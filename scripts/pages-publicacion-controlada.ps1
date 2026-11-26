# Pages only: no API Worker deploy, D1 migration, bucket writes or DNS changes.
param([switch]$Publicar,[string]$Confirmacion='',[switch]$HabilitarStudio,[switch]$DependenciasYaInstaladas,[switch]$CompiladorTemporal)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
$site='https://bnergiv.com'
Set-Location $root
function MustSucceed([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function CheckCloudflare {
 # Wrangler human-readable tables are not a stable interface: read the official JSON instead.
 $d=& npx.cmd --yes wrangler@4.151.2 pages deployment list --project-name energia-vital-web --environment production --json
 MustSucceed 'Pages inaccesible: no se publico.'
 try{
  $deployments=($d -join [Environment]::NewLine) | ConvertFrom-Json
 }catch{
  throw 'Pages no devolvio JSON valido: no publicar.'
 }
 $production=@($deployments | Where-Object { $_.Environment -eq 'Production' -and $_.Branch -eq 'main' })
 if($production.Count -lt 1){
  throw 'Pages no confirma un despliegue de produccion con rama main: no publicar.'
 }
 Write-Host '[OK] Cloudflare Pages: produccion main comprobada con JSON.'
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-db --remote --config apps/api/wrangler.toml --json --command "SELECT COUNT(*) AS total, COALESCE(MAX(id),0) AS last_id FROM d1_migrations"
 MustSucceed 'No se pudo leer historial D1 comercial.'
 try{
  $obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json
  $r=@($obj)[0].results[0]
  $total=[int]$r.total; $last=[int]$r.last_id
 }catch{throw 'Historial D1 con formato inesperado; no publicar.'}
 Write-Host "[LECTURA] D1 Bonaire: $total migraciones registradas; ultima ID $last."
 if(!(($total -eq 24 -and $last -eq 24) -or ($total -eq 28 -and $last -eq 28))){
  throw 'D1 parcial o inesperado: solo se permite 24/24 o 28/28, no publicar.'
 }
 Write-Host '[OK] Esquema comercial compatible con Pages: ningun dato ni migracion modificados.'
 if($HabilitarStudio){
  if($total -ne 28 -or $last -ne 28){throw 'Studio requiere el esquema comercial 28/28.'}
  foreach($path in @('/v1/me','/v1/engineering/manifest')){
   $status=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' ('https://evpro-sync.bnergiv.com'+$path)
   MustSucceed 'No se pudo consultar el Worker Studio.'
   if("$status" -notmatch '^403\|application/json'){throw 'Worker Studio no confirma acceso anonimo bloqueado. No publicar UI.'}
  }
  Write-Host '[OK] Worker Studio activo y acceso anonimo bloqueado.'
 }
}
if((git branch --show-current).Trim() -cne $branch){throw 'No estas en la rama de trabajo autorizada.'}
if(git status --porcelain){throw 'Hay cambios sin guardar; no publicar.'}
$head=(git rev-parse HEAD).Trim()
$remote=(git rev-parse "origin/$branch").Trim()
if($head -cne $remote){throw 'Actualiza la rama con git pull --ff-only antes de continuar.'}
Write-Host "[OK] Git: $($head.Substring(0,8)) en rama $branch"
CheckCloudflare
if(!$Publicar){
 Write-Host '[PLAN] Comprobaciones remotas de solo lectura superadas. Nada desplegado.'
 Write-Host "[PLAN] Solo Pages, sin migrar D1 ni publicar Worker. Habilitar Studio: $HabilitarStudio"
 Write-Host '[PENDIENTE] Ejecutar -Publicar con confirmacion explicita para subir Pages.'
 exit 0
}
$requiredConfirmation=if($HabilitarStudio){'PUBLICAR_PAGES_STUDIO_PRIVADO'}else{'PUBLICAR_SOLO_PAGES_BONAIRE'}
if($Confirmacion -cne $requiredConfirmation){
 throw 'Falta confirmacion explicita de Pages exclusivamente. No se publico.'
}
$tmp=Join-Path $env:TEMP ('bonaire-pages-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try{
 if($DependenciasYaInstaladas){
  & npm.cmd ls --depth=0
  MustSucceed 'Dependencias previas incompletas; vuelve a ejecutar sin -DependenciasYaInstaladas.'
  Write-Host '[OK] Dependencias instaladas reutilizadas.'
 }else{
  & npm.cmd ci
  MustSucceed 'npm ci no termino.'
 }
 & node apps/web/tests/studio-bridge.test.mjs
 MustSucceed 'Puente Studio no paso pruebas.'
 $env:VITE_API_URL='https://energia-vital-api.astrustrus.workers.dev'
 $env:VITE_QA_MODE='false'
 # Explicit UI activation only; existing server-side authorization remains in force.
 $env:VITE_STUDIO_UI_ENABLED=if($HabilitarStudio){'true'}else{'false'}
 Write-Host "[BUILD] VITE_STUDIO_UI_ENABLED=$env:VITE_STUDIO_UI_ENABLED"
 $previousEsbuild=$env:ESBUILD_BINARY_PATH
 try{
  if($CompiladorTemporal){
   $binary=Join-Path $tmp 'esbuild-vite.exe'
   & node scripts/preparar-esbuild-temporal.cjs $binary
   MustSucceed 'No se pudo verificar el compilador temporal; no publicar.'
   $env:ESBUILD_BINARY_PATH=$binary
   Write-Host '[OK] Vite usara una copia temporal de su propia version de esbuild.'
  }
  & npm.cmd run build --workspace=apps/web
  MustSucceed 'Frontend no compilo.'
 }finally{
  # Wrangler can use another esbuild version: do not pass Vite's override to it.
  if($null -eq $previousEsbuild){Remove-Item Env:ESBUILD_BINARY_PATH -ErrorAction SilentlyContinue}
  else{$env:ESBUILD_BINARY_PATH=$previousEsbuild}
 }
 & node apps/web/tests/pages-build-output.mjs
 MustSucceed 'Rutas Pages no validas.'
 if($HabilitarStudio){
  & node --test apps/web/tests/studio-technical-share.test.mjs
  MustSucceed 'Pruebas de colaboracion no superadas.'
  & node --test apps/web/tests/studio-action-audit.test.mjs
  MustSucceed 'Auditoria de acciones de Studio no superada.'
  $bundles=Get-ChildItem (Join-Path $root 'apps/web/dist/assets') -Filter '*.js' -File
  if(!($bundles | Select-String -SimpleMatch 'Volver a Bonaire' -List)){throw 'El build no contiene la interfaz Studio habilitada.'}
  if(!(Test-Path (Join-Path $root 'apps/web/dist/studio-engineering/index.html'))){throw 'Falta la interfaz original de ingenieria.'}
 }
 Push-Location (Join-Path $root 'apps/web')
 try{
  & npx.cmd --yes wrangler@4.151.2 pages functions build functions --outfile (Join-Path $tmp 'functions.js') --output-routes-path (Join-Path $tmp 'routes.json')
  MustSucceed 'Functions no compilaron.'
 }finally{Pop-Location}
 & node apps/web/tests/pages-package-preflight.mjs (Join-Path $tmp 'functions.js') (Join-Path $tmp 'routes.json') (Join-Path $tmp 'preflight.json')
 MustSucceed 'No se valido el manifiesto del paquete.'
 CheckCloudflare
 if((git rev-parse HEAD).Trim() -cne $head){throw 'El commit cambio durante el build.'}
 Write-Host '[PUBLICANDO] Exclusivamente Pages energia-vital-web, rama de Pages main.'
 Push-Location (Join-Path $root 'apps/web')
 try{
  & npx.cmd --yes wrangler@4.151.2 pages deploy dist --project-name energia-vital-web --branch main
  MustSucceed 'Fallo publicacion Pages. Revisar Cloudflare.'
 }finally{Pop-Location}
 foreach($path in @('/api/studio/v1/me','/api/studio/native/v1/me')){
  $response=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' ($site+$path)
  MustSucceed ('Fallo verificacion web '+$path)
  if("$response" -notmatch '^401\|application/json'){
   throw ("Pages YA se publico, pero "+$path+" no devolvio 401 JSON. Revisar rollback. HTTP: "+$response)
  }
  Write-Host "[OK] $path 401 JSON"
 }
 $withoutCookie=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' -X POST "$site/api/admin-session/refresh" -H "Origin: $site" -H 'Content-Type: application/json' --data '{}'
 MustSucceed 'Fallo verificacion de sesion admin.'
 if("$withoutCookie".Trim() -ne '401'){throw 'Pages publicado pero session refresh no devuelve 401. Revisar binding ADMIN_SESSION_API y rollback.'}
 Write-Host '[OK] Refresh admin protegido: 401 sin cookie.'
 $homeStatus=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' "$site/"
 MustSucceed 'Fallo verificacion de inicio.'
 if("$homeStatus".Trim() -ne '200'){throw 'Pages YA se publico; inicio no responde 200. Revisar rollback.'}
 $adminDeep=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' "$site/admin/citas"
 MustSucceed 'Fallo verificacion de enlace directo admin.'
 if("$adminDeep".Trim() -ne '200'){throw 'Pages publicado pero /admin/citas no responde 200; revisar rollback.'}
 if($HabilitarStudio){
  $adminStudio=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' ($site+'/admin/ev-pro-studio')
  MustSucceed 'Fallo comprobacion ruta Studio admin'
  if("$adminStudio".Trim() -ne '200'){throw ('Pages publicado, pero ruta Studio admin no responde 200: '+$adminStudio)}
  # Pages may canonicalize /index.html to the directory URL. Verify the
  # actual engineering HTML, not merely a 200 from the SPA fallback.
  $target=Join-Path $tmp 'published-studio-index.html'
  $response=& curl.exe -sS --location --max-redirs 3 --proto-redir '=https' --max-time 30 -o $target -w '%{http_code}|%{url_effective}' ($site+'/studio-engineering/index.html?verify='+$head)
  MustSucceed 'Fallo comprobacion HTML Studio'
  if("$response" -notmatch '^200\|https://bnergiv\.com/studio-engineering/(index\.html)?(\?[^#]*)?\z'){throw ('Pages publicado, pero respuesta final Studio inesperada: '+$response)}
  $expected=(Get-FileHash -Algorithm SHA256 (Join-Path $root 'apps/web/dist/studio-engineering/index.html')).Hash
  if((Get-FileHash -Algorithm SHA256 $target).Hash -ne $expected){throw 'Pages publicado, pero HTML Studio no coincide con el build.'}
  Write-Host '[OK] HTML Studio publicado: destino final y SHA256 comprobados.'
  Write-Host '[OK] SOLO Pages desplegado; Studio UI habilitada. Acceso a expedientes sujeto a autorizacion del Worker. Falta prueba con cuenta real.'
 }else{Write-Host '[OK] SOLO Pages desplegado y revisado: inicio y /admin/citas OK; Worker y D1 sin cambios; Studio UI apagada.'}
}finally{
 Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
 Remove-Item Env:VITE_QA_MODE -ErrorAction SilentlyContinue
 Remove-Item Env:VITE_STUDIO_UI_ENABLED -ErrorAction SilentlyContinue
 Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
