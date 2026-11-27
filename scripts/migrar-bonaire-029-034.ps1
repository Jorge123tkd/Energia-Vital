# Apply ONLY migrations 029-034 to production after QA and an external USB restore test.
# Default is read-only. Never deploy Worker/Pages or modify R2.
param([string]$Unidad='',[switch]$Aplicar)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama de Git no autorizada'}
if(git status --porcelain){throw 'Hay cambios locales sin guardar'}
$head=(git rev-parse HEAD).Trim()
if($head -cne (git rev-parse "origin/$branch").Trim()){throw 'Actualizar Git con git pull --ff-only'}
$prodCfg=Get-Content (Join-Path $root 'apps/api/wrangler.toml') -Raw
$qaCfg=Get-Content (Join-Path $root 'apps/api/wrangler.qa.toml') -Raw
if($prodCfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
 $prodCfg -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
 $prodCfg -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$' -or
 $qaCfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-qa-db"\s*$' -or
 $qaCfg -notmatch '(?m)^database_id\s*=\s*"62755365-2c9a-4b20-8933-21209609a94b"\s*$'){
 throw 'Configuracion D1 no coincide con QA/produccion autorizadas.'
}
$expected='029_commercial_tariffs.sql,030_residential_survey.sql,031_quote_decisions.sql,032_service_contracts.sql,033_service_execution.sql,034_service_delivery.sql'
$files=@(Get-ChildItem (Join-Path $root 'apps/api/migrations') -File -Filter '*.sql' |
 Where-Object {$_.Name -match '^0(2[9]|3[0-4])_'} | Sort-Object Name | ForEach-Object {$_.Name})
