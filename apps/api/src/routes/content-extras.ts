import { Hono } from 'hono';
import type { Env } from '../types';
import { getUser, requireAdminAuth, requireCustomerAuth, requireStaffAuth } from '../middleware';
import { storeImage, serveImage, servePublicImage } from '../media-library';

type Bindings = { Bindings: Env; Variables: { user?: any } };
export const publicExtrasRoutes = new Hono<Bindings>();
export const adminExtrasRoutes = new Hono<Bindings>();
export const privateExtrasRoutes = new Hono<Bindings>();
export const staffExtrasRoutes = new Hono<Bindings>();
adminExtrasRoutes.use('*', requireAdminAuth);
privateExtrasRoutes.use('*', requireCustomerAuth);
staffExtrasRoutes.use('*', requireStaffAuth);

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const types = new Set(['installation', 'maintenance', 'repair', 'consultation', 'complaint', 'suggestion']);
const integer = (value: unknown, min = 0, max = 9999) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const imageURL = (c: any, kind: string, id: string) =>
  `${new URL(c.req.url).origin}/api/public/extras/${kind}/images/${id}`;
const returnError = (c: any, e: unknown) =>
  c.json({ error: e instanceof Error ? e.message : 'No fue posible guardar la imagen.' }, 400);

async function galleryImages(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, url, sort_order FROM work_gallery_images WHERE project_id = ? ORDER BY sort_order, created_at'
  ).bind(projectId).all();
  return results || [];
}
async function serviceImages(env: Env, id: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, url, sort_order FROM service_images WHERE service_id = ? ORDER BY sort_order, created_at'
  ).bind(id).all();
  return results || [];
}

// Categorías de trabajos: editables, independientes de las categorías comerciales.
publicExtrasRoutes.get('/gallery/categories', async c => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, sort_order FROM project_categories WHERE is_active = 1 ORDER BY sort_order, name'
  ).all();
  return c.json({ categories: results || [] });
});
adminExtrasRoutes.get('/gallery/categories', async c => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM project_categories ORDER BY sort_order, name'
  ).all();
  return c.json({ categories: results || [] });
});
adminExtrasRoutes.post('/gallery/categories', async c => {
  const b = await c.req.json<any>().catch(() => null);
  const name = text(b?.name, 100);
  if (name.length < 2 || name.length > 100)
    return c.json({ error: 'El nombre debe tener entre 2 y 100 caracteres.' }, 400);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO project_categories (id, name) VALUES (?, ?)').bind(id, name).run();
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e))) return c.json({ error: 'La categoría ya existe.' }, 409);
    throw e;
  }
  return c.json({ id }, 201);
});
adminExtrasRoutes.patch('/gallery/categories/:id', async c => {
  const id = c.req.param('id');
  const b = await c.req.json<any>().catch(() => null);
  if (!b || Object.keys(b).some(k => !['name','is_active','sort_order'].includes(k)))
    return c.json({ error: 'Campos de categoría no permitidos.' }, 400);
  const current = await c.env.DB.prepare('SELECT * FROM project_categories WHERE id = ?').bind(id).first<any>();
  if (!current) return c.notFound();
  const name = b.name === undefined ? current.name : text(b.name, 100);
  const active = b.is_active === undefined ? Boolean(current.is_active) : b.is_active;
  const sort = b.sort_order === undefined ? current.sort_order : b.sort_order;
  if (name.length < 2 || typeof active !== 'boolean' || !integer(sort))
    return c.json({ error: 'Nombre, estado u orden inválido.' }, 400);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE project_categories SET name=?, is_active=?, sort_order=? WHERE id=?')
        .bind(name, active ? 1 : 0, sort, id),
      c.env.DB.prepare('UPDATE work_gallery SET category=? WHERE category=?').bind(name, current.name),
    ]);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e))) return c.json({ error: 'Ya existe otra categoría con ese nombre.' }, 409);
    throw e;
  }
  return c.json({ message: 'Categoría actualizada' });
});
adminExtrasRoutes.delete('/gallery/categories/:id', async c => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT name FROM project_categories WHERE id = ?').bind(id).first<{name:string}>();
  if (!row) return c.notFound();
  const used = await c.env.DB.prepare('SELECT id FROM work_gallery WHERE category = ? LIMIT 1').bind(row.name).first();
  if (used) return c.json({ error: 'Hay proyectos en esta categoría. Cámbialos de categoría antes de eliminarla.' }, 409);
  await c.env.DB.prepare('DELETE FROM project_categories WHERE id = ?').bind(id).run();
  return c.json({ message: 'Categoría eliminada' });
});

