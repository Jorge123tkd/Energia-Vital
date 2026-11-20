import { Hono } from 'hono';
import type { Env } from '../types';
import { REFRESH_TTL, comparePassword, extractToken, generateTokenPair, hashPassword, verifyToken, type JwtPayload } from '../auth';
import { activeSession } from '../middleware';
import { rateLimited } from '../rate-limit';
import { verifiedTelegramUser } from '../telegram-customer-auth';

export const authRoutes = new Hono<{ Bindings: Env }>();
// Evita que respuestas con access/refresh JWT se almacenen en cachés.
authRoutes.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
});
/** SHA-256 del refresh JWT firmado: nunca guardar el token en D1. */
async function refreshFingerprint(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPhone = (phone: string) => /^\+?[0-9 ()-]{8,20}$/.test(phone) && (phone.match(/\d/g) || []).length >= 8;
const validPassword = (s: unknown): s is string => typeof s === 'string' && s.length >= 10 && s.length <= 128;
const clean = (v: unknown, limit: number) => typeof v === 'string' ? v.trim().slice(0, limit) : '';
/** Un JSON malformado, nulo, lista o primitivo nunca debe causar un 500 en auth. */
async function readBodyObject(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  const body = await c.req.json().catch(() => null);
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function safeCustomer(row: any) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, address: row.address,
    city: row.city, province: row.province, phone_verified: Boolean(row.phone_verified), role: 'customer' };
}
async function issue(env: Env, userId: string, type: 'customer' | 'admin', role: string, ttl=REFRESH_TTL) {
  const sid = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 1000).toISOString();
  const tokens = await generateTokenPair(env, userId, type, role, sid);
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, user_type, created_at, expires_at, refresh_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sid, userId, type, now.toISOString(), expires, await refreshFingerprint(tokens.refresh_token)).run();
  return tokens;
}
async function signedIn(c: any, type: 'admin' | 'customer'): Promise<JwtPayload | null> {
  const p = await extractToken(c.req.header('authorization'), c.env);
  if (!p || p.type !== type || !await activeSession(c.env, p)) return null;
  return p;
}

// Primer administrador: requiere secreto independiente configurado en Workers.
authRoutes.post('/setup', async c => {
  if (await rateLimited(c.env, c.req.raw, 'admin_setup', 5, 3600)) return c.json({ error: 'Demasiados intentos' }, 429);
  const setup = (c.env as Env & { ADMIN_SETUP_KEY?: string }).ADMIN_SETUP_KEY;
  if (!setup || setup.length < 32 || c.req.header('x-setup-key') !== setup) return c.json({ error: 'Configuración inicial no autorizada' }, 403);
  const b = await readBodyObject(c);
  if (!b) return c.json({ error: 'Datos de configuración inválidos' }, 400);
  const email = clean(b.email, 254).toLowerCase();
  if (!validEmail(email) || !validPassword(b.password)) return c.json({ error: 'Email o contraseña inválidos (mínimo 10 caracteres)' }, 400);
  const now = new Date().toISOString();
  // La condición de primer administrador se comprueba en el MISMO INSERT de
  // SQLite/D1: dos solicitudes simultáneas con correos distintos nunca deben
  // crear dos administradores por una carrera SELECT -> INSERT.
  const result = await c.env.DB.prepare(`INSERT INTO admin_users
    (id, email, password_hash, role, is_active, created_at, updated_at)
    SELECT ?, ?, ?, 'admin', 1, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM admin_users)`)
    .bind(crypto.randomUUID(), email, await hashPassword(b.password), now, now).run();
  if (result.meta.changes !== 1) {
    return c.json({ error: 'El administrador ya fue configurado' }, 409);
  }
  return c.json({ message: 'Administrador inicial creado' }, 201);
});

