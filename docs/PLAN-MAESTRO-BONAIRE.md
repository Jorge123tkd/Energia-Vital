# Bonaire — Plan maestro de crecimiento seguro (acuerdos con dirección)

## 17/11/2026 — Clientes administrativos: búsquedas sin resultados atrasados
Corregido `apps/web/src/components/AdminCustomers.svelte` en la rama única (commit `0da7c53ce96eb73f29c3efed03295e6cae49942c`): se introdujo un identificador secuencial de peticiones que descarta respuestas antiguas cuando cambian el texto o la página; las respuestas remotas ya no se vuelven a filtrar con texto escrito pero todavía no enviado; tras editar, bloquear o eliminar se conserva la página actual y, si desaparece la última página por una eliminación, se vuelve a la última válida. Mensaje de ausencia de resultados más preciso. No hay cambios de API, permisos ni base de datos. Pendiente de compilar con la próxima descarga, sin pruebas repetitivas; no se publicó nada en Cloudflare.

## 17/11/2026 — Paginación compacta compartida para listados grandes
Se actualizó `apps/web/src/components/Pagination.svelte` en la rama única: ahora muestra hasta cinco páginas cercanas a la actual más primera/última y separadores, en lugar de crear una opción `<option>` por cada página de datos. Conserva botones Primera/Anterior/Siguiente/Última, contador de registros, desactivación durante cargas y accesibilidad `aria-current`. Beneficia solicitudes, citas, clientes, personal, notificaciones, brigadas, galería y servicios que usan el componente compartido. Commit `315d77d6fee5fb2eda990fbba7d62a845eb066ee`. Sin cambios en D1 ni despliegue. `npm audit` global (12 high de dev), migraciones 013–021 QA y control real de acceso QA permanecen pendientes.

## 17/11/2026 — Paginación de brigadas en el panel administrativo
Se completó la paginación de la pantalla privada de Brigadas en `apps/web/src/components/AdminBrigades.svelte`, reutilizando el componente común `Pagination`: 10 brigadas por página y contador basado en brigadas reales. Si el usuario crea o edita una brigada con la ficha de integrantes expandida, la actualización mantiene visible esa brigada; si desapareció del listado, elimina la selección. No cambia asignaciones, reglas de ocupación, permisos ni D1. Commit `f0c867ed7d40d778a3424ebeb0844fe1e6c38eff`. Sin despliegue ni migraciones. Pendientes: 12 hallazgos high en dependencias de desarrollo, migraciones 013–021 en QA y protección efectiva de acceso QA antes de publicar vista previa.

## 17/11/2026 — Separación CORS entre API QA y web de producción
En `apps/api/src/index.ts` se corrigió la lista de orígenes permitidos: cuando `ENVIRONMENT=qa` solo se permite el origen `SITE_URL` definido para QA. Sin `SITE_URL`, QA no autoriza solicitudes de navegadores por CORS. Producción mantiene sus orígenes anteriores. Commit `a34207ae2ff7b569a30ab8fb79b633f97625f027`. **CORS NO es un control de acceso ni bloquea clientes directos**: por contener una copia de datos de producción, la API QA y Pages QA no deben hacerse públicas sin Cloudflare Access/política equivalente de acceso efectivo. No hay despliegue. Auditoría de dependencias dev (12 high) sigue sin resolver; no se han modificado `package.json` o `package-lock.json` ni aplicado migraciones.

## 17/11/2026 — QA preview alineada con rama única; snapshot protegido
Se corrigió `.github/workflows/cloudflare-qa-preview.yml` para permitir solamente la rama `feat/cloudflare-customer-accounts-hardening`, eliminando la condición que apuntaba a la rama antigua de release. Se añadió confirmación específica de que la copia de producción restaurada en D1 QA está protegida tanto en API como en Pages antes de cualquier preview. El documento `docs/PREVIEW-CLOUDFLARE-QA-2026-11-17.md` refleja que QA ya tiene 59 tablas y migraciones 001–012, **no es una base vacía** y puede contener datos sensibles. La confirmación manual no sustituye la instalación real de Cloudflare Access y el workflow no se ha ejecutado. Migraciones 013–021 pendientes. Auditoría npm proporcionada por el usuario: 12 alertas high en conjunto completo de dependencias de desarrollo, `npm audit --omit=dev --audit-level=high` devolvió **0**. No ejecutar `npm audit fix --force`; actualizar lockfile de manera reproducible y verificar build antes de producción. Sin cambios en Cloudflare.

## 17/11/2026 — Consolidación en rama ÚNICA de descarga (PR #7 integrado)
Por instrucción de dirección, la rama única para descargar en el PC y publicar manualmente a Cloudflare es `feat/cloudflare-customer-accounts-hardening`. El [PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7) se reorientó a esta rama, se resolvió el conflicto de los dos documentos conservando la versión más reciente, y quedó **fusionado** en el commit `bfff54469dc936c98137c18ee642204ce7242461`. Reúne seguridad de sesiones y rotación, dependencias auditadas, workflows de QA y respaldo preparados, tests y migración 021 en código. Las ramas candidatas de seguridad históricas no deben descargarse por separado ni mezclarse a ciegas. No se creó ninguna rama nueva ni se desplegó a Cloudflare.

La D1 remota de QA `energia-vital-qa-db` se restauró desde el respaldo privado `energia-vital-20261117-213103.sql` validado con SHA256. Reportó 59 tablas y 12 migraciones registradas (001–012); `PRAGMA foreign_key_check` no devolvió errores. `PRAGMA integrity_check` fue denegado por autorización `SQLITE_AUTH`, por lo que NO se afirma que ese chequeo haya pasado. Las migraciones 013–021 no se aplicaron en esta operación. Hay archivo separado `apps/api/wrangler.qa.toml` que apunta solo a QA, sin cron ni bucket R2 productivo. No se desplegó ni se tocó producción.

La rama `main` conserva un workflow manual `.github/workflows/backup-restore-qa.yml` diseñado para una QA *vacía* y para un SHA antiguo del candidato. **No copiar ni ejecutar ese procedimiento sin actualizarlo**, ahora que QA contiene datos. La fusión de PR #7 está lista para descargar; no publicar nuevas migraciones o Worker en producción sin validar primero dependencias y esquema.

## 17/11/2026 — Flujo ÚNICO nube: exportar D1 → R2 → restaurar QA → ensayar 013–021
Para acelerar el lanzamiento, se creó **solo** el archivo `.github/workflows/backup-restore-qa.yml` en la rama predeterminada `main` (commits `0e2cff91`, revisión de acceso a secretos `06191626`), sin fusionar PR #7 ni publicar Worker/Pages. El workflow de GitHub Actions es **manual**: confirmación `RESPALDAR_Y_PROBAR_QA`, SHA completo del PR #7; checkout fijo a `release/combined-security-deps-20261117`; suite previa sin secretos; verifica UUID de prod y QA y QA vacía; exporta la D1 real `energia-vital` a archivo SQL en runner temporal, sube a R2 privado `energia-vital-backups-private`, recupera y compara archivos byte por byte; importa **únicamente a D1 QA** `energia-vital-qa-db`; verifica historial de 12 migraciones y ensaya 013–021 en QA con config temporal que NO tiene binding productivo. Limpia SQL/logs de runner incluso al fallar. No existe ningún comando para mutar D1 de producción ni publicar la web. Los secretos Cloudflare están limitados a pasos CLI, no a `npm ci` ni tests. **No ejecutado:** faltan confirmar secrets GitHub Actions y ventana de bajo tráfico porque export D1 puede bloquear consultas. Documento operativo `docs/FLUJO-UNICO-BACKUP-RESTAURACION-QA-2026-11-17.md` (commit `3ddbe8a2`). No hay copia de respaldo verificada aún y se mantiene NO-GO de producción.


## 17/11/2026 — Instalación del Worker de respaldo preparada en GitHub Actions
Cloudflare `wrangler workflows list` devolvió **ningún Workflow desplegado**. Se añadió a PR #7 `.github/workflows/install-backup-workflow.yml` (commit `597e0940`): instalación manual de **solo** `energia-vital-d1-backup`, con rama autorizada, confirmación `INSTALAR_WORKFLOW_RESPALDO`, SHA fuente validado, `npm ci`, pruebas, `wrangler deploy --dry-run`, `BACKUP_CF_DEPLOY_TOKEN` separado y `wrangler workflows describe` de verificación. **No dispara instancia/exportación**, no despliega web/api productivas ni realiza migraciones. Prueba de política agregada en `apps/api/tests/backup-workflow-policy.cjs` (commit `56611964`). Aún NO se ha ejecutado la nueva CI ni instalado nada. Los workflows manuales nuevos deben existir en la rama predeterminada para ser seleccionables en Actions, lo que requiere autorización independiente para introducir el archivo allí. Documentado en `docs/RESPALDO-D1-R2-MANUAL-2026-11-17.md` (commit `a06c7f7c`). No solicitar secretos en chat ni afirmar que existe respaldo.


