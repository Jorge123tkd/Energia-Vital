# Operación única de respaldo D1 → R2 → restauración y migraciones QA

**Estado:** workflow manual disponible en la rama `main`, **NO EJECUTADO** y sin copia confirmada. No publica la web ni modifica tablas de producción.

**Enlace de ejecución:** https://github.com/Jorge123tkd/Energia-Vital/actions/workflows/backup-restore-qa.yml

## Qué hace la única ejecución
1. Exige confirmación `RESPALDAR_Y_PROBAR_QA` y SHA completo de la rama `release/combined-security-deps-20261117`; verifica que el commit exacto coincida.
2. En el runner temporal de GitHub instala dependencias y valida política de seguridad, preservación de migraciones, tipos y build, sin usar el ordenador del operador.
3. Comprueba UUID de producción `bbb91e7a-37c6-4290-aa9c-29a8022226b4` y QA `62755365-2c9a-4b20-8933-21209609a94b` y que QA está **vacía**. No sobreescribe una QA ya utilizada.
4. Hace una exportación **solo lectura de esquema y datos** de D1 `energia-vital`. Cloudflare advierte que la operación de exportación puede interrumpir temporalmente las consultas; ejecutar cuando se permita esa interrupción.
5. Sube el SQL temporal al R2 **privado** `energia-vital-backups-private` mediante CLI con `--remote`, lo descarga a un segundo archivo temporal y exige comparación binaria exacta antes de continuar. **El SQL no se sube como artefacto de GitHub ni se imprime**.
6. Restaura únicamente en `energia-vital-qa-db` utilizando la copia recuperada desde R2, valida 12 migraciones históricas y se detiene si faltan.
7. Genera una configuración Wrangler temporal con **solo** la conexión QA, ejecuta **013–021 solamente allí**, verifica 21 migraciones y columna `auth_sessions.refresh_hash`.
8. Limpia los archivos SQL y logs temporales del runner incluso si algo falla. La copia en R2 permanece guardada.

## Preparación para el operador
- En GitHub, **Settings → Secrets and variables → Actions**, deben existir los secretos `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`. Crear un token específico con permisos mínimos para **exportar D1 producción, leer/escribir D1 QA y leer/escribir objetos del bucket privado**; nunca introducirlo en archivos, comandos o chat.
- La cuenta debe seguir teniendo las dos D1 y el bucket, tal como verificó el operador.
- **No conectar aún una web/Worker QA pública** a la base que se va a restaurar con datos reales.
- Seleccionar una ventana apropiada de poca actividad: D1 export puede pausar consultas.
- Abrir Actions → **Bonaire - respaldo D1 a R2 y migraciones SOLO QA** → Run workflow (rama **main**). Completar `release_sha` con el commit de PR #7 y `confirmation` con `RESPALDAR_Y_PROBAR_QA`.
- **No reejecutar sin revisar**: después de una ejecución parcial, QA podría no estar vacía y el flujo está diseñado para rechazarla.
- La exportación R2 usa almacenamiento privado; este flujo no introduce cifrado de aplicación con clave separada. Mantener las credenciales bajo acceso restringido y definir retención y prueba de restauración periódica antes de considerarlo política definitiva de backups.

## Criterio de éxito y límites
- **Éxito**: workflow verde, comparación binaria R2 correcta, QA restaurada y D1 QA migrada a 021. No sustituye QA funcional/admin en navegador.
- **Fallo**: conserva el SQL de R2 si ya se subió; producción sigue sin migrar; revisar logs sanitizados antes de reintentar.
- **Prohibido**: aplicar `013–021` a D1 productiva, `time-travel restore` a producción, `wrangler deploy` de API o Pages, fusión de PR #7 hacia main como parte del flujo.
- Workflow creado en `main` únicamente para que GitHub permita su ejecución manual; modificar el repositorio **no** equivale a ejecutar el workflow.

**Documentación Cloudflare:** https://developers.cloudflare.com/d1/best-practices/import-export-data/ y https://developers.cloudflare.com/r2/reference/wrangler-commands/