// Fotos de proyectos: se pueden añadir y eliminar sin sustituir las anteriores.
publicExtrasRoutes.get('/gallery/:id/images', async c => {
  const project = await c.env.DB.prepare('SELECT id FROM work_gallery WHERE id = ? AND is_active = 1')
    .bind(c.req.param('id')).first();
  if (!project) return c.notFound();
  return c.json({ images: await galleryImages(c.env, c.req.param('id')) });
});
adminExtrasRoutes.get('/gallery/:id/images', async c => {
  return c.json({ images: await galleryImages(c.env, c.req.param('id')) });
});
adminExtrasRoutes.post('/gallery/:id/images', async c => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT id, url FROM work_gallery WHERE id = ?').bind(id).first<any>();
  if (!project) return c.notFound();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM work_gallery_images WHERE project_id=?')
    .bind(id).first<{n:number}>();
  if ((count?.n || 0) >= 15) return c.json({ error: 'Máximo 15 fotografías por proyecto.' }, 409);
  let saved;
  try {
    const form = await c.req.formData();
    saved = await storeImage(c.env, form.get('file'), 'projects', id);
  } catch (e) { return returnError(c, e); }
  const imageId = crypto.randomUUID(), url = imageURL(c, 'gallery', imageId), now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO work_gallery_images (id,project_id,r2_key,url,sort_order,created_at) VALUES (?,?,?,?,?,?)')
        .bind(imageId, id, saved.key, url, count?.n || 0, now),
      ...(!project.url ? [c.env.DB.prepare('UPDATE work_gallery SET url = ?, r2_key = ? WHERE id=?')
        .bind(url, saved.key, id)] : []),
    ]);
  } catch (e) { await c.env.BUCKET.delete(saved.key).catch(() => {}); throw e; }
  return c.json({ id: imageId, url }, 201);
});
adminExtrasRoutes.delete('/gallery/:id/images/:imageId', async c => {
  const pid = c.req.param('id'), iid = c.req.param('imageId');
  const current = await c.env.DB.prepare('SELECT id, r2_key, url FROM work_gallery_images WHERE id=? AND project_id=?')
    .bind(iid, pid).first<any>();
  if (!current) return c.notFound();
  const project = await c.env.DB.prepare('SELECT url FROM work_gallery WHERE id=?').bind(pid).first<{url:string|null}>();
  const replacements = project?.url === current.url
    ? await c.env.DB.prepare('SELECT url,r2_key FROM work_gallery_images WHERE project_id=? AND id!=? ORDER BY sort_order,created_at LIMIT 1')
      .bind(pid, iid).first<any>() : null;
  const statements = [c.env.DB.prepare('DELETE FROM work_gallery_images WHERE id=?').bind(iid)];
  if (project?.url === current.url)
    statements.push(c.env.DB.prepare('UPDATE work_gallery SET url=?, r2_key=? WHERE id=?')
      .bind(replacements?.url || null, replacements?.r2_key || null, pid));
  await c.env.DB.batch(statements);
  if (current.r2_key) await c.env.BUCKET.delete(current.r2_key).catch(() => {});
  return c.json({ message: 'Foto eliminada' });
});
publicExtrasRoutes.get('/gallery/images/:id', async c => {
  const photo = await c.env.DB.prepare(`SELECT i.r2_key FROM work_gallery_images i
    JOIN work_gallery w ON w.id = i.project_id WHERE i.id = ? AND w.is_active = 1`)
    .bind(c.req.param('id')).first<{r2_key:string|null}>();
  return photo?.r2_key ? servePublicImage(c, photo.r2_key) : c.notFound();
});

