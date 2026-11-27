# Bonaire: preparación de vista previa Cloudflare totalmente aislada

## Actualización de consolidación y datos QA — 17/11/2026
La rama única autorizada para continuar el desarrollo es `feat/cloudflare-customer-accounts-hardening`. Se corrigió en `.github/workflows/cloudflare-qa-preview.yml` la condición de rama obsoleta del candidato de release, sin crear otra rama. Se añadió confirmación obligatoria `qa_snapshot_protected` para evitar publicar una vista previa mientras la copia restaurada contenga datos reales sin controles sobre **API y Pages**.

**Estado real de QA:** el respaldo privado del 17/11/2026 ya fue restaurado a `energia-vital-qa-db`, con 59 tablas y migraciones registradas 001–012. Por tanto, las instrucciones anteriores que suponen una base vacía o solo datos ficticios ya no describen el entorno actual. Hasta que se verifique la protección efectiva del Worker y del proyecto Pages, **NO lanzar la vista previa**; marcar una casilla manual no instala Cloudflare Access. No reutilizar autenticaciones, secretos o datos reales para hacer pruebas públicas. Migraciones 013–021 aún no ejecutadas en QA.

La ejecución `workflow_dispatch` puede requerir disponer del workflow en la rama predeterminada `main`; no se ha copiado allí ni se ha cambiado la rama por defecto. El entorno de producción no se ha modificado.

**17/11/2026 — Estado: PREPARADO EN CÓDIGO, SIN DESPLIEGUE.** La aprobación de preparar QA no equivale a autorización para publicar la web final.

## Bloqueo real detectado
El archivo original `apps/api/wrangler.toml` de producción declara `energia-vital-api`, una D1 real, el R2 `energia-vital-assets`, `ENVIRONMENT=production` y tareas cron que ejecutan recordatorios. **No se puede reutilizar ese archivo para pruebas remotas.**

## Archivos QA preparados en PR #7
- `scripts/prepare-cloudflare-qa-config.cjs`: crea un Wrangler temporal QA, solo con nombres y UUID de recursos de ensayo, sin cron ni secretos de Telegram/WhatsApp; exige dominios Worker/Pages QA HTTPS y rechaza nombres/UUID conocidos de producción.
- `scripts/prepare-cloudflare-qa-config.test.cjs`: verifica que se bloquea toda reutilización de Worker, D1, R2 y Pages reales; incorporado al CI ordinario.
- `.github/workflows/cloudflare-qa-preview.yml`: workflow de GitHub **solo manual**, restringido a rama `release/combined-security-deps-20261117`, confirmación escrita `PUBLICAR_SOLO_QA`, confirmación de D1 de ensayo migrada y Cloudflare Access/privacidad de QA. Comprueba esquema D1 QA con SELECT, valida código, despliega Worker QA y Pages QA a rama `release-preview`. No migra D1 QA por defecto ni despliega producción.
- La acción de workflow_dispatch de GitHub Actions **solo aparecerá/será ejecutable cuando el archivo de workflow también exista en la rama predeterminada del repositorio**; no eludir esa regla mezclando en `main` sin revisión. Confirmar antes el funcionamiento de los permisos de Actions del repositorio.

## Preparación fuera del código (Cloudflare/GitHub Settings, requiere propietario)
1. Crear la base D1 de ensayo, distinta de `energia-vital-db`; no copiar registros comerciales reales ni incluir datos privados.
2. Crear un bucket R2 QA distinto de `energia-vital-assets`.
3. Crear/configurar Worker QA con nombre distinto de `energia-vital-api` y proyecto Pages QA distinto de `energia-vital-web`. **Verificar que la URL de producción permanece intacta**.
4. Aplicar migraciones completas a la D1 QA **solo con aprobación de operaciones de QA**, usando la base de datos de ensayo y sin secreto ni cliente de producción. No ejecutar `migrations apply --remote` con el archivo productivo.
5. Proteger la web de ensayo mediante Cloudflare Access o restricción equivalente; los servicios de ensayo nunca deben permitir registros de clientes reales. No copiar tokens, bot de Telegram o cuentas productivas.
6. Guardar en **GitHub Actions variables**: `QA_D1_DATABASE_ID`, `QA_D1_DATABASE_NAME`, `QA_R2_BUCKET_NAME`, `QA_WORKER_NAME`, `QA_PAGES_PROJECT`, `QA_API_URL`, `QA_SITE_URL`. Todos los nombres QA deben contener la palabra separada `qa` y ser exclusivos; el Worker QA termina en `workers.dev`, Pages QA en `pages.dev`. Ejemplo de nombres: `energia-vital-qa-db`, `energia-vital-qa-assets`, `energia-vital-api-qa`, `energia-vital-qa-web`.
7. Mantener credenciales Cloudflare solo en **GitHub Actions secrets**; no registrar en chat, docs ni commits. Verificar permisos mínimos y que el flujo no tiene autoridad para modificar recursos de producción; el validador de nombres es una defensa, no sustituye un token Cloudflare con alcance limitado.

## Comprobaciones antes de aprobar QA
- PR #7 CI completa sobre SHA actualizado (incluyendo test de bloqueo de vínculos productivos).
- Revisión humana de workflow y permisos, configuración de recursos QA separada y Cloudflare Access.
- Comprobar D1 QA migrada con datos **ficticios** y bucket vacío o con muestras consentidas.
- Confirmar una URL de Pages **de QA** y comprobar que todas las llamadas `/api` van al Worker QA; si apunta a `energia-vital-api.astrustrus.workers.dev`, detener.
- Realizar pruebas de administrador/cliente/brigadas/asistente con cuentas ficticias.
- No dar por resuelto el 401 de producción con un usuario ficticio de QA.

## Lo que sigue
Obtener los IDs/nombres de recursos QA por configuración segura (no crear recursos con nombres reales sobre la marcha), poner a disposición de GitHub el workflow manual una vez aprobado y ejecutar **solo el entorno QA**. El inventario de producción sigue siendo **solo lectura y requiere autorización específica**; el despliegue de producción, backup y migraciones tienen puertas separadas.
