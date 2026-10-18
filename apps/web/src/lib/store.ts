import { writable, derived } from 'svelte/store';

export const assistantSessionId = writable<string | null>(null);
export const assistantMessages = writable<{ role: string; content: string }[]>([]);
export const isAssistantOpen = writable(false);
export const isAuthenticated = writable(false);
export const authToken = writable<string | null>(null);
export const adminUser = writable<{ id: string; email: string; role: string } | null>(null);
export const cart = writable<any[]>([]);
export const notifications = writable<{ type: string; message: string }[]>([]);

export function addNotification(type: 'success' | 'error' | 'info', message: string) {
  const id = Date.now();
  notifications.update((n) => [...n, { type, message } as any]);
  setTimeout(() => {
    notifications.update((n) => n.filter((x: any) => x !== n.find((i: any) => i === n.find((j: any) => j === n.find((k: any) => k.id === id)))));
  }, 5000);
}