// Servicios y productos: varias imágenes, sin perder la fotografía principal.
publicExtrasRoutes.get('/services/:id/images', async c => {
  const exists = await c.env.DB.prepare('SELECT id FROM services WHERE id=? AND is_active=1')
    .bind(c.req.param('id')).first();
  return exists ? c.json({ images: await serviceImages(c.env,c.req.param('id')) }) : c.notFound();
});
adminExtrasRoutes.get('/services/:id/images', async c => {
  return c.json({ images: await serviceImages(c.env,c.req.param('id')) });
});
adminExtrasRoutes.post('/services/:id/images', async c => {
  const id = c.req.param('id');
  const service = await c.env.DB.prepare('SELECT id,image_url FROM services WHERE id=?').bind(id).first<any>();
  if (!service) return c.notFound();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM service_images WHERE service_id=?').bind(id).first<{n:number}>();
  if ((count?.n || 0) >= 10) return c.json({ error: 'Máximo 10 fotos por servicio.' }, 409);
  let saved;
  try { saved = await storeImage(c.env, (await c.req.formData()).get('file'), 'service-gallery', id); }
  catch (e) { return returnError(c, e); }
  const photoId=crypto.randomUUID(),url=imageURL(c,'services',photoId);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO service_images (id,service_id,r2_key,url,sort_order) VALUES (?,?,?,?,?)')
        .bind(photoId,id,saved.key,url,count?.n || 0),
      ...(!service.image_url ? [c.env.DB.prepare('UPDATE services SET image_url=?,image_r2_key=?,updated_at=? WHERE id=?')
        .bind(url,saved.key,new Date().toISOString(),id)] : []),
    ]);
  } catch(e) { await c.env.BUCKET.delete(saved.key).catch(() => {}); throw e; }
  return c.json({ id:photoId,url },201);
});
adminExtrasRoutes.delete('/services/:id/images/:imageId', async c => {
  const id=c.req.param('id'),iid=c.req.param('imageId');
  const pic=await c.env.DB.prepare('SELECT r2_key,url FROM service_images WHERE id=? AND service_id=?')
    .bind(iid,id).first<any>();
  if(!pic) return c.notFound();
  const service=await c.env.DB.prepare('SELECT image_url FROM services WHERE id=?').bind(id).first<any>();
  const next=service?.image_url===pic.url
    ? await c.env.DB.prepare('SELECT r2_key,url FROM service_images WHERE service_id=? AND id!=? ORDER BY sort_order,created_at LIMIT 1')
      .bind(id,iid).first<any>() : null;
  const stmts=[c.env.DB.prepare('DELETE FROM service_images WHERE id=?').bind(iid)];
  if(service?.image_url===pic.url) stmts.push(
    c.env.DB.prepare('UPDATE services SET image_url=?,image_r2_key=?,updated_at=? WHERE id=?')
      .bind(next?.url||null,next?.r2_key||null,new Date().toISOString(),id));
  await c.env.DB.batch(stmts);
  if(pic.r2_key) await c.env.BUCKET.delete(pic.r2_key).catch(()=>{});
  return c.json({message:'Imagen eliminada'});
});
publicExtrasRoutes.get('/services/images/:id', async c => {
  const pic=await c.env.DB.prepare(`SELECT i.r2_key FROM service_images i JOIN services s ON s.id=i.service_id
    WHERE i.id=? AND s.is_active=1`).bind(c.req.param('id')).first<{r2_key:string|null}>();
  return pic?.r2_key?servePublicImage(c,pic.r2_key):c.notFound();
});
adminExtrasRoutes.get('/products/:id/images', async c => {
  const {results}=await c.env.DB.prepare('SELECT id,url,is_primary FROM product_images WHERE product_id=? ORDER BY is_primary DESC,sort_order,created_at')
    .bind(c.req.param('id')).all();
  return c.json({images:results||[]});
});
adminExtrasRoutes.delete('/products/:id/images/:imageId', async c => {
  const id=c.req.param('id'),iid=c.req.param('imageId');
  const pic=await c.env.DB.prepare('SELECT id,r2_key,is_primary FROM product_images WHERE id=? AND product_id=?')
    .bind(iid,id).first<any>();
  if(!pic) return c.notFound();
  const next=pic.is_primary?await c.env.DB.prepare('SELECT id FROM product_images WHERE product_id=? AND id!=? ORDER BY sort_order,created_at LIMIT 1')
    .bind(id,iid).first<{id:string}>():null;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM product_images WHERE id=?').bind(iid),
    ...(next?[c.env.DB.prepare('UPDATE product_images SET is_primary=1 WHERE id=?').bind(next.id)]:[]),
  ]);
  if(pic.r2_key) await c.env.BUCKET.delete(pic.r2_key).catch(()=>{});
  return c.json({message:'Fotografía del producto eliminada'});
});

