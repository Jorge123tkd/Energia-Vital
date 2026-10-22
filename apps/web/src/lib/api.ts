const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

function getApiBase(): string {
  // En producción, si no hay VITE_API_URL, intentamos detectar si estamos en el mismo dominio
  // Si no, el usuario debe configurar la variable en Cloudflare Pages
  const base = (import.meta.env.VITE_API_URL as string) || '';
  return base;
}

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
    return request(`/api/public/products${qs}`);
  },
  getProduct: (id: string) => request(`/api/public/products/${id}`),
  getCategories: () => request('/api/public/categories'),
  getServices: () => request('/api/public/services'),
  getService: (id: string) => request(`/api/public/services/${id}`),
  getFAQ: (params?: { category_id?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/api/public/faq${qs}`);
  },
  getGallery: () => request('/api/public/gallery'),
  getSettings: () => request('/api/public/settings'),

  // Asistente
  getAssistantConfig: () => request('/api/assistant/config'),
  postAssistantMessage: (body: { session_id?: string; message: string; channel?: string; telegram_chat_id?: string }) =>
    request('/api/assistant/message', { method: 'POST', body: JSON.stringify(body) }),

  // Auth
  login: (body: { email: string; password: string }) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  setup: (body: { email: string; password: string }) =>
    request('/api/auth/setup', { method: 'POST', body: JSON.stringify(body) }),

  // Admin
  getAdminProducts: (token: string) =>
    request('/api/admin/products', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminProduct: (token: string, body: any) =>
    request('/api/admin/products', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  updateAdminProduct: (token: string, id: string, body: any) =>
    request(`/api/admin/products/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  deleteAdminProduct: (token: string, id: string) =>
    request(`/api/admin/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  getAdminCategories: (token: string) =>
    request('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminCategory: (token: string, body: any) =>
    request('/api/admin/categories', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminServices: (token: string) =>
    request('/api/admin/services', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminService: (token: string, body: any) =>
    request('/api/admin/services', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminFAQ: (token: string) =>
    request('/api/admin/faq', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminFAQ: (token: string, body: any) =>
    request('/api/admin/faq', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminGallery: (token: string) =>
    request('/api/admin/gallery', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminAssistantConfig: (token: string) =>
    request('/api/admin/assistant-config', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminAssistantConfig: (token: string, body: any) =>
    request('/api/admin/assistant-config', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminSettings: (token: string) =>
    request('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } }),
  createAdminSetting: (token: string, body: any) =>
    request('/api/admin/settings', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getAdminAudit: (token: string) =>
    request('/api/admin/audit', { headers: { Authorization: `Bearer ${token}` } }),
};