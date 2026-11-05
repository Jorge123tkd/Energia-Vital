const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

function getApiBase(): string {
  // En producción, si no hay VITE_API_URL, intentamos detectar si estamos en el mismo dominio
  // Si no, el usuario debe configurar la variable en Cloudflare Pages
  const base = (import.meta.env.VITE_API_URL as string) || '';
  return base;
}

async function request(path: string, options?: RequestInit) {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: isFormData
      ? { ...options?.headers }
      : {
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

  // Auth (dual login: Telegram + Phone)
  login: (body: { email: string; password: string }) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  setup: (body: { email: string; password: string }) =>
    request('/api/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { name: string; email: string; password: string; phone?: string }) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  customerLogin: (body: { email: string; password: string }) =>
    request('/api/auth/customer/login', { method: 'POST', body: JSON.stringify(body) }),
  refreshToken: (body: { refresh_token: string }) =>
    request('/api/auth/refresh', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  adminMe: () => request('/api/auth/admin/me'),
  phoneRequest: (body: { phone?: string; email?: string; telegram_chat_id?: string }) =>
    request('/api/auth/phone/request', { method: 'POST', body: JSON.stringify(body) }),
  phoneVerify: (body: { phone?: string; email?: string; code: string }) =>
    request('/api/auth/phone/verify', { method: 'POST', body: JSON.stringify(body) }),
  telegramLink: (body: { telegram_chat_id: string; name?: string; email?: string }) =>
    request('/api/auth/telegram/link', { method: 'POST', body: JSON.stringify(body) }),
  telegramExchange: (body: { link_code: string }) =>
    request('/api/auth/telegram/exchange', { method: 'POST', body: JSON.stringify(body) }),
  telegramWebhook: (body: any) =>
    request('/api/auth/telegram/webhook', { method: 'POST', body: JSON.stringify(body) }),

  // Giveaways
  getGiveaways: (token: string) =>
    request('/api/giveaways', { headers: { Authorization: `Bearer ${token}` } }),
  createGiveaway: (token: string, body: any) =>
    request('/api/giveaways', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  getGiveaway: (token: string, id: string) =>
    request(`/api/giveaways/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
  updateGiveaway: (token: string, id: string, body: any) =>
    request(`/api/giveaways/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  deleteGiveaway: (token: string, id: string) =>
    request(`/api/giveaways/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  activateGiveaway: (token: string, id: string) =>
    request(`/api/giveaways/${id}/activate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  deactivateGiveaway: (token: string, id: string) =>
    request(`/api/giveaways/${id}/deactivate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  getGiveawayParticipants: (token: string, id: string) =>
    request(`/api/giveaways/${id}/participants`, { headers: { Authorization: `Bearer ${token}` } }),
  drawGiveaway: (token: string, id: string) =>
    request(`/api/giveaways/${id}/draw`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  getGiveawayPublic: (id: string) =>
    request(`/api/giveaways/public/${id}`),
  getGiveawaysPublic: () =>
    request('/api/giveaways/public/list'),
  participateGiveaway: (id: string, body: any) =>
    request(`/api/giveaways/public/${id}/participate`, { method: 'POST', body: JSON.stringify(body) }),

  // Rewards
  getRewards: () => request('/api/rewards'),
  createReward: (token: string, body: any) =>
    request('/api/rewards', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  updateReward: (token: string, id: string, body: any) =>
    request(`/api/rewards/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  deleteReward: (token: string, id: string) =>
    request(`/api/rewards/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  getRewardBalance: () => request('/api/rewards/balance'),
  redeemReward: (token: string, id: string) =>
    request(`/api/rewards/${id}/redeem`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  getRewardRedemptions: () => request('/api/rewards/redemptions'),
  getRewardRedemptionsById: (token: string, id: string) =>
    request(`/api/rewards/${id}/redemptions`, { headers: { Authorization: `Bearer ${token}` } }),

  // Notifications
  getNotifications: () => request('/api/notifications'),
  markNotificationRead: (token: string, id: string) =>
    request(`/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }),
  getAdminNotifications: (token: string) =>
    request('/api/notifications/admin', { headers: { Authorization: `Bearer ${token}` } }),
  sendNotification: (token: string, body: { customer_ids: string[]; title: string; message: string; type?: string; data?: string }) =>
    request('/api/notifications/admin/send', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  broadcastNotification: (token: string, body: { title: string; message: string; type?: string; data?: string }) =>
    request('/api/notifications/admin/send-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  // --- Admin CRUD (productos, servicios, categorías, FAQ, galería, config) ---
  createAdminProduct: (token: string, body: any) =>
    request('/api/admin/products', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  updateAdminProduct: (token: string, id: string, body: any) =>
    request(`/api/admin/products/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  deleteAdminProduct: (token: string, id: string) =>
    request(`/api/admin/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  createAdminService: (token: string, body: any) =>
    request('/api/admin/services', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  updateAdminService: (token: string, id: string, body: any) =>
    request(`/api/admin/services/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  deleteAdminService: (token: string, id: string) =>
    request(`/api/admin/services/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  createAdminCategory: (token: string, body: any) =>
    request('/api/admin/categories', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  updateAdminCategory: (token: string, id: string, body: any) =>
    request(`/api/admin/categories/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  deleteAdminCategory: (token: string, id: string) =>
    request(`/api/admin/categories/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  createAdminFAQ: (token: string, body: any) =>
    request('/api/admin/faq', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  updateAdminFAQ: (token: string, id: string, body: any) =>
    request(`/api/admin/faq/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  deleteAdminFAQ: (token: string, id: string) =>
    request(`/api/admin/faq/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  createAdminGalleryImage: (token: string, body: FormData) =>
    request('/api/admin/gallery', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }),

  deleteAdminGalleryImage: (token: string, id: string) =>
    request(`/api/admin/gallery/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  getAdminConfig: (token: string) =>
    request('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } }),

  updateAdminConfig: (token: string, body: any) =>
    request('/api/admin/settings', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),

  // --- Lectura admin ---
  getAdminProducts: (token: string) =>
    request('/api/admin/products', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminServices: (token: string) =>
    request('/api/admin/services', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminCategories: (token: string) =>
    request('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminFAQ: (token: string) =>
    request('/api/admin/faq', { headers: { Authorization: `Bearer ${token}` } }),
  getAdminGallery: (token: string) =>
    request('/api/admin/gallery', { headers: { Authorization: `Bearer ${token}` } }),
  deleteAdminConfig: (token: string, id: string) =>
    request(`/api/admin/settings/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
};
};
