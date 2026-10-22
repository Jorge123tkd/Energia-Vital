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

/**
 * Rehidrata los stores de autenticación desde localStorage.
 * Debe llamarse al inicio (onMount) para que persistan los inicios de sesión.
 */
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

export { isAuthenticated, authToken, adminUser };
