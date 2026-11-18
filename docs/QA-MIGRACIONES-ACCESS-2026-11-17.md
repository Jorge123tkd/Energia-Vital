# QA Bonaire: migraciones remotas y protección de acceso

## 17/11/2026 — D1 QA 013–021 completadas (salida real del operador)
El operador descargó la rama habitual mediante `git pull --ff-only` (fast-forward a `4b5185e`) y ejecutó `scripts/apply-qa-migrations.ps1` con confirmación `APLICAR_SOLO_QA`. La salida de Wrangler 4.151.2 muestra ejecutadas con ✅ las nueve migraciones `013_brigades_foundation.sql`, `014_request_activities.sql`, `015_commercial_quote_versions.sql`, `016_request_financial_tracking.sql`, `017_technical_followup.sql`, `018_chief_access_evidence.sql`, `019_chief_completion_review_bridge.sql`, `020_last_admin_guard.sql` y `021_refresh_rotation.sql` exclusivamente en D1 `energia-vital-qa-db` (ID `62755365-2c9a-4b20-8933-21209609a94b`). Confirmación final del script: **21 migraciones registradas**. No repetir el script: su precondición 12 migraciones ya no se cumple. **No hay evidencia de cambios en producción** por esta ejecución. La evidencia corresponde a historial de migraciones, no a validación funcional integral.

Próximo bloqueo: configurar de verdad Cloudflare Access para Worker QA y Pages QA, con política restrictiva y URL(s) protegidas antes de publicar cualquier preview con copia de datos personales. Se reforzó `apps/api/src/qa-access.ts` para que una petición OPTIONS sin `SITE_URL` válido no eluda la verificación (commit `16058a23739c1e95661192e5cddefaab15907337`). La configuración Access aún no está instalada/verificada en Cloudflare. Auditoría de dependencias dev (12 high) sigue pendiente.

**Estado (17/11/2026): preparado en GitHub; NO ejecutado en Cloudflare por esta modificación.**
Rama única: `feat/cloudflare-customer-accounts-hardening`.

## 1. Base de pruebas (ya restaurada)
- D1 QA: `energia-vital-qa-db`, ID `62755365-2c9a-4b20-8933-21209609a94b`.
- Restauración desde SQL privado del 17/11 verificado previamente por el operador: 59 tablas, 12 migraciones (001–012) y ninguna fila devuelta por `PRAGMA foreign_key_check`.
- El intento de `PRAGMA integrity_check` dio `SQLITE_AUTH`; no se considera aprobado.
- La copia **puede contener datos personales reales**. No utilizarla como demo pública ni crear usuarios ficticios que puedan acceder a otros registros.

## 2. Migrar SOLO D1 QA
Una vez actualizada la rama en el PC, ejecutar desde la carpeta raíz:
```powershell
.\scripts\apply-qa-migrations.ps1
```
Este script valida el **nombre y UUID exactos de QA** en `apps/api/wrangler.qa.toml`, rechaza referencias conocidas de producción, comprueba que existen exactamente las migraciones 013–021, consulta el historial remoto de QA (debe seguir en 12) y exige escribir `APLICAR_SOLO_QA` antes de ejecutar `wrangler d1 migrations apply energia-vital-qa-db --remote --config wrangler.qa.toml`. No ejecuta migraciones locales ni toca D1 productiva. Si falla a mitad, **no repetir a ciegas**; revisar el estado de QA y de la importación.

**No ejecutar** `npm run db:migrate` ni `wrangler d1 migrations apply energia-vital-db --remote`: apuntan a producción. El archivo SQL 021 contiene un `ALTER TABLE`; no aplicarlo manualmente si la migración ya figura en D1.

