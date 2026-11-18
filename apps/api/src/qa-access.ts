// Protección adicional del Worker QA. Cloudflare Access debe proteger también Pages.
// No confundir con el JWT propio de clientes: verifica exclusivamente Access (RS256).
type AccessJwk = JsonWebKey & { kid?: string };
type QaAccessConfig = { team: string; audience: string };
type AccessClaims = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number };
let cached: { url: string; keys: JsonWebKey[]; until: number } | undefined;
const jsonError = () => new Response(JSON.stringify({ error: 'Acceso restringido a QA' }), {
  status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('JWT no válido');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function parsePart(value: string): Record<string, unknown> {
  const decoded = new TextDecoder().decode(decodeBase64Url(value));
  const obj: unknown = JSON.parse(decoded);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error('Parte JWT inválida');
  return obj as Record<string, unknown>;
}
function validateConfig(env: { QA_ACCESS_TEAM_DOMAIN?: string; QA_ACCESS_AUD?: string }): QaAccessConfig | null {
  const team = (env.QA_ACCESS_TEAM_DOMAIN || '').trim().toLowerCase();
  const audience = (env.QA_ACCESS_AUD || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(team) ||
      !/^[a-zA-Z0-9_-]{10,128}$/.test(audience)) return null;
  return { team, audience };
}
async function getKeys(team: string): Promise<JsonWebKey[]> {
  const url = 'https://' + team + '/cdn-cgi/access/certs';
  if (cached?.url === url && cached.until > Date.now()) return cached.keys;
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw Error('Certificados Access no disponibles');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('keys' in body) ||
      !Array.isArray((body as { keys: unknown }).keys)) throw Error('Certificados Access inválidos');
  const keys = (body as { keys: AccessJwk[] }).keys;
  cached = { url, keys, until: Date.now() + 5 * 60_000 };
  return keys;
}
export async function allowQaRequest(request: Request, env: {
  ENVIRONMENT: string; QA_ACCESS_TEAM_DOMAIN?: string; QA_ACCESS_AUD?: string;
}): Promise<Response | null> {
  if (env.ENVIRONMENT !== 'qa') return null;
  const config = validateConfig(env);
  if (!config) return jsonError(); // Falla cerrado ante configuración incompleta.
  // El preflight no lee datos y no envía JWT en el navegador. Solo el origen QA declarado.
  const qaOrigin = (env as { SITE_URL?: string }).SITE_URL;
  if (request.method === 'OPTIONS' && qaOrigin &&
      request.headers.get('Origin') === qaOrigin) return null;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts.some(p => !p)) return jsonError();
  try {
    const header = parsePart(parts[0]);
    const payload = parsePart(parts[1]) as AccessClaims;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return jsonError();
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== 'https://' + config.team ||
        !aud.includes(config.audience) ||
        typeof payload.exp !== 'number' || payload.exp <= now ||
        (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now)))
      return jsonError();
    const keys = await getKeys(config.team);
    const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256');
    if (!key) return jsonError();
    const publicKey = await crypto.subtle.importKey('jwk', key, {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
    }, false, ['verify']);
    const signature = decodeBase64Url(parts[2]);
    const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signed)
      ? null : jsonError();
  } catch {
    return jsonError(); // Sin certificados, sin red o JWT erróneo: no permitir.
  }
}
