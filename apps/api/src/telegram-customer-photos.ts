/** Private Telegram photos. Explicit request reference in caption, never infer case. */
import type {Env} from './types';
import {currentTelegramCustomer} from './telegram-customer-auth';
const maxBytes=8*1024*1024;
export type TelegramPhoto={updateId:string;chatId:string;fileId:string;caption:string;size:number};
export function extractTelegramPhoto(payload:any):TelegramPhoto|null{
 const m=payload?.message,u=payload?.update_id;
 if(!Number.isSafeInteger(u)||u<0||m?.chat?.type!=='private'||m?.from?.is_bot===true||
 !Number.isSafeInteger(m?.chat?.id)||m.chat.id<=0||m.from?.id!==m.chat.id||!Array.isArray(m.photo))return null;
 const photos=m.photo.filter((p:any)=>typeof p?.file_id==='string'&&p.file_id.length<=512&&Number.isSafeInteger(p.file_size)&&p.file_size>0&&p.file_size<=maxBytes);
 const best=photos.sort((a:any,b:any)=>b.file_size-a.file_size)[0];
 if(!best)return null;
 return {updateId:String(u),chatId:String(m.chat.id),fileId:best.file_id,caption:typeof m.caption==='string'?m.caption.trim().slice(0,1024):'',size:best.file_size};
}
export async function receiveTelegramPhoto(env:Env,input:TelegramPhoto):Promise<string>{
 const customer=await currentTelegramCustomer(env,input.chatId);
 if(!customer)return 'Tu solicitud por teléfono puede seguir registrada. Para adjuntar fotos y consultar el expediente desde Telegram, crea o vincula tu cuenta con «Mi cuenta». Después reenvía la foto con «solicitud REFERENCIA». No se ha guardado esta foto.';
 const match=/^solicitud\s+([a-z0-9-]{1,128})$/i.exec(input.caption);
 if(!match)return 'Todavía no guardé esta foto. Termina y confirma tu solicitud o consulta «mis solicitudes». Después reenvíala con el texto «solicitud REFERENCIA» para incorporarla al expediente correcto.';
 const requestId=match[1],imageId='tg-photo-'+input.updateId;
 const owner=await env.DB.prepare("SELECT r.id FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1 AND r.status NOT IN ('cancelled','completed')")
 .bind(requestId,customer.id,input.chatId).first();
 if(!owner)return 'No encuentro una solicitud abierta con esa referencia en tu cuenta.';
 const existing=await env.DB.prepare('SELECT id FROM request_images WHERE id=? AND request_id=? AND customer_id=?').bind(imageId,requestId,customer.id).first();
 if(existing)return 'Fotografía ya guardada en tu expediente.';
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM request_images WHERE request_id=?').bind(requestId).first<{n:number}>();
 if((count?.n||0)>=5)return 'Tu solicitud ya tiene cinco fotografías. Contacta al equipo si necesitas añadir más.';
 if(!env.TELEGRAM_BOT_TOKEN)throw Error('Telegram no configurado');
 const api='https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN;
 const info=await fetch(api+'/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:input.fileId}),signal:AbortSignal.timeout(9000)});
 if(!info.ok)throw Error('Telegram no devolvió el archivo');
 const metadata=await info.json<any>();
 const path=metadata?.result?.file_path;
 // Telegram-generated path, never a URL supplied by the customer.
 if(metadata?.ok!==true||typeof path!=='string'||!/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(path)||path.startsWith('/')||path.includes('..')||Number(metadata.result.file_size)>maxBytes)
 return 'No se pudo validar la fotografía.';
 const response=await fetch('https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+path,{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok||!response.body)throw Error('No se pudo descargar la fotografía');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();return 'La fotografía supera 8 MB.';}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 if(length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return 'Envía una fotografía JPEG válida.';
 const key='requests/'+requestId+'/'+crypto.randomUUID()+'.jpg';
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 try{
 const saved=await env.DB.prepare("INSERT INTO request_images(id,request_id,customer_id,r2_key,content_type) "+
 "SELECT ?,r.id,c.id,?,'image/jpeg' FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1 "+
 "AND r.status NOT IN ('cancelled','completed') AND (SELECT COUNT(*) FROM request_images WHERE request_id=r.id)<5 ON CONFLICT(id) DO NOTHING")
 .bind(imageId,key,requestId,customer.id,input.chatId).run();
 if(!saved.meta?.changes){await env.BUCKET.delete(key);const prior=await env.DB.prepare('SELECT id FROM request_images WHERE id=? AND request_id=? AND customer_id=?').bind(imageId,requestId,customer.id).first();return prior?'Fotografía ya guardada.':'No se pudo añadir la fotografía. Revisa el estado o el límite de archivos.';}
 }catch(e){await env.BUCKET.delete(key).catch(()=>{});throw e;}
 return 'Fotografía guardada en tu solicitud '+requestId+'. El equipo podrá verla desde el expediente.';
}
