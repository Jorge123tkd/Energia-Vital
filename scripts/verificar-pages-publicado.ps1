# Bonaire Pages: verify existing production site without deploying or modifying any data.
# Windows PowerShell 5.1 compatible. Run after a deployment (no publish parameters).
$ErrorActionPreference='Stop'
$site='https://bnergiv.com'
function CheckCode([string]$label,[string]$raw,[string]$expected){
 if($LASTEXITCODE -ne 0){throw "$label : HTTPS request failed"}
 if("$raw".Trim() -notmatch $expected){throw "$label : unexpected response: $raw"}
 Write-Host "[OK] $label -> $raw"
}
$studioWeb=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' "$site/api/studio/v1/me"
CheckCode 'Studio web anonymous' "$studioWeb" '^401\|application/json'
$studioNative=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' "$site/api/studio/native/v1/me"
CheckCode 'Studio native anonymous' "$studioNative" '^401\|application/json'
$adminRefresh=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}' -X POST "$site/api/admin-session/refresh" -H "Origin: $site" -H 'Content-Type: application/json' --data '{}'
CheckCode 'Admin refresh without cookie' "$adminRefresh" '^401$'
$homeStatus=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' "$site/"
CheckCode 'Public home page' "$homeStatus" '^200\|text/html'
$adminDeepLink=& curl.exe -sS --max-time 20 -o NUL -w '%{http_code}|%{content_type}' "$site/admin/citas"
CheckCode 'Admin appointments direct link' "$adminDeepLink" '^200\|text/html'
Write-Host '[OK] Pages smoke tests complete. No deployment or D1 operation was performed.'
Write-Host '[PENDIENTE] Login real, refresh with cookie, logout and Studio binding need authorized manual checks.'