## 3. Acceso a la API QA (tres defensas)
1. `apps/api/wrangler.qa.toml` no incluye credenciales, buckets o tareas periódicas de producción.
2. `apps/api/src/qa-access.ts` exige JWT de Cloudflare Access válido (RS256, firma, emisor, audience y vencimiento) **en todas las rutas de QA**, salvo respuesta CORS OPTIONS que no lee datos y solo acepta el origen QA configurado. Sin `QA_ACCESS_TEAM_DOMAIN` o `QA_ACCESS_AUD` la API deniega por defecto. No se debe desplegar una API pública sin proteger su dirección.
3. **Control real a configurar en Cloudflare:** Workers & Pages → Worker `energia-vital-api-qa` → **Access** → Protect this Worker behind Access → **All traffic** → política **Allow solo a correos de administradores/operadores de prueba específicos**. Esta protección incluye el hostname `workers.dev` y previews. No escoger un permiso de acceso universal. Fuente: https://developers.cloudflare.com/workers/configuration/cloudflare-access/

En Cloudflare Access, copiar de la **aplicación específica del Worker QA** su Audience Tag (`QA_ACCESS_AUD`) y el dominio del equipo, p. ej. `mi-equipo.cloudflareaccess.com` (`QA_ACCESS_TEAM_DOMAIN`). No inventarlos ni copiarlos de la web productiva. Guardarlos como variables del entorno QA, no como secretos de la web pública. `SITE_URL` debe ser exclusivamente la URL de Pages QA. El generador `scripts/prepare-cloudflare-qa-config.cjs` requiere esos valores y otros recursos QA exclusivos.

**Aviso:** el middleware añade defensa en profundidad, pero no instala por sí solo la política de Cloudflare Access y no sustituye los permisos por cliente/administrador de Bonaire.

## 4. Acceso a Pages QA
En Workers & Pages → Pages **proyecto distinto** `energia-vital-qa-web` → Settings → **Enable access policy**; proteger tanto la URL principal `*.pages.dev` como las previews. Cloudflare documenta que proteger solo las previews **no protege automáticamente** el dominio principal del proyecto. Configurar ambas políticas de forma restrictiva: https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain

**No publicar Pages QA hasta verificar** la protección en todas sus URLs; ninguna copia de los datos reales debe ser públicamente consultable. Aplicar también control Access sobre cualquier hostname adicional del Worker QA.

## 5. Activación de la vista previa
- Crear/verificar bucket R2 QA separado si se van a usar medios; **no reutilizar `energia-vital-assets`**.
- Definir de manera privada las variables QA del flujo manual GitHub Actions: `QA_D1_DATABASE_ID`, `QA_D1_DATABASE_NAME`, `QA_R2_BUCKET_NAME`, `QA_WORKER_NAME`, `QA_PAGES_PROJECT`, `QA_API_URL`, `QA_SITE_URL`, `QA_ACCESS_TEAM_DOMAIN`, `QA_ACCESS_AUD`.
- El flujo `.github/workflows/cloudflare-qa-preview.yml` exige confirmaciones de Access y esquema QA listo, y comprueba configuración. **Todavía no ha sido ejecutado**. GitHub puede requerir tener el workflow disponible en la rama por defecto para permitir `workflow_dispatch`; no cambiar `main` sin aprobación.
- Para usar el Worker real de QA habrá que provisionar también secretos **independientes** de autenticación de QA (`JWT_SECRET` y los que correspondan). No trasladar tokens de Telegram/WhatsApp ni secretos de producción.
- Hasta comprobar la protección de API y Pages y el estado migrado de D1 QA, mantener la vista previa sin publicar.
- El release productivo es un proceso aparte: no ejecutar `wrangler deploy` con el archivo de producción por inferir que QA pasó.

## 6. Estado de dependencias
El usuario verificó `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades de producción. `npm audit` total: 12 vulnerabilidades altas en herramientas de desarrollo; **no están corregidas**. Nunca ejecutar `npm audit fix --force` sin adaptar Tailwind/Vite y generar un lockfile reproducible. Sigue pendiente antes del lanzamiento.

