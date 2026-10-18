import { Env } from './types';

export function getDb(env: Env): D1Database {
  return env.DB;
}

export async function execMigration(db: D1Database, sql: string): Promise<void> {
  const statements = sql.split(';').filter((s) => s.trim().length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt.trim()).run();
  }
}

export async function ensureAdminUser(db: D1Database, email: string, passwordHash: string): Promise<void> {
  const existing = await db.prepare('SELECT id FROM admin_users WHERE email = ?').bind(email).first();
  if (existing) return;

  await db.prepare(
    'INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(),
    email,
    passwordHash,
    'admin',
    1,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
}