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

/** Descarga una imagen privada con la sesión adecuada para mostrarla en un objeto URL local. */
export async function authorizedImageBlob(path: string, token?: string): Promise<Blob> {
  const auth = token || customerToken();
  if (!auth) throw new Error('Necesitas iniciar sesión para ver este archivo.');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${auth}` }
  });
  if (!response.ok) throw new Error('No se pudo cargar esta imagen privada.');
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))
    throw new Error('El archivo no tiene un formato de imagen válido.');
  return blob;
}

export const api = {
  getProducts: (params?: Record<string, string>) => apiRequest(`/api/public/products${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getProduct: (id: string) => apiRequest(`/api/public/products/${encodeURIComponent(id)}`),
  getCategories: () => apiRequest('/api/public/categories'),
  getServices: (featured = false) => apiRequest('/api/public/services' + (featured ? '?featured=true' : '')),
  getService: (id: string) => apiRequest(`/api/public/services/${encodeURIComponent(id)}`),
  getFAQ: (params?: Record<string, string>) => apiRequest(`/api/public/faq${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getGallery: (featured = false) => apiRequest('/api/public/gallery' + (featured ? '?featured=true' : '')),
  getGalleryCategories: () => apiRequest('/api/public/extras/gallery/categories'),
  getGalleryImages: (id: string) => apiRequest('/api/public/extras/gallery/' + encodeURIComponent(id) + '/images'),
  getServiceImages: (id: string) => apiRequest('/api/public/extras/services/' + encodeURIComponent(id) + '/images'),
  getRequestCategories: () => apiRequest('/api/public/extras/request-categories'),
  getProductReviews: (id: string) => apiRequest('/api/public/extras/products/' + encodeURIComponent(id) + '/reviews'),

  getSettings: () => apiRequest('/api/public/settings'),
  getAssistantConfig: () => apiRequest('/api/assistant/config'),
  getAssistantSessions: (page = 1) => apiRequest('/api/assistant/sessions?page=' + page),
  createAssistantSession: () => post('/api/assistant/sessions', {}),
  renameAssistantSession: (id: string, title: string) =>
    patch('/api/assistant/session/' + encodeURIComponent(id), {title}),
  deleteAssistantSession: (id: string) =>
    apiRequest('/api/assistant/session/' + encodeURIComponent(id), {method:'DELETE'}),
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
  createRequest: (body: { type?: string; category_id?: string; title: string; description: string; preferred_date?: string }) => post('/api/private/requests', body),
  uploadRequestImage: (id: string, file: File) => {
    const body = new FormData(); body.append('file', file);
    return apiRequest('/api/private/extras/requests/' + encodeURIComponent(id) + '/images', { method: 'POST', body });
  },
  getMyRequestImages: (id: string) => apiRequest('/api/private/extras/requests/' + encodeURIComponent(id) + '/images'),
  getReviewEligibility: (id: string) => apiRequest('/api/private/extras/products/' + encodeURIComponent(id) + '/review-eligibility'),
  sendProductReview: (id: string, rating: number, comment: string) =>
    post('/api/private/extras/products/' + encodeURIComponent(id) + '/reviews', { rating, comment }),

  getMyAppointments: () => apiRequest('/api/private/appointments'),
  createAppointment: (body: { title: string; starts_at: string; ends_at: string }) => post('/api/private/appointments', body),
  getCalendarSlots: (date: string, minutes = 60) => apiRequest(`/api/calendar/slots?date=${encodeURIComponent(date)}&duration_minutes=${minutes}`),
  getNotifications: () => apiRequest('/api/notifications'),
  markNotificationRead: (id: string) => patch('/api/notifications/' + encodeURIComponent(id) + '/read', {}),
  getWelcomeAutomation: (token: string) => apiRequest('/api/notifications/admin/automation', withAdmin(token)),
  saveWelcomeAutomation: (token: string, enabled: boolean, title: string, message: string) =>
    apiRequest('/api/notifications/admin/automation', withAdmin(token, {
      method: 'PUT', body: JSON.stringify({enabled,title,message}),
    })),
  getStaffInbox: (token: string) => apiRequest('/api/notifications/inbox', withAdmin(token)),
  markStaffNotificationRead: (token: string, id: string) =>
    patch('/api/notifications/inbox/' + encodeURIComponent(id) + '/read', {}, withAdmin(token)),
  sendCustomerNotification: (token: string, customer_ids: string[], title: string, message: string) =>
    post('/api/notifications/admin/send', { customer_ids, title, message }, withAdmin(token)),
  sendAllCustomerNotifications: (token: string, title: string, message: string) =>
    post('/api/notifications/admin/send-all', { title, message }, withAdmin(token)),

  getRewards: () => apiRequest('/api/rewards'),
  getRewardBalance: () => apiRequest('/api/rewards/balance'),
  getRewardRedemptions: () => apiRequest('/api/rewards/redemptions'),
  getGiveawaysPublic: () => apiRequest('/api/giveaways/public/list'),
  getGiveawayPublic: (id: string) => apiRequest(`/api/giveaways/public/${id}`),
  participateGiveaway: (id: string, body: unknown) => post(`/api/giveaways/public/${id}/participate`, body),

  adminLogin: (body: { email: string; password: string }) => post('/api/auth/login', body),
  adminMe: (token: string) => apiRequest('/api/auth/admin/me', withAdmin(token)),
  listStaff: (token: string) => apiRequest('/api/admin/users', withAdmin(token)),
  createStaff: (token: string, body: { email: string; password: string; role: 'admin' | 'operator' }) =>
    post('/api/admin/users', body, withAdmin(token)),
  updateStaff: (token: string, id: string, body: { role?: 'admin' | 'operator'; is_active?: boolean }) =>
    patch('/api/admin/users/' + encodeURIComponent(id), body, withAdmin(token)),
  deactivateStaff: (token: string, id: string) =>
    apiRequest('/api/admin/users/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),

  adminCustomers: (token: string, query = '') => apiRequest('/api/admin-customers/customers' + (query ? '?q=' + encodeURIComponent(query) : ''), withAdmin(token)),
  updateAdminCustomer: (token: string, id: string, body: Record<string, string>) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}`, body, withAdmin(token)),
  setAdminCustomerStatus: (token: string, id: string, is_active: boolean) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}/status`, { is_active }, withAdmin(token)),
  deleteAdminCustomer: (token: string, id: string) =>
    apiRequest(`/api/admin-customers/customers/${encodeURIComponent(id)}`, withAdmin(token, { method: 'DELETE' })),
  adminRequests: (token: string, q = '', page?: number, pageSize = 20) =>
    apiRequest('/api/admin-customers/requests' +
      (page !== undefined || q ? '?' + new URLSearchParams({
        q, page: String(page ?? 1), page_size: String(pageSize),
      }).toString() : ''), withAdmin(token)),
  getStaffRequestImages: (token: string, id: string) =>
    apiRequest('/api/admin-customers/extras/requests/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  listAdminRequestCategories: (token: string) => apiRequest('/api/admin/extras/request-categories', withAdmin(token)),
  createAdminRequestCategory: (token: string, body: unknown) => post('/api/admin/extras/request-categories', body, withAdmin(token)),
  updateAdminRequestCategory: (token: string, id: string, body: unknown) =>
    patch('/api/admin/extras/request-categories/' + encodeURIComponent(id), body, withAdmin(token)),
  deleteAdminRequestCategory: (token: string, id: string) =>
    apiRequest('/api/admin/extras/request-categories/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),

  adminAppointments: (token: string, q = '', page?: number, pageSize = 20) =>
    apiRequest('/api/admin-customers/appointments' +
      (page !== undefined || q ? '?' + new URLSearchParams({
        q, page: String(page ?? 1), page_size: String(pageSize),
      }).toString() : ''), withAdmin(token)),
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
  deleteAdminCategory: (token: string, id: string) =>
    apiRequest('/api/admin/categories/' + encodeURIComponent(id), withAdmin(token, {method:'DELETE'})),
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
  setProductImageUrl: (token: string, id: string, url: string) =>
    post(`/api/admin/products/${encodeURIComponent(id)}/image-url`, { url }, withAdmin(token)),
  setServiceImageUrl: (token: string, id: string, url: string) =>
    post(`/api/admin/services/${encodeURIComponent(id)}/image-url`, { url }, withAdmin(token)),
  uploadSiteMedia: (token: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest('/api/admin/site-media', withAdmin(token, { method: 'POST', body }));
  },
  getAdminGallery: (token: string) => apiRequest('/api/admin/gallery', withAdmin(token)),
  listAdminGalleryCategories: (token: string) => apiRequest('/api/admin/extras/gallery/categories', withAdmin(token)),
  createAdminGalleryCategory: (token: string, name: string) =>
    post('/api/admin/extras/gallery/categories', { name }, withAdmin(token)),
  updateAdminGalleryCategory: (token: string, id: string, body: unknown) =>
    patch('/api/admin/extras/gallery/categories/' + encodeURIComponent(id), body, withAdmin(token)),
  deleteAdminGalleryCategory: (token: string, id: string) =>
    apiRequest('/api/admin/extras/gallery/categories/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),
  getAdminGalleryImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  uploadAdminGalleryImage: (token: string, id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images', withAdmin(token, { method: 'POST', body: form }));
  },
  deleteAdminGalleryImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  getAdminProductImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/products/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  deleteAdminProductImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/products/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  getAdminServiceImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  uploadAdminServiceImage: (token: string, id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images', withAdmin(token, { method: 'POST', body: form }));
  },
  deleteAdminServiceImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  verifyProductPurchase: (token: string, id: string, customerId: string, reference = '') =>
    post('/api/admin/extras/products/' + encodeURIComponent(id) + '/verify-purchase', { customer_id: customerId, reference }, withAdmin(token)),
  listAdminProductReviews: (token: string) => apiRequest('/api/admin/extras/product-reviews', withAdmin(token)),
  moderateProductReview: (token: string, id: string, status: 'published' | 'rejected' | 'pending') =>
    patch('/api/admin/extras/product-reviews/' + encodeURIComponent(id), { status }, withAdmin(token)),

  createAdminGallery: (token: string, body: FormData) => apiRequest('/api/admin/gallery', withAdmin(token, { method: 'POST', body })),
  updateAdminGallery: (token: string, id: string, body: unknown) => patch(`/api/admin/gallery/${id}`, body, withAdmin(token)),
  deleteAdminGallery: (token: string, id: string) => apiRequest(`/api/admin/gallery/${id}`, withAdmin(token, { method: 'DELETE' })),
  saveSiteSettings: (token: string, body: Record<string, string>) => apiRequest('/api/admin/site-settings', withAdmin(token, { method: 'PUT', body: JSON.stringify(body) })),
  getAdminConfig: (token: string) => apiRequest('/api/admin/settings', withAdmin(token)),
};
