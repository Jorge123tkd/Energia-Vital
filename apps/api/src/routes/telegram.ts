import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth } from '../middleware';

export const telegramRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

// Telegram envía webhooks autenticados por un secreto configurado en Cloudflare.
telegramRoutes.post('/webhook', async c => {
  const configured = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!configured || configured.length < 16) return c.json({ error: 'Telegram no configurado' }, 503);
  if (c.req.header('x-telegram-bot-api-secret-token') !== configured) return c.json({ error: 'Webhook no autorizado' }, 401);
  const b = await c.req.json<any>().catch(() => null);
  const msg = b?.message || b?.edited_message;
  if (!msg?.chat?.id) return c.json({ ok: true });
  const firstName = typeof msg.from?.first_name === 'string' ? msg.from.first_name.slice(0, 60) : 'cliente';
  const text = typeof msg.text === 'string' ? msg.text : '';
  const reply = /^\/(start|help|login)\b/i.test(text)
    ? `Hola, ${firstName}. Por seguridad, crea tu cuenta e inicia sesión con correo y contraseña en el sitio oficial de Bonaire. Nunca compartas contraseñas por Telegram.`
    : 'Gracias por contactar a Bonaire. Este canal todavía no está vinculado al asistente de tu cuenta. Para hablar con el asistente con historial privado, inicia sesión en nuestro sitio oficial.';
  if (c.env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: msg.chat.id, text: reply }),
    }).catch(error => console.error('Fallo de Telegram', error));
  }
  return c.json({ ok: true });
});

telegramRoutes.post('/set-webhook', requireAdminAuth, async c => {
  const b = await c.req.json<any>();
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_WEBHOOK_SECRET || c.env.TELEGRAM_WEBHOOK_SECRET.length < 16)
    return c.json({ error: 'Configura los secretos de Telegram' }, 503);
  if (!b?.url || typeof b.url !== 'string' || !b.url.startsWith('https://')) return c.json({ error: 'URL HTTPS requerida' }, 400);
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: b.url, secret_token: c.env.TELEGRAM_WEBHOOK_SECRET }),
  });
  return c.json(await res.json());
});

telegramRoutes.get('/webhook-info', requireAdminAuth, async c => {
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Telegram no configurado' }, 503);
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
  return c.json(await res.json());
});
