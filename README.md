# Energía Vital — plataforma comercial Cloudflare

**Desarrollo en revisión.** Esta rama incorpora acceso de clientes con correo y contraseña, perfil (teléfono, dirección, municipio y provincia), catálogo solar, solicitudes, citas, asistente y panel administrativo. El software se ejecuta sobre **Cloudflare Pages + Cloudflare Workers + D1 + R2**.

## Antes de desplegar

> No publiques con datos reales hasta que se aprueben las comprobaciones de CI, migraciones, control de acceso y la política de privacidad. No hay recuperación de contraseña ni verificación de email/teléfono implementadas: habilítalas con un proveedor real antes de un lanzamiento masivo.

- Node.js 22 y npm.
- Cuenta Cloudflare con Pages, Workers, D1 y R2 activos; en `apps/api/wrangler.toml` revisar el `database_id`, binding `DB` y bucket `BUCKET`.
- Nunca subir secretos a GitHub ni colocar `JWT_SECRET` en `VITE_*`.

## Instalación y pruebas locales

```sh
npm ci
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/web
npm run build --workspace=apps/web
```

Para integrar D1 local: desde `apps/api`, ejecutar `npx wrangler d1 migrations apply energia-vital-db --local`. Para usar Worker en local con la clave JWT, crear `apps/api/.dev.vars` (ignorado por Git) con `JWT_SECRET` de 32 caracteres o más y `ADMIN_SETUP_KEY` distinta; ejecutar `npm run dev --workspace=apps/api`. La web local (`npm run dev --workspace=apps/web`) usa `VITE_API_URL=http://127.0.0.1:8787` desde `apps/web/.env.local`.

## Despliegue Cloudflare (primero a prueba y tras respaldo)

1. Crear/verificar **D1** `energia-vital-db`, **R2** `energia-vital-assets`, proyecto **Pages** `energia-vital-web` y Worker `energia-vital-api`.
2. Revisar y corregir bindings en `apps/api/wrangler.toml` para el entorno real. Confirmar la región y dependencias.
3. Respaldar D1. **No ejecutar migraciones a ciegas**: revisar datos actuales, emails duplicados y aplicar 001, 002, 003, 004 en orden. En `apps/api`: `npx wrangler d1 migrations apply energia-vital-db --remote`.
4. Configurar en Workers los secretos `JWT_SECRET`, `ADMIN_SETUP_KEY` y, si se utiliza Telegram, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET`: `npx wrangler secret put JWT_SECRET`. `JWT_SECRET` debe ser largo, aleatorio e independiente del setup.
5. Configurar `SITE_URL` con el origen de Pages (sin ruta) para permitir CORS; configurar `VITE_API_URL` con el origen público del Worker **en el build del frontend**.
6. Crear el administrador inicial con `POST /api/auth/setup` enviando `X-Setup-Key` y `{"email":"...","password":"..."}`. Eliminar `ADMIN_SETUP_KEY` después del alta inicial.
7. Verificar registro, autenticación, solicitud, visita, panel administrador, reintentos y cierre de sesión.
8. Para CI, añadir a GitHub Secrets `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, y a variables `VITE_API_URL`. El workflow de despliegue solo se ejecuta desde `main` tras aprobar CI.

Consulta `docs/CLIENTES_CLOUDFLARE.md` para detalles de privacidad, seguridad y limitaciones.

## Acceso y datos personales

- El frontend pide inicio de sesión antes de abrir el catálogo y las gestiones.
- El backend verifica autenticación y propietario de los datos; no se confía en IDs proporcionados por clientes.
- Los datos del teléfono y la dirección son declarados, **no verificados**.
- Contraseñas derivadas con PBKDF2 y sal; JWT de acceso ligado a sesión revocable en D1.
- El acceso administrativo es independiente y requiere rol de administrador activo.

## Trabajo pendiente antes de producción

Se necesitan pruebas de instalación real, revisión de sorteos, recuperación segura de cuenta, verificación de correo y teléfono, antispam (Turnstile/WAF), pruebas de carga y controles de eliminación/exportación de datos personales. El asesor solar produce estimaciones preliminares, nunca cálculos técnicos definitivos.
