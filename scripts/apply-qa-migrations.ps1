# Aplica solamente migraciones 013-021 a la D1 QA restaurada.
# No utiliza el archivo wrangler.toml de producción ni la base local.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$api = Join-Path $repo "apps/api"
$config = Join-Path $api "wrangler.qa.toml"
if (!(Test-Path $config)) { throw "Falta configuración QA" }
$toml = Get-Content $config -Raw
if ($toml -notmatch '(?m)^name\s*=\s*"energia-vital-api-qa"\s*$' -or
    $toml -notmatch '(?m)^database_name\s*=\s*"energia-vital-qa-db"\s*$' -or
    $toml -notmatch '(?m)^database_id\s*=\s*"62755365-2c9a-4b20-8933-21209609a94b"\s*$' -or
    $toml -match 'bbb91e7a-37c6-4290-aa9c-29a8022226b4|energia-vital-assets|(?m)^crons\s*=') {
    throw "Configuración insegura: solo se admite la D1 QA conocida, sin recursos de producción"
}
$migrations = @(Get-ChildItem (Join-Path $api "migrations") -File -Filter "*.sql" |
    Where-Object { $_.Name -match '^\d{3}_.*\.sql$' })
$pending = @($migrations | Where-Object { [int]$_.Name.Substring(0, 3) -gt 12 } |
    Sort-Object Name | ForEach-Object { [int]$_.Name.Substring(0, 3) })
if (($pending -join ",") -ne "13,14,15,16,17,18,19,20,21") {
    throw "El conjunto de migraciones no es exactamente 013-021. No se aplicará nada."
}
Push-Location $api
try {
    $json = npx wrangler d1 execute energia-vital-qa-db --remote --config wrangler.qa.toml --json --command "SELECT COUNT(*) AS total,MAX(id) AS ultimo FROM d1_migrations"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el historial de QA" }
    $result = $json | ConvertFrom-Json
    if ([int]$result[0].results[0].total -ne 12 -or [int]$result[0].results[0].ultimo -ne 12) {
        throw "QA ya no está en el estado esperado de 12 migraciones; detenida"
    }
    $confirmation = Read-Host "Escribe APLICAR_SOLO_QA para aplicar 013-021 exclusivamente en QA"
    if ($confirmation -cne "APLICAR_SOLO_QA") { throw "Cancelado sin migrar" }
    npx wrangler d1 migrations apply energia-vital-qa-db --remote --config wrangler.qa.toml
    if ($LASTEXITCODE -ne 0) { throw "Migración QA no finalizada; revisar antes de repetir" }
    Write-Host "Migraciones QA solicitadas. Producción no fue seleccionada." -ForegroundColor Green
} finally {
    Pop-Location
}
