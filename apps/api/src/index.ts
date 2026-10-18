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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();

    app.use('*', logger());
    app.use('*', cors({
      origin: env.SITE_URL || '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

    app.get('/health', (c) => c.json({ status: 'ok', service: 'energia-vital-api' }));

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;