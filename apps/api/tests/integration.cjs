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
