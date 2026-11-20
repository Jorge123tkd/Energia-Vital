import {Hono} from 'hono';
import type {Env} from '../types';
import {requireCustomerAuth,requireStaffAuth,getUser} from '../middleware';
import {listRequestDocuments,ownedDocument,saveRequestDocument,maxDocumentBytes,documentFormat} from '../request-documents';

export const customerDocumentRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
export const staffDocumentRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
customerDocumentRoutes.use('*',requireCustomerAuth);
staffDocumentRoutes.use('*',requireStaffAuth);
function attachment(object:R2ObjectBody,filename:string){
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+filename.replace(/[^a-zA-Z0-9._ -]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
for(const [router,direction] of [[customerDocumentRoutes,'customer'],[staffDocumentRoutes,'staff']] as const){
 const owner=async(env:Env,id:string,userId:string)=>env.DB.prepare("SELECT r.customer_id FROM requests r JOIN customers cu ON cu.id=r.customer_id WHERE r.id=? AND cu.is_active=1 AND (?='staff' OR r.customer_id=?)")
 .bind(id,direction,userId).first<{customer_id:string}>();
 router.get('/requests/:id',async c=>{
  const request=await owner(c.env,c.req.param('id'),getUser(c)!.user_id);
  if(!request)return c.notFound();
  return c.json({documents:await listRequestDocuments(c.env,c.req.param('id'),request.customer_id)});
 });
 router.post('/requests/:id',async c=>{
  const request=await owner(c.env,c.req.param('id'),getUser(c)!.user_id);
  if(!request)return c.notFound();
  const length=Number(c.req.header('content-length')||0);
  if(!Number.isFinite(length)||length>maxDocumentBytes+65536)return c.json({error:'Archivo demasiado grande.'},413);
  // Enforce the real stream length even without Content-Length.
  const raw=c.req.raw.body;
  if(!raw)return c.json({error:'Adjunta un documento.'},400);
  const reader=raw.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.length;
      if(total>maxDocumentBytes+65536){await reader.cancel();return c.json({error:'Archivo demasiado grande.'},413);}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const buffer=new Uint8Array(total);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const body=await new Response(buffer,{headers:{'Content-Type':c.req.header('content-type')||''}}).formData().catch(()=>null);
  // Workers' FormData declarations may type get() as string, even for a runtime File.
  const file:unknown=body?.get('file');
  if(!(file instanceof File)||file.size>maxDocumentBytes||file.size<=0)return c.json({error:'Adjunta PDF, DOCX o XLSX de hasta 8 MB.'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!documentFormat(file.name,bytes))return c.json({error:'Formato no admitido.'},400);
  const id=crypto.randomUUID();
  if(!await saveRequestDocument(c.env,{id,requestId:c.req.param('id'),customerId:request.customer_id,direction,name:file.name,bytes}))
   return c.json({error:'No se pudo guardar el documento o se alcanzó el límite.'},409);
  return c.json({id},201);
 });
 router.get('/files/:id',async c=>{
  const customerId=direction==='customer'?getUser(c)!.user_id:(await c.env.DB.prepare("SELECT customer_id FROM request_documents WHERE id=?").bind(c.req.param('id')).first<{customer_id:string}>())?.customer_id;
  if(!customerId)return c.notFound();
  const file=await ownedDocument(c.env,c.req.param('id'),customerId);
  if(!file)return c.notFound();
  const object=await c.env.BUCKET.get(file.r2_key);
  return object?attachment(object,file.filename):c.notFound();
 });
}
