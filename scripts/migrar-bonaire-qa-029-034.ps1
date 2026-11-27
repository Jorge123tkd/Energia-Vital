# Apply only migrations 029-034 to the isolated remote QA D1.
# Default is read-only. Never selects production D1 or deploys a Worker.
param([switch]$Aplicar)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch='feat/cloudflare-customer-accounts-hardening'
Set-Location $root
if((git branch --show-current).Trim() -cne $branch){throw 'Rama de Git no autorizada'}
if(git status --porcelain){throw 'Hay cambios locales sin guardar'}
$head=(git rev-parse HEAD).Trim()
if($head -cne (git rev-parse "origin/$branch").Trim()){throw 'Actualizar Git con pull --ff-only antes de continuar'}
$cfg=Get-Content (Join-Path $root 'apps/api/wrangler.qa.toml') -Raw
if($cfg -notmatch '(?m)^name\s*=\s*"energia-vital-api-qa"\s*$' -or
 $cfg -notmatch '(?m)^database_name\s*=\s*"energia-vital-qa-db"\s*$' -or
 $cfg -notmatch '(?m)^database_id\s*=\s*"62755365-2c9a-4b20-8933-21209609a94b"\s*$' -or
 $cfg -match 'bbb91e7a-37c6-4290-aa9c-29a8022226b4|energia-vital-assets|(?m)^\s*crons\s*='){
 throw 'Configuracion no aislada de QA. No migrar.'
}
$expected='029_commercial_tariffs.sql,030_residential_survey.sql,031_quote_decisions.sql,032_service_contracts.sql,033_service_execution.sql,034_service_delivery.sql'
$files=@(Get-ChildItem (Join-Path $root 'apps/api/migrations') -File -Filter '*.sql' |
 Where-Object {$_.Name -match '^0(2[9]|3[0-4])_'} | Sort-Object Name | ForEach-Object {$_.Name})
if(($files -join ',') -cne $expected){throw 'El conjunto de migraciones no coincide exactamente con 029-034'}
function Read-State {
 $sql="SELECT (SELECT COUNT(*) FROM d1_migrations) AS total,(SELECT COALESCE(MAX(id),0) FROM d1_migrations) AS last_id,(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('commercial_tariff_versions','residential_survey_versions','commercial_quote_decisions','service_contract_drafts','service_contract_approvals','service_contract_signatures','service_work_orders','service_work_assignments','service_deliveries')) AS required_tables,(SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name='commercial_tariffs') AS tariffs_view"
 $raw=& npx.cmd --yes wrangler@4.151.2 d1 execute energia-vital-qa-db --remote --config wrangler.qa.toml --json --command $sql
 if($LASTEXITCODE -ne 0){throw 'No se pudo consultar QA remoto'}
 try{$obj=($raw -join [Environment]::NewLine)|ConvertFrom-Json;$r=@($obj)[0].results[0];return @{total=[int]$r.total;last=[int]$r.last_id;tables=[int]$r.required_tables;view=[int]$r.tariffs_view}}catch{throw 'Respuesta QA inesperada'}
}
Push-Location (Join-Path $root 'apps/api')
try{
 $state=Read-State
 Write-Host "[LECTURA] QA: $($state.total)/$($state.last); tablas nuevas $($state.tables)/9; vista tarifas $($state.view)/1."
 if($state.total -eq 34 -and $state.last -eq 34 -and $state.tables -eq 9 -and $state.view -eq 1){
  Write-Host '[OK] QA 34/34 y las nueve tablas nuevas verificadas. Nada que aplicar.'
  exit 0
 }
 if($state.total -ne 28 -or $state.last -ne 28 -or $state.tables -ne 0){
  throw 'QA no esta exactamente en 28/28 sin migraciones nuevas. No aplicar ni reparar automaticamente.'
 }
 if(!$Aplicar){
  Write-Host '[PLAN] QA esta en 28/28. Aplicacion pendiente; produccion no se ha consultado ni modificado.'
  Write-Host '[PLAN] Para aplicar exclusivamente QA: -Aplicar y confirmacion interactiva.'
  exit 0
 }
 $confirm=Read-Host 'Escribe MIGRAR_SOLO_QA_029_034 para aplicar exclusivamente a D1 QA'
 if($confirm -cne 'MIGRAR_SOLO_QA_029_034'){throw 'Cancelado sin modificar QA'}
 if((git rev-parse HEAD).Trim() -cne $head){throw 'Codigo Git cambio durante la preparacion'}
 $again=Read-State
 if($again.total -ne 28 -or $again.last -ne 28 -or $again.tables -ne 0){throw 'QA cambio antes de aplicar. Cancelado.'}
 & npx.cmd --yes wrangler@4.151.2 d1 migrations apply energia-vital-qa-db --remote --config wrangler.qa.toml
 if($LASTEXITCODE -ne 0){throw 'Migracion QA fallida o parcial. Inspeccionar historial; no repetir a ciegas.'}
 $after=Read-State
 if($after.total -ne 34 -or $after.last -ne 34 -or $after.tables -ne 9 -or $after.view -ne 1){throw 'QA no confirma 34/34 y todas las tablas. No migrar produccion.'}
 Write-Host '[OK] QA 34/34; nueve tablas y vista de tarifas presentes.'
 Write-Host '[OK] Produccion, Worker y Pages no fueron modificados.'
}finally{Pop-Location}
