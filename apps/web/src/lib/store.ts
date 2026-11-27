import { writable } from 'svelte/store';
export const assistantSessionId = writable<string | null>(null);
export const assistantMessages = writable<{ role: string; content: string }[]>([]);
export const isAssistantOpen = writable(false);
export const isAuthenticated = writable(false);
export const authToken = writable<string | null>(null);
export const adminUser = writable<{ id: string; email: string; role: string } | null>(null);
export const cart = writable<any[]>([]);
export const notifications = writable<{ id: number; type: string; message: string }[]>([]);
let nextId = 0;
export function addNotification(type: 'success' | 'error' | 'info' | 'warning', message: string) {
  const id = ++nextId;
  notifications.update(items => [...items, { id, type, message }]);
  setTimeout(() => notifications.update(items => items.filter(item => item.id !== id)), 5000);
}
