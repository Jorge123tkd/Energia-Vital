# Publicar en los servicios YA EXISTENTES. No migra ni crea recursos.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
if ((git branch --show-current).Trim() -ne 'feat/cloudflare-customer-accounts-hardening') {
  throw 'Rama Git no autorizada.'
}
if (git status --porcelain) {throw 'Existen cambios locales; revisar antes de desplegar.'}
$apiDir=Join-Path $root 'apps/api'
$webDir=Join-Path $root 'apps/web'
$worker='energia-vital-api'
$pages='energia-vital-web'
$apiUrl='https://energia-vital-api.astrustrus.workers.dev'
$cfg=Get-Content (Join-Path $apiDir 'wrangler.toml') -Raw
if ($cfg -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
    $cfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
    $cfg -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
    $cfg -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$') {
  throw 'Wrangler de API no es el recurso existente autorizado.'
}
Push-Location $apiDir
try {
  $raw=npx wrangler d1 execute energia-vital-db --remote --config wrangler.toml --json --command "SELECT (SELECT COUNT(*) FROM d1_migrations) AS total, (SELECT MAX(id) FROM d1_migrations) AS ultimo, (SELECT COUNT(*) FROM pragma_table_info('auth_sessions') WHERE name='refresh_hash') AS refresh_hash, (SELECT COUNT(*) FROM pragma_table_info('customers') WHERE name='telegram_customer_chat_id') AS telegram_verified, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='request_documents') AS documents"
  if($LASTEXITCODE -ne 0){throw 'Falló lectura remota D1. NO desplegar.'}
  $parsed=$raw | ConvertFrom-Json
  $row=@($parsed)[0].results[0]
  if([int]$row.total -ne 22 -or [int]$row.ultimo -ne 22 -or [int]$row.refresh_hash -ne 1 -or [int]$row.telegram_verified -ne 1 -or [int]$row.documents -ne 1){
    throw 'D1 requiere migracion 022, sesiones seguras, identidad Telegram verificada y documentos. NO desplegar.'
  }
} finally {Pop-Location}
npm run typecheck --workspace=apps/api
if($LASTEXITCODE -ne 0){throw 'Typecheck API falló. NO desplegar.'}
npm run typecheck --workspace=apps/web
if($LASTEXITCODE -ne 0){throw 'Typecheck frontend falló. NO desplegar.'}
node apps/web/tests/auth-session.cjs
if($LASTEXITCODE -ne 0){throw 'Pruebas de sesiones fallaron. NO desplegar.'}
# Variables del build solo en este proceso PowerShell; no escribir secretos ni .env.
$env:VITE_API_URL=$apiUrl
$env:VITE_QA_MODE='false'
npm run build --workspace=apps/web
if($LASTEXITCODE -ne 0){throw 'Build frontend falló. NO desplegar.'}
if(!(Test-Path (Join-Path $webDir 'dist/index.html'))){throw 'Falta dist/index.html.'}
$mainConfig=Get-Content (Join-Path $webDir 'wrangler.toml') -Raw
if($mainConfig -notmatch '(?m)^name\s*=\s*"energia-vital-web"\s*$'){
  throw 'El proyecto Pages no coincide con producción.'
}
$branch=Read-Host 'Escribe la rama de PRODUCCION configurada en Cloudflare Pages para energia-vital-web (por ejemplo main)'
if($branch -notmatch '^[A-Za-z0-9._/-]{1,100}$'){
  throw 'Rama de Pages inválida, no se publica.'
}
Write-Host 'Se va a publicar en Worker energia-vital-api y Pages energia-vital-web.' -ForegroundColor Yellow
Write-Host "Pages: rama $branch. Debe ser la rama configurada como Production Branch en Cloudflare." -ForegroundColor Yellow
$approval=Read-Host 'Escribe PUBLICAR_BONAIRE_PRODUCCION para autorizar ambos despliegues'
if($approval -cne 'PUBLICAR_BONAIRE_PRODUCCION'){throw 'Cancelado; nada desplegado.'}
Push-Location $apiDir
try {
  npx wrangler deploy --config wrangler.toml
  if($LASTEXITCODE -ne 0){throw 'Error desplegando Worker. No publicar Pages.'}
} finally {Pop-Location}
try {
  $health=Invoke-RestMethod -Uri "$apiUrl/health" -Method Get -TimeoutSec 20
  if($health.status -ne 'ok'){throw 'Health no confirmó status ok.'}
  Write-Host 'Worker actualizado y /health OK.' -ForegroundColor Green
} catch {
  throw "Worker se publicó pero health falló. NO publicar Pages: $($_.Exception.Message)"
}
Push-Location $webDir
try{
  npx wrangler pages deploy dist --project-name $pages --branch $branch
  if($LASTEXITCODE -ne 0){throw 'Publicacion Pages falló, revisar Cloudflare.'}
}finally{Pop-Location}
Write-Host 'PUBLICACION TERMINADA: API /health OK y Pages deploy aceptado.' -ForegroundColor Green
Write-Host "Comprobar manualmente https://energia-vital-web.pages.dev (home, login, admin, solicitudes)." -ForegroundColor Yellow
