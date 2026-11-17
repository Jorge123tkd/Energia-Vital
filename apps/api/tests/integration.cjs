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
async function invalidJson(name, route, method, rawBody, expected, token, setupKey) {
  const res=await fetch(BASE+route,{method,
    headers:{'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),
      ...(setupKey?{'x-setup-key':setupKey}:{})},
    body:rawBody,
  });
  const result=await res.json().catch(()=>({}));
  assert.equal(res.status,expected,name+': '+JSON.stringify(result));
  assert.equal(typeof result.error,'string',name+' must provide a controlled error');
  console.log('PASS',name);
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
  let adminEmail = 'admin-test-' + uid + '@example.invalid';
  const adminPassword = 'AdminSolar!Prueba2026';
  const setupKey = process.env.TEST_ADMIN_SETUP_KEY || 'ClaveSetupCIExclusivaParaPruebasDe36Caracteres123';
  await invalidJson('Setup rejects malformed JSON without creating an admin',
    '/api/auth/setup','POST','{',400,null,setupKey);
  // Dos creaciones de primer admin con correos DIFERENTES deben compartir una
  // sola decisión atómica de D1: nunca terminar ambas en 201.
  const competingEmails = [adminEmail, 'admin-concurrent-' + uid + '@example.invalid'];
  const setupResults = await Promise.all(competingEmails.map(email =>
    fetch(BASE + '/api/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        'x-setup-key': setupKey },
      body: JSON.stringify({ email, password: adminPassword })
    })
  ));
  const setupStatuses = setupResults.map(res => res.status);
  assert.deepEqual([...setupStatuses].sort((a,b)=>a-b),[201,409],
    'Concurrent admin setup must create exactly one first administrator');
  adminEmail = competingEmails[setupStatuses.indexOf(201)];
  console.log('PASS Concurrent setup creates exactly one administrator with distinct emails');
  const repeatSetup = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      'x-setup-key': setupKey },
    body: JSON.stringify({ email: 'third-' + uid + '@example.invalid', password: adminPassword })
  });
  assert.equal(repeatSetup.status,409,'Later setup must be rejected even with valid setup key');
  console.log('PASS Setup cannot be reused after initial creation');
  const adminSession = await request('Admin login accepts valid credentials', '/api/auth/login', 'POST',
    { email: adminEmail, password: adminPassword });
  assert.ok(adminSession.access_token, 'admin returns a signed access token');
  const adminToken = adminSession.access_token;
  const privateAuthResponse = await fetch(BASE + '/api/auth/admin/me', {
    headers: { Authorization: 'Bearer ' + adminToken }
  });
  assert.equal(privateAuthResponse.status, 200);
  assert.match(privateAuthResponse.headers.get('cache-control') || '', /no-store/i,
    'Authentication responses must never be cached');
  console.log('PASS Auth responses carry no-store headers');
  const adminRenewed = await request('Admin refresh uses current database permissions',
    '/api/auth/refresh','POST',{refresh_token:adminSession.refresh_token});
  // Cada refresh emitido contiene un identificador criptográfico único.
  // Esto no activa todavía consumo de un solo uso ni invalida tokens legacy.
  const readJwtClaims = value => JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  const initialRefreshClaims = readJwtClaims(adminSession.refresh_token);
  const firstRefreshClaims = readJwtClaims(adminRenewed.refresh_token);
  assert.match(initialRefreshClaims.jti, /^[0-9a-f-]{36}$/i);
  assert.match(firstRefreshClaims.jti, /^[0-9a-f-]{36}$/i);
  assert.notEqual(initialRefreshClaims.jti, firstRefreshClaims.jti, 'Every issued refresh token must have a distinct jti');
  assert.equal(initialRefreshClaims.sid, firstRefreshClaims.sid, 'Renewal must keep the same device session');
  const secondAdminRenewal = await request('Second admin renewal issues a fresh identifier',
    '/api/auth/refresh','POST',{refresh_token:adminRenewed.refresh_token});
  const secondRefreshClaims = readJwtClaims(secondAdminRenewal.refresh_token);
  assert.notEqual(firstRefreshClaims.jti, secondRefreshClaims.jti, 'Consecutive renewals must not reuse jti');
  assert.equal(secondRefreshClaims.sid, firstRefreshClaims.sid);
  console.log('PASS Refresh tokens have distinct jti within one device session');
  await request('Consumed admin refresh cannot be reused',
    '/api/auth/refresh','POST',{refresh_token:adminSession.refresh_token},null,401);
  await request('Intermediate refresh is also consumed',
    '/api/auth/refresh','POST',{refresh_token:adminRenewed.refresh_token},null,401);
  const concurrentAdmin = await request('New admin session for simultaneous refresh',
    '/api/auth/login','POST',{email:adminEmail,password:adminPassword});
  const race = await Promise.all([1,2].map(()=>fetch(BASE+'/api/auth/refresh',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:concurrentAdmin.refresh_token})
  })));
  assert.deepEqual(race.map(x=>x.status).sort((a,b)=>a-b),[200,401],
    'Two simultaneous renewals must have exactly one winner');
  const winner = race.find(x=>x.status===200);
  const winnerTokens = await winner.json();
  await request('Concurrent winning refresh is valid for one next renewal',
    '/api/auth/refresh','POST',{refresh_token:winnerTokens.refresh_token});
  console.log('PASS Concurrent refresh compare-and-swap permits exactly one winner');
  const adminRenewedClaims = JSON.parse(Buffer.from(adminRenewed.access_token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(adminRenewedClaims.role,'admin');
  assert.equal(adminRenewedClaims.type,'admin');
  await request('Renewed admin can access protected users',
    '/api/admin/users','GET',null,adminRenewed.access_token);
  await request('Access token cannot be used to renew session',
    '/api/auth/refresh','POST',{refresh_token:adminToken},null,401);
  await request('Refresh token cannot act as bearer admin access',
    '/api/admin/users','GET',null,adminSession.refresh_token,401);

  const onlyInitialAdmins = await request('First setup created one admin only',
    '/api/admin/users','GET',null,adminToken);
  assert.equal(onlyInitialAdmins.users.length,1,
    'Competing setup requests with distinct emails cannot create two admins');

  await invalidJson('Admin login rejects malformed JSON without an internal error',
    '/api/auth/login','POST','{',401);
  await invalidJson('Admin login rejects JSON array without an internal error',
    '/api/auth/login','POST','[]',401);
  await invalidJson('Admin login rejects JSON null without an internal error',
    '/api/auth/login','POST','null',401);
  await invalidJson('Refresh rejects malformed JSON without an internal error',
    '/api/auth/refresh','POST','{',401);

  const initialWelcome = await request('Admin reads default welcome automation',
    '/api/notifications/admin/automation','GET',null,adminToken);
  assert.equal(initialWelcome.enabled,true);
  await request('Admin configures automated welcome','/api/notifications/admin/automation','PUT',
    {enabled:true,title:'Bienvenido a Bonaire de prueba',message:'Te damos la bienvenida al portal de atención solar.'},
    adminToken);
  const savedWelcome = await request('Saved welcome automation','/api/notifications/admin/automation',
    'GET',null,adminToken);
  assert.equal(savedWelcome.title,'Bienvenido a Bonaire de prueba');

  const staffEmail = 'operator-' + uid + '@example.invalid';
  const createdStaff = await request('Admin creates moderator account', '/api/admin/users', 'POST',
    { email: staffEmail, password: 'Operador!Seguro2026', role: 'operator' }, adminToken, 201);
  assert.ok(createdStaff.id);
  const staffLogin = await request('Moderator uses unified login', '/api/auth/sign-in', 'POST',
    { email: staffEmail, password: 'Operador!Seguro2026' });
  assert.equal(staffLogin.user.role, 'operator');
  const staffToken = staffLogin.access_token;
  const staffRenewed = await request('Operator refresh preserves current operator role',
    '/api/auth/refresh','POST',{refresh_token:staffLogin.refresh_token});
  const staffRenewedClaims = JSON.parse(Buffer.from(staffRenewed.access_token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(staffRenewedClaims.role,'operator');
  await request('Renewed operator cannot access main admin operations',
    '/api/admin/users','GET',null,staffRenewed.access_token,403);
  await request('Renewed operator can access staff inbox',
    '/api/notifications/inbox','GET',null,staffRenewed.access_token);

  await request('Moderator cannot change site content', '/api/admin/site-settings', 'PUT',
    { home_title: 'Attempted overwrite' }, staffToken, 403);
  await request('Moderator cannot change staff roles', '/api/admin/users/' + createdStaff.id, 'PATCH',
    { role: 'admin' }, staffToken, 403);
  await request('Moderator can read staff notifications', '/api/notifications/inbox', 'GET', null, staffToken);

  const unifiedAdmin = await request('Unified sign-in recognizes an administrator', '/api/auth/sign-in',
    'POST', { email: adminEmail, password: adminPassword });
  assert.equal(unifiedAdmin.user.role, 'admin');
  await invalidJson('Unified login rejects malformed JSON with generic 401',
    '/api/auth/sign-in','POST','{',401);

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
  await request('Admin edits category name and description', '/api/admin/categories/' + category.id, 'PATCH',
    { name: 'Equipos solares de prueba', description: 'Categoría editable', sort_order: 4, is_active: true }, adminToken);
  const categoriesEdited = await request('Admin lists updated categories', '/api/admin/categories', 'GET', null, adminToken);
  assert.ok(categoriesEdited.categories.some(row =>
    row.id === category.id && row.name === 'Equipos solares de prueba' && row.sort_order === 4));
  await request('Admin clears the category description', '/api/admin/categories/' + category.id, 'PATCH',
    { description: '' }, adminToken);
  const categoriesCleared = await request('Admin sees cleared category description', '/api/admin/categories', 'GET', null, adminToken);
  assert.ok(categoriesCleared.categories.some(row => row.id === category.id && row.description == null));
  await request('Reject an invalid category update', '/api/admin/categories/' + category.id, 'PATCH',
    { name: '' }, adminToken, 400);
  await request('Moderator cannot edit categories', '/api/admin/categories/' + category.id, 'PATCH',
    { name: 'Malicioso' }, staffToken, 403);

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

  const disposableCategory=await request('Create disposable unused category',
    '/api/admin/categories','POST',{name:'Temporal '+uid,slug:'temporal-'+uid},adminToken);
  const disposableProduct=await request('Create disposable product','/api/admin/products','POST',
    {category_id:disposableCategory.id,name:'Equipo temporal '+uid,slug:'equipo-temporal-'+uid},adminToken);
  await request('Delete unpurchased product','/api/admin/products/'+disposableProduct.id,
    'DELETE',null,adminToken);
  await request('Delete now-empty product category','/api/admin/categories/'+disposableCategory.id,
    'DELETE',null,adminToken);
  const disposableService=await request('Create disposable service','/api/admin/services','POST',
    {name:'Servicio temporal '+uid,slug:'servicio-temporal-'+uid,price_type:'quote'},adminToken);
  await request('Delete unreferenced service','/api/admin/services/'+disposableService.id,
    'DELETE',null,adminToken);
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

  const galleryCategory = await request('Create project category', '/api/admin/extras/gallery/categories','POST',
    {name:'Proyecto residencial '+uid},adminToken,201);
  const project = await uploadPhoto('/api/admin/gallery',{title:'Instalación '+uid,
    category:'Proyecto residencial '+uid,description:'Vivienda con inversor y baterías'});
  // Home highlights must be explicit, persist through edits, and never reveal hidden content.
  for (const [kind, collection, id] of [['services', 'services', service.id], ['gallery', 'gallery', project.id]]) {
    const path = '/api/admin/' + kind + '/' + id;
    const highlights = () => request(kind + ' home highlights', '/api/public/' + kind + '?featured=true');
    assert.ok(!(await highlights())[collection].some(x => x.id === id));
    await request(kind + ' rejects string booleans', path, 'PATCH', {is_featured: 'false'}, adminToken, 400);
    await request(kind + ' marks highlight', path, 'PATCH', {is_featured: true}, adminToken);
    assert.ok((await highlights())[collection].some(x => x.id === id));
    await request(kind + ' preserves highlight on unrelated edit', path, 'PATCH', {description: 'Descripción actualizada'}, adminToken);
    assert.ok((await highlights())[collection].some(x => x.id === id));
    await request(kind + ' hides highlight', path, 'PATCH', {is_active: false}, adminToken);
    assert.ok(!(await highlights())[collection].some(x => x.id === id));
    await request(kind + ' republishes highlight', path, 'PATCH', {is_active: true}, adminToken);
    assert.ok((await highlights())[collection].some(x => x.id === id));
    await request(kind + ' removes highlight', path, 'PATCH', {is_featured: false}, adminToken);
    assert.ok(!(await highlights())[collection].some(x => x.id === id));
    const all = await request(kind + ' remains in full listing', '/api/public/' + kind);
    assert.ok(all[collection].some(x => x.id === id));
  }
  await uploadPhoto('/api/admin/extras/gallery/'+project.id+'/images');
  const projectPhotos = await request('Public gallery lists project photos',
    '/api/public/extras/gallery/'+project.id+'/images');
  assert.equal(projectPhotos.images.length,2);
  await request('Rename project category', '/api/admin/extras/gallery/categories/'+galleryCategory.id,'PATCH',
    {name:'Instalación privada '+uid,is_active:true,sort_order:1},adminToken);
  const publicProjects = await request('Project appears under renamed category','/api/public/gallery');
  assert.ok(publicProjects.gallery.some(p=>p.id===project.id && p.category==='Instalación privada '+uid));
  await uploadPhoto('/api/admin/extras/services/'+service.id+'/images');
  const servicePhotos = await request('Public service photos list','/api/public/extras/services/'+service.id+'/images');
  assert.ok(servicePhotos.images.length>=1);
  const requestCategory = await request('Create custom request type','/api/admin/extras/request-categories','POST',
    {name:'Garantía técnica '+uid,legacy_type:'complaint',requires_image:true},adminToken,201);
  await request('Edit custom request type','/api/admin/extras/request-categories/'+requestCategory.id,
    'PATCH',{name:'Garantía e incidencias '+uid,requires_image:true,is_active:true},adminToken);
  const requestCategories = await request('Customers can see custom types','/api/public/extras/request-categories');
  assert.ok(requestCategories.categories.some(c=>c.id===requestCategory.id));
  const slideMedia = await uploadPhoto('/api/admin/site-media');
  assert.match(slideMedia.image_url, /\/api\/public\/site\/media\//);
  await request('Admin saves telephone list', '/api/admin/site-settings', 'PUT', {
    business_phone: '+53 5555 0101',
    business_phones: JSON.stringify([{ label: 'Ventas', number: '+53 5555 0102' }])
  }, adminToken);
  const publicContacts = await request('Published contacts include extra phones', '/api/public/settings');
  assert.equal(JSON.parse(publicContacts.settings.business_phones)[0].label, 'Ventas');
  await request('Admin rejects malformed contact number', '/api/admin/site-settings', 'PUT', {
    business_phones: JSON.stringify([{ label: 'Teléfono', number: 'not a number' }])
  }, adminToken, 400);
  await request('Product accepts an external image URL', '/api/admin/products/' + product.id + '/image-url',
    'POST', { url: 'https://example.com/equipo.png' }, adminToken, 201);
  await request('Service accepts an external image URL', '/api/admin/services/' + service.id + '/image-url',
    'POST', { url: 'https://example.com/servicio.png' }, adminToken, 201);
  await request('External image URL rejects non-HTTPS scheme', '/api/admin/products/' + product.id + '/image-url',
    'POST', { url: 'javascript:alert(1)' }, adminToken, 400);


  const ar = await request('Register customer A', '/api/auth/register', 'POST', a, null, 201);
  await request('Moderator cannot send mass notifications', '/api/notifications/admin/send-all', 'POST',
    { title: 'No autorizado', message: 'Esto no debe enviarse' }, staffToken, 403);

  const br = await request('Register customer B', '/api/auth/register', 'POST', b, null, 201);
  const at = ar.access_token, bt = br.access_token;
  const customerRenewed = await request('Customer refresh uses customer role from D1',
    '/api/auth/refresh','POST',{refresh_token:ar.refresh_token});
  const customerRenewedClaims = JSON.parse(Buffer.from(customerRenewed.access_token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(customerRenewedClaims.role,'customer');
  assert.equal(customerRenewedClaims.type,'customer');
  await request('Refreshed customer cannot read admin accounts',
    '/api/admin/users','GET',null,customerRenewed.access_token,401);
  await request('Refresh token cannot act as customer access',
    '/api/private/requests','GET',null,ar.refresh_token,401);
  await request('Customer access token cannot be used to refresh',
    '/api/auth/refresh','POST',{refresh_token:at},null,401);
  // Un token consumido en A no afecta una sesión independiente B.
  const secondaryCustomerA = await request('Customer A opens an independent device',
    '/api/auth/customer/login','POST',{email:a.email,password:a.password});
  const independentRenewal = await request('Independent device renews normally',
    '/api/auth/refresh','POST',{refresh_token:secondaryCustomerA.refresh_token});
  const secondaryClaims = readJwtClaims(independentRenewal.refresh_token);
  const originalClaims = readJwtClaims(customerRenewed.refresh_token);
  assert.notEqual(secondaryClaims.sid, originalClaims.sid,
    'Each login must create an independent device session');
  await request('Original customer session still renews independently',
    '/api/auth/refresh','POST',{refresh_token:customerRenewed.refresh_token});
  await request('Consumed independent device token is rejected',
    '/api/auth/refresh','POST',{refresh_token:secondaryCustomerA.refresh_token},null,401);
  await request('Independent device logs out using access token',
    '/api/auth/logout','POST',{},secondaryCustomerA.access_token);
  await request('Logged-out device cannot use its new refresh',
    '/api/auth/refresh','POST',{refresh_token:independentRenewal.refresh_token},null,401);
  await request('Original device remains active after independent logout',
    '/api/auth/me','GET',null,at);


  await invalidJson('Customer request rejects malformed JSON',
    '/api/private/requests','POST','{',400,at);
  await invalidJson('Customer request rejects JSON arrays',
    '/api/private/requests','POST','[]',400,at);
  await invalidJson('Customer appointment rejects malformed JSON',
    '/api/private/appointments','POST','{',400,at);
  await invalidJson('Customer appointment rejects JSON null',
    '/api/private/appointments','POST','null',400,at);
  await invalidJson('Customer appointment rejects JSON arrays',
    '/api/private/appointments','POST','[]',400,at);
  await invalidJson('Customer appointment rejects numeric dates',
    '/api/private/appointments','POST',
    '{"title":"Visita solar válida","starts_at":12345,"ends_at":67890}',400,at);
  await request('Customer appointment rejects missing date',
    '/api/private/appointments','POST',{title:'Visita solar sin fecha'},at,400);
  await request('Admin JWT cannot submit customer appointments',
    '/api/private/appointments','POST',
    {title:'Visita de administrador',starts_at:'2027-01-01T14:00:00.000Z',
      ends_at:'2027-01-01T15:00:00.000Z'},adminToken,401);
  await request('Anonymous appointment list blocked',
    '/api/private/appointments','GET',null,null,401);

  await invalidJson('Customer login rejects malformed JSON',
    '/api/auth/customer/login','POST','{',401);
  await invalidJson('Customer login rejects JSON number',
    '/api/auth/customer/login','POST','123',401);
  await invalidJson('Customer profile rejects malformed JSON',
    '/api/auth/me','PUT','{',400,at);
  await invalidJson('Customer password update rejects JSON array',
    '/api/auth/password','PUT','[]',400,at);
  await invalidJson('Customer password update rejects non-text values',
    '/api/auth/password','PUT','{"new_password":12345}',400,at);

  const welcomeCustomer = await request('Customer receives configured welcome notification',
    '/api/notifications','GET',null,at);
  assert.ok(welcomeCustomer.notifications.some(n=>n.title==='Bienvenido a Bonaire de prueba'));
  await request('Operator cannot configure automatic welcomes','/api/notifications/admin/automation',
    'PUT',{enabled:false,title:'Bloqueado',message:'Esto no debe cambiarse por un operador.'},staffToken,403);

  assert.ok(at && bt, 'registration returns tokens');
  const sharedCustomer = await request('Site login recognizes customer', '/api/auth/sign-in', 'POST', a);
  assert.equal(sharedCustomer.user.role, 'customer');


  await request('Unverified customer cannot submit product review','/api/private/extras/products/'+product.id+'/reviews',
    'POST',{rating:5,comment:'Muy buen equipo'},at,403);
  await request('Cannot verify purchase without an audit reference',
    '/api/admin/extras/products/'+product.id+'/verify-purchase','POST',
    {customer_id:ar.user.id},adminToken,400);
  await request('Admin verifies a real purchase','/api/admin/extras/products/'+product.id+'/verify-purchase',
    'POST',{customer_id:ar.user.id,reference:'Factura-test-'+uid},adminToken,201);
  const review = await request('Verified customer can submit review','/api/private/extras/products/'+product.id+'/reviews',
    'POST',{rating:5,comment:'El equipo funciona según lo esperado.'},at,201);
  let publicReviews = await request('Pending reviews are private','/api/public/extras/products/'+product.id+'/reviews');
  assert.equal(publicReviews.count,0);
  await request('Moderator cannot approve reviews','/api/admin/extras/product-reviews/'+review.id,
    'PATCH',{status:'published'},staffToken,403);
  await request('Admin approves verified purchase review','/api/admin/extras/product-reviews/'+review.id,
    'PATCH',{status:'published'},adminToken);
  publicReviews = await request('Approved review is public','/api/public/extras/products/'+product.id+'/reviews');
  assert.equal(publicReviews.count,1);
  assert.equal(publicReviews.average,5);
  await request('Cannot delete purchased product with verified reviews',
    '/api/admin/products/'+product.id,'DELETE',null,adminToken,409);
  await request('Cannot delete category still containing a product',
    '/api/admin/categories/'+category.id,'DELETE',null,adminToken,409);

  await request('Duplicate email refused', '/api/auth/register', 'POST', a, null, 409);
  await request('Admin changes customer address', '/api/admin-customers/customers/' + br.user.id,
    'PATCH', { name: b.name, email: b.email, phone: b.phone, address: 'Nueva avenida 123', city: b.city, province: b.province }, adminToken);

  const byId = await request('Admin searches customer by full identifier', '/api/admin-customers/customers?q=' + encodeURIComponent(ar.user.id),
    'GET', null, adminToken);
  assert.equal(byId.customers.length, 1);
  assert.equal(byId.customers[0].id, ar.user.id);
  const me = await request('Profile belongs to A', '/api/auth/me', 'GET', null, at);
  assert.equal(me.user.email, a.email);
  assert.equal(me.user.address, a.address);
  assert.equal('password_hash' in me.user, false);
  await request('Customer blocked from admin', '/api/admin/users', 'GET', null, at, 401);
  await request('Catalog accessible after login', '/api/public/products', 'GET', null, at);
  const created = await request('Customer A creates request', '/api/private/requests', 'POST', {
    type: 'installation', title: 'Instalación solar residencial', description: 'Deseo instalar paneles y baterías en mi vivienda.'
  }, at, 201);
  // Seguimiento económico 4A: no confundir declaración con fondos/pagos reales.
  await request('Anonymous cannot read private financial history',
    '/api/finance/requests/'+created.id,'GET',null,null,401);
  await request('Customer cannot read internal financial history',
    '/api/finance/requests/'+created.id,'GET',null,at,401);
  const emptyFinance=await request('Staff reads empty financial ledger',
    '/api/finance/requests/'+created.id,'GET',null,staffToken);
  assert.equal(emptyFinance.declarations.length,0);
  assert.equal(emptyFinance.reports.length,0);
  assert.equal(emptyFinance.summary.unverified_cents,0);
  await request('Customer cannot create declared funding',
    '/api/finance/requests/'+created.id+'/declarations','POST',
    {source:'customer_reported',funding_stage:'approval_reported',
      payment_method:'transfer',notes:'Cliente declara que tiene dinero.'},at,401);
  await request('Staff cannot record confirmed funds directly',
    '/api/finance/requests/'+created.id+'/declarations','POST',
    {source:'customer_reported',funding_stage:'approval_reported',
      payment_method:'transfer',payment_verified:true,
      notes:'Intento de reportar fondos verificados.'},staffToken,400);
  const funds=await request('Gestor records funds approved and available as DECLARED only',
    '/api/finance/requests/'+created.id+'/declarations','POST',{
      source:'customer_reported',funding_stage:'approval_reported',
      approved_funds_declared_cents:450000,available_funds_declared_cents:150000,
      advance_proposed_cents:50000,payment_method:'transfer',
      payment_deadline:'2027-03-01',expected_payment_date:'2027-02-15',
      notes:'Empresa declara aprobación, sin documento de acreditación.'},staffToken,201);
  assert.ok(funds.id);
  const fundsHistory=await request('Funding remains explicitly declared, not verified',
    '/api/finance/requests/'+created.id,'GET',null,adminToken);
  assert.equal(fundsHistory.declarations[0].approved_funds_declared_cents,450000);
  assert.equal(fundsHistory.declarations[0].available_funds_declared_cents,150000);
  assert.equal(fundsHistory.declarations[0].advance_proposed_cents,50000);
  assert.equal(fundsHistory.declarations[0].actor_email,staffEmail);
  assert.equal(fundsHistory.summary.reviewed_manual_cents,0);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Havana',year:'numeric',
    month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const cubaPart=(name)=>parts.find(x=>x.type===name).value;
  const financeDay=[cubaPart('year'),cubaPart('month'),cubaPart('day')].join('-');
  const paymentReference='CI-PAGO-'+uid;
  const reportedPayment=await request('Operator records transfer as reported, NEVER verified',
    '/api/finance/requests/'+created.id+'/payment-reports','POST',{
      amount_usd_cents:120000,payment_method:'transfer',reported_on:financeDay,
      reference:paymentReference,report_note:'Cliente informa transferencia sin confirmación de recibo.'},
    staffToken,201);
  assert.equal(reportedPayment.status,'reported');
  const beforeVerification=await request('Reported amount is kept UNVERIFIED',
    '/api/finance/requests/'+created.id,'GET',null,staffToken);
  assert.equal(beforeVerification.summary.unverified_cents,120000);
  assert.equal(beforeVerification.summary.reviewed_manual_cents,0);
  await request('Duplicate reference cannot be counted again',
    '/api/finance/requests/'+created.id+'/payment-reports','POST',{
      amount_usd_cents:120000,payment_method:'transfer',reported_on:financeDay,
      reference:paymentReference,report_note:'Segunda copia del mismo reporte de pago.'},
    staffToken,409);
  await request('Operator cannot verify payment, only admin',
    '/api/finance/payment-reports/'+reportedPayment.id+'/review','PATCH',{
      decision:'manual_verify',verification_basis:'bank_statement',
      review_note:'Comprobación no autorizada por el gestor.',
      confirm_independent_check:true
    },staffToken,403);
  await request('Admin cannot verify without independent evidence confirmation',
    '/api/finance/payment-reports/'+reportedPayment.id+'/review','PATCH',{
      decision:'manual_verify',verification_basis:'bank_statement',
      review_note:'No se verificó ninguna evidencia independiente.',
      confirm_independent_check:false
    },adminToken,400);
  await request('Admin cannot use client statement alone as verification',
    '/api/finance/payment-reports/'+reportedPayment.id+'/review','PATCH',{
      decision:'manual_verify',verification_basis:'bank_statement',
      review_note:'corto',confirm_independent_check:true
    },adminToken,400);
  const manuallyChecked=await request('Admin records manual payment verification with audit evidence',
    '/api/finance/payment-reports/'+reportedPayment.id+'/review','PATCH',{
      decision:'manual_verify',verification_basis:'bank_statement',
      review_note:'Revisado extracto independiente de la empresa durante prueba.',
      confirm_independent_check:true
    },adminToken);
  assert.equal(manuallyChecked.status,'verified_manual');
  await request('Verified manual record cannot be silently changed',
    '/api/finance/payment-reports/'+reportedPayment.id+'/review','PATCH',{
      decision:'reject',review_note:'No debe permitir una segunda decisión.'
    },adminToken,409);
  const rejectedReport=await request('Operator registers separate cash payment report',
    '/api/finance/requests/'+created.id+'/payment-reports','POST',{
      amount_usd_cents:32000,payment_method:'cash',reported_on:financeDay,
      reference:'CI-OTRO-'+uid,report_note:'El cliente informó efectivo, no fue contado.'},
    staffToken,201);
  await request('Admin cannot reject without giving reason',
    '/api/finance/payment-reports/'+rejectedReport.id+'/review','PATCH',{
      decision:'reject',review_note:''
    },adminToken,400);
  const rejected=await request('Admin rejects a payment report with reason',
    '/api/finance/payment-reports/'+rejectedReport.id+'/review','PATCH',{
      decision:'reject',review_note:'No hay comprobante para validar lo informado.'
    },adminToken);
  assert.equal(rejected.status,'rejected');
  const remaining=await request('Second unverified payment is not counted as manually checked',
    '/api/finance/requests/'+created.id+'/payment-reports','POST',{
      amount_usd_cents:15000,payment_method:'cash',reported_on:financeDay,
      report_note:'Cliente informa un anticipo adicional todavía sin comprobar.'
    },staffToken,201);
  assert.equal(remaining.status,'reported');
  const afterReview=await request('Finance history preserves reported, reviewed and rejected separately',
    '/api/finance/requests/'+created.id,'GET',null,adminToken);
  assert.equal(afterReview.summary.unverified_cents,15000);
  assert.equal(afterReview.summary.reviewed_manual_cents,120000);
  assert.equal(afterReview.summary.report_count,3);
  assert.ok(afterReview.reports.some(x=>x.id===rejectedReport.id&&x.verification_status==='rejected'));
  assert.ok(afterReview.reports.some(x=>x.id===reportedPayment.id&&
    x.verification_status==='verified_manual'&&x.reviewed_by_email===adminEmail));
  const financeDossier=await request('Financial tracking does not change request state',
    '/api/dossiers/requests/'+created.id,'GET',null,staffToken);
  assert.equal(financeDossier.request.status,'pending');
  assert.ok(financeDossier.audit.some(x=>x.action==='payment_review_verified_manual'));
  assert.ok(financeDossier.audit.some(x=>x.action==='funds_declaration_recorded'));
  await request('Financial reports have no edit or delete API',
    '/api/finance/payment-reports/'+remaining.id,'DELETE',null,adminToken,404);

  // Cotizaciones fase 3A: snapshots inmutables, cifras USD y control humano.
  await request('Anonymous cannot read private quote versions',
    '/api/quotes/requests/'+created.id,'GET',null,null,401);
  await request('Customer cannot read internal quote versions',
    '/api/quotes/requests/'+created.id,'GET',null,at,401);
  const emptyQuotes=await request('Gestor reads quote history for customer request',
    '/api/quotes/requests/'+created.id,'GET',null,staffToken);
  assert.equal(emptyQuotes.versions.length,0);
  const quoteDraft=await request('Gestor creates first internal estimate',
    '/api/quotes/requests/'+created.id+'/versions','POST',{
      expected_latest_id:null,title:'Primera revisión de instalación',
      items:[{description:'Panel solar de prueba',quantity:2.5,unit_price_usd_cents:1234}],
      taxes_usd_cents:200,freight_usd_cents:450,discount_usd_cents:100
    },staffToken,201);
  assert.equal(quoteDraft.status,'draft');
  const savedDraft=await request('Quotation totals are calculated on server',
    '/api/quotes/requests/'+created.id,'GET',null,staffToken);
  assert.equal(savedDraft.versions[0].subtotal_cents,3085);
  assert.equal(savedDraft.versions[0].total_cents,3635);
  assert.equal(savedDraft.versions[0].items[0].line_total_usd_cents,3085);
  await request('Draft without review fields cannot be submitted',
    '/api/quotes/'+quoteDraft.id+'/submit','PATCH',{},staffToken,400);
  await request('Client cannot impersonate quote author',
    '/api/quotes/requests/'+created.id+'/versions','POST',{
      expected_latest_id:quoteDraft.id,title:'Suplantación de identidad',
      items:[{description:'Equipo de prueba',quantity:1,unit_price_usd_cents:500}],
      created_by:adminEmail
    },staffToken,400);
  await request('Quote rejects unapproved payment verification fields',
    '/api/quotes/requests/'+created.id+'/versions','POST',{
      expected_latest_id:quoteDraft.id,title:'Pago no autorizado',
      items:[{description:'Equipo de prueba',quantity:1,unit_price_usd_cents:500}],
      payment_verified:true
    },staffToken,400);
  const expires=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const quotationBody={
    expected_latest_id:quoteDraft.id,title:'Cotización revisable con condiciones',
    items:[{description:'Instalación y materiales solares',quantity:2,unit_price_usd_cents:12500},
      {description:'Montaje y cableado técnico',quantity:1,unit_price_usd_cents:8000}],
    taxes_usd_cents:2000,freight_usd_cents:1200,discount_usd_cents:0,
    valid_until:expires,delivery_terms:'Entrega por coordinación de gestores.',
    warranty_terms:'Garantía conforme a contrato, pendiente de revisión jurídica.',
    payment_terms:'Transferencia sujeta a verificación de cuenta y anticipo.',
    stock_notes:'Gestor debe confirmar existencias antes de emitir oferta.',
    tax_notes:'Impuestos aplicables por confirmar mediante revisión contable.',
    freight_notes:'Transporte confirmado solo después de revisión logística.'
  };
  const quoteV2=await request('Gestor creates a new snapshot instead of editing first quote',
    '/api/quotes/requests/'+created.id+'/versions','POST',quotationBody,staffToken,201);
  assert.equal(quoteV2.version_no,2);
  const afterRevision=await request('Old quote snapshot is retained and superseded',
    '/api/quotes/requests/'+created.id,'GET',null,adminToken);
  assert.equal(afterRevision.versions.length,2);
  assert.equal(afterRevision.versions[0].status,'draft');
  assert.equal(afterRevision.versions[1].status,'superseded');
  assert.equal(afterRevision.versions[1].total_cents,3635);
  await request('Stale draft version cannot overwrite newer version',
    '/api/quotes/requests/'+created.id+'/versions','POST',quotationBody,staffToken,409);
  await request('Moderators cannot approve internal quotations',
    '/api/quotes/'+quoteV2.id+'/review','PATCH',
    {decision:'approve',reason:'Intento no autorizado'},staffToken,403);
  const submittedQuote=await request('Gestor submits quote to human review',
    '/api/quotes/'+quoteV2.id+'/submit','PATCH',{},staffToken);
  assert.equal(submittedQuote.status,'in_review');
  await request('Cannot create another draft during active review',
    '/api/quotes/requests/'+created.id+'/versions','POST',
    {...quotationBody,expected_latest_id:quoteV2.id},staffToken,409);
  const reviewedQuote=await request('Admin authorizes quote internally without issuance',
    '/api/quotes/'+quoteV2.id+'/review','PATCH',
    {decision:'approve',reason:'Revisión interna de cifras y condiciones'},adminToken);
  assert.equal(reviewedQuote.status,'approved_internal');
  assert.match(reviewedQuote.message,/no se envi[oó]/i);
  await request('Repeated approval cannot alter review history',
    '/api/quotes/'+quoteV2.id+'/review','PATCH',
    {decision:'approve',reason:'Intento duplicado'},adminToken,409);
  const checkedQuote=await request('Quote approval keeps full version and reviewer',
    '/api/quotes/requests/'+created.id,'GET',null,staffToken);
  assert.equal(checkedQuote.versions[0].status,'approved_internal');
  assert.equal(checkedQuote.versions[0].reviewed_by_email,adminEmail);
  const newDraft=await request('Approved version can be revised in a NEW draft',
    '/api/quotes/requests/'+created.id+'/versions','POST',
    {...quotationBody,expected_latest_id:quoteV2.id,
      title:'Cambio posterior a revisión interna'},staffToken,201);
  assert.equal(newDraft.version_no,3);
  await request('Third version enters human review',
    '/api/quotes/'+newDraft.id+'/submit','PATCH',{},staffToken);
  await request('Rejection requires documented reason',
    '/api/quotes/'+newDraft.id+'/review','PATCH',{decision:'reject',reason:''},adminToken,400);
  const rejectedQuote=await request('Administrator rejects version with reason',
    '/api/quotes/'+newDraft.id+'/review','PATCH',
    {decision:'reject',reason:'Revisar disponibilidad y plazos'},adminToken);
  assert.equal(rejectedQuote.status,'rejected');
  const preservedQuote=await request('Rejected quote retains all versions',
    '/api/quotes/requests/'+created.id,'GET',null,staffToken);
  assert.deepEqual(preservedQuote.versions.map(v=>v.status),
    ['rejected','approved_internal','superseded']);
  assert.equal(preservedQuote.versions[0].review_reason,'Revisar disponibilidad y plazos');
  const dossierStillPending=await request('Internal review does not change commercial request state',
    '/api/dossiers/requests/'+created.id,'GET',null,staffToken);
  assert.equal(dossierStillPending.request.status,'pending');

  // Expediente 360°: permisos, datos vinculados y gestiones inmutables.
  await request('Anonymous cannot access customer dossier',
    '/api/dossiers/customers/'+ar.user.id,'GET',null,null,401);
  await request('Customer cannot open internal dossier',
    '/api/dossiers/customers/'+ar.user.id,'GET',null,at,401);
  await request('Other customer cannot open request dossier',
    '/api/dossiers/requests/'+created.id,'GET',null,bt,401);
  await request('Unrecognized dossier returns 404',
    '/api/dossiers/customers/'+crypto.randomUUID(),'GET',null,staffToken,404);
  const originalDossier=await request('Staff reads existing customer dossier',
    '/api/dossiers/customers/'+ar.user.id,'GET',null,staffToken);
  assert.equal(originalDossier.customer.email,a.email);
  assert.ok(originalDossier.requests.some(x=>x.id===created.id));
  assert.equal('password_hash' in originalDossier.customer,false);
  assert.equal('telegram_chat_id' in originalDossier.customer,false);
  assert.ok('assistant_conversations_count' in originalDossier);
  const requestDossier=await request('Staff reads linked request dossier',
    '/api/dossiers/requests/'+created.id,'GET',null,staffToken);
  assert.equal(requestDossier.request.customer_id,ar.user.id);
  assert.equal(requestDossier.request.title,'Instalación solar residencial');
  assert.ok(Array.isArray(requestDossier.activities));
  assert.ok(Array.isArray(requestDossier.works));
  await request('Customer cannot insert an internal activity',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:'No autorizado'},at,401);
  await request('Anonymous cannot add internal activity',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:'No autorizado'},null,401);
  await request('Staff cannot forge activity actor ID',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:'Contacto de prueba',actor_id:adminEmail},staffToken,400);
  await request('Staff rejects empty commercial activity',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:' '},staffToken,400);
  await request('Staff rejects fictional payment verification field',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:'Pago reportado',payment_verified:true},staffToken,400);
  const loggedCall=await request('Gestor records a customer call',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'call',note:'Se atendió la consulta del cliente.',
      next_step:'Confirmar fecha de visita'},staffToken,201);
  assert.ok(loggedCall.id);
  const loggedByAdmin=await request('Administrador also records independent intervention',
    '/api/dossiers/requests/'+created.id+'/activities','POST',
    {activity_type:'follow_up',note:'Revisada la posibilidad de visita.'},adminToken,201);
  assert.notEqual(loggedCall.id,loggedByAdmin.id);
  const recorded=await request('Dossier contains activity from both staff accounts',
    '/api/dossiers/requests/'+created.id,'GET',null,staffToken);
  assert.ok(recorded.activities.some(x=>x.id===loggedCall.id&&x.actor_email===staffEmail));
  assert.ok(recorded.activities.some(x=>x.id===loggedByAdmin.id&&x.actor_email===adminEmail));
  assert.ok(recorded.audit.some(x=>x.action==='commercial_activity_logged'));
  await request('No endpoint for erasing staff activity',
    '/api/dossiers/requests/'+created.id+'/activities/'+loggedCall.id,
    'DELETE',null,adminToken,404);
  const customerDossierAfter=await request('Customer dossier groups linked interventions',
    '/api/dossiers/customers/'+ar.user.id,'GET',null,staffToken);
  assert.ok(customerDossierAfter.activities.some(x=>x.id===loggedCall.id));
  // Una actividad impide eliminar una solicitud y perder su historia,
  // incluso si no está vinculada a una cita.
  await request('Admin cannot delete request with commercial history',
    '/api/admin-customers/requests/'+created.id,'DELETE',null,adminToken,409);

  const guestRequest=await request('Operator opens dossier for WhatsApp guest with no account',
    '/api/admin-customers/requests','POST',{
      contact_name:'Contacto de WhatsApp',contact_phone:'5355555555',
      type:'consultation',title:'Consulta de contacto sin cuenta',
      description:'Solicitud creada manualmente sin cuenta de cliente.',
      status:'pending',location:'La Habana',preferred_date:null
    },staffToken,201);
  const guestDossier=await request('Guest request dossier works without fake customer',
    '/api/dossiers/requests/'+guestRequest.id,'GET',null,staffToken);
  assert.equal(guestDossier.request.customer_id,null);
  assert.match(guestDossier.request.description,/Contacto de WhatsApp/);
  const guestActivity=await request('Operator logs guest contact without creating customer account',
    '/api/dossiers/requests/'+guestRequest.id+'/activities','POST',{
      activity_type:'whatsapp',note:'Se recibió una consulta por WhatsApp.'
    },staffToken,201);
  const guestHistory=await request('Guest dossier retains responsible operator',
    '/api/dossiers/requests/'+guestRequest.id,'GET',null,adminToken);
  assert.ok(guestHistory.activities.some(x=>x.id===guestActivity.id&&x.actor_email===staffEmail));
  // Brigadas Bonaire: integración real con Worker + D1 local y JWT.
  // La administración de fichas NO asigna trabajos ni altera citas.
  await request('Brigades require a staff login','/api/brigades','GET',null,null,401);
  await request('Customer cannot view internal brigades','/api/brigades','GET',null,at,401);
  await request('Moderator cannot create a brigade','/api/brigades','POST',
    {name:'Brigada no autorizada',leader_name:'Jefe de prueba'},staffToken,403);
  const initialBrigades=await request('Staff sees private brigade catalog',
    '/api/brigades','GET',null,staffToken);
  assert.ok(Array.isArray(initialBrigades.brigades));
  assert.ok(Array.isArray(initialBrigades.members));
  const newBrigade=await request('Admin creates brigade in D1','/api/brigades','POST',
    {name:'Brigada integración '+uid,leader_name:'Responsable de prueba',specialty:'Instalación solar'},
    adminToken,201);
  assert.ok(newBrigade.id);
  await request('Admin cannot create brigade with same name','/api/brigades','POST',
    {name:'Brigada integración '+uid,leader_name:'Otro responsable'},adminToken,409);
  const brigadeList=await request('Staff reads created brigade',
    '/api/brigades','GET',null,staffToken);
  const brigade=brigadeList.brigades.find(x=>x.id===newBrigade.id);
  assert.ok(brigade&&brigade.leader_name==='Responsable de prueba');
  await request('Moderator cannot register brigade members',
    '/api/brigades/'+newBrigade.id+'/members','POST',
    {full_name:'Integrante de prueba'},staffToken,403);
  const member=await request('Admin registers brigade member','/api/brigades/'+newBrigade.id+'/members',
    'POST',{full_name:'Integrante de prueba',function_name:'Electricista'},adminToken,201);
  const memberList=await request('Staff sees brigade member in D1','/api/brigades','GET',null,staffToken);
  const savedMember=memberList.members.find(x=>x.id===member.id);
  assert.ok(savedMember&&savedMember.brigade_id===newBrigade.id);
  await request('Moderator cannot edit brigade','/api/brigades/'+newBrigade.id,'PATCH',
    {name:'Nombre prohibido',expected_updated_at:brigade.updated_at},staffToken,403);
  await request('Admin cannot overwrite stale brigade version','/api/brigades/'+newBrigade.id,'PATCH',
    {name:'Nombre obsoleto',expected_updated_at:'2000-01-01T00:00:00.000Z'},adminToken,409);
  await request('Admin updates brigade profile','/api/brigades/'+newBrigade.id,'PATCH',
    {name:'Brigada verificada '+uid,expected_updated_at:brigade.updated_at},adminToken);
  await request('Admin cannot change stale member version',
    '/api/brigades/'+newBrigade.id+'/members/'+member.id,'PATCH',
    {is_active:false,expected_updated_at:'2000-01-01T00:00:00.000Z'},adminToken,409);
  await request('Admin deactivates brigade member preserving history',
    '/api/brigades/'+newBrigade.id+'/members/'+member.id,'PATCH',
    {is_active:false,expected_updated_at:savedMember.updated_at},adminToken);
  const postMember=await request('Brigade remains visible after member deactivation',
    '/api/brigades','GET',null,staffToken);
  assert.equal(Boolean(postMember.members.find(x=>x.id===member.id)?.is_active),false);
  const latestBrigade=postMember.brigades.find(x=>x.id===newBrigade.id);
  await request('Admin deactivates brigade without deleting record',
    '/api/brigades/'+newBrigade.id,'PATCH',
    {is_active:false,expected_updated_at:latestBrigade.updated_at},adminToken);
  const inactiveBrigades=await request('Staff can audit inactive brigade',
    '/api/brigades','GET',null,staffToken);
  assert.equal(Boolean(inactiveBrigades.brigades.find(x=>x.id===newBrigade.id)?.is_active),false);

  // Brigadas 1C: los gestores asignan; 1/2 requieren reconocer ocupación;
  // con 3+ el segundo trabajo queda pendiente de ADMIN GENERAL.
  await request('Anonymous cannot consult brigade availability',
    '/api/brigade-work/availability?date=2026-11-14','GET',null,null,401);
  await request('Customer cannot consult internal brigade work',
    '/api/brigade-work/month?month=2026-11','GET',null,at,401);
  await request('Brigade rejects impossible date','/api/brigade-work/availability?date=2026-02-30',
    'GET',null,staffToken,400);
  const workDate=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
  const anotherDate=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
  const futureRequest=async index=>request('Customer creates technical request '+index,'/api/private/requests','POST',
    {type:'installation',title:'Instalación para brigada '+index,
      description:'Prueba de distribución, brigadas y autorización en GitHub CI.'},at,201);
  const r2=await futureRequest('dos'),r3=await futureRequest('tres'),r4=await futureRequest('cuatro'),
    r5=await futureRequest('cinco'),r6=await futureRequest('seis'),r7=await futureRequest('siete'),
    r8=await futureRequest('ocho'),r9=await futureRequest('nueve');

  const bg1=await request('Admin registers active brigade 1','/api/brigades','POST',
    {name:'Brigada A '+uid,leader_name:'Jefe A'},adminToken,201);
  const initialAvailability=await request('One active brigade is available',
    '/api/brigade-work/availability?date='+workDate,'GET',null,staffToken);
  assert.equal(initialAvailability.active_count,1);
  assert.equal(initialAvailability.recommended_brigade_id,bg1.id);
  const firstWork=await request('Operator assigns available brigade',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:created.id,
      work_date:workDate,estimated_minutes:360,busy_acknowledged:false},staffToken,201);
  assert.equal(firstWork.work.status,'scheduled');
  await request('Operator cannot skip occupied-day warning with one brigade',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r2.id,
      work_date:workDate,estimated_minutes:180,busy_acknowledged:false},staffToken,409);
  const acknowledgedWork=await request('Operator confirms feasible second work with one brigade',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r2.id,
      work_date:workDate,estimated_minutes:180,busy_acknowledged:true},staffToken,201);
  assert.equal(acknowledgedWork.work.status,'scheduled');
  await request('A work cannot be duplicated for same request and day',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r2.id,
      work_date:workDate,estimated_minutes:180,busy_acknowledged:true},staffToken,409);
  const bg2=await request('Admin adds second brigade','/api/brigades','POST',
    {name:'Brigada B '+uid,leader_name:'Jefe B'},adminToken,201);
  const balanced=await request('System recommends free brigade with two active',
    '/api/brigade-work/availability?date='+workDate,'GET',null,staffToken);
  assert.equal(balanced.active_count,2);
  assert.equal(balanced.recommended_brigade_id,bg2.id);
  const toB=await request('Operator assigns recommended brigade','/api/brigade-work',
    'POST',{brigade_id:bg2.id,request_id:r3.id,
      work_date:workDate,estimated_minutes:480,busy_acknowledged:false},staffToken,201);
  assert.equal(toB.work.status,'scheduled');
  const secondB=await request('Two brigades still allow a warned second job',
    '/api/brigade-work','POST',{brigade_id:bg2.id,request_id:r4.id,
      work_date:workDate,estimated_minutes:60,busy_acknowledged:true},staffToken,201);
  assert.equal(secondB.work.status,'scheduled');

  // Etapa 5B1 — credenciales AISLADAS del jefe y fotos privadas R2.
  await request('Anonymous cannot list chief accounts',
    '/api/chief/admin/accounts','GET',null,null,401);
  await request('Operator cannot provision brigade chief accounts',
    '/api/chief/admin/accounts','POST',{
      brigade_id:bg1.id,email:'intruso-'+uid+'@invalid.example',
      password:'ClaveDelJefeSoloPruebas123!'
    },staffToken,403);
  const chiefPassword='ClaveJefeCI2026-TotalmenteFicticia!';
  const chiefEmail1='jefe-uno-'+uid+'@invalid.example';
  const chiefEmail2='jefe-dos-'+uid+'@invalid.example';
  const chiefOne=await request('Admin provisions chief login for first brigade',
    '/api/chief/admin/accounts','POST',{
      brigade_id:bg1.id,email:chiefEmail1,password:chiefPassword
    },adminToken,201);
  const chiefTwo=await request('Admin provisions separate chief for second brigade',
    '/api/chief/admin/accounts','POST',{
      brigade_id:bg2.id,email:chiefEmail2,password:chiefPassword
    },adminToken,201);
  assert.notEqual(chiefOne.id,chiefTwo.id);
  const chiefs=await request('Admin lists accounts without hashes or tokens',
    '/api/chief/admin/accounts','GET',null,adminToken);
  assert.ok(chiefs.accounts.some(x=>x.id===chiefOne.id&&x.brigade_id===bg1.id));
  assert.equal(JSON.stringify(chiefs).includes('password_hash'),false);
  await request('Chief password cannot be reused for staff identity',
    '/api/chief/admin/accounts','POST',{
      brigade_id:bg1.id,email:staffEmail,password:chiefPassword
    },adminToken,409);
  await request('Chief login rejects wrong password',
    '/api/chief/login','POST',{email:chiefEmail1,password:'no-es-la-contraseña'},null,401);
  const login1=await request('Chief logs into independent 8-hour session',
    '/api/chief/login','POST',{email:chiefEmail1,password:chiefPassword},null);
  const login2=await request('Another chief logs into own brigade',
    '/api/chief/login','POST',{email:chiefEmail2,password:chiefPassword},null);
  const chiefToken1=login1.access_token,chiefToken2=login2.access_token;
  assert.match(chiefToken1,/^[0-9a-f]{64}$/);
  assert.equal(login1.account.brigade_id,bg1.id);
  assert.equal(login2.account.brigade_id,bg2.id);
  await request('Chief session cannot enter the admin panel API',
    '/api/admin/users','GET',null,chiefToken1,401);
  await request('Chief session cannot read internal dossiers',
    '/api/dossiers/requests/'+r3.id,'GET',null,chiefToken2,401);
  await request('Chief session cannot access internal finance',
    '/api/finance/requests/'+r3.id,'GET',null,chiefToken2,401);
  await request('Staff JWT cannot pose as a chief session',
    '/api/chief/me','GET',null,staffToken,401);
  await request('Customer JWT cannot pose as a chief session',
    '/api/chief/me','GET',null,at,401);
  const work1=await request('Chief one sees only assigned brigade work',
    '/api/chief/works','GET',null,chiefToken1);
  const work2=await request('Chief two sees only own brigade work',
    '/api/chief/works','GET',null,chiefToken2);
  assert.ok(work1.works.some(x=>x.id===firstWork.work.id));
  assert.ok(!work1.works.some(x=>x.id===toB.work.id));
  assert.ok(work2.works.some(x=>x.id===toB.work.id));
  assert.ok(!work2.works.some(x=>x.id===firstWork.work.id));
  assert.equal(JSON.stringify(work2).includes('customer_phone'),false);
  await request('Chief cannot read report history for foreign brigade',
    '/api/chief/works/'+toB.work.id+'/reports','GET',null,chiefToken1,404);
  await request('Chief cannot create report for foreign brigade',
    '/api/chief/works/'+firstWork.work.id+'/reports','POST',{
      report_type:'progress',summary:'Informe desde cuenta de otra brigada.'
    },chiefToken2,404);
  await request('Chief cannot forge a signed admin completion',
    '/api/chief/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',summary:'Pretende inventar una firma válida.',
      evidence_note:'Se detallan pruebas pendientes de supervisión.',
      review_status:'accepted',approved_by:adminEmail
    },chiefToken2,400);
  const authenticChiefReport=await request('Assigned chief records progress using own identity',
    '/api/chief/works/'+toB.work.id+'/reports','POST',{
      report_type:'progress',
      summary:'El jefe informa directamente avance de montaje y pruebas.'
    },chiefToken2,201);
  assert.ok(authenticChiefReport.id);
  const chiefCloseProposal=await request('Chief can propose completion without authorizing work',
    '/api/chief/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',
      summary:'El jefe declara finalizadas las labores y solicita revisión.',
      evidence_note:'Se hicieron mediciones declaradas por el responsable técnico; revisar documentación.'
    },chiefToken2,201);
  assert.match(chiefCloseProposal.message,/requiere revisión/i);
  const stillPlanned=await request('Chief self-report does not close brigade assignment',
    '/api/chief/works','GET',null,chiefToken2);
  assert.equal(stillPlanned.works.find(x=>x.id===toB.work.id).status,'scheduled');
  // 5B2 — propuesta realmente autenticada y revisión de dirección en UN paso.
  const chiefProposalReject=await request('Chief proposes completion on another scheduled job',
    '/api/chief/works/'+secondB.work.id+'/reports','POST',{
      report_type:'completion_proposed',
      summary:'El jefe indica haber concluido la segunda visita programada.',
      evidence_note:'Documentó las conexiones, mediciones y revisión visual pendiente de administración.'
    },chiefToken2,201);
  await request('Anonymous cannot review chief completion',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'accept',review_note:'No autorizado por dirección.',
      confirm_technical_evidence:true
    },null,401);
  await request('Operator cannot approve chief completion',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'accept',review_note:'El operador no puede aprobar.',
      confirm_technical_evidence:true
    },staffToken,403);
  await request('Chief himself cannot approve his own closure',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'accept',review_note:'El jefe no debe ser revisor.',
      confirm_technical_evidence:true
    },chiefToken2,401);
  await request('Admin must confirm technical evidence to accept chief completion',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'accept',review_note:'Revisé las pruebas según procedimiento.',
      confirm_technical_evidence:false
    },adminToken,400);
  const rejectChief=await request('Admin rejects chief proposal with reason and full history',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'reject',review_note:'Aún faltan pruebas de carga.'
    },adminToken);
  assert.equal(rejectChief.status,'rejected');
  assert.equal(rejectChief.work_status,'scheduled');
  await request('Rejected chief proposal cannot be silently rereviewed',
    '/api/technical/chief-reports/'+chiefProposalReject.id+'/review','PATCH',{
      decision:'accept',review_note:'Intento indebido de sobrescritura.',
      confirm_technical_evidence:true
    },adminToken,409);
  const newChiefProposal=await request('Chief submits corrected documented completion',
    '/api/chief/works/'+secondB.work.id+'/reports','POST',{
      report_type:'completion_proposed',
      summary:'El responsable técnico terminó las nuevas pruebas del trabajo.',
      evidence_note:'Se registraron las mediciones requeridas y pruebas de salida para la revisión.'
    },chiefToken2,201);
  const acceptChief=await request('Admin accepts authenticated chief report and closes job atomically',
    '/api/technical/chief-reports/'+newChiefProposal.id+'/review','PATCH',{
      decision:'accept',review_note:'Inspeccioné el informe y acepto el cierre técnico.',
      confirm_technical_evidence:true
    },adminToken);
  assert.equal(acceptChief.status,'accepted');
  assert.equal(acceptChief.work_status,'completed');
  const chiefAudit=await request('Dossier preserves chief, reviewer and technical audit',
    '/api/technical/requests/'+r4.id,'GET',null,staffToken);
  assert.equal(chiefAudit.works.find(x=>x.id===secondB.work.id).status,'completed');
  const savedChiefReport=chiefAudit.chief_reports.find(x=>x.id===newChiefProposal.id);
  assert.equal(savedChiefReport.review_status,'accepted');
  assert.equal(savedChiefReport.reviewed_by_email,adminEmail);
  assert.ok(chiefAudit.reports.some(x=>x.id===acceptChief.technical_report_id&&
    x.review_status==='accepted'));
  const originalR4=await request('Chief closure preserves commercial request status',
    '/api/dossiers/requests/'+r4.id,'GET',null,staffToken);
  assert.equal(originalR4.request.status,'pending');
  assert.ok(originalR4.audit.some(x=>x.action==='chief_completion_accepted'));
  await request('Accepted chief proposal cannot be approved twice',
    '/api/technical/chief-reports/'+newChiefProposal.id+'/review','PATCH',{
      decision:'accept',review_note:'Intento de doble aprobación del cierre.',
      confirm_technical_evidence:true
    },adminToken,409);
  await request('Completed job no longer accepts reports from chief',
    '/api/chief/works/'+secondB.work.id+'/reports','POST',{
      report_type:'progress',summary:'No se informa sobre trabajos terminados.'
    },chiefToken2,404);

  const ownReports=await request('Only actual authenticated chief can read own report history',
    '/api/chief/works/'+toB.work.id+'/reports','GET',null,chiefToken2);
  assert.ok(ownReports.reports.some(x=>x.id===authenticChiefReport.id));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP438DwHwAGgAJ/zxIJ8QAAAABJRU5ErkJggg==','base64');
  // Una foto con un bloque tEXt privado debe guardarse SIN metadatos.
  const chunkData=Buffer.from('GPSLocation\\0Coordenadas privadas de prueba');
  const injected=Buffer.alloc(12+chunkData.length);
  injected.writeUInt32BE(chunkData.length,0);
  injected.write('tEXt',4,'ascii');
  chunkData.copy(injected,8);
  let crc=0xffffffff;
  for(const x of injected.subarray(4,8+chunkData.length)){
    crc^=x;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  injected.writeUInt32BE((crc^0xffffffff)>>>0,8+chunkData.length);
  const dirtyPng=Buffer.concat([png.subarray(0,33),injected,png.subarray(33)]);
  const payload=new FormData();
  payload.append('file',new Blob([dirtyPng],{type:'image/png'}),'evidencia-prueba.png');
  payload.append('stage','after');
  payload.append('captured_note','Fotografía ficticia tomada para comprobar permisos en R2.');
  payload.append('report_id',authenticChiefReport.id);
  const photoResponse=await fetch(BASE+'/api/chief/works/'+toB.work.id+'/evidence',{
    method:'POST',headers:{Authorization:'Bearer '+chiefToken2},body:payload
  });
  const photoData=await photoResponse.json().catch(()=>({}));
  assert.equal(photoResponse.status,201,
    'Chief photo upload: '+photoResponse.status+' '+JSON.stringify(photoData));
  console.log('PASS Chief photo uploaded to private R2');
  assert.match(photoData.sha256_hex,/^[a-f0-9]{64}$/);
  const chiefPhotoList=await request('Chief lists only metadata of own evidence',
    '/api/chief/works/'+toB.work.id+'/evidence','GET',null,chiefToken2);
  assert.ok(chiefPhotoList.images.some(x=>x.id===photoData.id));
  assert.equal(JSON.stringify(chiefPhotoList).includes('r2_key'),false);
  const staffPhotoList=await request('Staff sees technical evidence without R2 key',
    '/api/chief/staff/works/'+toB.work.id+'/evidence','GET',null,staffToken);
  assert.ok(staffPhotoList.images.some(x=>x.id===photoData.id));
  const imageOwn=await fetch(BASE+'/api/chief/works/'+toB.work.id+'/evidence/'+photoData.id,{
    headers:{Authorization:'Bearer '+chiefToken2}
  });
  assert.equal(imageOwn.status,200);
  assert.equal(imageOwn.headers.get('cache-control'),'private, no-store');
  const cleanedBytes=Buffer.from(await imageOwn.arrayBuffer());
  assert.deepEqual(cleanedBytes,png,'R2 should keep image pixels but remove private text chunks');
  assert.equal(photoData.sha256_hex,require('node:crypto').createHash('sha256').update(png).digest('hex'));
  assert.equal(chiefPhotoList.images.find(x=>x.id===photoData.id).size_bytes,png.length);
  console.log('PASS Chief private evidence sanitizes metadata before R2, SHA and D1');
  const verifyPath='/api/chief/staff/works/'+toB.work.id+'/evidence/'+photoData.id+'/verify';
  const inspected=await request('Admin verifies R2 bytes against immutable D1 evidence hash',
    verifyPath,'GET',null,adminToken,200);
  assert.equal(inspected.image_id,photoData.id);
  assert.equal(inspected.integrity_status,'verified');
  assert.equal(JSON.stringify(inspected).includes('r2_key'),false);
  assert.equal(JSON.stringify(inspected).includes('sha256_hex'),false);
  await request('Operator cannot verify technical evidence integrity',
    verifyPath,'GET',null,staffToken,403);
  await request('Chief cannot call staff-only integrity verification',
    verifyPath,'GET',null,chiefToken2,401);
  await request('Anonymous cannot verify technical evidence',
    verifyPath,'GET',null,null,401);
  await request('Admin cannot verify evidence as a different work',
    '/api/chief/staff/works/'+secondB.work.id+'/evidence/'+photoData.id+'/verify',
    'GET',null,adminToken,404);
  console.log('PASS Private R2 integrity audit requires admin, verifies bytes and guards work boundary');

  const foreignImage=await fetch(BASE+'/api/chief/works/'+toB.work.id+'/evidence/'+photoData.id,{
    headers:{Authorization:'Bearer '+chiefToken1}
  });
  assert.equal(foreignImage.status,404);
  console.log('PASS Other chief cannot download foreign brigade R2 image');
  const anonImage=await fetch(BASE+'/api/chief/staff/works/'+toB.work.id+'/evidence/'+photoData.id);
  assert.equal(anonImage.status,401);
  console.log('PASS Anonymous photo access blocked');
  const copiedEvidence=new FormData();
  copiedEvidence.append('file',new Blob([png],{type:'image/png'}),'mal-uso.png');
  copiedEvidence.append('stage','after');
  const foreignUpload=await fetch(BASE+'/api/chief/works/'+toB.work.id+'/evidence',{
    method:'POST',headers:{Authorization:'Bearer '+chiefToken1},body:copiedEvidence
  });
  assert.equal(foreignUpload.status,404);
  console.log('PASS Cross-brigade upload blocked');
  const fakeEvidence=new FormData();
  fakeEvidence.append('file',new Blob(['texto, no una imagen'],{type:'image/png'}),'falsa.png');
  fakeEvidence.append('stage','after');
  const invalidUpload=await fetch(BASE+'/api/chief/works/'+toB.work.id+'/evidence',{
    method:'POST',headers:{Authorization:'Bearer '+chiefToken2},body:fakeEvidence
  });
  assert.equal(invalidUpload.status,400);
  console.log('PASS Fake PNG signature rejected');
  const currentChief=chiefs.accounts.find(x=>x.id===chiefTwo.id);
  const rotated=await request('Admin rotates chief password and revokes all prior sessions',
    '/api/chief/admin/accounts/'+chiefTwo.id,'PATCH',{
      password:'NuevaClaveJefeTotalmenteFicticia2026!',
      expected_updated_at:currentChief.updated_at
    },adminToken);
  assert.match(rotated.message,/revocadas/);
  await request('Revoked chief token cannot read jobs',
    '/api/chief/works','GET',null,chiefToken2,401);
  const newChiefLogin=await request('Chief can log in with new password',
    '/api/chief/login','POST',{
      email:chiefEmail2,password:'NuevaClaveJefeTotalmenteFicticia2026!'
    },null);
  assert.ok(newChiefLogin.access_token!==chiefToken2);
  const rotatedList=await request('Admin gets version for disabling chief account',
    '/api/chief/admin/accounts','GET',null,adminToken);
  const updatedAccount=rotatedList.accounts.find(x=>x.id===chiefTwo.id);
  await request('Admin deactivates chief account and revokes sessions',
    '/api/chief/admin/accounts/'+chiefTwo.id,'PATCH',{
      is_active:false,expected_updated_at:updatedAccount.updated_at
    },adminToken);
  await request('Deactivated chief cannot access work records',
    '/api/chief/works','GET',null,newChiefLogin.access_token,401);
  await request('Chief can explicitly close own session',
    '/api/chief/logout','POST',{},chiefToken1);
  await request('Logged out chief cannot access session',
    '/api/chief/works','GET',null,chiefToken1,401);

  const beforeChange=await request('Original chief logs in before administrative replacement',
    '/api/chief/login','POST',{email:chiefEmail1,password:chiefPassword},null);
  const brigadeBeforeChange=await request('Admin reads current brigade edit version',
    '/api/brigades','GET',null,adminToken);
  const originalBrigade=brigadeBeforeChange.brigades.find(x=>x.id===bg1.id);
  await request('Replacing nominal chief revokes old technical credential automatically',
    '/api/brigades/'+bg1.id,'PATCH',{
      leader_name:'Nuevo Jefe A',
      expected_updated_at:originalBrigade.updated_at
    },adminToken);
  await request('Previous chief session is invalidated by D1 trigger',
    '/api/chief/works','GET',null,beforeChange.access_token,401);
  await request('Former chief cannot sign in again after replacement',
    '/api/chief/login','POST',{email:chiefEmail1,password:chiefPassword},null,401);

  // Etapa 5A: informes, propuesta y revisión de cierre; incidencias y garantías.
  await request('Anonymous cannot inspect technical work records',
    '/api/technical/requests/'+r3.id,'GET',null,null,401);
  await request('Customer cannot inspect staff technical records',
    '/api/technical/requests/'+r3.id,'GET',null,at,401);
  const technicalBefore=await request('Staff sees assigned technical work',
    '/api/technical/requests/'+r3.id,'GET',null,staffToken);
  assert.ok(technicalBefore.works.some(x=>x.id===toB.work.id&&x.status==='scheduled'));
  await request('Customer cannot post a signed chief report',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'progress',information_source:'chief_relayed',
      summary:'Se revisaron las conexiones y se informa progreso.'
    },at,401);
  await request('Staff cannot forge a digitally signed report',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'progress',information_source:'chief_relayed',
      summary:'Informe firmado falsamente.',chief_signature:'FIRMA-FALSA'
    },staffToken,400);
  const progressNote=await request('Operator relays chief observation without impersonation',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'progress',information_source:'chief_relayed',
      summary:'El jefe informa avance de los paneles y revisión de conexiones.'
    },staffToken,201);
  assert.equal(progressNote.status,'note_only');
  await request('Cannot propose completion without described evidence',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',information_source:'staff_observed',
      summary:'La instalación está terminada.'
    },staffToken,400);
  await request('Evidence picture from another or unknown request is rejected',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',information_source:'staff_observed',
      summary:'Trabajo terminado según pruebas.',
      evidence_note:'Se midieron los terminales y la salida en los equipos de prueba.',
      evidence_image_id:crypto.randomUUID()
    },staffToken,409);
  const proposed=await request('Operator submits completion PROPOSAL for admin',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',information_source:'chief_relayed',
      summary:'El jefe declara concluido el montaje según la inspección realizada.',
      evidence_note:'Se informaron mediciones de salida y pruebas técnicas; revisión pendiente.'
    },staffToken,201);
  assert.equal(proposed.status,'pending_review');
  const beforeClosure=await request('Work still scheduled until admin accepts technical report',
    '/api/technical/requests/'+r3.id,'GET',null,staffToken);
  assert.equal(beforeClosure.works.find(x=>x.id===toB.work.id).status,'scheduled');
  await request('Duplicate pending completion proposal blocked',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',information_source:'staff_observed',
      summary:'Segunda declaración prematura.',
      evidence_note:'Se pretendía cerrar el trabajo dos veces sin revisión de la dirección.'
    },staffToken,409);
  await request('Operator cannot approve technical completion',
    '/api/technical/reports/'+proposed.id+'/review','PATCH',{
      decision:'accept',review_note:'Revisión no autorizada por gestor.',
      confirm_technical_evidence:true
    },staffToken,403);
  await request('Admin must confirm evidence before final technical closure',
    '/api/technical/reports/'+proposed.id+'/review','PATCH',{
      decision:'accept',review_note:'Se revisó documentación técnica aportada.',
      confirm_technical_evidence:false
    },adminToken,400);
  const rejectedTechnical=await request('Admin rejects premature completion while keeping schedule',
    '/api/technical/reports/'+proposed.id+'/review','PATCH',{
      decision:'reject',review_note:'Faltan pruebas de carga.'
    },adminToken);
  assert.equal(rejectedTechnical.status,'rejected');
  assert.equal(rejectedTechnical.work_status,'scheduled');
  await request('Cannot rewrite rejected technical review',
    '/api/technical/reports/'+proposed.id+'/review','PATCH',{
      decision:'accept',review_note:'Intento duplicado de aprobación.',confirm_technical_evidence:true
    },adminToken,409);
  const secondProposal=await request('Operator submits corrected completion evidence',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'completion_proposed',information_source:'staff_observed',
      summary:'Se completaron las mediciones y la comprobación de conexión.',
      evidence_note:'Resultados de tensiones y comprobaciones documentadas para revisión interna.'
    },staffToken,201);
  const acceptedTechnical=await request('Admin accepts evidence and completes technical work',
    '/api/technical/reports/'+secondProposal.id+'/review','PATCH',{
      decision:'accept',review_note:'Revisé la documentación y acepto el cierre técnico.',
      confirm_technical_evidence:true
    },adminToken);
  assert.equal(acceptedTechnical.status,'accepted');
  assert.equal(acceptedTechnical.work_status,'completed');
  const afterClosure=await request('Historical technical work appears completed without changing customer request',
    '/api/technical/requests/'+r3.id,'GET',null,adminToken);
  assert.equal(afterClosure.works.find(x=>x.id===toB.work.id).status,'completed');
  assert.equal(afterClosure.reports.find(x=>x.id===secondProposal.id).reviewer_email,adminEmail);
  assert.ok(afterClosure.reports.some(x=>x.id===progressNote.id));
  await request('Cannot add fabricated progress to already completed work',
    '/api/technical/works/'+toB.work.id+'/reports','POST',{
      report_type:'progress',information_source:'staff_observed',
      summary:'No se puede añadir avance tras cierre.'
    },staffToken,409);
  const customerStateUnchanged=await request('Technical closure does not close commercial request',
    '/api/dossiers/requests/'+r3.id,'GET',null,adminToken);
  assert.equal(customerStateUnchanged.request.status,'pending');
  assert.ok(customerStateUnchanged.audit.some(x=>x.action==='technical_work_completed'));

  await request('After-sales case must reference a work of the SAME request',
    '/api/technical/requests/'+r3.id+'/cases','POST',{
      work_id:firstWork.work.id,case_type:'incident',priority:'medium',
      title:'Incidencia de cableado',description:'El equipo reporta un problema técnico.'
    },staffToken,409);
  const claim=await request('Operator opens warranty CLAIM without accepting coverage',
    '/api/technical/requests/'+r3.id+'/cases','POST',{
      work_id:toB.work.id,case_type:'warranty_claim',priority:'high',
      title:'Reclamación de funcionamiento',description:'Cliente alega fallo después de instalar.',
      warranty_claim_details:'Cliente menciona garantía; vigencia por revisar.'
    },staffToken,201);
  assert.equal(claim.status,'open');
  assert.match(claim.message,/sin aceptación/i);
  const followNote=await request('Operator adds immutable follow-up note with author',
    '/api/technical/cases/'+claim.id+'/notes','POST',{
      note:'La brigada propone revisar conexiones y mediciones nuevamente.'
    },staffToken,201);
  assert.ok(followNote.id);
  await request('Operator cannot administratively resolve warranty complaint',
    '/api/technical/cases/'+claim.id+'/resolve','PATCH',{
      resolution_note:'Gestor intenta cerrar sin permiso.',confirm_review:true
    },staffToken,403);
  await request('Admin cannot resolve without documented review',
    '/api/technical/cases/'+claim.id+'/resolve','PATCH',{
      resolution_note:'Muy breve',confirm_review:false
    },adminToken,400);
  const resolved=await request('Admin closes after-sales case with responsible review',
    '/api/technical/cases/'+claim.id+'/resolve','PATCH',{
      resolution_note:'Se revisó la incidencia y se documentó el resultado sin reconocer cobertura automática.',
      confirm_review:true
    },adminToken);
  assert.equal(resolved.status,'resolved');
  await request('Already resolved warranty claim cannot be rewritten',
    '/api/technical/cases/'+claim.id+'/resolve','PATCH',{
      resolution_note:'Intento de revisión duplicada después de cierre.',
      confirm_review:true
    },adminToken,409);
  await request('Resolved case does not accept new notes',
    '/api/technical/cases/'+claim.id+'/notes','POST',{
      note:'Intento de agregar información después del cierre.'
    },staffToken,409);
  const caseSummary=await request('Historic warranty claim and notes remain visible to staff',
    '/api/technical/requests/'+r3.id,'GET',null,staffToken);
  assert.ok(caseSummary.cases.some(x=>x.id===claim.id&&x.status==='resolved'&&
    x.resolved_by_email===adminEmail));
  assert.ok(caseSummary.notes.some(x=>x.id===followNote.id&&x.actor_email===staffEmail));
  const aftersalesDossier=await request('Dossier audits technical and warranty decisions',
    '/api/dossiers/requests/'+r3.id,'GET',null,staffToken);
  assert.ok(aftersalesDossier.audit.some(x=>x.action==='service_case_resolved'));
  await request('No API allows deleting technical reports',
    '/api/technical/reports/'+secondProposal.id,'DELETE',null,adminToken,404);

  const bg3=await request('Admin adds third brigade','/api/brigades','POST',
    {name:'Brigada C '+uid,leader_name:'Jefe C'},adminToken,201);
  const three=await request('Three brigades enabled','/api/brigade-work/availability?date='+anotherDate,
    'GET',null,staffToken);
  assert.equal(three.active_count,3);
  const workThree=await request('Operator assigns first job of day with three brigades',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r5.id,
      work_date:anotherDate,estimated_minutes:360,busy_acknowledged:false},staffToken,201);
  assert.equal(workThree.work.status,'scheduled');
  const awaiting=await request('Second same-day work goes pending admin approval',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r6.id,
      work_date:anotherDate,estimated_minutes:120,busy_acknowledged:true},staffToken,201);
  assert.equal(awaiting.work.status,'pending_approval','Gestor nunca confirma excepción de 3+ brigadas');
  await request('Moderator cannot see pending approvals',
    '/api/brigade-work/pending','GET',null,staffToken,403);
  await request('Moderator cannot approve special assignment',
    '/api/brigade-work/'+awaiting.work.id+'/review','PATCH',
    {decision:'approve',reason:'Operador intentando aprobar'},staffToken,403);
  const waitingList=await request('Admin sees pending work','/api/brigade-work/pending',
    'GET',null,adminToken);
  assert.ok(waitingList.pending.some(x=>x.id===awaiting.work.id));
  await request('Admin cannot reject without reason',
    '/api/brigade-work/'+awaiting.work.id+'/review','PATCH',
    {decision:'reject',reason:''},adminToken,400);
  await request('Admin rejects second job with recorded reason',
    '/api/brigade-work/'+awaiting.work.id+'/review','PATCH',
    {decision:'reject',reason:'No cabe la instalación el mismo día.'},adminToken);
  await request('Already rejected job cannot be approved',
    '/api/brigade-work/'+awaiting.work.id+'/review','PATCH',
    {decision:'approve',reason:''},adminToken,409);
  const secondAttempt=await request('Operator requests second job after rejection',
    '/api/brigade-work','POST',{brigade_id:bg1.id,request_id:r7.id,
      work_date:anotherDate,estimated_minutes:60,busy_acknowledged:false},staffToken,201);
  assert.equal(secondAttempt.work.status,'pending_approval');
  await request('Admin approves pending second job',
    '/api/brigade-work/'+secondAttempt.work.id+'/review','PATCH',
    {decision:'approve',reason:'Jefe de brigada confirma viabilidad.'},adminToken);
  const monthWork=await request('Staff reads month calendar with decisions',
    '/api/brigade-work/month?month='+anotherDate.slice(0,7),'GET',null,staffToken);
  assert.ok(monthWork.works.some(x=>x.id===secondAttempt.work.id&&
    x.status==='scheduled'&&x.reviewed_by_email===adminEmail));
  assert.ok(monthWork.works.some(x=>x.id===awaiting.work.id&&x.status==='rejected'));
  await request('Operator cancels assigned work retaining history',
    '/api/brigade-work/'+firstWork.work.id+'/cancel','PATCH',
    {reason:'Reprogramación solicitada'},staffToken);
  await request('Operator cannot cancel already cancelled job',
    '/api/brigade-work/'+firstWork.work.id+'/cancel','PATCH',
    {reason:'Intento duplicado'},staffToken,409);

  const bg4=await request('Admin adds fourth brigade','/api/brigades','POST',
    {name:'Brigada D '+uid,leader_name:'Jefe D'},adminToken,201);
  assert.ok(bg4.id);
  const four=await request('Four brigades remain under special-approval rule',
    '/api/brigade-work/availability?date='+anotherDate,'GET',null,staffToken);
  assert.equal(four.active_count,4);

  // Dos gestores concurrentes con más de dos brigadas, misma fecha/brigada:
  // exactamente uno queda programado, otro necesita aprobación.
  const concurrentDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const submitConcurrent=id=>request('Concurrent assignment '+id,
    '/api/brigade-work','POST',{brigade_id:bg3.id,request_id:id,
      work_date:concurrentDate,estimated_minutes:480,busy_acknowledged:false},staffToken,201);
  const races=await Promise.all([submitConcurrent(r8.id),submitConcurrent(r9.id)]);
  assert.deepEqual(races.map(x=>x.work.status).sort(),['pending_approval','scheduled'],
    'Dos solicitudes concurrentes no pueden producir doble asignación directa sin administrador');
  const queue=await request('Admin queue includes concurrent exception','/api/brigade-work/pending',
    'GET',null,adminToken);
  assert.ok(queue.pending.some(x=>x.id===races.find(y=>y.work.status==='pending_approval').work.id));

  const searchedRequest=await request('Staff searches request by exact ID, first page',
    '/api/admin-customers/requests?q='+encodeURIComponent(created.id)+'&page=1&page_size=20',
    'GET',null,staffToken);
  assert.equal(searchedRequest.total,1);
  assert.equal(searchedRequest.requests[0].id,created.id);
  assert.equal(searchedRequest.page,1);
  const noSecondPage=await request('Staff receives empty second page',
    '/api/admin-customers/requests?q='+encodeURIComponent(created.id)+'&page=2&page_size=20',
    'GET',null,staffToken);
  assert.equal(noSecondPage.requests.length,0);
  const receipt=await request('Customer sees request creation receipt',
    '/api/notifications','GET',null,at);
  assert.ok(receipt.notifications.some(n=>n.title==='Recibimos tu solicitud' && n.message.includes(created.id)));
  await request('Staff updates request status and triggers alert','/api/admin-customers/requests/'+created.id,
    'PATCH',{status:'quoted'},staffToken);
  const changed=await request('Customer sees automatic request status alert',
    '/api/notifications','GET',null,at);
  assert.ok(changed.notifications.some(n=>n.title==='Actualización de tu solicitud' &&
    n.message.includes(created.id)));


  const extraRequest = await request('Client files a custom type of request','/api/private/requests','POST',
    {category_id:requestCategory.id,title:'Problema de garantía',description:'Quiero que revisen mi inversor instalado.'},at,201);
  async function uploadPrivatePhoto(route,token){
    const form=new FormData();
    form.append('file',new Blob([pixel],{type:'image/png'}),'evidencia.png');
    const response=await fetch(BASE+route,{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
    const body=await response.json().catch(()=>({}));
    assert.equal(response.status,201,'Private photo upload: '+JSON.stringify(body));
    return body;
  }
  const evidence = await uploadPrivatePhoto('/api/private/extras/requests/'+extraRequest.id+'/images',at);
  await request('Other customer cannot list request photos',
    '/api/private/extras/requests/'+extraRequest.id+'/images','GET',null,bt,404);
  await request('Other customer cannot download request photo',
    '/api/private/extras/requests/images/'+evidence.id,'GET',null,bt,404);
  const imageResponse=await fetch(BASE+'/api/private/extras/requests/images/'+evidence.id,
    {headers:{Authorization:'Bearer '+at}});
  assert.equal(imageResponse.status,200,'Owner can view own private request image');
  const staffPhotos=await request('Staff can list request attachments',
    '/api/admin-customers/extras/requests/'+extraRequest.id+'/images','GET',null,staffToken);
  assert.equal(staffPhotos.images.length,1);
  const staffImage=await fetch(BASE+'/api/admin-customers/extras/requests/images/'+evidence.id,
    {headers:{Authorization:'Bearer '+staffToken}});
  assert.equal(staffImage.status,200,'Staff can view private evidence');
  const adminRequests=await request('Staff sees custom request category and photo count',
    '/api/admin-customers/requests','GET',null,staffToken);
  assert.ok(adminRequests.requests.some(x=>x.id===extraRequest.id &&
    x.image_count===1 && x.category_name==='Garantía e incidencias '+uid));
  const own = await request('Customer A lists own requests', '/api/private/requests', 'GET', null, at);
  const other = await request('Customer B lists own requests', '/api/private/requests', 'GET', null, bt);
  assert.ok(own.requests.some(r => r.id === created.id));
  await request('Prevent deletion of customer with history', '/api/admin-customers/customers/' + ar.user.id,
    'DELETE', null, adminToken, 409);

  assert.ok(!other.requests.some(r => r.id === created.id));
  const chat = await request('Assistant message A', '/api/assistant/message', 'POST', { message: 'Hola, necesito paneles solares' }, at);
  assert.ok(chat.session_id);

  const blankChat=await request('Create a new private assistant conversation',
    '/api/assistant/sessions','POST',{},at,201);
  assert.ok(blankChat.session.id);
  const initialChats=await request('List customer assistant history',
    '/api/assistant/sessions','GET',null,at);
  assert.ok(initialChats.sessions.some(x=>x.id===chat.session_id));
  assert.ok(initialChats.sessions.some(x=>x.id===blankChat.session.id));
  const otherChats=await request('Other customer cannot list customer A conversations',
    '/api/assistant/sessions','GET',null,bt);
  assert.ok(!otherChats.sessions.some(x=>x.id===blankChat.session.id));
  await request('Other customer cannot read private chat messages',
    '/api/assistant/session/'+blankChat.session.id+'/messages','GET',null,bt,404);
  await request('Other customer cannot rename conversation',
    '/api/assistant/session/'+blankChat.session.id,'PATCH',{title:'Robado'},bt,404);
  await request('Other customer cannot delete private conversation',
    '/api/assistant/session/'+blankChat.session.id,'DELETE',null,bt,404);
  await request('Rename own conversation','/api/assistant/session/'+blankChat.session.id,
    'PATCH',{title:'Estudio solar personal'},at);
  const namedChats=await request('History includes new title',
    '/api/assistant/sessions','GET',null,at);
  assert.ok(namedChats.sessions.some(x=>x.id===blankChat.session.id&&x.title==='Estudio solar personal'));
  await request('Send message to explicitly created conversation','/api/assistant/message',
    'POST',{session_id:blankChat.session.id,message:'Hola'},at);
  await request('Delete own conversation','/api/assistant/session/'+blankChat.session.id,
    'DELETE',null,at);
  await request('Deleted chat cannot be restored','/api/assistant/session/'+blankChat.session.id+
    '/messages','GET',null,at,404);
  const retainedChats=await request('Older conversation remains after deleting another',
    '/api/assistant/sessions','GET',null,at);
  assert.ok(retainedChats.sessions.some(x=>x.id===chat.session_id));
  assert.ok(!retainedChats.sessions.some(x=>x.id===blankChat.session.id));

  const followUp = await request('Assistant preserves topic in follow-up', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: '¿Y a 48 voltios?' }, at);
  assert.equal(followUp.intent, 'solar_advice');
  // El flujo actual pregunta por inversor ANTES del sector; las aserciones
  // reflejan los pasos vigentes, sin alterar las respuestas del asistente.
  const guidedStart = await request('Solar guide asks for existing inverter',
    '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: 'Quiero un asesoramiento solar' }, at);
  assert.match(guidedStart.response, /inversor/i);
  for (const [answer, expectedText] of [
    ['1', 'vivienda'], ['2', 'experiencia'], ['2', 'tipo de instalación'],
    ['1', 'datos de consumo'], ['1', 'vatios'], ['800 W', 'horas al día'],
    ['6', 'porcentaje'], ['35', 'apagón'], ['5', 'horas solares pico'],
  ]) {
    const guidedNext = await request('Solar guide accepts step ' + answer, '/api/assistant/message', 'POST',
      { session_id: chat.session_id, message: answer }, at);
    assert.ok(guidedNext.response.toLowerCase().includes(expectedText.toLowerCase()),
      'Solar guide progression: ' + expectedText);
  }
  const guidedResult = await request('Solar guide calculates technical recommendation', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: '4,5' }, at);
  assert.match(guidedResult.response, /consumo diario/i);
  assert.match(guidedResult.response, /batería nominal/i);
  assert.match(guidedResult.response, /paneles/i);
  assert.match(guidedResult.response, /serie o paralelo/i);

  const noviceStart = await request('New novice solar conversation', '/api/assistant/message', 'POST',
    {message:'Necesito asesoramiento solar'},at);
  assert.match(noviceStart.response,/inversor/i);
  let noviceResult;
  for (const [answer, expected] of [
    ['1','vivienda'], ['1','experiencia'], ['1','equipos'],
    ['1 nevera, 1 televisor, 2 ventiladores, 6 luces LED','esenciales'],
    ['1','apagón'], ['5','batería nominal'],
  ]) {
    noviceResult = await request('Novice guidance '+answer,'/api/assistant/message','POST',
      {session_id:noviceStart.session_id,message:answer},at);
    assert.ok(noviceResult.response.toLowerCase().includes(expected.toLowerCase()),
      'Novice flow: '+expected);
  }
  assert.match(noviceResult.response,/refrigerador/i);
  assert.match(noviceResult.response,/batería nominal/i);
  assert.match(noviceResult.response,/serie o paralelo/i);
  const commercial = await request('Assistant understands catalog availability', '/api/assistant/message', 'POST',
    { message: '¿Tienen disponibilidad de baterías?' }, at);
  assert.equal(commercial.intent, 'product_inquiry');
  assert.ok(!/reserva confirmada|pedido realizado/i.test(commercial.response));
  await request('Customer B denied A chat', `/api/assistant/session/${chat.session_id}/messages`, 'GET', null, bt, 404);
  const starts = new Date(Date.now() + 48 * 3600 * 1000);
  starts.setUTCHours(14, 0, 0, 0);
  const appointment = { title: 'Visita solar de diagnóstico', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString() };
  const booked = await request('Customer A reserves time slot', '/api/private/appointments', 'POST', appointment, at, 201);
  const appSearch=await request('Staff finds appointment by ID and page',
    '/api/admin-customers/appointments?q='+encodeURIComponent(booked.id)+'&page=1&page_size=20',
    'GET',null,staffToken);
  assert.equal(appSearch.total,1);
  assert.equal(appSearch.appointments[0].id,booked.id);
  await request('Staff confirms appointment','/api/admin-customers/appointments/'+booked.id,
    'PATCH',{status:'confirmed'},staffToken);
  // Customer booking currently creates appointments without service_id.
  // The service deletion guard applies to records that really reference a service.
  const appointmentAlert=await request('Customer sees appointment status alert',
    '/api/notifications','GET',null,at);
  assert.ok(appointmentAlert.notifications.some(n=>n.title==='Estado de tu cita' &&
    n.message.includes(booked.id)));
  await request('Duplicate time slot blocked', '/api/private/appointments', 'POST', appointment, bt, 409);
  const bAppointments = await request('B sees only own appointments', '/api/private/appointments', 'GET', null, bt);
  assert.equal(bAppointments.appointments.length, 0);
  const otherDeviceB = await request('Customer B signs in from second device',
    '/api/auth/customer/login','POST',{email:b.email,password:b.password});
  await request('Second device works before password change',
    '/api/auth/me','GET',null,otherDeviceB.access_token);
  await request('Wrong current password does not update account',
    '/api/auth/password','PUT',
    {current_password:'ClaveIncorrecta2026',new_password:'ClaveNoDebeGuardarse2026'},bt,403);
  await request('Second device remains active after rejected password change',
    '/api/auth/me','GET',null,otherDeviceB.access_token);
  await request('Customer B changes password', '/api/auth/password', 'PUT',
    { current_password: b.password, new_password: 'OtraClave!MasSegura2026' }, bt);
  await request('Current device remains active after password change',
    '/api/auth/me','GET',null,bt);
  await request('Second device access is revoked atomically',
    '/api/auth/me','GET',null,otherDeviceB.access_token,401);
  await request('Second device refresh is revoked atomically',
    '/api/auth/refresh','POST',{refresh_token:otherDeviceB.refresh_token},null,401);
  await request('Old password rejected', '/api/auth/customer/login', 'POST', { email: b.email, password: b.password }, null, 401);
  await request('New password accepted', '/api/auth/customer/login', 'POST', { email: b.email, password: 'OtraClave!MasSegura2026' });
  await request('Block customer', '/api/admin-customers/customers/' + br.user.id + '/status',
    'PATCH', { is_active: false }, adminToken);
  await request('Blocked customer token rejected', '/api/auth/me', 'GET', null, bt, 401);
  await request('Unblock customer', '/api/admin-customers/customers/' + br.user.id + '/status',
    'PATCH', { is_active: true }, adminToken);


  const disposable = await request('Create disposable customer', '/api/auth/register',
    'POST', make('disposable'), null, 201);
  await request('Remove disposable customer', '/api/admin-customers/customers/' + disposable.user.id,
    'DELETE', null, adminToken);
  // Seguridad del personal: una modificación de rol cierra las sesiones antiguas,
  // y la desactivación nunca deja acceso a información de terceros.
  await request('Sole admin cannot demote own account',
    '/api/admin/users/'+adminSession.user.id,'PATCH',{role:'operator'},adminToken,403);
  await request('Sole admin cannot deactivate own account',
    '/api/admin/users/'+adminSession.user.id,'DELETE',null,adminToken,403);
  await invalidJson('Staff role patch rejects arrays',
    '/api/admin/users/'+createdStaff.id,'PATCH','[]',400,adminToken);
  await request('Admin promotes moderator to administrator',
    '/api/admin/users/'+createdStaff.id,'PATCH',{role:'admin'},adminToken);
  await request('Original moderator token is immediately revoked on promotion',
    '/api/notifications/inbox','GET',null,staffToken,401);
  await request('Original moderator refresh token is revoked on promotion',
    '/api/auth/refresh','POST',{refresh_token:staffLogin.refresh_token},null,401);
  const promoted = await request('Promoted staff signs in as administrator',
    '/api/auth/sign-in','POST',{email:staffEmail,password:'Operador!Seguro2026'});
  assert.equal(promoted.user.role,'admin');
  await request('Promoted administrator can access admin-only users',
    '/api/admin/users','GET',null,promoted.access_token);
  await request('Admin demotes second administrator to moderator',
    '/api/admin/users/'+createdStaff.id,'PATCH',{role:'operator'},adminToken);
  await request('Old promoted-admin token rejected after demotion',
    '/api/admin/users','GET',null,promoted.access_token,401);
  await request('Old promoted-admin refresh token rejected after demotion',
    '/api/auth/refresh','POST',{refresh_token:promoted.refresh_token},null,401);
  const demoted = await request('Demoted staff signs in with current role',
    '/api/auth/sign-in','POST',{email:staffEmail,password:'Operador!Seguro2026'});
  assert.equal(demoted.user.role,'operator');
  await request('Demoted moderator cannot read admin users',
    '/api/admin/users','GET',null,demoted.access_token,403);
  await request('Demoted moderator can access staff-only notifications',
    '/api/notifications/inbox','GET',null,demoted.access_token);
  await request('Admin deactivates moderator without deleting history',
    '/api/admin/users/'+createdStaff.id,'DELETE',null,adminToken);
  await request('Deactivated moderator token revoked',
    '/api/notifications/inbox','GET',null,demoted.access_token,401);
  await request('Deactivated moderator cannot sign in',
    '/api/auth/sign-in','POST',{email:staffEmail,password:'Operador!Seguro2026'},null,401);
  await request('Sole administrator remains active after other account deactivation',
    '/api/admin/users','GET',null,adminToken);

  await request('Logout customer A', '/api/auth/logout', 'POST', {}, at);
  await request('Revoked token rejected', '/api/private/requests', 'GET', null, at, 401);
  await request('Logout also invalidates customer refresh token',
    '/api/auth/refresh','POST',{refresh_token:ar.refresh_token},null,401);
  await request('Logout invalidates access token minted by prior refresh',
    '/api/private/requests','GET',null,customerRenewed.access_token,401);
  await request('Logout invalidates refresh token minted by prior refresh',
    '/api/auth/refresh','POST',{refresh_token:customerRenewed.refresh_token},null,401);


  // Al final: no interferir con los logins legítimos previos. Doce intentos
  // concurrentes prueban que el contador de D1 es atómico, sin lectura SELECT
  // separada, y que después de superar el límite incluso un login válido da 429.
  const attempts = await Promise.all(Array.from({length:12},(_,i)=>
    fetch(BASE+'/api/auth/login',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'brute-force-'+uid+'-'+i+'@example.invalid',password:'incorrecto'})
    })
  ));
  const statuses=attempts.map(x=>x.status);
  assert.ok(statuses.every(x=>x===401||x===429),
    'Concurrent wrong passwords must return only 401/429; got '+statuses.join(','));
  assert.ok(statuses.includes(429),'Repeated failed logins must eventually be rate-limited');
  assert.ok(statuses.filter(x=>x===401).length<=10,
    'An atomic D1 counter cannot allow over 10 requests in the same IP window');
  const gatedValid=await fetch(BASE+'/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:adminEmail,password:adminPassword})
  });
  assert.equal(gatedValid.status,429,'Valid credentials must not bypass an exhausted IP budget');
  console.log('PASS Atomic D1 login rate limit blocks concurrent abuse and bypass attempts');
  console.log('SUCCESS: Worker + D1 local integration');
})().catch(error => { console.error(error); process.exitCode = 1; });