authRoutes.post('/login', async c => {
  if (await rateLimited(c.env, c.req.raw, 'admin_login', 10, 900)) return c.json({ error: 'Demasiados intentos' }, 429);
  const b = await readBodyObject(c);
  const email = clean(b?.email, 254).toLowerCase();
  const password = b?.password;
  if (!validEmail(email) || typeof password !== 'string' || !password || password.length > 128)
    return c.json({ error: 'Credenciales inválidas' }, 401);
  const admin = await c.env.DB.prepare('SELECT * FROM admin_users WHERE LOWER(email) = ? AND is_active = 1')
    .bind(email).first<any>();
  if (!admin || !await comparePassword(password, admin.password_hash)) return c.json({ error: 'Credenciales inválidas' }, 401);
  // Browser sessions have a fixed absolute lifetime in D1, never extended on refresh.
  const ttl=b?.browser_session===true?(b.remember===true?7*86400:8*3600):REFRESH_TTL;
  const tokens = await issue(c.env, admin.id, 'admin', admin.role,ttl);
  return c.json({ user: { id: admin.id, email: admin.email, role: admin.role }, token: tokens.access_token, ...tokens });
});

// Acceso único al sitio: la credencial se verifica en su tabla original.
// Un JWT de administrador nunca obtiene permisos de cliente ni viceversa.
authRoutes.post('/sign-in', async c => {
  if (await rateLimited(c.env, c.req.raw, 'site_login', 10, 900))
    return c.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
  const b = await readBodyObject(c);
  const email = clean(b?.email, 254).toLowerCase();
  const password = typeof b?.password === 'string' ? b.password : '';
  if (!validEmail(email) || !password || password.length > 128)
    return c.json({ error: 'Credenciales inválidas' }, 401);

  // Admin antes que cliente solo cuando su contraseña ha sido verificada.
  const admin = await c.env.DB.prepare(`SELECT id, email, role, password_hash FROM admin_users
      WHERE LOWER(email) = ? AND is_active = 1 AND role IN ('admin','operator')`)
    .bind(email).first<any>();
  if (admin && await comparePassword(password, admin.password_hash)) {
    const tokens = await issue(c.env, admin.id, 'admin', admin.role);
    return c.json({
      user: { id: admin.id, email: admin.email, name: admin.role === 'admin' ? 'Administrador' : 'Moderador', role: admin.role, account_type: 'admin' },
      ...tokens,
    });
  }
  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE LOWER(email) = ? AND password_hash IS NOT NULL AND is_active = 1'
  ).bind(email).first<any>();
  if (!customer || !await comparePassword(password, customer.password_hash))
    return c.json({ error: 'Credenciales inválidas' }, 401);
  const tokens = await issue(c.env, customer.id, 'customer', 'customer');
  return c.json({ user: safeCustomer(customer), ...tokens });
});

/** Evita registros incompletos cuando la D1 remota no recibió todas las migraciones. */
async function registrationSchemaReady(env: Env): Promise<boolean> {
  const { results } = await env.DB.prepare('PRAGMA table_info(customers)').all<{ name: string }>();
  const columns = new Set((results || []).map(row => row.name));
  const required = ['id', 'name', 'email', 'phone', 'address', 'city', 'province', 'password_hash', 'role', 'phone_verified', 'created_at', 'updated_at'];
  const missing = required.filter(name => !columns.has(name));
  const sessions = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'").first();
  if (missing.length || !sessions) {
    console.error('[register] D1 necesita migraciones de cuentas', { missingColumns: missing, missingSessions: !sessions });
    return false;
  }
  return true;
}