// Tipos de solicitud personalizables: se preserva el tipo histórico para compatibilidad.
publicExtrasRoutes.get('/request-categories', async c => {
  const {results}=await c.env.DB.prepare('SELECT id,name,requires_image,sort_order FROM request_categories WHERE is_active=1 ORDER BY sort_order,name').all();
  return c.json({categories:results||[]});
});
adminExtrasRoutes.get('/request-categories', async c => {
  const {results}=await c.env.DB.prepare('SELECT * FROM request_categories ORDER BY sort_order,name').all();
  return c.json({categories:results||[]});
});
adminExtrasRoutes.post('/request-categories', async c => {
  const b=await c.req.json<any>().catch(()=>null);
  const name=text(b?.name,100),legacy=types.has(b?.legacy_type)?b.legacy_type:'consultation';
  if(name.length<2 || (b?.legacy_type!==undefined && !types.has(b.legacy_type)))
    return c.json({error:'Escribe un nombre y un tipo base válido.'},400);
  const id=crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO request_categories (id,name,legacy_type,requires_image,sort_order) VALUES (?,?,?,?,?)')
      .bind(id,name,legacy,b?.requires_image?1:0,integer(b?.sort_order)?b.sort_order:0).run();
  } catch(e) {if(/UNIQUE|constraint/i.test(String(e)))return c.json({error:'Esta categoría ya existe.'},409);throw e;}
  return c.json({id},201);
});
adminExtrasRoutes.patch('/request-categories/:id', async c => {
  const id=c.req.param('id');
  const row=await c.env.DB.prepare('SELECT * FROM request_categories WHERE id=?').bind(id).first<any>();
  if(!row)return c.notFound();
  const b=await c.req.json<any>().catch(()=>null);
  if(!b || Object.keys(b).some(k=>!['name','legacy_type','requires_image','is_active','sort_order'].includes(k)))
    return c.json({error:'Campos inválidos.'},400);
  const name=b.name===undefined?row.name:text(b.name,100);
  const legacy=b.legacy_type===undefined?row.legacy_type:b.legacy_type;
  const required=b.requires_image===undefined?Boolean(row.requires_image):b.requires_image;
  const active=b.is_active===undefined?Boolean(row.is_active):b.is_active;
  const sort=b.sort_order===undefined?row.sort_order:b.sort_order;
  if(name.length<2 || !types.has(legacy) || typeof required!=='boolean'||typeof active!=='boolean'||!integer(sort))
    return c.json({error:'Nombre, tipo, obligatoriedad, visibilidad u orden incorrectos.'},400);
  try {
    await c.env.DB.prepare(`UPDATE request_categories SET name=?,legacy_type=?,requires_image=?,is_active=?,sort_order=? WHERE id=?`)
      .bind(name,legacy,required?1:0,active?1:0,sort,id).run();
  }catch(e){if(/UNIQUE|constraint/i.test(String(e)))return c.json({error:'Nombre duplicado.'},409);throw e;}
  return c.json({message:'Categoría actualizada'});
});
adminExtrasRoutes.delete('/request-categories/:id', async c => {
  const id=c.req.param('id');
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM requests WHERE request_category_id=?').bind(id).first<{n:number}>();
  if((count?.n||0)>0)return c.json({error:'Esta categoría ya tiene solicitudes. Desactívala para conservar el historial.'},409);
  await c.env.DB.prepare('DELETE FROM request_categories WHERE id=?').bind(id).run();
  return c.json({message:'Categoría eliminada'});
});

