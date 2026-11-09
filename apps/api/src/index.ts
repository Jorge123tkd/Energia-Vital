import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import type { JwtPayload } from './auth';
import { requireCustomerAuth } from './middleware';
import { publicRoutes } from './routes/public';
import { privateRoutes } from './routes/private';
import { assistantRoutes } from './routes/assistant';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { adminCustomersRoutes } from './routes/admin-customers';
import { calendarRoutes } from './routes/calendar';
import { telegramRoutes } from './routes/telegram';
import { giveawaysRoutes } from './routes/giveaways';
import { rewardsRoutes } from './routes/rewards';
import { notificationsRoutes } from './routes/notifications';

const knownOrigins = ['https://energia-vital-web.pages.dev', 'http://localhost:5173'];
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = new Hono<{ Bindings: Env; Variables: { user?: JwtPayload } }>();
    app.use('*', cors({
      origin: origin => origin && [...knownOrigins, env.SITE_URL].includes(origin) ? origin : '',
      allowHeaders: ['Content-Type', 'Authorization', 'X-Setup-Key'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }));
    // El catálogo, contacto, galería, citas y asistente son exclusivos de clientes registrados.
    // Las imágenes de R2 pueden servir como activos estáticos sin información personal.
    app.use('/api/public/*', async (c, next) => {
      if (c.req.path.startsWith('/api/public/gallery/image/')) return next();
      return requireCustomerAuth(c, next);
    });
    // Los sorteos públicos también exigen cuenta; no se aceptan participantes anónimos.
    app.use('/api/giveaways/public/*', requireCustomerAuth);
    // Limitar tipos y tamaño en subidas al bucket R2. El backend verifica JWT después.
    app.use('/api/admin/gallery', async (c, next) => {
      if (c.req.method === 'POST' && (c.req.header('content-type') || '').includes('multipart/form-data')) {
        const form = await c.req.raw.clone().formData().catch(() => null);
        const file = form?.get('file');
        if (file instanceof File && file.size > 0 && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)))
          return c.json({ error: 'Solo imágenes JPG, PNG o WebP de hasta 8 MB' }, 400);
      }
      await next();
    });
    app.route('/api/public', publicRoutes);
    app.route('/api/private', privateRoutes);
    app.route('/api/assistant', assistantRoutes);
    app.route('/api/auth', authRoutes);
    app.route('/api/admin', adminRoutes);
    app.route('/api/admin-customers', adminCustomersRoutes);
    app.route('/api/calendar', calendarRoutes);
    app.route('/api/telegram', telegramRoutes);
    app.route('/api/giveaways', giveawaysRoutes);
    app.route('/api/rewards', rewardsRoutes);
    app.route('/api/notifications', notificationsRoutes);
    app.get('/health', c => c.json({ status: 'ok', service: 'energia-vital-api' }));
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
