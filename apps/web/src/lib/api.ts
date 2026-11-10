/** Cliente REST para Cloudflare Workers. Evita tokens Bearer manuales en cada pantalla. */
const API_BASE = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
export const CUSTOMER_TOKEN_KEY = 'energia_vital_customer_session';
export const ADMIN_TOKEN_KEY = 'energia_vital_admin_session';

export function customerToken(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CUSTOMER_TOKEN_KEY) : null;
}
export function setCustomerToken(token: string | null) {
  if (token) sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  else sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
}
export async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = customerToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Error HTTP ${response.status}`);
  return data;
}
function withAdmin(token: string, options: RequestInit = {}): RequestInit {
  return { ...options, headers: { ...Object.fromEntries(new Headers(options.headers).entries()), Authorization: `Bearer ${token}` } };
}
const post = (path: string, body: unknown, options: RequestInit = {}) => apiRequest(path, { ...options, method: 'POST', body: JSON.stringify(body) });
const patch = (path: string, body: unknown, options: RequestInit = {}) => apiRequest(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });

export const api = {
  getProducts: (params?: Record<string, string>) => apiRequest(`/api/public/products${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getProduct: (id: string) => apiRequest(`/api/public/products/${encodeURIComponent(id)}`),
  getCategories: () => apiRequest('/api/public/categories'),
  getServices: () => apiRequest('/api/public/services'),
  getService: (id: string) => apiRequest(`/api/public/services/${encodeURIComponent(id)}`),
  getFAQ: (params?: Record<string, string>) => apiRequest(`/api/public/faq${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getGallery: () => apiRequest('/api/public/gallery'),
  getSettings: () => apiRequest('/api/public/settings'),
  getAssistantConfig: () => apiRequest('/api/assistant/config'),
  getAssistantMessages: (id: string) => apiRequest(`/api/assistant/session/${encodeURIComponent(id)}/messages`),
  postAssistantMessage: (body: { session_id?: string; message: string; channel?: string }) => post('/api/assistant/message', body),

  register: (body: { name: string; email: string; phone: string; address: string; city: string; province: string; password: string }) => post('/api/auth/register', body),
  customerLogin: (body: { email: string; password: string }) => post('/api/auth/customer/login', body),
  signIn: (body: { email: string; password: string }) => post('/api/auth/sign-in', body),
  logoutAdmin: (token: string) => post('/api/auth/logout', {}, withAdmin(token)),
  me: () => apiRequest('/api/auth/me'),
  updateProfile: (body: { name: string; phone: string; address: string; city: string; province: string }) =>
    apiRequest('/api/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    apiRequest('/api/auth/password', { method: 'PUT', body: JSON.stringify(body) }),
  logout: () => post('/api/auth/logout', {}),
  refreshToken: (body: { refresh_token: string }) => post('/api/auth/refresh', body),
  getMyRequests: () => apiRequest('/api/private/requests'),
  createRequest: (body: { type: string; title: string; description: string; preferred_date?: string }) => post('/api/private/requests', body),
  getMyAppointments: () => apiRequest('/api/private/appointments'),
  createAppointment: (body: { title: string; starts_at: string; ends_at: string }) => post('/api/private/appointments', body),
  getCalendarSlots: (date: string, minutes = 60) => apiRequest(`/api/calendar/slots?date=${encodeURIComponent(date)}&duration_minutes=${minutes}`),
  getNotifications: () => apiRequest('/api/notifications'),
  getRewards: () => apiRequest('/api/rewards'),
  getRewardBalance: () => apiRequest('/api/rewards/balance'),
  getRewardRedemptions: () => apiRequest('/api/rewards/redemptions'),
  getGiveawaysPublic: () => apiRequest('/api/giveaways/public/list'),
  getGiveawayPublic: (id: string) => apiRequest(`/api/giveaways/public/${id}`),
  participateGiveaway: (id: string, body: unknown) => post(`/api/giveaways/public/${id}/participate`, body),

  adminLogin: (body: { email: string; password: string }) => post('/api/auth/login', body),
  adminMe: (token: string) => apiRequest('/api/auth/admin/me', withAdmin(token)),
  adminCustomers: (token: string, query = '') => apiRequest('/api/admin-customers/customers' + (query ? '?q=' + encodeURIComponent(query) : ''), withAdmin(token)),
  updateAdminCustomer: (token: string, id: string, body: Record<string, string>) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}`, body, withAdmin(token)),
  setAdminCustomerStatus: (token: string, id: string, is_active: boolean) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}/status`, { is_active }, withAdmin(token)),
  deleteAdminCustomer: (token: string, id: string) =>
    apiRequest(`/api/admin-customers/customers/${encodeURIComponent(id)}`, withAdmin(token, { method: 'DELETE' })),
  adminRequests: (token: string) => apiRequest('/api/admin-customers/requests', withAdmin(token)),
  adminAppointments: (token: string) => apiRequest('/api/admin-customers/appointments', withAdmin(token)),
  updateAdminRequest: (token: string, id: string, status: string) => patch(`/api/admin-customers/requests/${id}`, { status }, withAdmin(token)),
  updateAdminAppointment: (token: string, id: string, status: string) => patch(`/api/admin-customers/appointments/${id}`, { status }, withAdmin(token)),
  getAdminProducts: (token: string) => apiRequest('/api/admin/products', withAdmin(token)),
  getAdminServices: (token: string) => apiRequest('/api/admin/services', withAdmin(token)),
  createAdminProduct: (token: string, body: unknown) => post('/api/admin/products', body, withAdmin(token)),
  createAdminService: (token: string, body: unknown) => post('/api/admin/services', body, withAdmin(token)),
  updateAdminProduct: (token: string, id: string, body: unknown) => patch(`/api/admin/products/${id}`, body, withAdmin(token)),
  updateAdminService: (token: string, id: string, body: unknown) => patch(`/api/admin/services/${id}`, body, withAdmin(token)),
  deleteAdminProduct: (token: string, id: string) => apiRequest(`/api/admin/products/${id}`, withAdmin(token, { method: 'DELETE' })),
  deleteAdminService: (token: string, id: string) => apiRequest(`/api/admin/services/${id}`, withAdmin(token, { method: 'DELETE' })),
  getAdminCategories: (token: string) => apiRequest('/api/admin/categories', withAdmin(token)),
  createAdminCategory: (token: string, body: unknown) => post('/api/admin/categories', body, withAdmin(token)),
  updateAdminCategory: (token: string, id: string, body: unknown) => patch(`/api/admin/categories/${id}`, body, withAdmin(token)),
  uploadProductImage: (token: string, id: string, file: File, altText = '') => {
    const body = new FormData();
    body.append('file', file); body.append('alt_text', altText);
    return apiRequest(`/api/admin/products/${id}/image`, withAdmin(token, { method: 'POST', body }));
  },
  uploadServiceImage: (token: string, id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest(`/api/admin/services/${id}/image`, withAdmin(token, { method: 'POST', body }));
  },
  uploadSiteMedia: (token: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest('/api/admin/site-media', withAdmin(token, { method: 'POST', body }));
  },
  getAdminGallery: (token: string) => apiRequest('/api/admin/gallery', withAdmin(token)),
  createAdminGallery: (token: string, body: FormData) => apiRequest('/api/admin/gallery', withAdmin(token, { method: 'POST', body })),
  updateAdminGallery: (token: string, id: string, body: unknown) => patch(`/api/admin/gallery/${id}`, body, withAdmin(token)),
  deleteAdminGallery: (token: string, id: string) => apiRequest(`/api/admin/gallery/${id}`, withAdmin(token, { method: 'DELETE' })),
  saveSiteSettings: (token: string, body: Record<string, string>) => apiRequest('/api/admin/site-settings', withAdmin(token, { method: 'PUT', body: JSON.stringify(body) })),
  getAdminConfig: (token: string) => apiRequest('/api/admin/settings', withAdmin(token)),
};
