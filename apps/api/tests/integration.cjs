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
  await request('Anonymous catalog is public', '/api/public/products');
  await request('Anonymous services are public', '/api/public/services');
  await request('Anonymous gallery is public', '/api/public/gallery');
  await request('Anonymous FAQ is public', '/api/public/faq');
  await request('Assistant remains private', '/api/assistant/message', 'POST', { message: 'Hola' }, null, 401);
  await request('Anonymous cannot submit a customer request', '/api/private/requests', 'POST', { title: 'Prueba' }, null, 401);
  await request('Admin login rejects unknown credentials', '/api/auth/login', 'POST', { email: 'nobody@example.invalid', password: 'bad' }, null, 401);
  // A real successful admin login was missing from the tests. This catches PBKDF2/JWT regressions.
  const adminEmail = 'admin-test-' + uid + '@example.invalid';
  const adminPassword = 'AdminSolar!Prueba2026';
  const setup = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      'x-setup-key': process.env.TEST_ADMIN_SETUP_KEY || 'ClaveSetupCIExclusivaParaPruebasDe36Caracteres123' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  assert.equal(setup.status, 201, 'Admin setup must succeed in local isolated D1');
  const adminSession = await request('Admin login accepts valid credentials', '/api/auth/login', 'POST',
    { email: adminEmail, password: adminPassword });
  assert.ok(adminSession.access_token, 'admin returns a signed access token');
  const adminToken = adminSession.access_token;
  const unifiedAdmin = await request('Unified sign-in recognizes an administrator', '/api/auth/sign-in',
    'POST', { email: adminEmail, password: adminPassword });
  assert.equal(unifiedAdmin.user.role, 'admin');
  await request('Admin JWT cannot access customer-only API', '/api/private/requests',
    'GET', null, unifiedAdmin.access_token, 401);

  await request('Admin can access protected catalog', '/api/admin/products', 'GET', null, adminToken);
  await request('Admin edits website content', '/api/admin/site-settings', 'PUT', {
    home_title: 'Energía Vital de prueba', footer_links: JSON.stringify([{ label: 'Catálogo', url: '/catalogo' }])
  }, adminToken);
  const publishedSettings = await request('Published settings are public', '/api/public/settings');
  assert.equal(publishedSettings.settings.home_title, 'Energía Vital de prueba');
  const slides = [
    { title: 'Empresa', subtitle: 'Energía', image_url: '', link_label: 'Catálogo', link_url: '/catalogo' },
    { title: 'Trabajos', subtitle: 'Instalaciones', image_url: '', link_label: 'Galería', link_url: '/galeria' },
    { title: 'Novedades', subtitle: 'Equipos', image_url: '', link_label: 'Servicios', link_url: '/servicios' },
  ];
  await request('Admin saves hero carousel', '/api/admin/site-settings', 'PUT',
    { home_slides: JSON.stringify(slides) }, adminToken);
  const publicSlides = await request('Public hero carousel can be read', '/api/public/settings');
  assert.equal(JSON.parse(publicSlides.settings.home_slides).length, 3);

  const category = await request('Admin creates a category', '/api/admin/categories', 'POST', {
    name: 'Paneles de prueba', slug: 'paneles-test-' + uid
  }, adminToken);
  const product = await request('Admin creates a richly described product', '/api/admin/products', 'POST', {
    category_id: category.id, name: 'Panel de 550 W', slug: 'panel-550-' + uid,
    price: 0, description: 'Panel monocristalino de prueba', currency: 'USD'
  }, adminToken);
  await request('Admin edits product description', '/api/admin/products/' + product.id, 'PATCH', {
    description: 'Panel monocristalino actualizado', price: 120
  }, adminToken);
  const catalog = await request('Catalog contains updated product', '/api/public/products');
  assert.ok(catalog.products.some(p => p.id === product.id && p.price === 120));
  const service = await request('Admin creates service with a quote', '/api/admin/services', 'POST', {
    name: 'Instalación de prueba', slug: 'instalacion-' + uid, description: 'Instalación completa', price_type: 'quote'
  }, adminToken);
  const serviceList = await request('Public services include the description', '/api/public/services');
  assert.ok(serviceList.services.some(s => s.id === service.id && s.description === 'Instalación completa'));
  // Exercise real R2 uploads and public image delivery for the content editors.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO85ggAAAABJRU5ErkJggg==', 'base64');
  async function uploadPhoto(route, fields = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', new Blob([pixel], { type: 'image/png' }), 'foto.png');
    const res = await fetch(BASE + route, { method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, body: form });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 201, 'Photo upload: HTTP ' + res.status + ' ' + JSON.stringify(body));
    const image = await fetch(body.image_url || body.url);
    assert.equal(image.status, 200, 'Uploaded image is publicly visible');
    assert.match(image.headers.get('content-type') || '', /^image\/png/);
    return body;
  }
  await uploadPhoto('/api/admin/products/' + product.id + '/image');
  await uploadPhoto('/api/admin/services/' + service.id + '/image');
  await uploadPhoto('/api/admin/gallery', { title: 'Instalación residencial de prueba', description: 'Obra terminada' });


  const ar = await request('Register customer A', '/api/auth/register', 'POST', a, null, 201);
  const br = await request('Register customer B', '/api/auth/register', 'POST', b, null, 201);
  const at = ar.access_token, bt = br.access_token;
  assert.ok(at && bt, 'registration returns tokens');
  const sharedCustomer = await request('Site login recognizes customer', '/api/auth/sign-in', 'POST', a);
  assert.equal(sharedCustomer.user.role, 'customer');

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
  const followUp = await request('Assistant preserves topic in follow-up', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: '¿Y a 48 voltios?' }, at);
  assert.equal(followUp.intent, 'solar_advice');
  const commercial = await request('Assistant understands catalog availability', '/api/assistant/message', 'POST',
    { message: '¿Tienen disponibilidad de baterías?' }, at);
  assert.equal(commercial.intent, 'product_inquiry');
  assert.ok(!/reserva confirmada|pedido realizado/i.test(commercial.response));
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
