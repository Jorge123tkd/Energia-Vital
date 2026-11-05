/**
 * Servicio de Telegram: envía mensajes al bot usando el Bot API.
 *
 * - `sendToTelegram(chatId, text)`: envía un mensaje de texto a un chat.
 * - `sendCodeToTelegram(chatId, code)`: mensaje con código de login.
 * - `notifyAdmin(adminChatId, message)`: notificación a un admin.
 *
 * El token del bot se lee de `env.TELEGRAM_BOT_TOKEN`.
 * En modo local / tests, si `TELEGRAM_BOT_TOKEN` no está definido, falla
 * silenciosamente con un error lógico pero no rompe el flujo de login.
 */

export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  [key: string]: any;
}

/**
 * Envía un mensaje de texto a un chat de Telegram.
 * Devuelve el resultado parseado o null si falla (p. ej. token no configurado).
 */
export async function sendToTelegram(
  env: Env,
  chatId: string | number,
  text: string,
  options: { parse_mode?: 'Markdown' | 'HTML' } = {},
): Promise<any | null> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[telegram-service] TELEGRAM_BOT_TOKEN no configurado');
    return null;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, any> = {
    chat_id: chatId,
    text,
    ...(options.parse_mode ? { parse_mode: options.parse_mode } : {}),
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[telegram-service] Error ${resp.status}: ${err}`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error('[telegram-service] fetch failed:', e);
    return null;
  }
}

/** Envia un código de login de 6 dígitos al chat de Telegram del customer. */
export async function sendLoginCode(
  env: Env,
  chatId: string | number,
  code: string,
  customerName?: string,
): Promise<any | null> {
  const text = `🔐 Código de acceso Energía Vital\n\n`
    + `Hola${customerName ? ` ${customerName}` : ''},\n`
    + `Tu código de ingreso es: <b>${code}</b>\n\n`
    + `Este código expira en 5 minutos.\n`
    + `No compartas este código.`;
  return sendToTelegram(env, chatId, text, { parse_mode: 'HTML' });
}

/** Notifica a un admin vía Telegram. */
export async function notifyAdmin(
  env: Env,
  adminChatId: string | number,
  message: string,
): Promise<any | null> {
  return sendToTelegram(env, adminChatId, message, { parse_mode: 'HTML' });
}

/** Envía un mensaje sin formato (sin parse_mode). */
export async function sendMessage(
  env: Env,
  chatId: string | number,
  text: string,
): Promise<any | null> {
  return sendToTelegram(env, chatId, text);
}
