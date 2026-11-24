# Pages only: no API Worker deploy, D1 migration, bucket writes or DNS changes.
param([switch]$Publicar,[string]$Confirmacion='')
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
 Write-Host '[OK] Esquema comercial compatible con Pages sin Studio UI: ningun dato ni migracion modificados.'
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
 Write-Host '[PLAN] Solo Pages, sin migrar D1, sin Worker, con interfaz Studio inactiva.'
 Write-Host '[PENDIENTE] Ejecutar -Publicar con confirmacion explicita para subir Pages.'
 exit 0
}
if($Confirmacion -cne 'PUBLICAR_SOLO_PAGES_BONAIRE'){
 throw 'Falta confirmacion explicita de Pages exclusivamente. No se publico.'
}
$tmp=Join-Path $env:TEMP ('bonaire-pages-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try{
 & npm.cmd ci
 MustSucceed 'npm ci no termino.'
 & node apps/web/tests/studio-bridge.test.mjs
 MustSucceed 'Puente Studio no paso pruebas.'
 $env:VITE_API_URL='https://energia-vital-api.astrustrus.workers.dev'
 $env:VITE_QA_MODE='false'
 # This Pages-only release must not expose Studio enterprise screens.
 $env:VITE_STUDIO_UI_ENABLED='false'
 # Never let the Pages-only release enable enterprise UI, even by build parameters.
 if($env:VITE_STUDIO_UI_ENABLED -cne 'false'){throw 'Studio UI debe estar desactivada.'}
 & npm.cmd run build --workspace=apps/web
 MustSucceed 'Frontend no compilo.'
 & node apps/web/tests/pages-build-output.mjs
 MustSucceed 'Rutas Pages no validas.'
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
 $home=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' "$site/"
 MustSucceed 'Fallo verificacion de inicio.'
 if("$home".Trim() -ne '200'){throw 'Pages YA se publico; inicio no responde 200. Revisar rollback.'}
 Write-Host '[OK] SOLO Pages desplegado y revisado: Worker API y D1 sin cambios; Studio UI desactivada.'
}finally{
 Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
 Remove-Item Env:VITE_QA_MODE -ErrorAction SilentlyContinue
 Remove-Item Env:VITE_STUDIO_UI_ENABLED -ErrorAction SilentlyContinue
 Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
