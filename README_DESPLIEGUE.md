# Energía Vital — versión de cuentas para Cloudflare

**Esta rama es una versión candidata para pruebas, no una publicación aprobada.**

## Arquitectura

- Cloudflare Pages: aplicación Svelte 5 / Vite.
- Cloudflare Workers: API Hono, JWT, lógica comercial, Telegram.
- D1: clientes, sesiones, solicitudes, catálogo y recompensas.
- R2: imágenes de galería.

## Preparación

1. Descargar esta rama desde GitHub y ejecutar `npm ci` en la raíz.
2. Comprobar `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web` y `npm run build:web`.
3. Probar migraciones SQL 001, 002, 003 y 004 en copia de la base D1. **Nunca ejecutar migraciones sobre producción sin respaldo.**
4. Configurar los bindings `DB` y `BUCKET` en `apps/api/wrangler.toml` y los secretos del Worker mediante `wrangler secret put JWT_SECRET` y `wrangler secret put ADMIN_SETUP_KEY`, usando secretos diferentes y aleatorios de al menos 32 caracteres. Configurar `SITE_URL` con el origen HTTPS de Pages.
5. Inicializar el administrador una sola vez mediante `POST /api/auth/setup` con `X-Setup-Key`; luego retirar `ADMIN_SETUP_KEY` del Worker.
6. Configurar Secrets en GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; Variable: `VITE_API_URL` con URL pública del Worker.
7. Publicar **solo desde ejecución manual** del workflow en Actions, después de pasar los Checks del PR y verificar la base de datos.

## Controles que faltan antes de uso comercial

Realizar pruebas end-to-end de autenticación y aislamiento entre clientes, límites de intentos en Cloudflare, migración de cuentas antiguas, recuperación de contraseña y verificación de email/teléfono. Las credenciales nunca se guardan en repositorios o en el navegador como contraseña. Publicar aviso de privacidad y política de tratamiento de datos vigente.

Guía detallada: `docs/CLIENTES_CLOUDFLARE.md`.
