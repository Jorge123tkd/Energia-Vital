# Configuración de Telegram — Energía Vital

Este documento explica cómo configurar el bot de Telegram para notificaciones y comunicación con clientes.

## Paso 1: Crear el bot con BotFather

1. Abre Telegram
2. Busca `@BotFather` e inicia una conversación
3. Envía el comando `/newbot`
4. Sigue las instrucciones:
   - Nombre del bot: `Energía Vital`
   - Nombre de usuario: `energia_vital_bot` (o el que elijas)
5. BotFather te enviará un **token** (ej: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Guarda este token de forma segura. No lo subas al repositorio.**

## Paso 2: Guardar el token en Cloudflare

1. Ve al panel de Cloudflare
2. Ve a **Workers & Pages** → Tu API Worker
3. Ve a **Settings** → **Variables**
4. Añade una variable secreta:
   - Nombre: `TELEGRAM_BOT_TOKEN`
   - Valor: El token que te dio BotFather
5. También añade `TELEGRAM_WEBHOOK_SECRET` con un valor aleatorio seguro

## Paso 3: Configurar el webhook

El webhook permite que Telegram envíe mensajes a tu API cuando un usuario escriba al bot.

Envía esta petición (reemplaza los valores):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-api.com/api/telegram/webhook",
    "secret_token": "TU_SECRETO"
  }'
```

## Paso 4: Verificar el webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Deberías ver la URL configurada y sin errores.

## Paso 5: Autorizar administradores

En el panel de administración, ve a **Configuración** y añade los `telegram_chat_id` de los administradores que recibirán notificaciones.

Para obtener tu chat_id:
1. Envía un mensaje a tu bot
2. Visita: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Busca el campo `chat.id` en la respuesta

## Funciones del bot

- `/start` - Mensaje de bienvenida
- Cualquier mensaje - Respuesta automática avisando que el equipo lo revisará
- Notificaciones automáticas para: nuevas citas, solicitudes, consultas

## Prueba

1. Busca tu bot en Telegram por su nombre de usuario
2. Envía `/start`
3. Deberías recibir el mensaje de bienvenida
4. Envía cualquier mensaje y verifica que recibas respuesta