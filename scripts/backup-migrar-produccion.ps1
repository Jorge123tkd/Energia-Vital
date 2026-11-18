# Bonaire: respaldo actualizado y migraciones 013-021 SOLO en D1 de produccion.
# Detiene todo ante cualquier duda. No despliega Worker ni Pages.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
if ((git branch --show-current).Trim() -ne 'feat/cloudflare-customer-accounts-hardening') {
  throw 'Rama distinta de la rama unica autorizada.'
}
if ((git status --porcelain)) { throw 'Existen cambios locales sin confirmar: detenida.' }
$api = Join-Path $root 'apps/api'
$cfg = Get-Content (Join-Path $api 'wrangler.toml') -Raw
if ($cfg -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
    $cfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
    $cfg -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
    $cfg -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$') {
  throw 'Configuracion de produccion inesperada. No hacer nada.'
}
$migrations = @(Get-ChildItem (Join-Path $api 'migrations') -File -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{3}_.*\.sql$' } |
  Where-Object { [int]$_.Name.Substring(0,3) -gt 12 } | Sort-Object Name)
if (($migrations | ForEach-Object { [int]$_.Name.Substring(0,3) }) -join ',' -ne '13,14,15,16,17,18,19,20,21') {
  throw 'El conjunto esperado de migraciones 013-021 no coincide.'
}
function Read-DbState {
  $json = npx wrangler d1 execute energia-vital-db --remote --config wrangler.toml --json --command "SELECT (SELECT COUNT(*) FROM d1_migrations) AS total, (SELECT MAX(id) FROM d1_migrations) AS ultimo, (SELECT COUNT(*) FROM pragma_table_info('auth_sessions') WHERE name='refresh_hash') AS refresh_hash"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el esquema remoto; detenida.' }
  $value = ($json | ConvertFrom-Json)
  if (!$value -or !$value[0].results -or $value[0].results.Count -ne 1) {
    throw 'Respuesta D1 inesperada; detener.'
  }
  return $value[0].results[0]
}
Push-Location $api
try {
  $before = Read-DbState
  if ([int]$before.total -ne 12 -or [int]$before.ultimo -ne 12 -or [int]$before.refresh_hash -ne 0) {
    throw "D1 produccion ya no tiene el estado esperado 12/12/0; NO repetir migraciones."
  }
  $backupDir = Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  # Intentar limitar acceso al usuario Windows antes de guardar registros privados.
  & icacls.exe $backupDir /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" /grant:r 'SYSTEM:(OI)(CI)F' /grant:r 'Administrators:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir permisos de carpeta de respaldos.' }
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = Join-Path $backupDir "energia-vital-prod-previo-013-021-$timestamp.sql"
  Write-Host 'Creando respaldo remoto de D1 produccion ANTES de migrar...' -ForegroundColor Cyan
  npx wrangler d1 export energia-vital-db --remote --config wrangler.toml --output $backup
  if ($LASTEXITCODE -ne 0 -or !(Test-Path $backup)) { throw 'Exportacion D1 fallida; NO migrar.' }
  $size = (Get-Item $backup).Length
  if ($size -lt 1024) { throw "Respaldo sospechosamente pequeno: $size bytes; NO migrar." }
  $head = (Get-Content $backup -TotalCount 100 | Out-String)
  if ($head -notmatch 'CREATE TABLE' -and $head -notmatch 'INSERT INTO') {
    throw 'Respaldo no parece SQL D1 valido; NO migrar.'
  }
  $hash = (Get-FileHash -Algorithm SHA256 $backup).Hash
  $manifest = "$backup.sha256.txt"
  "Archivo: $backup`nBytes: $size`nSHA256: $hash" | Set-Content -Encoding UTF8 $manifest
  Write-Host "Respaldo guardado: $backup" -ForegroundColor Green
  Write-Host "SHA256: $hash" -ForegroundColor Green
  Write-Host 'IMPORTANTE: el respaldo contiene datos privados; NO compartir ni subir a GitHub.'
  $approval = Read-Host 'Para aplicar SOLO migraciones 013-021 en D1 PRODUCCION escribe MIGRAR_PRODUCCION_013_021'
  if ($approval -cne 'MIGRAR_PRODUCCION_013_021') { throw 'Operacion cancelada. Respaldo conservado.' }
  npx wrangler d1 migrations apply energia-vital-db --remote --config wrangler.toml
  if ($LASTEXITCODE -ne 0) { throw 'Error aplicando migraciones. No repetir; verificar historial D1.' }
  $after = Read-DbState
  if ([int]$after.total -ne 21 -or [int]$after.ultimo -ne 21 -or [int]$after.refresh_hash -ne 1) {
    throw 'Migraciones incompletas; NO publicar y NO reintentar automaticamente.'
  }
  Write-Host 'PASS: produccion registra 21 migraciones, columna refresh_hash presente.' -ForegroundColor Green
  Write-Host "Respaldo privado anterior: $backup"
  Write-Host 'No se ha desplegado la API ni Pages.'
} finally {
  Pop-Location
}
