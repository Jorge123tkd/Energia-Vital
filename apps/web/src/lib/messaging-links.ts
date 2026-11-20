/** Limita accesos a bots a enlaces oficiales HTTPS; nunca confundirlos con contactos humanos. */
export function messagingBotUrl(value: unknown, channel: 'whatsapp' | 'telegram'): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    const allowed = channel === 'whatsapp' ? ['wa.me', 'api.whatsapp.com'] : ['t.me', 'telegram.me'];
    if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(url.hostname.toLowerCase()))
      return '';
    return url.toString();
  } catch {
    return '';
  }
}
