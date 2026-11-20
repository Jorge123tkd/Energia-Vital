/** Almacenamiento de sesión por pestaña; la contraseña jamás se guarda. */
import { api, customerToken, setCustomerToken } from './api';
import { isAuthenticated, authToken, adminUser } from './store';

export { customerToken, setCustomerToken };
export function persistAuth(token: string) {
  setCustomerToken(token);
  authToken.set(token);
  isAuthenticated.set(true);
}
export function clearAuth() {
  setCustomerToken(null);
  authToken.set(null);
  adminUser.set(null);
  isAuthenticated.set(false);
}
export async function registerCustomer(body: Parameters<typeof api.register>[0]) { return api.register(body); }
export async function customerLogin(body: Parameters<typeof api.customerLogin>[0]) { return api.customerLogin(body); }
export async function logout() { try { await api.logout(); } finally { clearAuth(); } }
export async function getMe() { return api.me(); }
