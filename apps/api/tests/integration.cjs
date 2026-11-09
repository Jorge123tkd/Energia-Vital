/** Integration tests against an isolated local Cloudflare Worker and D1 database. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
async function request(name, route, method = 'GET', body, token, expected = 200) {
  const res = await fetch(BASE + route, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(res.status, expected, `${name}: HTTP ${res.status} != ${expected} ${JSON.stringify(data)}`);
  console.log('PASS', name);
  return data;
}
(async () => {
  const uid = crypto.randomUUID().slice(0, 10);
  const make = name => ({ name: `Cliente ${name}`, email: `${name}-${uid}@example.invalid`, phone: '5355555555',
    address: 'Calle Principal 42', city: 'Habana Vieja', province: 'La Habana', password: 'Prueba!Segura2026' });
  const a = make('a'), b = make('b');
  await request('Health endpoint', '/health');
  await request('Anonymous requests blocked', '/api/private/requests', 'GET', null, null, 401);
  await request('Anonymous catalog blocked', '/api/public/products', 'GET', null, null, 401);
  await request('Admin login rejects unknown credentials', '/api/auth/login', 'POST', { email: 'nobody@example.invalid', password: 'bad' }, null, 401);
  const ar = await request('Register customer A', '/api/auth/register', 'POST', a, null, 201);
  const br = await request('Register customer B', '/api/auth/register', 'POST', b, null, 201);
  const at = ar.access_token, bt = br.access_token;
  assert.ok(at && bt, 'registration returns tokens');
  await request('Duplicate email refused', '/api/auth/register', 'POST', a, null, 409);
  const me = await request('Profile belongs to A', '/api/auth/me', 'GET', null, at);
  assert.equal(me.user.email, a.email);
  assert.equal(me.user.address, a.address);
  assert.equal('password_hash' in me.user, false);
  await request('Customer blocked from admin', '/api/admin/users', 'GET', null, at, 401);
  await request('Catalog accessible after login', '/api/public/products', 'GET', null, at);
  const created = await request('Customer A creates request', '/api/private/requests', 'POST', {
    type: 'installation', title: 'Instalación solar residencial', description: 'Deseo instalar paneles y baterías en mi vivienda.'
  }, at, 201);
  const own = await request('Customer A lists own requests', '/api/private/requests', 'GET', null, at);
  const other = await request('Customer B lists own requests', '/api/private/requests', 'GET', null, bt);
  assert.ok(own.requests.some(r => r.id === created.id));
  assert.ok(!other.requests.some(r => r.id === created.id));
  const chat = await request('Assistant message A', '/api/assistant/message', 'POST', { message: 'Hola, necesito paneles solares' }, at);
  assert.ok(chat.session_id);
  await request('Customer B denied A chat', `/api/assistant/session/${chat.session_id}/messages`, 'GET', null, bt, 404);
  const starts = new Date(Date.now() + 48 * 3600 * 1000);
  starts.setUTCHours(14, 0, 0, 0);
  const appointment = { title: 'Visita solar de diagnóstico', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString() };
  await request('Customer A reserves time slot', '/api/private/appointments', 'POST', appointment, at, 201);
  await request('Duplicate time slot blocked', '/api/private/appointments', 'POST', appointment, bt, 409);
  const bAppointments = await request('B sees only own appointments', '/api/private/appointments', 'GET', null, bt);
  assert.equal(bAppointments.appointments.length, 0);
  await request('Customer B changes password', '/api/auth/password', 'PUT', { current_password: b.password, new_password: 'OtraClave!MasSegura2026' }, bt);
  await request('Old password rejected', '/api/auth/customer/login', 'POST', { email: b.email, password: b.password }, null, 401);
  await request('New password accepted', '/api/auth/customer/login', 'POST', { email: b.email, password: 'OtraClave!MasSegura2026' });
  await request('Logout customer A', '/api/auth/logout', 'POST', {}, at);
  await request('Revoked token rejected', '/api/private/requests', 'GET', null, at, 401);
  console.log('SUCCESS: Worker + D1 local integration');
})().catch(error => { console.error(error); process.exitCode = 1; });
