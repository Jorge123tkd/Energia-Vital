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
  await request('Moderator cannot change site content', '/api/admin/site-settings', 'PUT',
    { home_title: 'Attempted overwrite' }, staffToken, 403);
  await request('Moderator cannot change staff roles', '/api/admin/users/' + createdStaff.id, 'PATCH',
    { role: 'admin' }, staffToken, 403);
  await request('Moderator can read staff notifications', '/api/notifications/inbox', 'GET', null, staffToken);

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
  const followUp = await request('Assistant preserves topic in follow-up', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: '¿Y a 48 voltios?' }, at);
  assert.equal(followUp.intent, 'solar_advice');
  const guidedStart = await request('Solar guide asks for sector', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: 'Quiero un asesoramiento solar' }, at);
  assert.match(guidedStart.response, /sector/i);
  for (const [answer, expectedText] of [
    ['1', 'experiencia'], ['2', 'tipo de instalación'], ['1', 'datos de consumo'],
    ['1', 'vatios'], ['800 W', 'horas al día'], ['6', 'cargas esenciales'],
    ['35', 'inversor'], ['no', 'autonomía'], ['5', 'horas solares pico'],
  ]) {
    const guidedNext = await request('Solar guide accepts step ' + answer, '/api/assistant/message', 'POST',
      { session_id: chat.session_id, message: answer }, at);
    assert.ok(guidedNext.response.toLowerCase().includes(expectedText.toLowerCase()), 'Solar guide progression: ' + expectedText);
  }
  const guidedResult = await request('Solar guide calculates technical recommendation', '/api/assistant/message', 'POST',
    { session_id: chat.session_id, message: '4,5' }, at);
  assert.match(guidedResult.response, /consumo diario/i);
  assert.match(guidedResult.response, /batería nominal/i);
  assert.match(guidedResult.response, /paneles/i);
  assert.match(guidedResult.response, /serie o paralelo/i);

  const noviceStart = await request('New novice solar conversation', '/api/assistant/message', 'POST',
    {message:'Necesito asesoramiento solar'},at);
  assert.match(noviceStart.response,/sector/i);
  for (const [answer, expected] of [
    ['1','experiencia'],['1','equipos'],['1 nevera, 1 televisor, 2 ventiladores, 6 luces LED','esenciales'],
    ['1','inversor'],['no','autonomía'],['5','horas solares pico'],
  ]) {
    const reply = await request('Novice guidance '+answer,'/api/assistant/message','POST',
      {session_id:noviceStart.session_id,message:answer},at);
    assert.ok(reply.response.toLowerCase().includes(expected.toLowerCase()),'Novice flow: '+expected);
  }
  const noviceResult=await request('Beginner household sees realistic battery reference',
    '/api/assistant/message','POST',{session_id:noviceStart.session_id,message:'4,5'},at);
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
  await request('Customer A reserves time slot', '/api/private/appointments', 'POST', appointment, at, 201);
  const appSearch=await request('Staff finds appointment by ID and page',
    '/api/admin-customers/appointments?q='+encodeURIComponent(created.id)+'&page=1&page_size=20',
    'GET',null,staffToken);
  assert.equal(appSearch.total,0);
  await request('Duplicate time slot blocked', '/api/private/appointments', 'POST', appointment, bt, 409);
  const bAppointments = await request('B sees only own appointments', '/api/private/appointments', 'GET', null, bt);
  assert.equal(bAppointments.appointments.length, 0);
  await request('Customer B changes password', '/api/auth/password', 'PUT', { current_password: b.password, new_password: 'OtraClave!MasSegura2026' }, bt);
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
  await request('Logout customer A', '/api/auth/logout', 'POST', {}, at);
  await request('Revoked token rejected', '/api/private/requests', 'GET', null, at, 401);
  console.log('SUCCESS: Worker + D1 local integration');
})().catch(error => { console.error(error); process.exitCode = 1; });
