# Manual de Despliegue — Energía Vital

Este manual te guía paso a paso para desplegar la plataforma Energía Vital en Cloudflare Pages y Cloudflare Workers, con coste mensual inicial de US$0 dentro de los planes gratuitos.

## Fase A: Preparación

### Paso 1: Cuentas necesarias

| Servicio | Propósito | Gratuito | Enlace |
|---|---|---|---|
| GitHub | Repositorio y CI/CD | Sí (público/privado) | https://github.com |
| Cloudflare | Pages, Workers, D1, R2 | Sí (límites gratuitos) | https://cloudflare.com |
| Telegram | Bot para notificaciones | Sí | https://t.me/BotFather |

### Paso 2: Crear repositorio GitHub

1. Ve a https://github.com/new
2. Nombre del repositorio: `Energia-Vital`
3. Visibilidad: Público o privado
4. No inicialices con README (ya tenemos uno)
5. Copia la URL del repositorio (ej: `https://github.com/tu-usuario/Energia-Vital.git`)

### Paso 3: Subir el código

Desde tu computadora, en la carpeta del proyecto:

```bash
git remote add origin https://github.com/tu-usuario/Energia-Vital.git
git branch -M main
git push -u origin main
```

## Fase B: Configuración de Cloudflare

### Paso 4: Crear la base de datos D1

1. Ve a https://dash.cloudflare.com
2. Ve a **Workers & Pages** → **D1**
3. Haz clic en **Create database**
4. Nombre: `energia-vital-db`
5. Copia el **Database ID** (lo necesitarás después)
6. En la pestaña **SQL**, ejecuta el contenido del archivo `apps/api/migrations/001_init.sql`

### Paso 5: Crear el bucket R2 (opcional, para imágenes)

1. Ve a **R2** en el panel de Cloudflare
2. Haz clic en **Create bucket**
3. Nombre del bucket: `energia-vital-assets`
4. Configuración por defecto (opción pública desactivada)

### Paso 6: Desplegar el backend (Workers)

1. En tu computadora, entra a `apps/api`
2. Copia `wrangler.toml` y edita `database_id` con el ID de D1
3. Ejecuta:
   ```bash
   cd apps/api
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
4. Copia la URL del Worker (ej: `https://energia-vital-api.tusubdomain.workers.dev`)

### Paso 7: Desplegar el frontend (Pages)

1. Entra a `apps/web`
2. Ejecuta:
   ```bash
   cd apps/web
   npm install
   npm run build
   npx wrangler pages deploy dist --project-name energia-vital-web
   ```
3. O conecta GitHub directamente desde Cloudflare Pages para despliegue automático

### Paso 8: Configurar variables de entorno

En el panel de Cloudflare, ve a Workers → Tu API → **Settings** → **Variables** y añade:

| Variable | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token de tu bot de Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto para webhooks |
| `ADMIN_PASSWORD_HASH` | Hash de contraseña admin |
| `SITE_URL` | URL de tu sitio web |
| `YOUTUBE_CHANNEL_URL` | URL de tu canal de YouTube |

## Fase C: Telegram

### Paso 9: Crear el bot

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot`
3. Ponle nombre: `Energía Vital`
4. Ponle usuario: `energia_vital_bot`
5. Copia el **token** que te da

### Paso 10: Configurar webhook

Desde el API desplegado, envía una petición POST:

```
POST https://api.telegram.org/bot<TU_TOKEN>/setWebhook
Body: { "url": "https://tu-api.com/api/telegram/webhook", "secret_token": "TU_SECRETO" }
```

## Fase D: Puesta en marcha

### Paso 11: Crear el primer administrador

Envía una petición POST a tu API:

```
POST https://tu-api.com/api/auth/setup
Body: { "email": "admin@energiavital.com", "password": "TuContraseñaSegura123" }
```

### Paso 12: Probar la web

1. Abre tu sitio en Cloudflare Pages
2. Verifica que cargue el catálogo
3. Prueba el asistente conversacional
4. Prueba el asesor solar
5. Inicia sesión en `/admin` con las credenciales creadas

## Costes estimados

| Servicio | Plan gratuito | Coste mensual estimado |
|---|---|---|
| Cloudflare Pages | Sí | US$0 |
| Cloudflare Workers | 100,000 requests/día | US$0 |
| Cloudflare D1 | 5 GB, 1M lecturas/día | US$0 |
| Cloudflare R2 | 10 GB almacenamiento | US$0 |
| Telegram Bot API | Sí | US$0 |
| GitHub | Repositorios privados | US$0 |
| **Total mensual** | | **US$0** |

> El dominio propio tiene un coste anual independiente (no incluido aquí).