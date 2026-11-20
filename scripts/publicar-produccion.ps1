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
  $raw=npx wrangler d1 execute energia-vital-db --remote --config wrangler.toml --json --command "SELECT (SELECT COUNT(*) FROM d1_migrations) AS total, (SELECT MAX(id) FROM d1_migrations) AS ultimo, (SELECT COUNT(*) FROM pragma_table_info('auth_sessions') WHERE name='refresh_hash') AS refresh_hash, (SELECT COUNT(*) FROM pragma_table_info('customers') WHERE name='telegram_customer_chat_id') AS telegram_verified, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='request_documents') AS documents, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='telegram_customer_notice_deliveries') AS telegram_notices, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='telegram_attachment_quota') AS attachment_quota, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='telegram_visitor_profiles') AS visitor_profiles"
  if($LASTEXITCODE -ne 0){throw 'Falló lectura remota D1. NO desplegar.'}
  $parsed=$raw | ConvertFrom-Json
  $row=@($parsed)[0].results[0]
  if([int]$row.total -ne 23 -or [int]$row.ultimo -ne 23 -or [int]$row.refresh_hash -ne 1 -or [int]$row.telegram_verified -ne 1 -or [int]$row.documents -ne 1 -or [int]$row.telegram_notices -ne 1 -or [int]$row.attachment_quota -ne 1 -or [int]$row.visitor_profiles -ne 1){
    throw 'D1 requiere migracion 023, sesiones seguras, identidad Telegram verificada y documentos. NO desplegar.'
  }
} finally {Pop-Location}
node apps/api/tests/assistant-usage.cjs
if($LASTEXITCODE -ne 0){throw 'Prueba estadisticas de asistente falló. NO desplegar.'}
node apps/api/tests/commercial-intake.cjs
if($LASTEXITCODE -ne 0){throw 'Prueba comercial falló. NO desplegar.'}
node apps/api/tests/telegram-customer-auth.cjs
if($LASTEXITCODE -ne 0){throw 'Prueba identidad Telegram falló. NO desplegar.'}
node apps/api/tests/telegram-customer-appointments.cjs
if($LASTEXITCODE -ne 0){throw 'Prueba citas falló. NO desplegar.'}
node apps/api/tests/request-documents.cjs
if($LASTEXITCODE -ne 0){throw 'Prueba documentos falló. NO desplegar.'}
npm run typecheck --workspace=apps/api
if($LASTEXITCODE -ne 0){throw 'Typecheck API falló. NO desplegar.'}
npm run typecheck --workspace=apps/web
if($LASTEXITCODE -ne 0){throw 'Typecheck frontend falló. NO desplegar.'}
node apps/web/tests/auth-session.cjs
if($LASTEXITCODE -ne 0){throw 'Pruebas de sesiones fallaron. NO desplegar.'}
node apps/web/tests/admin-browser-session.cjs
if($LASTEXITCODE -ne 0){throw 'Pruebas de navegacion y cookie fallaron. NO desplegar.'}
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
$site='https://bnergiv.com'
$withoutCookie=curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' -X POST "$site/api/admin-session/refresh" -H "Origin: $site" -H "Content-Type: application/json" --data '{}'
if($LASTEXITCODE -ne 0 -or "$withoutCookie".Trim() -ne '401'){throw "Pages desplegado pero proxy de sesion sin cookie devolvio $withoutCookie, se esperaba 401. Revisar Functions/binding."}
$loginProbe=curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' -X POST "$site/api/admin-session/login" -H "Origin: $site" -H "Content-Type: application/json" --data '{}'
if($LASTEXITCODE -ne 0 -or "$loginProbe".Trim() -ne '401'){throw "Pages desplegado pero login sin credenciales devolvio $loginProbe, se esperaba 401. Revisar llamada al Worker; no considerar publicacion validada."}
$foreign=curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' -X POST "$site/api/admin-session/refresh" -H 'Origin: https://invalid.example' -H 'Content-Type: application/json' --data '{}'
if($LASTEXITCODE -ne 0 -or "$foreign".Trim() -ne '403'){throw "Pages desplegado pero control de origen devolvio $foreign, se esperaba 403."}
$deepLink=curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' "$site/admin/citas"
if($LASTEXITCODE -ne 0 -or "$deepLink".Trim() -ne '200'){throw "Ruta directa /admin/citas devolvio $deepLink."}
Write-Host 'PUBLICACION TERMINADA: API health OK, Pages desplegado, rutas y rechazo de origen/sesion anonima OK.' -ForegroundColor Green
Write-Host "Comprobar manualmente https://bnergiv.com/admin/citas (login, recarga, recordar, logout)." -ForegroundColor Yellow
