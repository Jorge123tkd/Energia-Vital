# Respaldo D1 de producción a R2 privado — procedimiento manual preparado

## 17/11/2026 — Instalador de Cloudflare preparado sin usar Windows
En el [PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7) se añadió `.github/workflows/install-backup-workflow.yml` (commit `597e0940`). Es una acción **manual** que exige confirmación `INSTALAR_WORKFLOW_RESPALDO`, rama de release específica, SHA exacto aprobado, `npm ci`, prueba de política y compilación `wrangler deploy --dry-run`. Despliega **solo** `apps/d1-backup/wrangler.toml` y consulta `workflows describe`; **NO llama** `workflows trigger`, no exporta D1, no modifica D1, no afecta Worker ni Pages públicos. La prueba de este bloqueo está en `apps/api/tests/backup-workflow-policy.cjs` (commit `56611964`). Requiere `BACKUP_CF_DEPLOY_TOKEN` de alcance mínimo, creado como GitHub Actions Secret sin exponerlo. El secreto `D1_EXPORT_API_TOKEN` del Worker sigue siendo independiente; debe configurarse por canal seguro antes de iniciar una exportación. **ADVERTENCIA GITHUB:** un workflow nuevo con `workflow_dispatch` en una rama no predeterminada no aparecerá ejecutable en la interfaz hasta que exista en la rama predeterminada. No copiar este workflow a `main` sin una revisión y autorización explícita; no improvisar un deploy local. Falta verificar CI del último SHA, revisión del instalador, permisos y disponibilidad del disparador.

**Estado al 17/11/2026: CÓDIGO PREPARADO EN PR #7, NO INSTALADO EN CLOUDFLARE, NO EXPORTADO.**

## Evidencia comprobada por el propietario
- Base de producción `energia-vital`, UUID `bbb91e7a-37c6-4290-aa9c-29a8022226b4`, 58 tablas, migraciones 001–012 y `auth_sessions` sin `refresh_hash`.
- D1 de prueba `energia-vital-qa-db`, UUID `62755365-2c9a-4b20-8933-21209609a94b`, vacía; no se copian datos reales automáticamente.
- R2 `energia-vital-backups-private`, sin dominio personalizado y con r2.dev desactivado; verificado en CLI.
- Punto D1 Time Travel recuperable registrado por el propietario. Time Travel no sustituye respaldo externo.

## Arquitectura preparada
- `apps/d1-backup/wrangler.toml` configura Worker **independiente** `energia-vital-d1-backup`; vincula **solamente** R2 de respaldos, sin D1, cron, web pública, Telegram ni integración con el Worker `energia-vital-api`.
- `apps/d1-backup/src/index.ts` implementa Workflow `energia-vital-d1-backup-manual`. Solo arranca tras el parámetro `{\"confirm\":\"RESPALDAR_D1_EN_R2\"}`, valida los IDs, inicia exportación **SQL compatible con D1** en API Cloudflare, consulta hasta recibir URL firmada, transmite el SQL al bucket privado, y verifica objeto/longitud con R2 HEAD. No imprime SQL ni URL firmada; su HTTP responde 404.
- `apps/api/tests/backup-workflow-policy.cjs` verifica ausencia de cron, bucket privado, confirmación manual, transferencia a R2 y verificación; el CI del PR #7 también hace `wrangler deploy --dry-run`, sin subir nada.
- El flujo **NO cifra por sí mismo el archivo SQL dentro de R2**. Es almacenamiento privado con controles de acceso; si se necesita cifrado de aplicación con clave independiente, auditarlo antes de considerarlo respaldo cifrado.

## Riesgos de exportación (leer antes de autorización)
Cloudflare advierte que **D1 export puede bloquear temporalmente solicitudes** a la base mientras dura la operación, por eso seleccionar una ventana de bajo tráfico e informar del posible impacto. La API de exportación requiere permiso D1 **Write**, aunque no cambia el esquema; hay que crear un token específico con privilegios mínimos y revocarlo cuando finalice. No usar el token OAuth personal existente ni subirlo a GitHub, logs o chat. Referencias:
- https://developers.cloudflare.com/workflows/examples/backup-d1/
- https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/
- https://developers.cloudflare.com/d1/observability/debug-d1/
- https://developers.cloudflare.com/workflows/reference/wrangler-commands/

## Secuencia de implementación, SOLO con autorización separada
1. Revisar diff del PR #7 y CI del último SHA, y confirmar compatibilidad de Cloudflare Workflows en la cuenta.
2. Crear token privado de Cloudflare para D1 export (permiso D1 Write de alcance mínimo). No copiar su valor en ningún chat.
3. Desplegar **solo el Worker de respaldo** en Cloudflare desde un runner seguro / GitHub Actions aprobada o CLI remota mediante `npx wrangler deploy --config apps/d1-backup/wrangler.toml`. Esto crea un recurso aparte. No usar el TOML de producción.
4. Configurar `D1_EXPORT_API_TOKEN` mediante `npx wrangler secret put D1_EXPORT_API_TOKEN --config apps/d1-backup/wrangler.toml`, introduciendo el token en la consola segura, nunca en un argumento CLI.
5. Iniciar **UNA** instancia mediante `npx wrangler workflows trigger energia-vital-d1-backup-manual '{\"confirm\":\"RESPALDAR_D1_EN_R2\"}'` desde consola POSIX; en PowerShell, adaptar comillas JSON cuidadosamente o iniciar instancia desde el panel de Cloudflare. El simple despliegue no ejecuta el respaldo.
6. Consultar la instancia mediante `npx wrangler workflows instances describe energia-vital-d1-backup-manual latest` y comprobar que terminó correctamente. Evitar compartir respuestas completas que incluyan tokens o URLs.
7. Comprobar exclusivamente el objeto dentro de `energia-vital-backups-private`, longitud mayor que cero y una prueba de restauración íntegra en entorno aislado; **la existencia del archivo y el tamaño por sí solos no acreditan integridad lógica**.
8. Antes de restaurar en `energia-vital-qa-db`, revisar que está vacía, restringir acceso a QA, y decidir si se usarán datos reales bajo control de privacidad o pruebas con datos anonimizados. Nunca conectar QA a producción.
9. Ensayar migraciones 013–021 en orden sobre copia, revisar conteos/foreign keys, accesos y D1; **no ejecutar esas migraciones en D1 real todavía**.

## Estado de aprobación
No hay autorización para crear o ejecutar el Worker real ni para iniciar exportación de datos personales. No afirmar que el respaldo está hecho. Las migraciones, despliegue de web, merge a main y restauración de producción siguen bloqueados.
