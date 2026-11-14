# Energía Vital — acceso de clientes para Cloudflare

## Política de acceso

- El cliente crea su **cuenta con correo y contraseña**; no hay acceso anónimo a catálogo, asesor, servicios, consultas o citas.
- Se registran nombre, teléfono, dirección, municipio y provincia. El teléfono queda **sin verificar** hasta que exista un flujo de confirmación real; no se presentan como teléfonos verificados los que el usuario tecleó.
- Los clientes solo ven sus propias solicitudes, citas y conversaciones. `customer_id` lo determina el JWT verificado por Worker, nunca un campo enviado por el navegador.
- El administrador usa un acceso separado `/admin` y consulta los datos necesarios para gestionar los servicios.
- Las contraseñas se almacenan como derivaciones PBKDF2 con sal aleatoria; los tokens son JWT firmados y limitados a sesiones revocables en D1.
- El token de acceso se guarda en `sessionStorage` de la pestaña, no la contraseña; expira tras una hora. El usuario vuelve a iniciar sesión cuando expira. El endpoint refresh existe para futuros clientes confiables, pero el navegador no persiste el refresh token.
- Antes de registrar clientes reales, publicar una política de privacidad, límites de conservación de datos y obtener consentimiento adecuado para comunicaciones comerciales. Revisar requisitos legales aplicables en Cuba.

## Despliegue (sin alterar producción hasta probar)

1. Respaldar primero Cloudflare D1 y los datos existentes. Revisar correos duplicados antes del índice único de `003_customer_accounts.sql`.
2. Desde la raíz del repositorio: `npm ci`, `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run build --workspace=apps/web`.
3. Aplicar las migraciones existentes 001 y 002 si aún no están en D1, después 003 y 004, **en ese orden**: `cd apps/api && npx wrangler d1 migrations apply energia-vital-db --remote`. No ejecutar dos veces SQL `ALTER TABLE` manualmente: Wrangler hace seguimiento de migraciones aplicadas.
4. Configurar en Cloudflare Workers los **secretos distintos** `JWT_SECRET` (32+ caracteres aleatorios), `ADMIN_SETUP_KEY` (32+ caracteres), `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` (solo si se usa Telegram), con `npx wrangler secret put NOMBRE`. No usar el mismo secreto para JWT y setup.
5. Si todavía no existe ningún administrador, llamar **una sola vez** a `POST /api/auth/setup` con JSON `{"email":"...","password":"..."}` y la cabecera `X-Setup-Key` secreta. No incluirla en el frontend. Retirar `ADMIN_SETUP_KEY` después de la creación del administrador.
6. Configurar en GitHub Actions los Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y la variable `VITE_API_URL` con el origen real del Worker de Cloudflare. También configurar `SITE_URL` en Worker con el origen de Pages para CORS.
7. Tras validar los Checks en el Pull Request, fusionar a main y ejecutar manualmente el flujo **Validar y desplegar Energía Vital** desde GitHub Actions (workflow_dispatch). La publicación automática se encuentra deshabilitada hasta configurar secretos, probar migraciones y respaldar D1. Publicar primero Worker y después Pages; conservar los mismos nombres de bindings D1 (`DB`) y R2 (`BUCKET`). Configurar HTTPS y dominio.
8. Ejecutar pruebas de login correcto/incorrecto, cierre de sesión, registro duplicado, acceso cruzado entre clientes, citas simultáneas, cálculo solar y panel antes de habilitar clientes reales.

## Servicios y casos que NO son entrega lista para producción

- Los clientes históricos sin contraseña, generados por flujos antiguos de Telegram o teléfono, **necesitan migración/invitación segura** para establecer una contraseña. No activar recuperación de cuentas por email hasta configurar un proveedor real para enviar y verificar enlaces de uso único.
- El envío y la verificación real de teléfono por SMS/Telegram requieren integración adicional; la dirección se declara por el cliente, no se valida físicamente.
- La migración 004 requiere probar el sistema de recompensas con una copia de D1 antes de aplicar sobre puntos existentes.
- El cálculo solar es preliminar, no sustituye evaluación presencial ni estudio de equipos y protecciones. Configurar condiciones técnicas y normativas locales.
- Revisar y restringir los flujos antiguos de sorteos. No asumir que el simple registro de una cuenta verifica los datos de contacto del participante.
- No automatizar migraciones de producción en cada push: necesitan respaldo, revisión y ventana de mantenimiento.

## Protección de datos

El personal con acceso al panel puede ver teléfonos y direcciones para prestar el servicio; no se deben publicar, usar como datos publicitarios sin consentimiento ni dejar credenciales en el repositorio. `secret_output.txt` y archivos de pruebas relacionados se encuentran en el historial público anterior: revisar su contenido y **rotar cualquier credencial real**. Eliminar un archivo de una rama no revoca credenciales ya expuestas.