// Fotos privadas de solicitudes: solo cliente propietario y personal autenticado.
privateExtrasRoutes.get('/requests/:id/images', async c => {
  const id=c.req.param('id'), customerId=getUser(c)!.user_id;
  const request=await c.env.DB.prepare('SELECT id FROM requests WHERE id=? AND customer_id=?').bind(id,customerId).first();
  if(!request)return c.notFound();
  const {results}=await c.env.DB.prepare('SELECT id,created_at FROM request_images WHERE request_id=? ORDER BY created_at')
    .bind(id).all();
  return c.json({images:results||[]});
});
privateExtrasRoutes.post('/requests/:id/images', async c => {
  const id=c.req.param('id'), customerId=getUser(c)!.user_id;
  const request=await c.env.DB.prepare('SELECT id FROM requests WHERE id=? AND customer_id=?').bind(id,customerId).first();
  if(!request)return c.notFound();
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM request_images WHERE request_id=?').bind(id).first<{n:number}>();
  if((count?.n||0)>=5)return c.json({error:'Máximo cinco fotografías por solicitud.'},409);
  let saved;
  try { saved=await storeImage(c.env,(await c.req.formData()).get('file'),'requests',id); }
  catch(e){return returnError(c,e);}
  const imageId=crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO request_images (id,request_id,customer_id,r2_key,content_type) VALUES (?,?,?,?,?)')
      .bind(imageId,id,customerId,saved.key,saved.type).run();
  }catch(e){await c.env.BUCKET.delete(saved.key).catch(()=>{});throw e;}
  return c.json({id:imageId},201);
});
privateExtrasRoutes.get('/requests/images/:imageId', async c => {
  const row=await c.env.DB.prepare('SELECT r2_key FROM request_images WHERE id=? AND customer_id=?')
    .bind(c.req.param('imageId'),getUser(c)!.user_id).first<{r2_key:string}>();
  return row?serveImage(c,row.r2_key):c.notFound();
});
staffExtrasRoutes.get('/requests/:id/images', async c => {
  const {results}=await c.env.DB.prepare('SELECT id,created_at FROM request_images WHERE request_id=? ORDER BY created_at')
    .bind(c.req.param('id')).all();
  return c.json({images:results||[]});
});
staffExtrasRoutes.get('/requests/images/:imageId', async c => {
  const row=await c.env.DB.prepare('SELECT r2_key FROM request_images WHERE id=?')
    .bind(c.req.param('imageId')).first<{r2_key:string}>();
  return row?serveImage(c,row.r2_key):c.notFound();
});

