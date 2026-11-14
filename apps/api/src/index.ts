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
import { brigadeRoutes } from './routes/brigades';
import { brigadeWorkRoutes } from './routes/brigade-work';
import { calendarRoutes } from './routes/calendar';
import { telegramRoutes } from './routes/telegram';
import { runTelegramMorningReminders } from './telegram-reminders';
import { whatsappRoutes } from './routes/whatsapp';
import { giveawaysRoutes } from './routes/giveaways';
import { rewardsRoutes } from './routes/rewards';
import { notificationsRoutes } from './routes/notifications';
import { publicExtrasRoutes, privateExtrasRoutes, adminExtrasRoutes, staffExtrasRoutes } from './routes/content-extras';

// Vista previa controlada del panel: misma API, sin habilitar cualquier subdominio.
const knownOrigins = [
  'https://energia-vital-web.pages.dev',
  'https://admin-visual-preview.energia-vital-web.pages.dev',
  'http://localhost:5173',
];
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = new Hono<{ Bindings: Env; Variables: { user?: JwtPayload } }>();
    app.use('*', cors({
      origin: origin => origin && [...knownOrigins, env.SITE_URL].includes(origin) ? origin : '',
      allowHeaders: ['Content-Type', 'Authorization', 'X-Setup-Key'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }));
    // Información comercial pública: solo consultas GET, sin datos personales.
    // Operaciones de clientes, conversaciones, citas y administración siguen protegidas.
    app.use('/api/public/*', async (c, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return c.json({ error: 'Método no permitido' }, 405);
      await next();
    });
    // Los sorteos públicos también exigen cuenta; no se aceptan participantes anónimos.
    app.use('/api/giveaways/public/*', requireCustomerAuth);
    // Limitar tipos y tamaño en subidas al bucket R2. El backend verifica JWT después.
    app.use('/api/admin/gallery', async (c, next) => {
      if (c.req.method === 'POST' && (c.req.header('content-type') || '').includes('multipart/form-data')) {
        const form = await c.req.raw.clone().formData().catch(() => null);
        const file = form?.get('file') as unknown as { size: number; type: string } | null;
        if (file && typeof file.size === 'number' && file.size > 0 && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)))
          return c.json({ error: 'Solo imágenes JPG, PNG o WebP de hasta 8 MB' }, 400);
      }
      await next();
    });
    app.route('/api/public', publicRoutes);
    app.route('/api/public/extras', publicExtrasRoutes);
    app.route('/api/private/extras', privateExtrasRoutes);
    app.route('/api/admin/extras', adminExtrasRoutes);
    app.route('/api/admin-customers/extras', staffExtrasRoutes);
    app.route('/api/private', privateRoutes);
    app.route('/api/assistant', assistantRoutes);
    app.route('/api/auth', authRoutes);
    app.route('/api/admin', adminRoutes);
    app.route('/api/admin-customers', adminCustomersRoutes);
    app.route('/api/brigades', brigadeRoutes);
    app.route('/api/brigade-work', brigadeWorkRoutes);
    app.route('/api/calendar', calendarRoutes);
    app.route('/api/telegram', telegramRoutes);
    app.route('/api/whatsapp', whatsappRoutes);
    app.route('/api/giveaways', giveawaysRoutes);
    app.route('/api/rewards', rewardsRoutes);
    app.route('/api/notifications', notificationsRoutes);
    app.get('/health', c => c.json({ status: 'ok', service: 'energia-vital-api' }));
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(runTelegramMorningReminders(env,new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
