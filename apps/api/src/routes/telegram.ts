import { Hono } from 'hono';
import { Env } from '../types';

export const telegramRoutes = new Hono<{ Bindings: Env }>();

// Webhook de Telegram
telegramRoutes.post('/webhook', async (c) => {
  const { env } = c;
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');

  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Secret inválido' }, 401);
  }

  const body = await c.req.json<any>();
  const message = body.message || body.edited_message;
  if (!message) return c.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text || '';
  const userName = message.from?.first_name || 'Usuario';

  // Respuesta básica del bot
  if (text === '/start' || text === '/help') {
    await sendTelegramMessage(env, chatId, `¡Hola ${userName}! Soy el bot de Energía Vital. Puedo notificarte sobre citas, solicitudes y ayudarte con consultas básicas.`);
  } else {
    await sendTelegramMessage(env, chatId, `Recibí tu mensaje: "${text}". Nuestro equipo lo revisará y se pondrá en contacto contigo.`);
  }

  return c.json({ ok: true });
});

// Enviar mensaje por Telegram
async function sendTelegramMessage(env: Env, chatId: number | string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('Error enviando mensaje de Telegram:', e);
  }
}

// Configurar webhook (llamada única desde el administrador)
telegramRoutes.post('/set-webhook', async (c) => {
  const { env } = c;
  const body = await c.req.json<{ url: string }>();
  if (!env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Token no configurado' }, 400);

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: body.url, secret_token: env.TELEGRAM_WEBHOOK_SECRET }),
  });

  const data = await res.json();
  return c.json(data);
});

// Obtener info del webhook
telegramRoutes.get('/webhook-info', async (c) => {
  const { env } = c;
  if (!env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Token no configurado' }, 400);

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
  const data = await res.json();
  return c.json(data);
});