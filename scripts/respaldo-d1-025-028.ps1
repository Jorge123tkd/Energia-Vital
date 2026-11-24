# Export and validate D1 backup only, NEVER migrate or deploy.
param([switch]$Crear)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$api=Join-Path $root 'apps/api'
$branch='feat/cloudflare-customer-accounts-hardening'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama incorrecta'}
if(git status --porcelain){throw 'Cambios locales sin guardar'}
$cfg=Get-Content (Join-Path $api 'wrangler.toml') -Raw
if($cfg -notmatch 'database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"' -or
 $cfg -notmatch 'database_name\s*=\s*"energia-vital-db"' -or
 $cfg -notmatch 'ENVIRONMENT\s*=\s*"production"'){throw 'D1 no coincide con la configuracion productiva conocida'}
Push-Location $api
try{
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-db --remote --config wrangler.toml --json --command "SELECT COUNT(*) AS total,COALESCE(MAX(id),0) AS last_id FROM d1_migrations"
 if($LASTEXITCODE -ne 0){throw 'Fallo la lectura remota de D1'}
 try{
  $row=@((($raw -join [Environment]::NewLine)|ConvertFrom-Json))[0].results[0]
  $total=[int]$row.total;$last=[int]$row.last_id
 }catch{throw 'JSON de migraciones inesperado'}
 if($total -ne 24 -or $last -ne 24){throw 'D1 no esta en 24/24. Detener antes de exportar.'}
 Write-Host '[OK] D1 produccion: 24/24, historial solo lectura.'
 if(!$Crear){Write-Host '[PLAN] Use -Crear para exportar y cifrar. No hay migraciones ni despliegues.';exit 0}
 $dir=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
 New-Item -ItemType Directory -Path $dir -Force|Out-Null
 $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $grant='*'+$sid+':(OI)(CI)F'
 & icacls.exe $dir /inheritance:r /grant:r $grant /grant:r '*S-1-5-18:(OI)(CI)F' /grant:r '*S-1-5-32-544:(OI)(CI)F' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'No se pudo proteger carpeta privada'}
 $stamp='bonaire-antes-025-028-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
 $sql=Join-Path $dir ($stamp+'.sql')
 $enc=Join-Path $dir ($stamp+'.evbackup')
 if((Test-Path $sql) -or (Test-Path $enc)){throw 'Nombre de respaldo ya existe'}
 $done=$false
 try{
  Write-Host 'Exportando SQL temporal privado (solo lectura)...'
  & npx.cmd --yes wrangler@4.151.2 d1 export energia-vital-db --remote --config wrangler.toml --output $sql
  if($LASTEXITCODE -ne 0 -or !(Test-Path $sql)){throw 'Fallo exportacion; no cifrar'}
  & node (Join-Path $root 'scripts/backup-bonaire-crypto.mjs') --crear $sql $enc
  if($LASTEXITCODE -ne 0){throw 'Respaldo cifrado no validado'}
  $done=$true
 }finally{if($done -and (Test-Path $sql)){Remove-Item -LiteralPath $sql -Force}}
 if(!$done){throw 'Respaldo incompleto; revisar SQL temporal privado'}
 Write-Host "[OK] Copia cifrada: $enc"
 Write-Host '[PENDIENTE] Copiar fuera de Cloudflare y del SSD; verificar copia EXTERNA antes de migrar.'
 Write-Host '[OK] Cloudflare D1 no fue migrada; no se publicaron Workers ni Pages.'
}finally{Pop-Location}