## 17/11/2026 — Workflow manual de copia D1 → R2 preparado en PR #7, todavía NO ejecutado
Tras confirmar D1 QA vacía y R2 de backups sin exposición pública, se investigó la API de exportación y ejemplo de Cloudflare Workflows. En PR #7 se añadieron `apps/d1-backup/wrangler.toml` (Worker independiente `energia-vital-d1-backup`, sin cron/endpoint público), `apps/d1-backup/src/index.ts` (Workflow `energia-vital-d1-backup-manual`, confirmación explícita `RESPALDAR_D1_EN_R2`, exportación SQL D1, espera y guardado en `energia-vital-backups-private`, verificación HEAD sin imprimir contenido), prueba `apps/api/tests/backup-workflow-policy.cjs` y CI con `wrangler deploy --dry-run`. No se ha desplegado, instalado secreto ni iniciado exportación. **La API requiere permiso D1 Write y la exportación puede bloquear temporalmente las consultas de producción**, por tanto exige ventana y autorización separadas. R2 privado no equivale necesariamente a cifrado independiente. Procedimiento: `docs/RESPALDO-D1-R2-MANUAL-2026-11-17.md` (commit `26e6c68b`). Sigue NO-GO hasta respaldo realmente completado, restauración aislada y pruebas de 013–021.


## 17/11/2026 — Preview QA de Cloudflare aislada, preparación segura
Se detectó que el archivo original `apps/api/wrangler.toml` apunta a D1/R2 **reales**, `ENVIRONMENT=production` y cron de recordatorios; reutilizarlo en QA podría afectar datos y mensajería. Por eso en PR #7 se crearon `scripts/prepare-cloudflare-qa-config.cjs` (`93c8113b`) y pruebas de rechazo de binding/URLs productivas (`6ede296b`), añadidas a la CI del PR (`839e65a6`). Se creó workflow manual `.github/workflows/cloudflare-qa-preview.yml` (`c000def2`) que solo permite publicar Worker/Pages QA tras confirmación `PUBLICAR_SOLO_QA`, recursos separados, D1 QA migrada y protección de acceso, sin crons ni secretos de mensajería y sin tocar D1 real. **No se ejecutó workflow ni se creó/desplegó ningún recurso Cloudflare**; faltan IDs y nombres de recursos QA/Cloudflare Access. La operación manual requiere que el workflow exista también en la rama predeterminada de GitHub para estar disponible, así que no se habilita hasta que se revise. Plan: `docs/PREVIEW-CLOUDFLARE-QA-2026-11-17.md` (commit `69dabc81`). Mantener NO-GO para producción y siete etapas abiertas.


