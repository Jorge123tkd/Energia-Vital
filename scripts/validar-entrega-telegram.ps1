# Checks only: no local server, remote mutation, migration or deployment.
param([switch]$SkipInstall)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ((git branch --show-current).Trim() -ne 'feat/cloudflare-customer-accounts-hardening') {throw 'Rama incorrecta.'}
function Test-Step([string]$label,[scriptblock]$command) {
  Write-Host "=== $label ===" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE -ne 0) {throw "FALLO: $label. No desplegar."}
}
if ($SkipInstall) {
  if (!(Test-Path 'node_modules/typescript/package.json')) {throw 'Dependencias no instaladas. Ejecuta sin -SkipInstall.'}
  Write-Host 'Reutilizando dependencias ya instaladas; no se ejecuta npm ci.' -ForegroundColor Cyan
} else {Test-Step 'Dependencias reproducibles' {npm ci}}
Test-Step 'Asistente empresarial' {node apps/api/tests/business-assistant-phase-a.cjs}
Test-Step 'Estadisticas del asistente web' {node apps/api/tests/assistant-usage.cjs}
Test-Step 'Solicitudes comerciales' {node apps/api/tests/commercial-intake.cjs}
Test-Step 'Identidad Telegram' {node apps/api/tests/telegram-customer-auth.cjs}
Test-Step 'Citas Telegram' {node apps/api/tests/telegram-customer-appointments.cjs}
Test-Step 'Validar documentos' {node apps/api/tests/request-documents.cjs}
Test-Step 'Typecheck API' {npm run typecheck --workspace=apps/api}
Test-Step 'Typecheck frontend' {npm run typecheck --workspace=apps/web}
Test-Step 'Sesiones autenticadas' {node apps/web/tests/auth-session.cjs}
Test-Step 'Rutas y cookies administrativas' {node apps/web/tests/admin-browser-session.cjs}
if (Get-Command python -ErrorAction SilentlyContinue) {
  Test-Step 'Migraciones con datos ficticios en memoria' {python apps/api/tests/migration-preservation.py}
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  Test-Step 'Migraciones con datos ficticios en memoria' {py -3 apps/api/tests/migration-preservation.py}
} else {throw 'Falta Python 3 para validar migraciones. No desplegar.'}
$env:VITE_API_URL='https://energia-vital-api.astrustrus.workers.dev'
$env:VITE_QA_MODE='false'
Test-Step 'Compilar frontend' {npm run build --workspace=apps/web}
$sessionBuild=Join-Path ([System.IO.Path]::GetTempPath()) ('bonaire-session-build-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $sessionBuild | Out-Null
Push-Location apps/web
try{Test-Step 'Compilar Pages Functions sin servidor' {npx wrangler pages functions build functions --outfile (Join-Path $sessionBuild 'worker.js') --output-routes-path (Join-Path $sessionBuild 'routes.json')}}
finally{Pop-Location;Remove-Item -LiteralPath $sessionBuild -Recurse -Force}
Write-Host 'VALIDACION TECNICA COMPLETADA. No se ha iniciado servidor ni modificado Cloudflare.' -ForegroundColor Green
