/** Private case documents; never serve inline or feed untrusted content into the assistant. */
import type {Env} from './types';
export const maxDocumentBytes=8*1024*1024;
const formats:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function documentFormat(name:unknown,bytes:Uint8Array){
 if(typeof name!=='string'||bytes.length<5||bytes.length>maxDocumentBytes)return null;
 const filename=name.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g,'_').trim().slice(-120);
 const ext=filename.split('.').pop()?.toLowerCase()||'';
 if(!Object.prototype.hasOwnProperty.call(formats,ext))return null;
 const valid=ext==='pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4;
 return valid?{filename,contentType:formats[ext]}:null;
}
export async function boundedDocument(response:Response):Promise<Uint8Array|null>{
 if(!response.ok||!response.body)return null;
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxDocumentBytes){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function saveRequestDocument(env:Env,input:{id:string;requestId:string;customerId:string;chatId?:string;direction:'customer'|'staff';name:string;bytes:Uint8Array}):Promise<boolean>{
 const format=documentFormat(input.name,input.bytes);if(!format)return false;
 const old=await env.DB.prepare("SELECT id FROM request_documents WHERE id=? AND request_id=? AND customer_id=?").bind(input.id,input.requestId,input.customerId).first();
 if(old)return true;
 const key='private-documents/'+crypto.randomUUID();
 await env.BUCKET.put(key,input.bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{
 const result=await env.DB.prepare("INSERT INTO request_documents(id,request_id,customer_id,r2_key,filename,content_type,size_bytes,direction,created_at) "+
 "SELECT ?,r.id,c.id,?,?,?,?,?,? FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.is_active=1 "+
 "AND (? IS NULL OR c.telegram_customer_chat_id=?) AND (SELECT COUNT(*) FROM request_documents d WHERE d.request_id=r.id)<20 ON CONFLICT(id) DO NOTHING")
 .bind(input.id,key,format.filename,format.contentType,input.bytes.length,input.direction,new Date().toISOString(),input.requestId,input.customerId,input.chatId??null,input.chatId??null).run();
 if(result.meta?.changes)return true;
 await env.BUCKET.delete(key);
 return !!await env.DB.prepare("SELECT id FROM request_documents WHERE id=? AND request_id=? AND customer_id=?").bind(input.id,input.requestId,input.customerId).first();
 }catch(e){await env.BUCKET.delete(key).catch(()=>{});throw e;}
}
export async function listRequestDocuments(env:Env,requestId:string,customerId:string){
 const {results}=await env.DB.prepare("SELECT d.id,d.filename,d.content_type,d.size_bytes,d.direction,d.created_at FROM request_documents d JOIN requests r ON r.id=d.request_id JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND d.customer_id=c.id AND c.is_active=1 ORDER BY d.created_at DESC LIMIT 20").bind(requestId,customerId).all<{id:string;filename:string;content_type:string;size_bytes:number;direction:string;created_at:string}>();
 return results||[];
}
export async function ownedDocument(env:Env,id:string,customerId:string){
 return env.DB.prepare("SELECT d.r2_key,d.filename,d.content_type,d.size_bytes FROM request_documents d JOIN requests r ON r.id=d.request_id JOIN customers c ON c.id=r.customer_id WHERE d.id=? AND c.id=? AND d.customer_id=c.id AND c.is_active=1").bind(id,customerId).first<{r2_key:string;filename:string;content_type:string;size_bytes:number}>();
}