// Solo se puede valorar un equipo cuando el administrador ha registrado una compra real.
publicExtrasRoutes.get('/products/:id/reviews', async c => {
  const id=c.req.param('id');
  const product=await c.env.DB.prepare('SELECT id FROM products WHERE id=? AND is_active=1').bind(id).first();
  if(!product)return c.notFound();
  const {results}=await c.env.DB.prepare(`SELECT r.id,r.rating,r.comment,r.created_at,
    substr(c.name,1,1)||'.' AS customer_name FROM product_reviews r
    JOIN customers c ON c.id=r.customer_id
    WHERE r.product_id=? AND r.status='published' ORDER BY r.created_at DESC LIMIT 100`).bind(id).all();
  const reviews=results||[];
  const summary=await c.env.DB.prepare(`SELECT COUNT(*) AS count, AVG(rating) AS average
    FROM product_reviews WHERE product_id=? AND status='published'`).bind(id)
    .first<{count:number;average:number|null}>();
  return c.json({
    reviews,
    average:summary?.average==null?null:Number(summary.average.toFixed(2)),
    count:summary?.count||0,
  });
});
privateExtrasRoutes.get('/products/:id/review-eligibility', async c => {
  const id=c.req.param('id'),customerId=getUser(c)!.user_id;
  const purchase=await c.env.DB.prepare('SELECT id FROM verified_product_purchases WHERE product_id=? AND customer_id=?')
    .bind(id,customerId).first();
  const existing=await c.env.DB.prepare('SELECT id,rating,comment,status FROM product_reviews WHERE product_id=? AND customer_id=?')
    .bind(id,customerId).first();
  return c.json({verified:!!purchase,review:existing||null});
});
privateExtrasRoutes.post('/products/:id/reviews', async c => {
  const id=c.req.param('id'),customerId=getUser(c)!.user_id,b=await c.req.json<any>().catch(()=>null);
  if(!b || !integer(b.rating,1,5) || typeof b.comment!=='string' || b.comment.length>1500)
    return c.json({error:'Indica entre 1 y 5 estrellas y un comentario de hasta 1500 caracteres.'},400);
  const verified=await c.env.DB.prepare('SELECT id FROM verified_product_purchases WHERE product_id=? AND customer_id=?')
    .bind(id,customerId).first();
  if(!verified)return c.json({error:'Solo los compradores cuya compra fue comprobada pueden valorar el producto.'},403);
  const existing=await c.env.DB.prepare('SELECT id FROM product_reviews WHERE product_id=? AND customer_id=?')
    .bind(id,customerId).first();
  if(existing)return c.json({error:'Ya enviaste una valoración para este producto.'},409);
  const reviewId=crypto.randomUUID(),now=new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO product_reviews(id,product_id,customer_id,rating,comment,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'pending',?,?)`).bind(reviewId,id,customerId,b.rating,b.comment.trim(),now,now).run();
  return c.json({id:reviewId,message:'Valoración enviada para revisión.'},201);
});
adminExtrasRoutes.post('/products/:id/verify-purchase', async c => {
  const id=c.req.param('id'),body=await c.req.json<any>().catch(()=>null);
  const customerId=text(body?.customer_id,80),reference=text(body?.reference,200);
  if(!customerId)return c.json({error:'Introduce el ID del cliente.'},400);
  const [product,customer]=await Promise.all([
    c.env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first(),
    c.env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(customerId).first(),
  ]);
  if(!product || !customer)return c.json({error:'Producto o cliente no encontrado.'},404);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO verified_product_purchases
        (id,product_id,customer_id,verified_by,reference) VALUES (?,?,?,?,?)`)
        .bind(crypto.randomUUID(),id,customerId,getUser(c)!.user_id,reference||null),
      c.env.DB.prepare(`INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at)
        VALUES (?,?,'purchase_verified','product',?,?,?)`)
        .bind(crypto.randomUUID(),getUser(c)!.user_id,id,JSON.stringify({customer_id:customerId,reference}),new Date().toISOString()),
    ]);
  }catch(e){if(/UNIQUE|constraint/i.test(String(e)))return c.json({error:'Esta compra ya está registrada.'},409);throw e;}
  return c.json({message:'Compra registrada como verificada.'},201);
});
adminExtrasRoutes.get('/product-reviews', async c => {
  const {results}=await c.env.DB.prepare(`SELECT r.id,r.product_id,r.rating,r.comment,r.status,
    p.name AS product_name,c.name AS customer_name,r.created_at
    FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN customers c ON c.id=r.customer_id
    ORDER BY r.created_at DESC LIMIT 200`).all();
  return c.json({reviews:results||[]});
});
adminExtrasRoutes.patch('/product-reviews/:id', async c => {
  const b=await c.req.json<any>().catch(()=>null);
  if(!b || !['published','rejected','pending'].includes(b.status))
    return c.json({error:'Estado inválido.'},400);
  const result=await c.env.DB.prepare('UPDATE product_reviews SET status=?,updated_at=? WHERE id=?')
    .bind(b.status,new Date().toISOString(),c.req.param('id')).run();
  return result.meta?.changes?c.json({message:'Valoración actualizada.'}):c.notFound();
});
