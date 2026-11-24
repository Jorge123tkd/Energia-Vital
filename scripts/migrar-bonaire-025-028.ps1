# Bonaire: apply ONLY migrations 025-028 to existing production D1 on explicit approval.
# Default is read-only. No backup creation, Worker deploy or Pages deploy.
# Windows PowerShell 5.1 ASCII only.
param([switch]$Aplicar)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
$api=Join-Path $root 'apps/api'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama de origen no autorizada'}
if(git status --porcelain){throw 'Hay cambios locales sin guardar'}
$head=(git rev-parse HEAD).Trim()
if($head -cne (git rev-parse "origin/$branch").Trim()){throw 'Actualizar Git con pull --ff-only antes de aplicar'}
$config=Get-Content (Join-Path $api 'wrangler.toml') -Raw
if($config -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
 $config -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
 $config -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
 $config -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$'){
 throw 'Configuracion de D1 de produccion distinta de la autorizada'
}
$expected='025_warehouse_ledger.sql,026_warehouse_brigade_links.sql,027_procurement.sql,028_business_finance.sql'
$files=@(Get-ChildItem (Join-Path $api 'migrations') -File -Filter '*.sql' |
 Where-Object { $_.Name -match '^0(2[5-9]|[3-9][0-9])_' } |
 Sort-Object Name | ForEach-Object { $_.Name })
if(($files -join ',') -cne $expected){throw 'Las migraciones nuevas no coinciden exactamente con 025-028'}
$backup=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital\bonaire-antes-025-028-20261123-225027.evbackup'
$sha='29fc648b3f4c97db215a48ad2efe72ab780bf2034cec2661fdb13edc28bc59af'
if(!(Test-Path -LiteralPath $backup -PathType Leaf)){throw 'No se encontro la copia cifrada local ya verificada, no migrar'}
if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){
 throw 'La copia cifrada local difiere de la verificada, no migrar'
}
function Read-State([string]$name,[string]$configFile){
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute $name --remote --config $configFile --json --command "SELECT COUNT(*) AS total,COALESCE(MAX(id),0) AS last_id FROM d1_migrations"
 if($LASTEXITCODE -ne 0){throw 'No se pudo leer el historial remoto de D1'}
 try{
  $obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json
  $row=@($obj)[0].results[0]
  return @{total=[int]$row.total;last=[int]$row.last_id}
 }catch{throw 'Historial remoto D1 incomprensible: detener'}
}
Push-Location $api
try{
 $qa=Read-State 'energia-vital-qa-db' 'wrangler.qa.toml'
 if($qa.total -ne 28 -or $qa.last -ne 28){throw 'QA comercial no esta en 28/28. No migrar produccion'}
 $prod=Read-State 'energia-vital-db' 'wrangler.toml'
 Write-Host "[LECTURA] QA $($qa.total)/$($qa.last); produccion $($prod.total)/$($prod.last)."
 if($prod.total -eq 28 -and $prod.last -eq 28){
  Write-Host '[OK] D1 produccion ya esta en 28/28. No se reaplican migraciones.'
  exit 0
 }
 if($prod.total -ne 24 -or $prod.last -ne 24){throw 'D1 produccion en estado parcial/inesperado. No reintentar a ciegas'}
 Write-Host '[OK] QA 28/28; produccion 24/24; copia cifrada local existente coincide SHA256.'
 if(!$Aplicar){
  Write-Host '[PLAN] Quedan solo 025-028. No se ha modificado D1.'
  Write-Host '[RIESGO] El respaldo esta en el SSD local y no protege de fallo fisico.'
  Write-Host '[PENDIENTE] Aplicar explicitamente o posponer hasta disponer de copia externa.'
  exit 0
 }
 Write-Host '[AVISO] Migracion PRODUCTIVA aditiva 025-028. Esquema y servicio pueden quedar indisponibles durante la operacion.'
 Write-Host '[AVISO] La unica copia cifrada adicional comprobada permanece en el SSD local.'
 $confirm=Read-Host 'Escribe MIGRAR_BONAIRE_025_028_CON_COPIA_LOCAL para asumir ese riesgo y aplicar solo las cuatro migraciones'
 if($confirm -cne 'MIGRAR_BONAIRE_025_028_CON_COPIA_LOCAL'){throw 'Cancelado sin aplicar migraciones'}
 if((git rev-parse HEAD).Trim() -cne $head){throw 'Codigo Git cambio antes de migrar'}
 $again=Read-State 'energia-vital-db' 'wrangler.toml'
 if($again.total -ne 24 -or $again.last -ne 24){throw 'Produccion cambio antes de aplicar. Cancelado'}
 & npx.cmd --yes wrangler@4.151.2 d1 migrations apply energia-vital-db --remote --config wrangler.toml
 if($LASTEXITCODE -ne 0){throw 'Migracion fallo o quedo parcial. NO reintentar sin inspeccionar D1'}
 $after=Read-State 'energia-vital-db' 'wrangler.toml'
 if($after.total -ne 28 -or $after.last -ne 28){throw 'Migracion no confirmada 28/28. No publicar Worker ni Pages'}
 Write-Host '[OK] D1 produccion 28/28. No se modificaron Worker, Pages ni R2.'
}finally{Pop-Location}
