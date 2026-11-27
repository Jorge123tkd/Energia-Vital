# Export production D1 at 28/28, restore in memory, encrypt and verify locally.
# No migration, Worker/Pages deployment, R2 writes or DNS changes.
param([switch]$Crear)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama de Git no autorizada'}
if(git status --porcelain){throw 'Hay cambios locales sin guardar'}
$head=(git rev-parse HEAD).Trim()
if($head -cne (git rev-parse "origin/$branch").Trim()){throw 'Actualizar Git con pull --ff-only antes de continuar'}
$cfg=Get-Content (Join-Path $root 'apps/api/wrangler.toml') -Raw
if($cfg -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
 $cfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
 $cfg -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
 $cfg -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$'){
 throw 'D1 no coincide con el recurso productivo autorizado.'
}
Push-Location (Join-Path $root 'apps/api')
try{
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-db --remote --config wrangler.toml --json --command "SELECT COUNT(*) AS total,COALESCE(MAX(id),0) AS last_id FROM d1_migrations"
 if($LASTEXITCODE -ne 0){throw 'Fallo la lectura remota de D1'}
 try{$obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json;$r=@($obj)[0].results[0]}catch{throw 'Historial D1 inesperado'}
 if([int]$r.total -ne 28 -or [int]$r.last_id -ne 28){throw 'El respaldo previo a 029-034 exige produccion exactamente 28/28. No exportar.'}
 Write-Host '[OK] Produccion 28/28, lectura remota solamente.'
 if(!$Crear){Write-Host '[PLAN] Use -Crear para exportar y cifrar. Ningun dato ha cambiado.';exit 0}
 $dir=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
 New-Item -ItemType Directory -Path $dir -Force|Out-Null
 $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 & icacls.exe $dir /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') /grant:r '*S-1-5-18:(OI)(CI)F' /grant:r '*S-1-5-32-544:(OI)(CI)F' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'No se pudieron restringir los permisos del respaldo.'}
 $stamp='bonaire-antes-029-034-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
 $sql=Join-Path $dir ($stamp+'.sql')
 $enc=Join-Path $dir ($stamp+'.evbackup')
 if((Test-Path $sql) -or (Test-Path $enc)){throw 'El archivo de respaldo ya existe.'}
 try{
  & npx.cmd --yes wrangler@4.151.2 d1 export energia-vital-db --remote --config wrangler.toml --output $sql
  if($LASTEXITCODE -ne 0 -or !(Test-Path $sql)){throw 'Exportacion fallida; no continuar.'}
  if((Get-Item -LiteralPath $sql).Length -lt 1024){throw 'Exportacion sospechosamente pequena.'}
  & node (Join-Path $root 'scripts/backup-bonaire-crypto.mjs') --crear-28 $sql $enc
  if($LASTEXITCODE -ne 0 -or !(Test-Path $enc)){throw 'El respaldo cifrado no supero la restauracion 28/28.'}
 }finally{
  if(Test-Path -LiteralPath $sql){Remove-Item -LiteralPath $sql -Force}
 }
 $hash=(Get-FileHash -LiteralPath $enc -Algorithm SHA256).Hash
 Write-Host "[OK] Copia cifrada local: $enc"
 Write-Host "[OK] SHA256: $hash"
 Write-Host '[PENDIENTE] Copiar a USB fisico independiente y verificar desde el USB antes de migrar.'
 Write-Host '[OK] No se modificaron D1, Worker, Pages ni R2.'
}finally{Pop-Location}
