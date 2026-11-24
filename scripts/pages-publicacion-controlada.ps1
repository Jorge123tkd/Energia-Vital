# Pages only: no API Worker deploy, D1 migration, bucket writes or DNS changes.
param([switch]$Publicar,[switch]$RespaldoExternoVerificado,[string]$Confirmacion='')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
$site='https://bnergiv.com'
Set-Location $root
function MustSucceed([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function CheckCloudflare {
 $d=& npx.cmd --yes wrangler@4.151.2 pages deployment list --project-name energia-vital-web --environment production
 MustSucceed 'Pages inaccesible: no se publico.'
 if(($d -join [Environment]::NewLine) -notmatch 'Production[^\w\r\n]*main\b'){
  throw 'Produccion Pages no confirma rama main: no publicar.'
 }
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-db --remote --config apps/api/wrangler.toml --json --command "SELECT COUNT(*) AS total, COALESCE(MAX(id),0) AS last_id FROM d1_migrations"
 MustSucceed 'No se pudo leer historial D1 comercial.'
 try{
  $obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json
  $r=@($obj)[0].results[0]
  $total=[int]$r.total; $last=[int]$r.last_id
 }catch{throw 'Historial D1 con formato inesperado; no publicar.'}
 Write-Host "[LECTURA] D1 Bonaire: $total migraciones registradas; ultima ID $last."
 if($total -lt 28 -or $last -lt 28){throw 'Faltan migraciones comerciales 025-028; no publicar frontend actual.'}
 Write-Host '[OK] Historial D1 comercial al menos 028; ninguna migracion ejecutada.'
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
 Write-Host '[PENDIENTE] Copias externas cifradas verificadas y autorizacion de Pages antes de publicar.'
 exit 0
}
if(!$RespaldoExternoVerificado -or $Confirmacion -cne 'PUBLICAR_SOLO_PAGES_BONAIRE'){
 throw 'No existe declaracion aprobada de respaldo externo verificado; publicacion bloqueada.'
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
 Write-Host '[OK] Pages desplegado; API Worker, D1, R2 y Studio sin cambios.'
}finally{
 Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
 Remove-Item Env:VITE_QA_MODE -ErrorAction SilentlyContinue
 Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
