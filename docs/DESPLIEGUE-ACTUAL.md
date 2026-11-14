# Despliegue actual — Bonaire

**ADVERTENCIA NOV-2026:** Guía histórica con pasos de ejecución real. NO seguir sus comandos `--remote`, `wrangler deploy` ni `pages deploy` sin superar primero todas las puertas y la autorización explícita recogidas en [PUBLICACION-SEGURA-BRIGADAS-EXPEDIENTES.md](./PUBLICACION-SEGURA-BRIGADAS-EXPEDIENTES.md). El propietario no desea realizar pruebas con servidores locales en su PC: se validan en GitHub Actions. Esta guía no documenta una publicación ya efectuada.
Preparado el 11 de noviembre de 2026. Esta guía describe pasos por ejecutar; el estado real está en CONTINUIDAD.md.

Ejecutar bloques de uno en uno en PowerShell. Si un comando falla, detener ese bloque y revisar su salida. No pegar contraseñas ni tokens en el chat.

## 1. Comprobar el equipo y Cloudflare
```powershell
Set-Location "C:\Users\Taliety\Desktop\Energia-Vital"
git status --short
git branch --show-current
npx wrangler whoami
npx wrangler pages project list
```
Si whoami indica que falta sesión, ejecutar npx wrangler login y repetir whoami.
Confirmar en Cloudflare Pages > energia-vital-web > configuración de compilación la rama de producción y URL pública. No asumir main ni el nombre de la rama de trabajo. El listado de proyectos puede no mostrar la rama.

## 2. Actualizar el código sin perder cambios
Con el estado local revisado y los cambios propios conservados:
```powershell
git switch feat/cloudflare-customer-accounts-hardening
git pull --ff-only origin feat/cloudflare-customer-accounts-hardening
if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar el repositorio." }
npm ci
if ($LASTEXITCODE -ne 0) { throw "Falló npm ci." }
npm run typecheck --workspace=apps/api
if ($LASTEXITCODE -ne 0) { throw "Falló TypeScript API." }
npm run typecheck --workspace=apps/web
if ($LASTEXITCODE -ne 0) { throw "Falló la comprobación web." }
```
Si Git informa cambios locales que impiden actualizar, conservarlos y resolverlos antes de continuar; no usar reset --hard ni borrar imágenes.

## 3. Preparar frontend y respaldo
Confirmar primero que la URL de API reportada sigue siendo correcta:
```powershell
$env:VITE_API_URL = "https://energia-vital-api.astrustrus.workers.dev"
npm run build:web
if ($LASTEXITCODE -ne 0) { throw "Falló la compilación web." }
$backupDir = Join-Path $env:USERPROFILE "Desktop\Respaldos-Energia-Vital"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupPath = Join-Path $backupDir ("energia-vital-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".sql")
Set-Location apps/api
npx wrangler d1 export energia-vital-db --remote --output="$backupPath"
if ($LASTEXITCODE -ne 0) { throw "Falló el respaldo D1." }
if (!(Test-Path $backupPath) -or (Get-Item $backupPath).Length -eq 0) { throw "El respaldo no existe o está vacío." }
Get-Item $backupPath | Select-Object Name, Length, LastWriteTime
npx wrangler deployments list
npx wrangler d1 migrations list energia-vital-db --remote
```
El archivo de respaldo permanece fuera del repositorio. Anotar la versión previa del Worker; no publicar el SQL. Revisar qué migraciones están pendientes; no asumir que solo falta 010.

## 4. Aplicar migraciones y API
Desde apps/api, después de verificar respaldo y lista de pendientes:
```powershell
npx wrangler d1 migrations apply energia-vital-db --remote
if ($LASTEXITCODE -ne 0) { throw "Fallaron las migraciones." }
npx wrangler d1 migrations list energia-vital-db --remote
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Falló el despliegue API." }
Invoke-RestMethod "https://energia-vital-api.astrustrus.workers.dev/health"
Invoke-RestMethod "https://energia-vital-api.astrustrus.workers.dev/api/public/services?featured=true"
Invoke-RestMethod "https://energia-vital-api.astrustrus.workers.dev/api/public/gallery?featured=true"
Set-Location ../..
```
Conservar versión y URL devueltas por Wrangler. Respuestas sin elementos destacados pueden ser correctas: todavía hay que seleccionarlos.

## 5. Publicar Pages en el destino confirmado
Desde la raíz, con el frontend compilado y la rama de producción comprobada en el paso 1:
```powershell
$pagesProductionBranch = Read-Host "Rama de producción exacta configurada en Cloudflare Pages"
if ([string]::IsNullOrWhiteSpace($pagesProductionBranch)) { throw "Falta confirmar la rama de producción." }
npx wrangler pages deployment list --project-name energia-vital-web
npx wrangler pages deploy apps/web/dist --project-name energia-vital-web --branch="$pagesProductionBranch"
if ($LASTEXITCODE -ne 0) { throw "Falló Pages." }
npx wrangler pages deployment list --project-name energia-vital-web
```
Registrar URL y entorno de la nueva publicación. Pasar --branch configura el destino Pages; no fusiona código en GitHub.

## 6. Validación final
- Abrir URL pública y comprobar que corresponde al nuevo despliegue, sin confundirla con un alias preview.
- En administración, elegir servicios/proyectos y activar Destacar en inicio. No seleccionar contenido comercial automáticamente.
- En Inicio, revisar las tres secciones, imágenes, detalle/fotos y móvil.
- Desmarcar un destacado: sale de Inicio y permanece en su listado. Ocultarlo: sale de ambos.
- Probar login/admin, chat modal y pantalla completa, notificaciones, citas/WhatsApp y los dos modos del asesor solar.
- Registrar resultados reales, errores, URLs, versión Worker y despliegue Pages en CONTINUIDAD.md.
- Si algo falla, detener y diagnosticar con la versión anterior registrada. No restaurar ni borrar D1 automáticamente.
- La auditoría general 1.0 sigue en RELEASE-V1-CHECKLIST.md; este despliegue no equivale a certificarla.
