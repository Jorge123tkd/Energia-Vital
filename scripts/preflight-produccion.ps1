# Comprobacion unica antes de actualizar la web de produccion.
# NO despliega, NO migra y NO cambia registros ni configuracion de Cloudflare.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expectedBranch = 'feat/cloudflare-customer-accounts-hardening'
$actualBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $actualBranch -ne $expectedBranch) {
  throw "Rama incorrecta: $actualBranch. Se esperaba $expectedBranch."
}
$state = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $state) { throw 'Hay cambios locales o Git no esta disponible: no continuar hasta revisarlos.' }
$apiConfig = Get-Content 'apps/api/wrangler.toml' -Raw
if ($apiConfig -notmatch '(?m)^name\s*=\s*"energia-vital-api"\s*$' -or
  $apiConfig -notmatch '(?m)^database_name\s*=\s*"energia-vital-db"\s*$' -or
  $apiConfig -notmatch '(?m)^database_id\s*=\s*"bbb91e7a-37c6-4290-aa9c-29a8022226b4"\s*$') {
  throw 'Wrangler de produccion inesperado. No continuar.'
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $env:TEMP "bonaire-preflight-$stamp.txt"
$steps = [System.Collections.Generic.List[object]]::new()
function Step([string]$title, [scriptblock]$body) {
  Write-Host ">> $title" -ForegroundColor Cyan
  try {
    & $body
    $ok = ($LASTEXITCODE -eq 0)
    if (-not $ok) { throw "Codigo de salida $LASTEXITCODE" }
    $steps.Add([pscustomobject]@{ Paso=$title; Resultado='OK' })
  } catch {
    $steps.Add([pscustomobject]@{ Paso=$title; Resultado='ERROR: ' + $_.Exception.Message })
    Write-Warning "$title : $($_.Exception.Message)"
  }
}
Step 'Dependencias npm (sin actualizar versiones)' { npm ci --ignore-scripts }
Step 'Auditoria de paquetes de produccion' { npm audit --omit=dev --audit-level=high }
Step 'Tipos de la API' { npm run typecheck --workspace=apps/api }
Step 'Tipos del frontend' { npm run typecheck --workspace=apps/web }
Step 'Construccion del frontend' { npm run build --workspace=apps/web }
Step 'Tests de seguridad de sesion y QA' {
  node apps/web/tests/auth-session.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Test de sesiones fallido' }
  node scripts/prepare-cloudflare-qa-config.test.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Test de aislamiento QA fallido' }
  node scripts/verify-qa-access.test.cjs
}
Step 'Ensayo aditivo de migraciones con datos ficticios' { py -3 apps/api/tests/migration-preservation.py }
Push-Location 'apps/api'
try {
  Step 'Inventario REMOTO de migraciones de produccion (solo lectura)' {
    npx wrangler d1 migrations list energia-vital-db --remote --config wrangler.toml
  }
  Step 'Resumen del esquema D1 de produccion (solo lectura)' {
    npx wrangler d1 execute energia-vital-db --remote --config wrangler.toml --command "SELECT (SELECT COUNT(*) FROM d1_migrations) AS migraciones, (SELECT COUNT(*) FROM sqlite_master WHERE type='table') AS tablas, (SELECT COUNT(*) FROM pragma_table_info('auth_sessions') WHERE name='refresh_hash') AS refresh_hash;"
  }
} finally { Pop-Location }
$steps | Format-Table -AutoSize | Out-String | Tee-Object -FilePath $report
Write-Host "Informe: $report" -ForegroundColor Cyan
if (@($steps | Where-Object { $_.Resultado -ne 'OK' }).Count) {
  Write-Warning 'Hay pasos con ERROR: NO publicar ni aplicar migraciones. Compartir este resumen.'
} else {
  Write-Host 'Preflight superado. TODAVIA NO se autorizo/publico produccion; revisar respaldo y esquema antes de migrar.' -ForegroundColor Green
}
