import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './types';

// Importar rutas
import { publicRoutes } from './routes/public';
import { privateRoutes } from './routes/private';
import { assistantRoutes } from './routes/assistant';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { calendarRoutes } from './routes/calendar';
import { telegramRoutes } from './routes/telegram';
import { giveawaysRoutes } from './routes/giveaways';
import { rewardsRoutes } from './routes/rewards';
import { notificationsRoutes } from './routes/notifications';

const ALLOWED_ORIGINS = [
  'https://energia-vital-web.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();

    app.use('*', logger());
    app.use('*', cors({
      origin: (origin) => {
        // Allow configured SITE_URL plus known web origins
        const allowed = [...ALLOWED_ORIGINS];
        if (env.SITE_URL) allowed.push(env.SITE_URL);
        if (origin && allowed.includes(origin)) return origin;
        // Fallback: allow if no origin (same-origin / server-to-server)
        if (!origin) return '*';
        return null;
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }));

    // Rutas públicas
    app.route('/api/public', publicRoutes);
    // Rutas del asistente
    app.route('/api/assistant', assistantRoutes);
    // Autenticación
    app.route('/api/auth', authRoutes);
    // Rutas privadas (requieren autenticación)
    app.route('/api/private', privateRoutes);
    // Admin
    app.route('/api/admin', adminRoutes);
    // Calendario y citas
    app.route('/api/calendar', calendarRoutes);
    // Telegram webhook
    app.route('/api/telegram', telegramRoutes);
    // SISTEMA DE SORTEOS (giveaways)
    app.route('/api/giveaways', giveawaysRoutes);
    // RECOMPENSAS
    app.route('/api/rewards', rewardsRoutes);
    // NOTIFICACIONES
    app.route('/api/notifications', notificationsRoutes);

    app.get('/health', (c) => c.json({ status: 'ok', service: 'energia-vital-api' }));

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
