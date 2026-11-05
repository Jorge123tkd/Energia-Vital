import { isAuthenticated, authToken, adminUser } from './store';

const TOKEN_KEY = 'energia_vital_auth_token';
const USER_KEY = 'energia_vital_admin_user';

/** Guarda la sesión en localStorage (token + datos de usuario + flag). */
export function persistAuth(token: string, user: { id: string; email: string; role: string }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem('energia_vital_is_authenticated', 'true');
  } catch {
    /* SSR / no-storage: se ignora silenciosamente */
  }
}

/** Borra la sesión de localStorage. */
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('energia_vital_is_authenticated');
}

/** Rehidrata los stores de autenticación desde localStorage. */
export function hydrateAuth(): boolean {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    const isAuth = localStorage.getItem('energia_vital_is_authenticated') === 'true';

    if (token && userJson && isAuth) {
      authToken.set(token);
      adminUser.set(JSON.parse(userJson));
      isAuthenticated.set(true);
      return true;
    }
  } catch {
    /* JSON corrupto: limpiamos y no autenticamos */
    clearAuth();
  }
  isAuthenticated.set(false);
  authToken.set(null);
  adminUser.set(null);
  return false;
}

/** Registro de cliente (email + password). */
export async function registerCustomer(body: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}) {
  return await api.register(body);
}

/** Login de cliente (email + password). */
export async function customerLogin(body: { email: string; password: string }) {
  return await api.customerLogin(body);
}

/** Refrescar el access token. */
export async function refreshAuth(body: { refresh_token: string }) {
  const res = await api.refreshToken(body);
  if (res && res.access_token) {
    authToken.set(res.access_token);
    persistAuth(res.access_token, { id: '', email: '', role: '' });
  }
  return res;
}

/** Cerrar sesión. */
export async function logout() {
  await api.logout();
  clearAuth();
  authToken.set(null);
  adminUser.set(null);
  isAuthenticated.set(false);
}

/** Obtener info del customer autenticado. */
export async function getMe() {
  return await api.me();
}

/** Obtener info del admin autenticado. */
export async function getAdminMe() {
  return await api.adminMe();
}

/** Solicitar código de verificación por teléfono/telegram. */
export async function requestPhoneCode(body: {
  phone?: string;
  email?: string;
  telegram_chat_id?: string;
}) {
  return await api.phoneRequest(body);
}

/** Verificar código de teléfono. */
export async function verifyPhoneCode(body: { phone?: string; email?: string; code: string }) {
  return await api.phoneVerify(body);
}

/** Generar código de enlace para vincular Telegram. */
export async function requestTelegramLink(body: {
  telegram_chat_id: string;
  name?: string;
  email?: string;
}) {
  return await api.telegramLink(body);
}

/** Intercambiar código de Telegram por tokens JWT. */
export async function exchangeTelegramCode(body: { link_code: string }) {
  return await api.telegramExchange(body);
}

/** Webhook de Telegram. */
export async function telegramWebhook(body: any) {
  return await api.telegramWebhook(body);
}

export { isAuthenticated, authToken, adminUser };
