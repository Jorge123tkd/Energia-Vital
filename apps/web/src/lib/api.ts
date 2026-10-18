const API_BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Productos
  getProducts: (params?: { category_id?: string; featured?: string; search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/public/products${qs}`);
  },
  getProduct: (id: string) => request(`/public/products/${id}`),
  getCategories: () => request('/public/categories'),
  getServices: () => request('/public/services'),
  getService: (id: string) => request(`/public/services/${id}`),
  getFAQ: (params?: { category_id?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/public/faq${qs}`);
  },
  getGallery: () => request('/public/gallery'),
  getSettings: () => request('/public/settings'),

  // Asistente
  getAssistantConfig: () => request('/assistant/config'),
  postAssistantMessage: (body: { session_id?: string; message: string; channel?: string; telegram_chat_id?: string }) =>
    request('/assistant/message', { method: 'POST', body: JSON.stringify(body) }),

  // Auth
  login: (body: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  setup: (body: { email: string; password: string }) =>
    request('/auth/setup', { method: 'POST', body: JSON.stringify(body) }),

  // Admin
  getAdminProducts: (token: string) =>
    request('/admin/products', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminProduct: (token: string, body: any) =>
    request('/admin/products', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  updateAdminProduct: (token: string, id: string, body: any) =>
    request(`/admin/products/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  deleteAdminProduct: (token: string, id: string) =>
    request(`/admin/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  getAdminCategories: (token: string) =>
    request('/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminCategory: (token: string, body: any) =>
    request('/admin/categories', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminServices: (token: string) =>
    request('/admin/services', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminService: (token: string, body: any) =>
    request('/admin/services', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminFAQ: (token: string) =>
    request('/admin/faq', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminFAQ: (token: string, body: any) =>
    request('/admin/faq', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminGallery: (token: string) =>
    request('/admin/gallery', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminAssistantConfig: (token: string) =>
    request('/admin/assistant-config', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminAssistantConfig: (token: string, body: any) =>
    request('/admin/assistant-config', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminSettings: (token: string) =>
    request('/admin/settings', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminSetting: (token: string, body: any) =>
    request('/admin/settings', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminAudit: (token: string) =>
    request('/admin/audit', { headers: { Authorization: `Bearer ${token}` } }),
};