authRoutes.post('/register', async c => {
  if (await rateLimited(c.env, c.req.raw, 'register', 5, 3600)) return c.json({ error: 'Demasiados intentos de registro. Inténtalo más tarde.' }, 429);
  const b = await c.req.json<any>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Solicitud de registro inválida' }, 400);
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 25);
  const address = clean(b.address, 250);
  const city = clean(b.city, 100);
  const province = clean(b.province, 100);
  if (name.length < 3 || !validEmail(email) || !validPhone(phone) || address.length < 6 || city.length < 2 || province.length < 2 || !validPassword(b.password))
    return c.json({ error: 'Completa nombre, email, teléfono, dirección, municipio, provincia y contraseña de al menos 10 caracteres.' }, 400);
  if (!c.env.JWT_SECRET || c.env.JWT_SECRET.length < 32) {
    console.error('[register] JWT_SECRET no configurado');
    return c.json({ error: 'El registro no está disponible temporalmente. Contacta al equipo de Energía Vital.' }, 503);
  }
  try {
    if (!await registrationSchemaReady(c.env)) {
      return c.json({ error: 'El registro no está disponible temporalmente. Contacta al equipo de Energía Vital.' }, 503);
    }
    const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE LOWER(email) = ?').bind(email).first();
    if (existing) return c.json({ error: 'Este correo ya está registrado. Utiliza «Entrar» o contacta a soporte para recuperar el acceso.' }, 409);
    const reservedAdmin = await c.env.DB.prepare('SELECT id FROM admin_users WHERE LOWER(email) = ?').bind(email).first();
    if (reservedAdmin) return c.json({ error: 'Este correo ya pertenece a una cuenta. Utiliza «Entrar».' }, 409);

    const id = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + REFRESH_TTL * 1000).toISOString();
    const hash = await hashPassword(b.password);
    const tokens = await generateTokenPair(c.env, id, 'customer', 'customer', sessionId);
    // D1.batch ejecuta ambas sentencias de forma transaccional:
    // no deja una cuenta creada a medias si la sesión no se puede guardar.
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO customers (id, name, email, phone, address, city, province, password_hash, role, phone_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'customer', 0, ?, ?)`)
        .bind(id, name, email, phone, address, city, province, hash, now, now),
      c.env.DB.prepare('INSERT INTO auth_sessions (id, user_id, user_type, created_at, expires_at, refresh_hash) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(sessionId, id, 'customer', now, expires, await refreshFingerprint(tokens.refresh_token)),
    ]);
    // Solo avisos internos: no enviamos SMS ni WhatsApp sin autorización expresa.
    try {
      const {results}=await c.env.DB.prepare(`SELECT key,value FROM system_settings
        WHERE key IN ('welcome_notification_enabled','welcome_notification_title','welcome_notification_message')`)
        .all<{key:string;value:string}>();
      const configured=Object.fromEntries((results||[]).map(x=>[x.key,x.value]));
      if(configured.welcome_notification_enabled!=='false') {
        await c.env.DB.prepare(`INSERT INTO notifications
          (id,user_id,user_type,type,title,message,is_read,created_at)
          VALUES (?,?,'customer','welcome',?,?,0,?)`).bind(
          crypto.randomUUID(),id,
          configured.welcome_notification_title||'¡Bienvenido a Bonaire!',
          configured.welcome_notification_message||
            'Gracias por registrarte. Desde tu cuenta puedes solicitar servicios, consultar tus citas y recibir notificaciones.',
          now,
        ).run();
      }
    } catch(e) {
      console.error('[register] El aviso de bienvenida no se pudo guardar',e);
      // La cuenta ya está creada: un fallo de notificaciones no bloquea el alta.
    }
    return c.json({ user: { id, name, email, phone, address, city, province, role: 'customer', phone_verified: false }, ...tokens }, 201);
  } catch (error) {
    console.error('[register] Error en D1 al registrar una cuenta', error);
    const detail = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed|unique index|SQLITE_CONSTRAINT_UNIQUE/i.test(detail)) {
      return c.json({ error: 'Este correo ya está registrado. Utiliza «Entrar».' }, 409);
    }
    return c.json({ error: 'No se pudo completar el registro por un problema temporal. Inténtalo más tarde o contacta a soporte.' }, 500);
  }
});

// Mini App: la contraseña viaja por HTTPS, nunca por mensaje de Telegram.
authRoutes.post('/telegram/register', async c => {
  if(await rateLimited(c.env,c.req.raw,'telegram_customer_register',5,3600))
    return c.json({error:'Demasiados intentos. Inténtalo más tarde.'},429);
  const b=await readBodyObject(c);
  if(!b)return c.json({error:'Datos inválidos'},400);
  const chatId=await verifiedTelegramUser(b.init_data,c.env.TELEGRAM_BOT_TOKEN);
  if(!chatId)return c.json({error:'Abre el formulario nuevamente desde el bot de Bonaire.'},401);
  const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,25);
  const address=clean(b.address,250),city=clean(b.city,100),province=clean(b.province,100);
  if(name.length<3||!validEmail(email)||!validPhone(phone)||address.length<6||city.length<2||province.length<2||!validPassword(b.password))
    return c.json({error:'Completa todos los campos y usa una contraseña de 10 a 128 caracteres.'},400);
  try{
    if(!await registrationSchemaReady(c.env))return c.json({error:'Registro temporalmente no disponible.'},503);
    const id=crypto.randomUUID(),time=new Date().toISOString();
    const hash=await hashPassword(b.password);
    // La comprobación de correo y Telegram ocurre en el mismo INSERT, no en una consulta anterior.
    const result=await c.env.DB.prepare("INSERT INTO customers (id,name,email,phone,address,city,province,password_hash,role,phone_verified,telegram_customer_chat_id,created_at,updated_at) "+
      "SELECT ?,?,?,?,?,?,?,?,'customer',0,?,?,? WHERE NOT EXISTS(SELECT 1 FROM customers WHERE lower(email)=? OR telegram_customer_chat_id=?) "+
      "AND NOT EXISTS(SELECT 1 FROM admin_users WHERE lower(email)=?)")
      .bind(id,name,email,phone,address,city,province,hash,chatId,time,time,email,chatId,email).run();
    if(result.meta.changes!==1)return c.json({error:'Ya existe una cuenta asociada a estos datos. Si tienes cuenta web, utiliza «Vincular cuenta existente».'},409);
    return c.json({message:'Cuenta creada y vinculada. Ya puedes acceder a la web con tu correo y contraseña.'},201);
  }catch{return c.json({error:'No se pudo completar el registro. Inténtalo de nuevo o contacta con Bonaire.'},500);}
});
authRoutes.post('/telegram/link', async c=>{
  if(await rateLimited(c.env,c.req.raw,'telegram_customer_link',8,900))return c.json({error:'Demasiados intentos.'},429);
  const b=await readBodyObject(c);
  const chatId=await verifiedTelegramUser(b?.init_data,c.env.TELEGRAM_BOT_TOKEN);
  if(!chatId)return c.json({error:'Abre el formulario desde Telegram.'},401);
  const email=clean(b?.email,254).toLowerCase(),password=b?.password;
  if(!validEmail(email)||typeof password!=='string'||password.length>128)return c.json({error:'Credenciales inválidas.'},401);
  const customer=await c.env.DB.prepare("SELECT id,password_hash FROM customers WHERE lower(email)=? AND is_active=1 AND password_hash IS NOT NULL").bind(email).first<{id:string;password_hash:string}>();
  if(!customer||!await comparePassword(password,customer.password_hash))return c.json({error:'Credenciales inválidas.'},401);
  const result=await c.env.DB.prepare("UPDATE customers SET telegram_customer_chat_id=?,updated_at=? WHERE id=? AND is_active=1 AND password_hash=? AND (telegram_customer_chat_id IS NULL OR telegram_customer_chat_id=?) AND NOT EXISTS(SELECT 1 FROM customers WHERE telegram_customer_chat_id=? AND id<>?)")
    .bind(chatId,new Date().toISOString(),customer.id,customer.password_hash,chatId,chatId,customer.id).run();
  if(result.meta.changes!==1)return c.json({error:'Ya existe una vinculación. Contacta con Bonaire para revisarla.'},409);
  return c.json({message:'Cuenta vinculada correctamente.'});
});

authRoutes.post('/customer/login', async c => {
  if (await rateLimited(c.env, c.req.raw, 'customer_login', 12, 900)) return c.json({ error: 'Demasiados intentos' }, 429);
  const b = await readBodyObject(c);
  const email = clean(b?.email, 254).toLowerCase();
  const password = b?.password;
  if (!validEmail(email) || typeof password !== 'string' || !password || password.length > 128)
    return c.json({ error: 'Credenciales inválidas' }, 401);
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE LOWER(email) = ? AND password_hash IS NOT NULL AND is_active = 1')
    .bind(email).first<any>();
  if (!customer || !await comparePassword(password, customer.password_hash)) return c.json({ error: 'Credenciales inválidas' }, 401);
  const tokens = await issue(c.env, customer.id, 'customer', 'customer');
  return c.json({ user: safeCustomer(customer), ...tokens });
});

authRoutes.post('/refresh', async c => {
  // Defensa de aplicación adicional; WAF/Turnstile requiere revisión remota.
  // Cuota suficientemente amplia para varias sesiones detrás de una NAT.
  if (await rateLimited(c.env, c.req.raw, 'auth_refresh', 180, 60))
    return c.json({ error: 'Demasiadas renovaciones. Inténtalo de nuevo más tarde.' }, 429);
  const b = await readBodyObject(c);
  const token = typeof b?.refresh_token === 'string' && b.refresh_token.length <= 4096
    ? await verifyToken(b.refresh_token, c.env.JWT_SECRET || '') : null;
  if (!token || token.kind !== 'refresh' || !await activeSession(c.env, token)) return c.json({ error: 'Sesión expirada' }, 401);
  // El rol del refresh JWT puede estar obsoleto. Solo los permisos vigentes
  // en D1 pueden determinar el rol de los nuevos tokens.
  let role: string;
  if (token.type === 'admin') {
    const current = await c.env.DB.prepare(`SELECT role FROM admin_users
      WHERE id = ? AND is_active = 1 AND role IN ('admin','operator')`)
      .bind(token.user_id).first<{ role: string }>();
    if (!current) return c.json({ error: 'Cuenta bloqueada o sin permisos' }, 403);
    role = current.role;
  } else {
    const current = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND is_active = 1')
      .bind(token.user_id).first();
    if (!current) return c.json({ error: 'Cuenta bloqueada o no disponible' }, 403);
    role = 'customer';
  }
  const tokens = await generateTokenPair(c.env, token.user_id, token.type, role, token.sid);
  // Compare-and-swap atómico. La primera renovación legacy (hash NULL) gana
  // una sola vez; dos requests concurrentes nunca pueden renovar ambos.
  const prior = await refreshFingerprint(b!.refresh_token as string);
  const next = await refreshFingerprint(tokens.refresh_token);
  const updated = await c.env.DB.prepare(`UPDATE auth_sessions SET refresh_hash = ?
    WHERE id = ? AND user_id = ? AND user_type = ?
    AND revoked_at IS NULL AND expires_at > ?
    AND (refresh_hash = ? OR (refresh_hash IS NULL AND ? = 1))`)
    .bind(next, token.sid, token.user_id, token.type, new Date().toISOString(), prior, token.jti ? 0 : 1).run();
  if (updated.meta.changes !== 1) return c.json({ error: 'Token de renovación utilizado o expirado' }, 401);
  return c.json(tokens);
});

authRoutes.post('/logout', async c => {
  const bearer = await extractToken(c.req.header('authorization'), c.env);
  // El access puede haber vencido. Se permite cerrar LA MISMA sesión
  // presentando el refresh firmado en el cuerpo, sin entregarlo en URL/cookie.
  const body = bearer ? null : await readBodyObject(c);
  const refresh = !bearer && typeof body?.refresh_token === 'string' && body.refresh_token.length <= 4096
    ? await verifyToken(body.refresh_token, c.env.JWT_SECRET || '') : null;
  const session = bearer || (refresh?.kind === 'refresh' ? refresh : null);
  if (!session) return c.json({ error: 'No autorizado' }, 401);
  await c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?
    WHERE id = ? AND user_id = ? AND user_type = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), session.sid, session.user_id, session.type).run();
  return c.json({ message: 'Sesión cerrada' });
});

authRoutes.get('/me', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ? AND is_active = 1').bind(user.user_id).first<any>();
  return customer ? c.json({ user: safeCustomer(customer) }) : c.json({ error: 'Cuenta bloqueada o no encontrada' }, 403);
});

authRoutes.put('/me', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const active = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND is_active = 1').bind(user.user_id).first();
  if (!active) return c.json({ error: 'Cuenta bloqueada' }, 403);
  const b = await readBodyObject(c);
  if (!b) return c.json({ error: 'Datos del perfil inválidos' }, 400);
  const name = clean(b.name, 120), phone = clean(b.phone, 25), address = clean(b.address, 250);
  const city = clean(b.city, 100), province = clean(b.province, 100);
  if (name.length < 3 || !validPhone(phone) || address.length < 6 || city.length < 2 || province.length < 2)
    return c.json({ error: 'Completa nombre, teléfono, dirección, municipio y provincia' }, 400);
  await c.env.DB.prepare('UPDATE customers SET name = ?, phone = ?, address = ?, city = ?, province = ?, phone_verified = CASE WHEN phone = ? THEN phone_verified ELSE 0 END, updated_at = ? WHERE id = ?')
    .bind(name, phone, address, city, province, phone, new Date().toISOString(), user.user_id).run();
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  return c.json({ user: safeCustomer(customer) });
});

authRoutes.put('/password', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const active = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND is_active = 1').bind(user.user_id).first();
  if (!active) return c.json({ error: 'Cuenta bloqueada' }, 403);
  const b = await readBodyObject(c);
  if (!b) return c.json({ error: 'Datos de contraseña inválidos' }, 400);
  if (!validPassword(b.new_password)) return c.json({ error: 'La contraseña nueva debe tener entre 10 y 128 caracteres' }, 400);
  const current = await c.env.DB.prepare('SELECT password_hash FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  if (!current || !await comparePassword(typeof b.current_password === 'string' ? b.current_password : '', current.password_hash)) return c.json({ error: 'Contraseña actual incorrecta' }, 403);
  const now = new Date().toISOString();
  const nextHash = await hashPassword(b.new_password);
  // D1.batch aplica el cambio de contraseña y la revocación de otras sesiones
  // en la misma transacción. Si hay dos cambios concurrentes, la condición
  // del hash anterior evita sobrescribir una contraseña recién actualizada.
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE customers SET password_hash = ?, updated_at = ?
      WHERE id = ? AND is_active = 1 AND password_hash = ?`)
      .bind(nextHash, now, user.user_id, current.password_hash),
    c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?
      WHERE user_id = ? AND user_type = 'customer' AND id != ?
        AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM customers WHERE id = ? AND password_hash = ?)`)
      .bind(now, user.user_id, user.sid, user.user_id, nextHash),
  ]);
  if (results[0].meta?.changes !== 1) {
    return c.json({ error: 'La contraseña cambió durante la operación. Vuelve a iniciar sesión.' }, 409);
  }
  return c.json({ message: 'Contraseña actualizada; otras sesiones cerradas' });
});

authRoutes.get('/admin/me', async c => {
  const user = await signedIn(c, 'admin');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const admin = await c.env.DB.prepare('SELECT id, email, role FROM admin_users WHERE id = ? AND is_active = 1').bind(user.user_id).first();
  return admin ? c.json({ user: admin }) : c.json({ error: 'Administrador no autorizado' }, 403);
});

// Se retira el login sin contraseña vía teléfono o Telegram. Telegram queda como canal de notificaciones.