if(($files -join ',') -cne $expected){throw 'El conjunto de migraciones no coincide exactamente con 029-034'}
function Read-State([string]$name,[string]$configFile){
 $sql="SELECT (SELECT COUNT(*) FROM d1_migrations) AS total,(SELECT COALESCE(MAX(id),0) FROM d1_migrations) AS last_id,(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('commercial_tariff_versions','residential_survey_versions','commercial_quote_decisions','service_contract_drafts','service_contract_approvals','service_contract_signatures','service_work_orders','service_work_assignments','service_deliveries')) AS required_tables,(SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name='commercial_tariffs') AS tariffs_view"
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute $name --remote --config $configFile --json --command $sql
 if($LASTEXITCODE -ne 0){throw "No se pudo leer D1 $name"}
 try{$obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json;$r=@($obj)[0].results[0];return @{total=[int]$r.total;last=[int]$r.last_id;tables=[int]$r.required_tables;view=[int]$r.tariffs_view}}catch{throw "Respuesta D1 $name inesperada"}
}
function Verify-ExternalBackup {
 if($Unidad -notmatch '^[A-Za-z]$'){throw 'Indica la letra de la unidad USB fisica con -Unidad, por ejemplo -Unidad E.'}
 $localDir=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
 $locals=@(Get-ChildItem -LiteralPath $localDir -File -Filter 'bonaire-antes-029-034-*.evbackup' | Sort-Object LastWriteTimeUtc -Descending)
 if($locals.Count -lt 1){throw 'No existe copia local cifrada 28/28.'}
 $source=$locals[0];$letter=$Unidad.ToUpperInvariant();$from=$source.FullName.Substring(0,1).ToUpperInvariant()
 if($from -eq $letter){throw 'El USB debe ser un disco fisico independiente.'}
 try{$p1=Get-Partition -DriveLetter $from -ErrorAction Stop;$p2=Get-Partition -DriveLetter $letter -ErrorAction Stop;$disk=Get-Disk -Number $p2.DiskNumber -ErrorAction Stop}catch{throw 'No se pudo identificar el disco USB.'}
 if($p1.DiskNumber -eq $p2.DiskNumber -or $disk.BusType.ToString() -cne 'USB'){throw 'El respaldo externo debe estar en un disco USB fisico independiente.'}
 $usb=Join-Path (Join-Path ($letter+':\') 'Bonaire-Respaldos-Cifrados') $source.Name
 if(!(Test-Path -LiteralPath $usb -PathType Leaf)){throw 'No se encontro en USB la copia cifrada previa a 029-034.'}
 $h1=(Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
 $h2=(Get-FileHash -LiteralPath $usb -Algorithm SHA256).Hash
 if($h1 -cne $h2){throw 'El archivo USB no coincide con la copia local.'}
 Write-Host '[OK] Copia local y USB tienen SHA256 identico.'
 Write-Host '[VERIFICANDO] Descifrado y restauracion 28/28 directamente desde USB.'
 & node (Join-Path $root 'scripts/backup-bonaire-crypto.mjs') --verificar-28 $usb
 if($LASTEXITCODE -ne 0){throw 'La restauracion desde USB no paso. No migrar.'}
}
Push-Location (Join-Path $root 'apps/api')
try{
 $qa=Read-State 'energia-vital-qa-db' 'wrangler.qa.toml'
 $prod=Read-State 'energia-vital-db' 'wrangler.toml'
 Write-Host "[LECTURA] QA $($qa.total)/$($qa.last), tablas $($qa.tables)/9; produccion $($prod.total)/$($prod.last), tablas nuevas $($prod.tables)/9."
 if($qa.total -ne 34 -or $qa.last -ne 34 -or $qa.tables -ne 9 -or $qa.view -ne 1){throw 'QA debe estar en 34/34 con las nueve tablas y la vista. No migrar produccion.'}
 if($prod.total -eq 34 -and $prod.last -eq 34 -and $prod.tables -eq 9 -and $prod.view -eq 1){
  Write-Host '[OK] Produccion ya esta en 34/34. No se reaplican migraciones.'
  exit 0
 }
 if($prod.total -ne 28 -or $prod.last -ne 28 -or $prod.tables -ne 0){throw 'Produccion no esta exactamente en 28/28 sin migraciones 029-034. Detener.'}
 if(!$Aplicar){
  Write-Host '[PLAN] QA 34/34; produccion 28/28. Sin cambios.'
  Write-Host '[PENDIENTE] Copia cifrada externa USB verificada y autorizacion expresa.'
  exit 0
 }
 Verify-ExternalBackup
 $confirm=Read-Host 'Escribe MIGRAR_BONAIRE_029_034_CON_RESPALDO_USB para aplicar exclusivamente a D1 produccion'
 if($confirm -cne 'MIGRAR_BONAIRE_029_034_CON_RESPALDO_USB'){throw 'Cancelado sin migrar produccion'}
 if((git rev-parse HEAD).Trim() -cne $head){throw 'Codigo Git cambio durante la preparacion'}
 $qaAgain=Read-State 'energia-vital-qa-db' 'wrangler.qa.toml'
 $prodAgain=Read-State 'energia-vital-db' 'wrangler.toml'
 if($qaAgain.total -ne 34 -or $qaAgain.last -ne 34 -or $qaAgain.tables -ne 9 -or $qaAgain.view -ne 1){throw 'QA cambio antes de aplicar. Cancelado.'}
 if($prodAgain.total -ne 28 -or $prodAgain.last -ne 28 -or $prodAgain.tables -ne 0){throw 'Produccion cambio antes de aplicar. Cancelado.'}
 & npx.cmd --yes wrangler@4.151.2 d1 migrations apply energia-vital-db --remote --config wrangler.toml
 if($LASTEXITCODE -ne 0){throw 'Migracion fallo o quedo parcial. No reintentar; inspeccionar historial D1.'}
 $after=Read-State 'energia-vital-db' 'wrangler.toml'
 if($after.total -ne 34 -or $after.last -ne 34 -or $after.tables -ne 9 -or $after.view -ne 1){throw 'Produccion no confirma 34/34 y todas las tablas. No publicar Worker ni Pages.'}
 Write-Host '[OK] D1 produccion 34/34; nueve tablas nuevas y vista de tarifas verificadas.'
 Write-Host '[OK] Worker, Pages y R2 no fueron modificados.'
}finally{Pop-Location}