## 17/11/2026 — Orden de ramas para lanzamiento sin sobrescribir arreglos
Se verificaron las 12 ramas de GitHub contra `release/combined-security-deps-20261117` (PR #7). Hono/Vite/Undici/Svelte y JWT tienen sus cambios consolidados en PR #7, por lo que **NO se deben publicar ni fusionar ramas antiguas una a una**: algunas son variantes obsoletas de lockfile. GitHub indicó `mergeable=true` para PR #7 en esta consulta (estado dinámico). Se estableció el orden seguro: `main` solo referencia → rama integral `feat/cloudflare-customer-accounts-hardening` → PR #7 combinado y CI → preview aislado → auditoría real autorizada → backup/restauración → migraciones autorizadas → Worker y Pages con smoke tests. Documento: `docs/ORDEN-INTEGRACION-PUBLICACION-2026-11-17.md` (commit `c3c3bed8`). **No se hicieron merges, deploys ni migraciones.** Los siete controles de publicación siguen abiertos.


## 17/11/2026 — Inventario completo de ramas antes de publicar
Se inventariaron las **12 ramas** de GitHub (incluida paginación final vacía), y se compararon todas con `release/combined-security-deps-20261117` ([PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7)). Verificación directa por SHA de contenido: 13 de 14 archivos del PR de sesiones coinciden íntegramente; el archivo restante `.github/workflows/deploy.yml` conserva el contenido original más el gate npm audit añadido. Los cuatro archivos de dependencias del PR #4 coinciden exactamente con commit fuente `ce8d32c0`. Rama candidata de sesiones de PR #6 está íntegramente contenida en PR #7. Las ramas antiguas adicionales contienen variantes de dependencias y workflows temporales, no se deben fusionar a ciegas. La rama `main` está **710 commits detrás** del candidato al revisar y debe tratarse como NO LISTA para desplegar. Documento detallado: `docs/AUDITORIA-RAMAS-PREPUBLICACION-2026-11-17.md` (commit `7920c17a`). **No se detectó pérdida de cambios funcionales del PR #4 o #6; no sustituye revisión de QA/Cloudflare real ni autorización para publicar.**


## Freeze de funciones / candidato de lanzamiento unificado — 17/11/2026

Se congela temporalmente el desarrollo funcional nuevo. Seguridad de sesiones (PR #6) y dependencias seguras (PR #4) se combinaron en [PR #7 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/7), sin fusionar ni desplegar. Los dos ensayos completos [44107829315](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44107829315) y [44108052050](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44108052050) **SUCCESS**; el segundo incluye un gate real de `npm audit` total + producción, que bloquea críticas/altas/moderadas. Las vulnerabilidades bajas requieren revisión humana. Se centralizó GO/NO-GO en `docs/CIERRE-PRODUCCION-2026-11-17.md`. Siete etapas pendientes: fotos, QA real/401 admin/WAF, inventario Cloudflare, backup D1/R2, restauración/migraciones, revisión/rollback y despliegue autorizado. No datos reales consultados ni producción modificada.


## Candidato consolidado validado — 17/11/2026

El PR #6 de rotación de sesiones y preparación de auditoría D1 pasó CI [44105736214](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44105736214) **SUCCESS**, sin despliegue. El PR #5 original fue cerrado **sin fusionar** para evitar duplicar revisiones; todos sus archivos funcionales están en PR #6. No hay migración 021 remota ni cambios de producción. La etapa 2 está avanzada en código y la 3 tiene herramienta de solo lectura preparada, pero siguen faltando QA real, auditoría autorizada de Cloudflare, respaldo y restauración, privacidad fotográfica y aprobación de publicación. Las 7 puertas principales continúan abiertas.


## Consolidación del candidato de seguridad — 17/11/2026

Se eliminó el problema de divergencia de PR #5 sin mezclar en producción: se recreó sobre la última rama de desarrollo un candidato de **14 archivos** en [PR #6 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/6), con 14 commits ahead / 0 behind. Incorpora seguridad JWT, migración 021, renovación de clientes y personal, tests de concurrencia y cambios de usuario, auditoría D1 de solo lectura preparada y protección de futuros despliegues. [CI 44105736214](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44105736214) aún en curso al documentar. PR #5 sigue como historial, PR #6 es candidato de revisión aislado. Ninguna etapa de producción ha sido autorizada, las siete puertas siguen abiertas.


## Auditoría de esquema D1 segura preparada (17/11/2026)

PR #5: se creó un workflow manual **no ejecutado** para consultar exclusivamente metadatos de esquema D1 (nombres de tablas y presencia de columna de renovación de tokens), con confirmación textual, acceso solo mediante secretos de Actions y sin leer registros privados. Se añadió validador estricto y test ficticio incorporado a CI; [run 44092428971](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44092428971) SUCCESS. Esta preparación **no equivale al inventario remoto autorizado de la etapa 3**. Continúan las necesidades de verificación Workers/Pages/R2 y migraciones, backup y restauración privados, QA móvil, WAF, 401 admin, privacidad fotográfica y revisión de PR #4. PR #5 requiere reconciliar 27 commits de diferencia con la rama base antes de fusionar; no desplegar por esta actualización.


## Corrección de mezcla de sesiones en navegador — 17/11/2026

Candidato PR #5: pruebas automatizadas de cambio de identidad cliente/administrador A→B durante refresh JWT y respuesta 401 tardía; el cliente web impide que la llamada vieja adopte las credenciales de B y no comparte entre cuentas un refresh en vuelo. Commits `d75acb0a`, `62f65cc7`, `00d30c09`, `dff2a34f`. CI [44087816609](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44087816609) pendiente de validar. Sin despliegue y sin pruebas manuales reales. Permanecen las 7 puertas de publicación.


## Defensa adicional de endpoint refresh (16/11/2026)

El candidato [PR #5 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/5) incluye límite de tasa en D1 de 180 solicitudes por IP en 60 segundos para renovación de JWT y rechazo de tokens de más de 4096 caracteres, además de rotación de un solo uso y cierre remoto por refresh firmado. Ensayos sintéticos añadidos; [CI 44013833729](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44013833729) pendiente al redactar. El WAF/Turnstile de Cloudflare continúa como requisito independiente y debe revisarse con tráfico real/autorizado, considerando IP compartidas en Cuba. No se han cambiado Workers/D1 de producción ni fusionado el PR.


## Seguridad de salida de sesiones caducadas — 16/11/2026

El PR #5 aislado incorpora revocación de sesiones mediante refresh JWT firmado en el cuerpo de `POST /api/auth/logout`, para que el servidor pueda revocar una sesión aunque el access haya caducado. Los flujos de cliente y administrador borran los tokens locales antes de esperar la red, usan refresh solo en memoria y fallback de access para sesiones anteriores. Incluye tests HTTP Worker/D1 ficticios y simulaciones de cliente sobre logout cliente/admin/legacy. CI [44013630792](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44013630792) en ejecución al documentar. Un logout durante desconexión **no garantiza revocación remota**, solo limpieza local: esta limitación requiere tratamiento antes de publicación. No hay despliegues, merge ni cambios de D1/R2 reales. Las 7 etapas siguen abiertas.


## Puerta de esquema para despliegue de rotación JWT (16/11/2026)

En el PR #5 de desarrollo aislado, el workflow de publicación ahora exige una comprobación de solo lectura de `auth_sessions.refresh_hash` (migración 021) en D1 remota **antes** de permitir `wrangler deploy`. El comando no ejecuta la migración, ni consulta datos de usuarios, ni modifica producción. Falta autorización específica, inventario remoto, copia cifrada D1/R2, ensayo de restauración y verificación de migraciones reales 013–021. El PR permanece DRAFT, sin publicar. La CI de este control es [44013144408](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44013144408) (pendiente de resultado al redactar). Las siete etapas de publicación siguen sin cerrarse.


## QA adicional de sesiones — 16/11/2026
El PR #5 (borrador aislado) ahora incluye pruebas del cliente web de autenticación sin servicios reales: restauración de sesiones caducadas, single-flight, personal con token desactualizado, 403 sin renovación y cierre de sesión concurrente. Se añadió un paso obligatorio a GitHub Actions y se corrigieron dos regresiones del flujo de restauración. [Run 44012930520](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44012930520): paso de navegador simulado PASS, resultado total aún no confirmado al redactar. **No implica QA manual en dispositivos reales, aprobación de fotos, validación del administrador real ni autorización de desplegar.** No hay migración 021 en D1 remoto ni merge.


## Avance de seguridad de sesiones (16/11/2026, ensayo aislado)

El [PR #5 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/5) contiene la migración 021 de huella de refresh JWT, rotación de un solo uso con compare-and-swap en D1, compatibilidad de primer canje para sesiones históricas, y renovación automática **en RAM** para clientes y personal. Se agregaron controles de logout ante renovaciones en curso, reintento de peticiones concurrentes del admin y protección ante fallos de red al restablecer la sesión. GitHub Actions [44012238458](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44012238458) aprobó el bloque anterior; últimos ajustes en CI [44012524232](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44012524232) pendientes de resultado. No almacenar refresh en sessionStorage/localStorage: al recargar puede requerirse autenticación otra vez. PR #5 sin fusionar, no aplicado a producción; QA real móvil, WAF, 401 admin real y consentimiento de fotografías siguen pendientes. No cerrar la etapa 2 ni ninguna de las 7 puertas de publicación por CI sintética.


Actualizado: 15 de noviembre de 2026. Rama de desarrollo: `feat/cloudflare-customer-accounts-hardening`.
**Estado:** plan aprobado para iniciar por entregas. No es garantía de funciones activas.
**No aplicar migraciones a D1 remoto ni desplegar API/Pages sin pruebas, copia de seguridad y autorización del propietario.**


## Renovación de sesión con permisos actuales — 16/11/2026

- Para renovar JWT de personal, se consulta `admin_users` en D1 y se exige `admin`/`operator` activo; para cliente, se valida cuenta activa y rol `customer`. Evita transmitir permisos antiguos al nuevo token.
- Pruebas HTTP aisladas de renovación por rol, rechazo de access como refresh y de refresh como acceso, aislamiento de operadores/clientes y revocación tras logout. Tres GitHub Actions de commit `8959a8a1` SUCCESS: [44008224028](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44008224028), `44008223971`, `44008216502`. No se han tocado clientes reales ni producción.
- Persisten la revisión sobre posible rotación de refresh tokens, WAF/Turnstile, 401 histórico real de admin, QA móvil y consentimiento/ICC. PR #4 sigue abierto sin fusionar. **Siete hitos de publicación pendientes; etapa 2 en progreso.**

## Protección de recuperación de acceso y sesiones de clientes — 16/11/2026

- El cliente puede cambiar su contraseña sin dejar otras sesiones válidas por un fallo entre operaciones: cambio de hash y revocación de sesiones ajenas ahora son un lote D1 transaccional. Se comprueba el hash anterior para evitar una actualización concurrente silenciosa.
- Pruebas de acceso y refresh en dos sesiones ficticias, cambio con clave actual inválida y nueva contraseña: [GitHub Actions 44006778238](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44006778238), `44006778251` y `44006769880` SUCCESS. No se modificaron clientes reales ni se ejecutaron despliegues.
- Se mantiene la sesión del dispositivo que solicita el cambio, como estaba previsto; decisión de UX/seguridad pendiente para posibles políticas más restrictivas. [PR #4](https://github.com/Jorge123tkd/Energia-Vital/pull/4) sigue en revisión, sin merge. **7 etapas de publicación pendientes; la segunda sigue en progreso**.

## Protección de configuración inicial de administrador — 16/11/2026

- `POST /api/auth/setup` emplea `INSERT ... WHERE NOT EXISTS` dentro de la misma operación D1: evita crear múltiples primeros administradores por solicitudes simultáneas con correos distintos.
- La integración Worker/D1 ficticia verificó una creación exitosa y rechazo 409 de las restantes, sin perder control de contraseñas ni modificar cuentas existentes. [CI 43953733232](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43953733232) y otras dos validaciones SUCCESS; despliegues omitidos.
- La configuración inicial no sirve para restablecer el antiguo login admin 401. Sigue sin consultarse la D1 de producción; el PR #4 continúa abierto en borrador. Se mantienen **siete etapas completas pendientes** de salida con la segunda en progreso.

## Revisión de acceso de clientes — 16/11/2026 (etapa 2/7)

- Se corrigió el manejo de cuerpos JSON en creación de citas y solicitudes: errores 400 ante datos malformados, tipos inesperados o fechas no textuales. Se conservan permisos JWT de cliente y las reglas existentes contra reservas solapadas.
- Nuevas pruebas con identidades ficticias confirman bloqueo de administrador/anónimo en rutas de citas privadas y errores controlados, sin exponer datos. [GitHub Actions 43949536145](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43949536145): SUCCESS; `deploy-api` y `deploy-web` omitidos.
- El PR #4 de dependencias sigue **borrador sin fusionar**, con las alertas npm residuales bajas bajo revisión. Continúan pendientes el 401 del administrador real, WAF/Turnstile, QA móvil, fotos consentidas/ICC y el respaldo D1/R2. **Siete etapas de publicación pendientes; la segunda en curso.**


## Avance 16-11-2026 — cuentas administrativas y control de sesiones

- Migración `020_last_admin_guard.sql`: dos triggers D1 conservan al menos un administrador activo aun con cambios concurrentes. La API devuelve 409 ante el conflicto y conserva auditoría y revocación de sesiones dentro de transacciones.
- Pruebas de integración con identidades de prueba: promoción, degradación y desactivación de gestor; bloqueo de tokens de acceso y refresh anteriores, mantenimiento del historial. [CI 43951639831](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43951639831) aprobada junto a `43951639834` y `43951626221`. Migraciones 013-020 preservan registros ficticios.
- La migración 020 todavía no se ha ejecutado en D1 de producción. Faltan auditoría y respaldo autorizados antes de publicarla, WAF, 401 admin real, pruebas manuales de la web y privacidad de fotografías. PR #4 no se fusionó. **7 etapas restantes**, etapa 2 abierta.

## Estado verificado 15-11-2026 — 5B2g y pasos pendientes
## Último estado de dependencias — 16/11/2026

- [PR #4 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/4) tiene ahora Hono 4.13.18, Vite 6.4.6, plugin Svelte 5.1.1, Undici 7.30.2 y Svelte 5.57.3 único en lockfile. Tras `npm dedupe` auténtico y [CI aislada 43946090393](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43946090393), el reporte npm completo es **0 críticas, 0 altas, 0 moderadas, 3 bajas**; reporte solo producción: **0 alertas**.
- Las tres bajas corresponden a la cadena del plugin Svelte/inspector y `deepmerge`, sin arreglo automático recomendado por npm. Se revisarán según riesgo y compatibilidad sin forzar el stack.
- El cambio quedó en lockfile del mismo PR #4, commit `ce8d32c0` y cuatro archivos de dependencias en total; se retiraron workflows temporales. **Ningún PR fusionado ni Cloudflare real modificado**. Continúan 7 hitos de publicación, etapa 2 abierta (WAF, admin 401 real, QA y políticas de privacidad).

## Actualización 16-11-2026 — integración de seguridad de dependencias

- [PR #4 borrador](https://github.com/Jorge123tkd/Energia-Vital/pull/4) reúne Hono 4.13.18, Vite 6.4.6, plugin Svelte 5.1.1 y Undici 7.30.2 en un lockfile generado por npm con integridad. [Actions 43943927309](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43943927309) **SUCCESS**: instalación reproducible, auditoría npm (0 críticas, 0 altas, 1 moderada, 3 bajas), compilación y pruebas integrales con Worker/D1 de CI.
- Los workflows temporales de escritura se retiraron; el PR modifica solo cuatro archivos de dependencias. **Sin fusión a la rama de trabajo o main y sin despliegue**. PR #2 y #3 permanecen como antecedentes separados.
- Requiere revisión humana del PR, QA móvil, WAF y error de inicio de sesión del administrador real; fotos consentidas/ICC y condiciones de respaldos D1/R2 siguen sin verificar. **7 hitos de publicación pendientes**, etapa 2 en progreso.



- Se avanzó en GitHub con tratamiento de evidencias JPEG, PNG y WebP, controles de orientación EXIF, CRC-32 PNG, verificación puntual R2/D1 (solo administrador) y validación estructural limitada de ICC en nuevos archivos (perfil completo JPEG, envoltura PNG iCCP y WebP ICCP, tope 1 MiB). Se preserva perfil de color; **no se garantiza eliminación de metadatos internos ICC** ni autenticidad del contenido fotográfico.
- La preparación no ha accedido a Cloudflare D1/R2 reales ni ha publicado API/Pages o fusionado main. El siguiente hito requiere ensayos de orientación/color en fotos consentidas, política de datos aprobada y revisión de permisos.
- **Plan operativo para publicación controlada de Brigadas y Expediente 360°:** [7 etapas pendientes](./PLAN-7-ETAPAS-PUBLICACION.md), incluidos ensayo visual/legal, QA integral, inventario remoto read-only autorizado, respaldo cifrado D1/R2, restauración aislada, revisión de versión y publicación/monitoreo con aprobación expresa. No son pasos para dar por finalizada toda la plataforma Bonaire.

## Avance de seguridad de accesos — 15-11-2026 (etapa 2/7 en curso)

- Revisadas rutas de autenticación de administrador y clientes. El backend ahora responde con errores controlados frente a JSON no válido en login, setup, refresh, perfil y contraseña, sin cambiar reglas PBKDF2/JWT ni tocar usuarios existentes.
- Pruebas automáticas añadidas en `apps/api/tests/integration.cjs` con Worker y D1 aislados; [matriz de acceso y plan de diagnóstico 401](./VALIDACION-SEGURIDAD-ACCESOS.md).
- El antiguo inicio de sesión administrativo falló con 401 en el entorno real y **NO se ha comprobado ni resuelto en producción**. No inventar un restablecimiento sin aprobación. Pendiente QA móvil, WAF, revisión de dependencias y políticas de fotos/ICC.
- [Plan de siete etapas](./PLAN-7-ETAPAS-PUBLICACION.md): la etapa 1 (fotos/privacidad) continúa pendiente por falta de fotos reales consentidas y política aprobada; la etapa 2 (seguridad/QA) está en progreso. Se mantienen 7 etapas de publicación sin cerrar.

## Segunda revisión de seguridad — 15-11-2026 (etapa 2/7)

- El límite D1 por IP y ventana ahora incrementa y obtiene el mismo contador en operación atómica. Pruebas concurrentes de acceso han pasado en GitHub Actions, sin tocar usuarios reales.
- El flujo de CI de la rama incluye auditoría informativa npm de ejecución y total. Primer resultado: en producción 1 alerta moderada y ninguna alta/crítica; en el conjunto completo de dependencias (incluye desarrollo), 2 altas, 7 moderadas y 1 baja. **Este dato no declara seguridad ni autoriza despliegue.** Las alertas deben clasificarse y remediarse de forma verificada.
- Pendiente verificar políticas Cloudflare WAF/Turnstile, casos de IP compartida y retención de filas históricas de límites de peticiones. No hay borrado ni limpieza automática en este cambio.
- La etapa 2/7 continúa abierta: requiere revisión manual, 401 del admin real, seguridad de dependencias y pruebas con clientes ficticios. La etapa 1 sigue pendiente de consentimiento y fotos reales. Se mantienen **7 etapas de salida**, sin publicar ni migrar D1 remota.

## Dependencias de producción — PR seguro preparado, 16-11-2026

- Hono `4.13.13` se identificó como dependencia de producción con alerta moderada. La actualización correctiva a `4.13.18` está preparada **exclusivamente en PR borrador [#2](https://github.com/Jorge123tkd/Energia-Vital/pull/2)**, dirigida a la rama de trabajo, no a `main`.
- `npm install` regeneró el lockfile en un runner de GitHub con `npm ci`, TypeScript API, Svelte, compilación web, prueba de integridad de migraciones ficticias y pruebas completas Worker+D1 en ensayo; [run 43813010675](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43813010675) SUCCESS. La auditoría de paquetes de producción del ensayo no arrojó alertas críticas/altas/moderadas.
- El PR solamente propone dos cambios de dependencias, no está fusionado. El workflow temporal de mantenimiento fue retirado. Vite y Undici siguen pendientes de revisión de vulnerabilidades de desarrollo.
- No se modifica producción, usuarios reales, D1/R2, Worker/Pages ni `main`. **7 etapas de publicación siguen pendientes**, con la segunda en progreso.

## Progreso de seguridad: Vite y Undici — 16-11-2026

- [PR #3 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/3) plantea Vite 6.4.6, plugin Svelte 5.1.1 y Undici 7.30.2, con `package-lock.json` regenerado por npm y override controlado de Undici 7. El ensayo [GitHub Actions 43815249208](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43815249208) superó instalación, compilación y pruebas Worker/D1 de CI; el informe npm del candidato arrojó **0 críticas, 0 altas, 1 moderada, 3 bajas**.
- [PR #2 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/2) mantiene separado el parche de Hono 4.13.18. No fusionar sin reconciliar los cambios del lockfile; comprobar ambos cambios juntos antes de aprobar publicación.
- **Producción sigue sin tocarse.** El 401 de administrador real, QA móvil, WAF, fotografías/ICC, D1/R2 respaldos y restauración siguen pendientes. Para publicar Brigadas/Expediente 360° continúan siete etapas completas de control.

## Control de integración de seguridad — 16-11-2026

- Los PR [#2 Hono](https://github.com/Jorge123tkd/Energia-Vital/pull/2) y [#3 Vite/Undici](https://github.com/Jorge123tkd/Energia-Vital/pull/3) siguen abiertos como borrador y validados individualmente.
- Los ensayos de combinación revelaron que npm mantiene Hono 4.13.13 en una ruta anidada al usar instalación solo-lockfile: **no existe aún un candidato integrado que haya superado validación**. Los workflows temporales con permisos de escritura se retiraron; no se ha fusionado ninguno.
- El próximo cambio debe basarse en [criterios de integración reproducible](./INTEGRACION-DEPENDENCIAS-PR2-PR3.md) y comprobar instalación real, `npm ci`, auditoría y pruebas de CI antes de aprobar. No se ha tocado Cloudflare producción.
- La etapa 2 de seguridad sigue abierta. **7 hitos pendientes** para la publicación limitada de Brigadas/Expediente 360°.

## Norte del proyecto

Bonaire es una plataforma comercial y de gestión para Cuba: energía renovable, servicios técnicos, propuestas empresariales, posibles colaboraciones comerciales y futuras líneas autorizadas. No confundir cotización con contrato, fondos declarados con fondos recibidos, ni orientación del asistente con decisión oficial.

Proceso objetivo: captación → solicitud → expediente 360° → gestor → propuesta revisada → aprobación/contrato → trabajo programado para brigada (si aplica) → resultado → posventa.

## Reglas acordadas

1. **Expedientes:** preservar solicitud original, estado, fotos, conversación, archivos, actividades y responsables. Memoria del asistente solo con identidad y permisos verificados; no registrar sin confirmación del cliente.
2. **Gestores:** con 1 o 2 gestores, ambos pueden atender cualquier caso sin reparto obligatorio. Cada actuación se atribuye a la cuenta del miembro del equipo que la realizó (no solo nombre público de WhatsApp). Con más de 2 gestores puede recomendarse distribución sin encerrar solicitudes en un único usuario.
3. **Cotizaciones:** estimación preliminar ≠ propuesta en revisión ≠ oferta oficial autorizada. Exigir revisión humana de precios, impuestos aplicables, vigencia, cantidades, existencias, transporte, plazos, garantías y condiciones. Versiones inmutables y control de emisión. Sin envío automático de ofertas contractuales.
4. **Pagos:** separar presupuesto declarado, fondos aprobados declarados, fondos disponibles declarados, condiciones negociadas, pago reportado y **pago verificado** por autorizado. No prometer modalidades/cambio legal sin revisión de normativa y permisos de la entidad en Cuba. El asistente no valida ingresos.
5. **Brigadas:** la entidad principal operativa es la brigada; tiene jefe, integrantes, especialidades y calendario. Actualmente dirección declara UNA brigada: no crear datos ficticios. Los **gestores** asignan trabajos. Con 1 brigada pueden asignar y reconocen la ocupación al proponer dos trabajos el mismo día. Con 2 se recomienda reparto equitativo por fecha libre y minutos estimados; el gestor elige y confirma si hay ocupación. Con **más de 2 brigadas**, cuando se pretende añadir un segundo trabajo a una brigada ocupada **el administrador general decide si aprobarlo**. Debe quedar pendiente sin confirmación hasta resolver; conservar solicitante, revisor, fecha y motivo. No reemplazar el requisito administrativo por un simple checkbox. La jornada local es `America/Havana`, y el trabajo tiene fecha explícita. El gestor debe comprobar viabilidad real aun cuando un sistema permita el calendario.
6. **Brigadas en web:** sección privada de Administración primero; no publicar fichas ni datos de integrantes sin permiso y revisión de privacidad. Las brigadas se relacionarán con solicitudes/citas, sin alterar citas previas. El jefe reporta información técnica, no aprueba pagos ni cotizaciones.
7. **Asistente:** responder primero y solicitar solo el dato útil que falte; no volver a pedir información conocida y autorizada; nunca crear solicitudes/citas/acuerdos sin confirmación explícita.
8. **Integridad:** cada etapa con pruebas automáticas, validación de permisos, pruebas manuales y rollback. Cloudflare D1 tiene respaldos y migraciones revisados.

## Entregas, con control de riesgo

| Etapa | Entrega utilizable | Dependencia / criterio de aceptación |
|---|---|---|
| 0 | Congelación y revisión: backup D1, seguridad de cuentas, pruebas y flujos vigentes | Sin pérdida de acceso ni regresiones |
| 1A | Fundación aditiva de brigadas: migración 013, reglas puras y tests (preparada en GitHub, NO desplegada) | `node apps/api/tests/brigade-policy.cjs` PASS; typecheck API; ensayo migración 013 en D1 local |
| 1B | Gestión privada de brigadas, jefe e integrantes en /admin | CRUD validado, solo personal autorizado, sin exposición pública |
| 1C | Asignación a solicitud y calendario por día, sugerencia equitativa, aprobación general para 3+ | Prueba 1, 2, 3 y 4 brigadas, dobles intentos concurrentes, cancelación, aprobación/rechazo, auditoría |
| 2 | Expediente 360°, actividades atribuibles a gestores y documentos | Datos previos conservados; permisos por expediente |
| 3 | Cotizaciones con versiones y revisión; *no* emisión automática | Firma/aprobación responsable y evidencia de condiciones |
| 4 | Seguimiento económico sin verificación automática falsa | Separación de declaración y comprobación, revisión jurídico-contable cubana |
| 5 | Agenda técnica y posventa integral con brigadas | No solapar sin regla, evidencias y cierres claros |
| 6 | Asistente conectado a expedientes autorizados, análisis de oportunidades y crecimiento | Chat ágil, sin interrogatorio, seguimiento medible |

**Nota actualizada:** 1A, 1B y 1C están preparadas y verificadas mediante GitHub Actions (Worker+D1 temporal, permisos reales, regresión de la web y APIs). **NO se han desplegado** y la migración 013 sigue sin aplicarse a D1 remota. Solo se habilitarán en producción tras respaldo, revisión de compatibilidad con datos históricos y autorización del propietario.

## Entrega 1A verificada en D1 local (evidencia del usuario, 13-11-2026)

- Usuario realizó `git pull --ff-only` hasta `aadcae6` correctamente.
- Ejecutó `wrangler@4.161.0 d1 migrations apply energia-vital-db --local --persist-to "$sandbox"` en la carpeta TEMP `bonaire-brigadas-d1-prueba`, sobre base **LOCAL aislada**.
- Las **13 migraciones 001–013** terminaron con ✅, incluido `013_brigades_foundation.sql`.
- Consulta de `sqlite_master` comprobó tablas `brigades`, `brigade_members`, `brigade_work` y triggers `trg_brigade_work_guard_insert`, `trg_brigade_work_guard_approval` y `trg_brigade_work_immutable_target`.
- **No se aplicó ninguna migración a D1 remoto**. Esta prueba de instalación no equivale a pruebas de asignación concurrente.

## Entrega 1B preparada para pruebas (no desplegada)

- `apps/api/src/routes/brigades.ts`: API privada en `/api/brigades`. Lectura exclusivamente a personal validado; crear/editar brigadas y sus integrantes solo para admin. Conserva historial: desactivación, no borrado; impide desactivar brigada con trabajos programados; auditoría de cambios y control de versión para evitar pisar ediciones simultáneas.
- `apps/web/src/components/AdminBrigades.svelte`: nueva pestaña «Brigadas» en /admin; lista privada, ficha de jefe/especialidad, altas, edición y activación de integrantes; informa explícitamente que la asignación/calendario NO se han implementado.
- `apps/web/src/lib/api.ts` y `apps/api/src/index.ts`: conectan módulo sin alterar rutas antiguas de solicitudes ni citas.
- `apps/api/tests/brigades-admin-smoke.cjs`: pruebas sin red con middleware y DB simulados; complementan `brigade-policy.cjs`; añadidas al script npm test. **No se ejecutaron ni typecheck/build desde esta sesión.**
- Pendiente obligatorio antes de publicar: typecheck API + web, build web, pruebas smoke, regresión completa y pruebas integrales con D1 local y autorización real; respaldo y revisión de la migración 013 sobre copia representativa de datos remotos. La nueva pestaña y rutas no deben publicarse antes de que la migración 013 esté instalada en producción de forma segura.

## Entrega 1C — Agenda técnica y asignaciones (GitHub, sin despliegue)

- API `apps/api/src/routes/brigade-work.ts`, accesible solo con cuentas de personal activas:
  - `GET /api/brigade-work/availability?date=AAAA-MM-DD`: identifica brigadas ocupadas por fecha cubana, número de trabajos, minutos estimados acumulados en el mes y recomienda una brigada, sin asignarla automáticamente.
  - `GET /api/brigade-work/month?month=AAAA-MM`: agenda privada del mes, con responsables, estado y fecha; incluye trabajos pendientes y aprobaciones.
  - `POST /api/brigade-work`: gestores (`operator` y `admin`) registran trabajos vinculados a solicitud existente y no cerrada. La operación usa una inserción SQL que decide, atómicamente, si queda `scheduled` o `pending_approval`. En 1–2 brigadas, si ya hay trabajo, exige que el gestor confirme que revisó la ocupación; en 3+ nunca puede confirmar por sí mismo el segundo trabajo.
  - `GET /api/brigade-work/pending` y `PATCH /api/brigade-work/:id/review`: solo administrador principal puede consultar la cola de excepciones y aprobarlas/rechazarlas. El rechazo exige motivo; se registran identidad y fecha del revisor.
  - `PATCH /api/brigade-work/:id/cancel`: personal puede cancelar una asignación activa sin borrar historial, indicando motivo opcional.
- Se respetan los tres triggers de la migración 013. El sistema NO modifica el estado comercial de la solicitud al asignar, NI altera las citas del cliente, NI permite autoprogramación desde el asistente.
- La interfaz `apps/web/src/components/BrigadePlanner.svelte` amplía `/admin → Brigadas` con vista mensual, advertencias de ocupación, reparto sugerido, asignación y cola de aprobación exclusiva de admin. La tarjeta de solicitudes contiene enlace directo «Asignar brigada» con el ID precargado.
- El calendario general `StaffCalendar.svelte` combina citas, solicitudes con fecha orientativa y trabajos técnicos, distinguiendo claramente los pendientes de autorización.
- GitHub Actions verificó CI PASS en run `43551000617` (commit `c2569bc7`): TypeScript API/web, build web, migración D1 en runner, pruebas `integration.cjs` incluyendo asignación 1, 2 y 3 brigadas, concurrencia de dos gestores, rechazo y aprobación, y regresión de funciones anteriores. Se agregó prueba para **CUATRO brigadas** en commit `3d1f214f`; el run de GitHub Actions `43551156654` terminó **success**. El último ajuste visual `92fb27bf` también superó GitHub Actions (run `43551338548`: `checks` success, `deploy-api`/`deploy-web` skipped).

### Riesgos y operaciones pendientes para publicación

1. **No hacer despliegue automático:** el flujo `deploy.yml` ejecutó comprobaciones pero los jobs de publicación quedaron `skipped`.
2. **No migrar D1 remota sin respaldo verificado** y ensayo de migración 013 en una copia representativa de datos reales. Las pruebas sobre D1 vacía/temporal no sustituyen ese ensayo.
3. **Orden de liberación imprescindible:** copia D1 remota → validación de migraciones pendientes → aplicar solo las aprobadas → desplegar Worker → comprobar endpoints privados, permisos e integridad → publicar Pages → comprobar UI y calendario. Tener plan de rollback de Worker/Pages; no borrar filas ni migraciones para revertir D1.
4. **Trabajo técnico no completado automáticamente:** la fase actual programa y cancela, pero la confirmación de ejecución y evidencias del jefe de brigada pertenecen a la etapa de seguimiento técnico. No marcar completado sin esa evidencia.
5. La solicitud comercial y la agenda de brigadas tienen estados independientes. Esto es intencional; se integrarán en el expediente 360° sin cambiar el historial previo.
6. La recomendación por carga es orientativa: horas estimadas sin conocer aún transporte, equipamiento ni eventual indisponibilidad. El gestor decide según condiciones reales.
7. La identidad interna es la cuenta de personal validada; no asignar permisos basándose en el nombre de WhatsApp.

## Entrega 2A — Expediente Bonaire 360° con gestiones de gestores (GitHub, NO desplegado)

**Objetivo:** expediente único lógico que enlaza datos reales ya existentes sin duplicarlos.
Se han preparado `apps/api/src/routes/dossiers.ts`, `apps/web/src/components/DossierPanel.svelte`, sus accesos desde Clientes y Solicitudes y la migración **014_request_activities.sql**.

- **Por cuenta de cliente:** contacto, solicitudes, citas, asignaciones de brigadas, intervenciones de gestores, presupuesto y forma de pago **declarados**. Se muestra número de conversaciones del asistente vinculadas a esa cuenta, pero no el contenido de chats privados ni coincidencias dudosas por teléfono/nombre. No se seleccionan contraseñas, tokens, Telegram IDs ni otros secretos.
- **Por solicitud:** funciona tanto si el cliente tiene una cuenta como si es contacto sin cuenta de WhatsApp registrado manualmente; ficha, estado, descripción original, ubicación, fecha preferida, fotos adjuntas (cantidad), formas de pago declaradas, citas, trabajos, auditoría de movimientos y bitácora de actuaciones.
- **Bitácora nueva e inmutable:** llamada, WhatsApp, visita, seguimiento o nota interna, texto breve y próxima acción/fecha opcionales. Cada evento queda asociado automáticamente al `actor_id` de un JWT de empleado activo; ni gestor ni administrador pueden elegir un autor distinto, modificar o borrar una intervención. La inserción de actividad y su auditoría usa `D1.batch`. Los registros protegen la solicitud contra eliminación accidental por FK con `ON DELETE RESTRICT`.
- **1–2 gestores:** ambos pueden consultar y registrar gestiones en los mismos expedientes sin asignaciones obligatorias. Se conserva la identidad REAL de quien atendió.
- **Privacidad:** requiere `requireStaffAuth` para toda lectura o escritura. El cliente y el bot no pueden acceder al expediente interno. Este primer corte no publica datos en la web pública ni envía mensajes o notificaciones.
- **Control financiero:** NO crea presupuestos oficiales ni confirma transferencias, saldo, depósitos o pagos; solo muestra lo declarado y advierte que falta verificar.
- **Sin duplicar archivos:** las fotos siguen en su almacenamiento existente; el expediente enlaza al flujo autorizado de solicitudes. No añade nuevas rutas de descarga ni comparte R2 por defecto.
- **Escala y límites:** máximo 100 registros recientes por sección del expediente, indica truncamiento y conserva el resto de la historia en D1.

**Pruebas añadidas a `apps/api/tests/integration.cjs`:** acceso anónimo/cliente denegado, gestor y administrador comparten expedientes, resumen correcto de cuenta y solicitud, ocultación de secretos, creación de intervenciones con actor real, rechazo de `actor_id` enviado por cliente, no declaración de `payment_verified`, historial inmutable, protección ante borrado y ficha de solicitud de WhatsApp sin cuenta. La versión más reciente de estos casos (`9ac63b3f`) **superó GitHub Actions**: run `43554466964` completó job `API, web y pruebas reales con D1 aislada` en estado `success` (typecheck backend/frontend, build web y pruebas integrales Worker+D1 temporal, incluyendo expedientes vinculados a cliente y solicitudes WhatsApp sin cuenta). No hubo despliegue.

**Requisito de publicación:** nuevo SQL 014 y SQL 013 deben aplicarse solo después de respaldar D1 remota y ensayar en copia de datos representativa, y SIEMPRE antes de publicar la API/Pages que leen esas tablas. No publicar desde el workflow de PR. Revisión de permisos e integridad posterior al despliegue. El expediente no equivale a ERP, gestión contractual ni contabilidad.

### Pendiente de 2B / fases futuras

- Gestión opcional de reparto de clientes cuando haya más de 2 gestores, SIN encerrar un cliente en un único operador.
- Integrar estados de seguimiento técnico, evidencia de ejecución, versiones de cotización y comprobación de pagos mediante permisos propios.
- Seguimiento con recordatorios solo si se definen canales/consentimientos y periodicidad, no emitirlos por registrar una fecha.
- Historias paginadas y política de conservación de datos.
- Distinguir chat histórico privado y trazas comerciales sin exponer conversaciones a personal sin permiso correspondiente.

## Entrega 3A — Cotizaciones comerciales internas con versiones y revisión (GitHub, NO desplegada)

**Objetivo:** no confundir estimación del gestor con oferta oficial, contrato, factura ni fondos verificados. Se agregó la migración aditiva `015_commercial_quote_versions.sql`, sin reescribir clientes ni solicitudes.

- `apps/api/src/routes/quotes.ts`: módulo PRIVADO `/api/quotes` para personal autenticado. Gestores y administradores pueden preparar un borrador por solicitud abierta, con partidas, cantidades de hasta tres decimales, precio unitario en centavos USD, impuestos, transporte, descuento, plazo, vigencia, garantía, existencias, condiciones de pago, base de impuestos y condiciones logísticas. El servidor calcula los totales en centavos; no confía en un total enviado por la interfaz. Los importes son internos, pendientes de revisión.
- **Snapshots inmutables:** cada corrección crea una nueva versión numerada; la anterior permanece con su cálculo original y estado histórico. Triggers D1 bloquean editar contenido o borrar versiones, y prohíben saltarse transiciones. Un índice parcial evita dos versiones simultáneamente abiertas por solicitud.
- **Flujo:** `draft → in_review → approved_internal/rejected`. Para solicitar revisión se exige total positivo, vigencia no vencida y condiciones de entrega, garantía, pago, existencias, impuestos y transporte. Solo el administrador activo revisa, aprueba internamente o rechaza con motivo. El sistema conserva autor, revisor y fecha.
- **El estado `approved_internal` NO equivale a emisión comercial:** ningún endpoint envía el documento por correo, Telegram, WhatsApp, API pública, ni crea contrato, factura, pago o anticipo. Una etapa separada futura deberá autorizar la emisión formal y confirmar precios, stock, impuestos y régimen jurídico de cada operación.
- `apps/web/src/components/QuoteManager.svelte`: incorporado dentro de `DossierPanel.svelte` cuando se abre una solicitud, con nueva versión, detalle de partidas, historial, envío a revisión y controles de aprobación exclusivos de administrador.
- **GitHub Actions confirmado:** run `43671068881` para commit `784a7cba` resultó `success`. Pasaron TypeScript API, validación Svelte, build, migraciones 001–015 en D1 temporal, Worker+JWT+integración para cotizaciones (cálculo, versiones, permisos, revisión, rechazo, no emisión) y regresión general. `apps/api/tests/migration-preservation.py` pasó también con migración 015 sobre nueve conjuntos históricos ficticios y probó que no se puede editar/borrar una versión ni aprobarla saltando revisión.
- **Publicación pendiente:** la auditoría real de Cloudflare sigue bloqueada por secretos GitHub no configurados; **no se aplicó migración 015 remota ni se publicó Worker/Pages**. El gate de despliegue de la rama de desarrollo ahora exige las cinco tablas de 013–015, incluyendo `commercial_quote_versions`. La rama `main` sigue siendo distinta, y el PR amplio debe revisarse antes de publicación.

### Entrega 3B (posterior): ofertas comerciales autorizadas

No incluida en 3A. Necesita número comercial, condiciones vigentes, revisión jurídico-contable por cliente, verificación de moneda/reglas aplicables, stock y compromisos firmes, proceso de firma/expedición, y envío solo por personal autorizado tras confirmación explícita. No automatizar desde el asistente.

## Entrega 4A — Seguimiento económico privado y validación administrativa MANUAL (GitHub, NO desplegada)

**Objetivo:** separar dinero DECLARADO, dinero REPORTADO y revisión administrativa, sin presentar información declarada como fondos disponibles o pagos bancarios acreditados. No es contabilidad ni sustituto del banco.

- Migración aditiva `apps/api/migrations/016_request_financial_tracking.sql`: añade dos tablas vinculadas a solicitudes reales, sin copiar ni alterar `request_intake`, clientes, cotizaciones, citas ni brigadas:
  - `request_financial_declarations`: eventos inmutables de fondos declarados aprobados/disponibles, etapa de trámite informada, origen de la información, forma prevista de pago, propuesta de anticipo, plazo y fecha esperada, y comentario del gestor. **No son fondos confirmados ni autorización fiscal**.
  - `request_payment_reports`: importes informados por cliente, con `reported` (pendiente), `verified_manual` (evidencia examinada manualmente por administrador) o `rejected`. Historial inmutable, índice de referencia único por solicitud y protección ante doble revisión. No guarda credenciales bancarias ni números de cuenta y no crea recibos, facturas o movimientos bancarios.
- `apps/api/src/routes/finance.ts`: rutas privadas `/api/finance` para consultar/añadir declaraciones y reportes. `requireStaffAuth` deja a gestores registrar sin afirmar verificaciones. **Solo `requireAdminAuth`** permite revisar un pago reportado, con fuente de evidencia independiente, confirmación expresa y nota detallada; los triggers SQL comprueban también rol administrador activo. Una decisión no puede modificarse después. Cualquier corrección posterior requerirá un evento nuevo en una futura etapa, no reescribir el reportado.
- Cálculos por categoría: suma de importes **reportados pendientes** y **revisados manualmente**, sin sumar los rechazados. Se evita etiquetarlos como saldo bancario, ingresos contables o deuda contractual.
- `apps/web/src/components/FinanceTracker.svelte`: sección móvil/desktop dentro de `DossierPanel.svelte`. Registra forma de pago, cantidad declarada/aprobada, anticipo, plazos y detalles para clientes persona, mipymes o estatales; reporta supuestos pagos y permite ver resultados administrativos. No está disponible al cliente/bot y no hace transferencias.
- Se ejecutó GitHub Actions run `43724056680` (**success**) en commit `b0c5f1c739c49804ee96e38117a1efe3632291be`: typecheck API/web, build, 001–016 en Worker+D1 temporal, pruebas JWT para cliente/operador/admin, protección contra referencias repetidas, revisión única y auditoría, y ensayo de preservación de nueve conjuntos históricos **ficticios** con triggers nuevos. No garantiza compatibilidad con la D1 REAL.
- El gate de deploy de la rama de desarrollo ahora exige **7 tablas** nuevas de 013–016, incluyendo declaración y reporte; el auditor de D1 contempla migración 016 y se cambió a **activación manual**, para no acceder a producción automáticamente con cada edición del código.
- **NO aplicado a D1 de producción.** Auditoría remota todavía sin secretos Cloudflare de GitHub, respaldo D1 real todavía no realizado, publicación Worker/Pages pendiente de autorización.

**Siguientes etapas:** integración jurídica/contable y conciliación bancaria real a través de fuentes autorizadas, gestión de anticipos/contratos, correcciones económicas auditables y posventa técnica con evidencias. No afirmar pagos reales sin revisarlos en los sistemas de tesorería.

## Entrega 5A — Informes de brigadas y posventa con cierre técnico revisado (GitHub, NO desplegada)

Se incorporaron `apps/api/migrations/017_technical_followup.sql`, `apps/api/src/routes/technical-followup.ts` y `apps/web/src/components/TechnicalFollowUp.svelte` dentro del expediente privado por solicitud. **El módulo no se ha desplegado**.

- **Informes de trabajos programados:** gestor o administrador autenticado registra avance, incidencia o propuesta de finalización, siempre con identidad de cuenta del actor. Se distingue `staff_observed` de `chief_relayed`: transmitir información del jefe **NO equivale a firma ni acceso autenticado del jefe**. Fecha/brigada/solicitud permanecen vinculadas al trabajo original.
- **Evidencias:** texto que describe mediciones, actas u observaciones (obligatorio y más extenso para proponer cierre), y **referencia opcional a una foto que ya pertenece a esa misma solicitud**. La D1 rechaza imágenes inexistentes o de otra solicitud. La foto puede ser anterior al trabajo y **no certifica ejecución**; esta fase **no agrega carga de imágenes nueva, ni proporciona un certificado técnico firmado**.
- **Finalización:** el gestor puede proponer `completion_proposed`; la asignación se mantiene `scheduled` hasta que `admin` revise la información, indique motivos y confirme el cierre técnico. Al aceptar, un `D1.batch` registra decisión, cambia únicamente `brigade_work.status` a `completed` y audita. Triggers de D1 exigen informe aceptado por admin activo, bloquean la reapertura silenciosa y preservan el contenido previo. Si rechaza, sigue programado y puede presentarse otro informe corregido. No cambia el estado comercial de la solicitud, las citas ni los pagos.
- **Posventa:** casos independientes `service_followup_cases` con `incident`, `warranty_claim` (reclamación de garantía, **no cobertura confirmada**) y `post_sale_followup`. Personal abre casos y agrega notas inmutables en `service_case_notes`; solo administrador principal puede registrar cierre con justificación. No se envían notificaciones ni se generan obligaciones contractuales.
- **Permisos:** rutas `/api/technical` usan `requireStaffAuth`, con `requireAdminAuth` en revisión de informes de finalización y cierre de casos. Clientes, chatbot y canales públicos no tienen permisos. No existen credenciales individuales del jefe de brigada.
- **Pruebas CI aprobadas:** GitHub Actions run `43725720209` (SHA `b9a39e8b`) y run `43725875406` (SHA `e4ac5839`) terminaron **success**; adicionalmente, el run `43726234548` (SHA `c1bdb826`) terminó **success** tras reforzar triggers SQL para impedir informes ya preaprobados, casos creados como resueltos y notas en casos cerrados: TypeScript API/Svelte, build web, migraciones 001–017 en D1 temporal, integración real JWT/Worker, protección de roles, informes/aceptación/rechazo, reclamación y casos de posventa, auditoría, rechazo de foto de otra solicitud y ensayo de nueve conjuntos históricos **ficticios** en SQLite. No equivale a ensayo sobre copia real.
- **Bloqueo de despliegue:** la rama dev requiere ahora **10 tablas** de 013–017 en D1 real antes de publicar. Auditoría remota solo manual y aún bloqueada por credenciales GitHub no configuradas. **No se han aplicado migraciones remotas, no se ha creado respaldo real ni se han publicado Worker/Pages.**

### Entrega 5B — Pendiente de diseño y autorización

Flujo de autenticación del jefe de brigada, pruebas/firmas técnicas y relación de equipos instalados; subida privada de fotografías posteriores al trabajo a R2 con permisos, clasificación antes/después, integridad y políticas de privacidad/retención; garantías contractuales con vigencias y aceptación jurídica; futuras notificaciones consentidas, SLA y tareas de mantenimiento sin generar obligaciones automáticas.

## Entrega 5B1 — Jefes autenticados y evidencia técnica privada (código, no producción)

**Objetivo:** dar acceso directo al responsable técnico SIN convertirlo en operador/admin ni mezclar cuentas y permisos de clientes. Fase 5B1 implementada en rama dev, sin despliegue ni usuarios reales creados.

- Migración `018_chief_access_evidence.sql` **aditiva**, cuatro tablas: `brigade_chief_accounts` (una credencial personal por brigada activa, creada por administrador, contraseña hasheada con PBKDF2); `brigade_chief_sessions` (token aleatorio de 256 bits, en D1 solo SHA-256 y caducidad de 8 h); `brigade_chief_reports` (avances, incidencias y propuestas de cierre con autor autenticado, inmutables); `brigade_evidence_images` (metadatos de foto privada R2, SHA-256, etapa antes/durante/después, hasta 12 por trabajo, sin compartir URL del bucket).
- La autenticación técnica está aislada en `apps/api/src/chief-auth.ts`, **no** expande los CHECK de `admin_users` o `auth_sessions` ni reutiliza JWT de cliente/administrador. `apps/api/src/routes/brigade-chief.ts` crea/cambia credenciales **solo con `requireAdminAuth`**, valida contraseñas y limita inicios de sesión, revoca sesiones ante contraseña nueva/desactivación, autoriza cada lectura/escritura por `brigade_id` y estado de brigada/obra, y bloquea acceso cruzado a otras brigadas, datos comerciales, pagos y administración. D1 refuerza la relación y prohíbe editar/borrar informes/fotos.
- **Cambio de jefe:** trigger SQL desactiva automáticamente el acceso anterior al cambiar `brigades.leader_name` o desactivar una brigada. No se vuelven a activar automáticamente credenciales anteriores. Dirección debe confirmar al nuevo responsable antes de darle credenciales.
- **R2 privado:** el jefe envía PNG/JPEG/WebP de máximo 5 MB, con comprobación de firma de archivo, SHA-256 y metadatos en D1. Si falla D1 se elimina el objeto R2 recién creado. Las descargas requieren token propio de jefe asignado o sesión de personal autorizado, con respuesta `Cache-Control: private, no-store`; no se exponen claves `r2_key` ni URLs públicas. **La foto original puede conservar metadatos EXIF/GPS; revisar consentimiento, clasificación, borrado/retención y eventual limpieza de metadatos antes de publicación.**
- **Portal móvil privado:** `/jefe-brigada` en `ChiefPortal.svelte` para iniciar sesión técnica, ver trabajo asignado, registrar avance y adjuntar evidencias. En `AdminBrigades.svelte` el administrador gestiona cuentas con `ChiefAccounts.svelte`; en `TechnicalFollowUp.svelte` el personal autorizado ve informes efectivamente ingresados por la cuenta del jefe y fotos privadas enlazadas a la misma solicitud. Ninguna ruta lo inserta en chat público, asistente ni galería.
- **Sin firma digital ni aprobación automática:** `brigade_chief_reports` demuestra qué cuenta autenticada ingresó información; no constituye firma electrónica con identidad civil verificada, certificación técnica ni aceptación de garantía. La propuesta de cierre del jefe es independiente del flujo `technical_work_reports` de 5A: **solo dirección** revisa/cierra por ese proceso; no cambia contratos, solicitudes comerciales o pagos.
- **Pruebas:** integración Worker+D1 temporal con dos brigadas y jefes, password incorrecta, rechazo de roles indebidamente elevados, acceso cruzado a informes/fotos, imagen PNG privada en R2, firma PNG inválida, hash/caché, cierre de sesión, rotación/desactivación y sustitución del responsable. `migration-preservation.py` preserva nueve conjuntos ficticios preexistentes y ensaya relaciones/guardas de 018. Evidencia [run CI 43728001383](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43728001383) **success** para código inicial, [run CI 43728482147](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43728482147) **success** tras triggers de sustitución; run de sustitución de jefe `43728712337` **success** y run final de documentación `43729034195` **success**; se validaron API, Svelte, build, migraciones 001–018, pruebas de preservación y Worker+D1/R2 aislados. No hubo deploy.
- **Producción no tocada:** no D1 remota, no Worker, no Pages, no R2 real, no cuentas reales ni datos privados; auditoría D1 sigue pendiente de secretos GitHub y autorización separada. Despliegue de la rama ahora bloqueado hasta verificar **14 tablas nuevas de 013–018**; prueba sobre copia privada de D1 real y respaldo R2 previo a cualquier escritura/publicación.

### Entrega futura 5B2

Estudiar firma electrónica/certificación de identidad, mantenimiento preventivo y protocolos de aceptación, política de retención y limpieza de EXIF, avisos consentidos, controles antimalware/validación más profunda de ficheros y firma contractual de garantías. La identidad técnica por contraseña NO equivale a identidad verificada ni firma jurídica.

## Entrega 5B2a — Cierre técnico directo del jefe con revisión humana (GitHub, NO publicada)

**Se completó un bloque entero y se validó automáticamente, sin despliegue.** El jefe autenticado puede registrar un informe de finalización en su portal. En el expediente 360°, un administrador activo puede aceptarlo o rechazarlo con motivo desde el propio informe; si acepta, se cierra **solo el trabajo técnico**, nunca la solicitud comercial, el contrato, la garantía ni los cobros.

- `019_chief_completion_review_bridge.sql` añade exclusivamente `chief_completion_reviews`: vínculo inmutable y único entre informe original del jefe y snapshot de revisión administrativa de `technical_work_reports`. Trigger de D1 exige que ambos informes correspondan al mismo trabajo, tengan exactamente los mismos textos de evidencia, que el informe sea `completion_proposed` y que el administrador esté activo. No se modifica ningún dato histórico ni las restricciones originales de brigadas.
- `apps/api/src/routes/technical-followup.ts` añade `PATCH /api/technical/chief-reports/:id/review` bajo `requireAdminAuth`: validaciones de decisión, justificación, confirmación técnica y un solo `DB.batch` para preservar informe del jefe, registrar snapshot técnico, revisión, cierre (si procede) y auditoría. Rechazo deja el trabajo programado. Una revisión duplicada, rol insuficiente, propuesta pendiente concurrente o trabajo ya cerrado es rechazada. La lista de expediente muestra quién ingresó el informe y quién revisó.
- El frontend `TechnicalFollowUp.svelte` presenta la decisión junto al informe original y el historial. Se conserva el circuito 5A de informes internos para los casos que no procedan del jefe autenticado.
- **Validación:** GitHub Actions `43750910764` y `43751037341` finalizaron **success**: typecheck backend, Svelte, build web, Worker+D1 temporal, casos de aceptación/rechazo, permisos, auditoría y pruebas con SQLite ficticio aplicando migraciones 001–019. Los nombres de usuario, informes y fotos en pruebas son sintéticos; NO se consultó D1/R2 de producción.
- Gate de publicación reforzado: exigir **15 tablas nuevas (013–019)** y auditar migración 019 solo mediante el workflow manual read-only. Quedan pendientes backup real de D1 y R2, ensayo de restauración/copia representativa, consentimiento/EXIF de imágenes, política documental de certificados, aprobación del propietario y despliegue.

**Aún no implementado:** una firma electrónica o certificado jurídico válido, pólizas y cobertura contractual de garantías, conciliación bancaria, ni aceptación automática de un trabajo por parte del jefe.

## Validaciones antes de activar la función

- Test de 1/2/3+ brigadas; 2 asignaciones un día; rechazo, aprobación solo admin y auditoría.
- Ningún usuario cliente ni bot puede ver integrantes o asignar brigadas.
- Si cambia de 2 a 3 brigadas, la próxima asignación conflictiva exige aprobación; los históricos no se borran.
- Fecha local correcta en Cuba; mantener trabajos históricos sin convertirlos a días UTC.
- D1: `013_brigades_foundation.sql` debe crear tablas sin modificar las existentes.
- Dos gestores concurrentes no deben producir un segundo trabajo confirmado cuando hay más de 2 brigadas: verificar atómicamente en SQL.
- Reversión: no eliminar tablas con datos ni restaurar D1 sin aprobación explícita del propietario.

## Pendiente de especificar antes de 1B/1C

Duración habitual de servicios por brigada; quién crea y desactiva integrantes; cómo representar múltiples días; permisos concretos del jefe de brigada; cómo declarar indisponibilidad por vacaciones/transporte; política para adelantar/cancelar trabajos; identificación privada de gestores con cuenta de personal. No inventar estas respuestas ni añadir permisos amplios para resolverlas.
