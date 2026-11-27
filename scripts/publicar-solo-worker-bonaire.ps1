# Bonaire: deploy ONLY the existing API Worker AFTER D1 reaches 28/28.
# Default is READ-ONLY; -Publicar requires explicit confirmation. ASCII PowerShell 5.1.
param([switch]$Publicar)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
$api=Join-Path $root 'apps/api'
$workerUrl='https://energia-vital-api.astrustrus.workers.dev'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama de Git no autorizada'}
if(git status --porcelain){throw 'Hay cambios locales sin guardar'}
$head=(git rev-parse HEAD).Trim()
if($head -cne (git rev-parse "origin/$branch").Trim()){throw 'Actualizar Git antes del release'}
$cfg=Get-Content (Join-Path $api 'wrangler.toml') -Raw
if($cfg -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
 $cfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
 $cfg -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$' -or
 $cfg -notmatch '(?m)^ENVIRONMENT\s*=\s*"production"\s*$'){
 throw 'La configuracion del Worker no coincide con produccion conocida'
}
function Read-Schema {
 $sql="SELECT (SELECT COUNT(*) FROM d1_migrations) AS total, (SELECT COALESCE(MAX(id),0) FROM d1_migrations) AS last_id, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='warehouse_items') AS warehouse, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='warehouse_project_links') AS links, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='procurement_orders') AS procurement, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='business_obligations') AS obligations, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('commercial_tariff_versions','residential_survey_versions','commercial_quote_decisions','service_contract_drafts','service_contract_approvals','service_contract_signatures','service_work_orders','service_work_assignments','service_deliveries')) AS residential_flow, (SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name='commercial_tariffs') AS tariffs_view"
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-db --remote --config wrangler.toml --json --command $sql
 if($LASTEXITCODE -ne 0){throw 'Fallo la consulta del esquema D1'}
 try{$obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json;$r=@($obj)[0].results[0]}catch{throw 'D1 devolvio esquema JSON inesperado'}
 if([int]$r.total -ne 34 -or [int]$r.last_id -ne 34 -or [int]$r.warehouse -ne 1 -or
    [int]$r.links -ne 1 -or [int]$r.procurement -ne 1 -or [int]$r.obligations -ne 1 -or
    [int]$r.residential_flow -ne 9 -or [int]$r.tariffs_view -ne 1){
  throw 'Worker nuevo requiere D1 34/34, almacen, compras, finanzas, tarifas, contratos, ejecucion y entrega; no publicar'
 }
 Write-Host '[OK] D1 de produccion 34/34 y todos los modulos comerciales detectados.'
}
Push-Location $api
try{
 Read-Schema
 if(!$Publicar){
  Write-Host '[PLAN] Solo Worker energia-vital-api; sin Pages, D1 ni R2.'
  Write-Host '[PENDIENTE] -Publicar requiere confirmacion expresa.'
  exit 0
 }
 $confirm=Read-Host 'Escribe PUBLICAR_SOLO_WORKER_BONAIRE para desplegar Worker sin tocar Pages ni D1'
 if($confirm -cne 'PUBLICAR_SOLO_WORKER_BONAIRE'){throw 'Cancelado antes de desplegar Worker'}
 if((git rev-parse HEAD).Trim() -cne $head){throw 'Codigo cambio antes de publicar'}
 Read-Schema
 & npx.cmd --yes wrangler@4.151.2 deploy --config wrangler.toml
 if($LASTEXITCODE -ne 0){throw 'Despliegue Worker fallido: inspeccionar estado antes de reintentar'}
 $resp=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' "$workerUrl/health"
 if($LASTEXITCODE -ne 0 -or "$resp" -notmatch '^200\|application/json'){
  throw 'Worker YA desplegado, /health no devolvio 200 JSON. Revisar rollback.'
 }
 Write-Host '[OK] Worker API desplegado y /health responde 200 JSON.'
 & node (Join-Path $root 'scripts/tests/production-delivery-gate.cjs')
 if($LASTEXITCODE -ne 0){throw 'La ruta de entrega no esta publicada o no esta protegida.'}
 & node --test (Join-Path $root 'scripts/tests/production-worker-gates.cjs')
 if($LASTEXITCODE -ne 0){throw 'Los gates de almacen/finanzas fallaron.'}
 Write-Host '[OK] Rutas protegidas verificadas; Pages y D1 no se modificaron en este paso.'
}finally{Pop-Location}
