import type {Env} from './types';
import {currentTelegramCustomer} from './telegram-customer-auth';
import {boundedDocument,saveRequestDocument,listRequestDocuments,ownedDocument,maxDocumentBytes,documentFormat} from './request-documents';
export function extractTelegramDocument(payload:any){
 const m=payload?.message,d=m?.document,u=payload?.update_id;
 if(!Number.isSafeInteger(u)||u<0||m?.chat?.type!=='private'||m?.from?.is_bot===true||!Number.isSafeInteger(m?.chat?.id)||m.chat.id<=0||m.from?.id!==m.chat.id||!d||typeof d.file_id!=='string'||d.file_id.length>512)return null;
 return {updateId:String(u),chatId:String(m.chat.id),fileId:d.file_id,filename:typeof d.file_name==='string'?d.file_name.slice(-180):'',size:d.file_size,caption:typeof m.caption==='string'?m.caption.trim():''};
}
export async function receiveTelegramDocument(env:Env,input:NonNullable<ReturnType<typeof extractTelegramDocument>>){
 const customer=await currentTelegramCustomer(env,input.chatId);
 if(!customer)return 'Crea o vincula tu cuenta con «Mi cuenta». Después registra tu solicitud, confirma el resumen y adjunta el archivo con la referencia que te daré. No se ha guardado este archivo.';
 const match=/^solicitud\s+([a-z0-9-]{1,128})$/i.exec(input.caption);
 if(!match)return 'Todavía no guardé el archivo. Si estás preparando una solicitud, termina y confirma el resumen primero. Si ya está registrada, reenvíalo con «solicitud REFERENCIA» (consulta «mis solicitudes»).';
 if(!Number.isSafeInteger(input.size)||input.size<1||input.size>maxDocumentBytes||!/\.(pdf|docx|xlsx)$/i.test(input.filename))return 'Solo archivos PDF, DOCX y XLSX de hasta 8 MB.';
 const requestId=match[1];
 if(!await env.DB.prepare("SELECT id FROM requests WHERE id=? AND customer_id=?").bind(requestId,customer.id).first())return 'No encuentro esa solicitud en tu cuenta.';
 if(!env.TELEGRAM_BOT_TOKEN)throw Error('Bot no configurado');
 const api='https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN;
 const response=await fetch(api+'/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:input.fileId}),signal:AbortSignal.timeout(9000)});
 const metadata=await response.json<any>();const path=metadata?.result?.file_path;
 if(!response.ok||metadata?.ok!==true||typeof path!=='string'||!/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(path)||path.startsWith('/')||path.includes('..'))return 'No se pudo validar el archivo.';
 const bytes=await boundedDocument(await fetch('https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+path,{redirect:'error',signal:AbortSignal.timeout(15000)}));
 if(!bytes||!documentFormat(input.filename,bytes))return 'Archivo inválido o formato no admitido.';
 const saved=await saveRequestDocument(env,{id:'tg-doc-'+input.updateId,requestId,customerId:customer.id,chatId:input.chatId,direction:'customer',name:input.filename,bytes});
 return saved?'Documento guardado en tu expediente '+requestId+'.':'No se pudo guardar. Comprueba tu cuenta o el máximo de 20 documentos por solicitud.';
}
export async function telegramDocuments(env:Env,chatId:string,input:string):Promise<string|null>{
 const match=/^(?:documentos solicitud|descargar documento)\s+([a-z0-9-]{1,128})$/i.exec(input.trim());
 if(!match)return null;
 const customer=await currentTelegramCustomer(env,chatId);
 if(!customer)return 'Vincula tu cuenta con «Mi cuenta».';
 if(/^documentos solicitud/i.test(input)){
 const docs=await listRequestDocuments(env,match[1],customer.id);
 return docs.length?docs.map(d=>d.filename+'\nReferencia: '+d.id).join('\n\n')+'\n\nEscribe «descargar documento REFERENCIA».':'No hay documentos disponibles para esa referencia.';
 }
 const file=await ownedDocument(env,match[1],customer.id);
 if(!file)return 'No encuentro ese documento en tu cuenta.';
 const object=await env.BUCKET.get(file.r2_key);
 if(!object||!env.TELEGRAM_BOT_TOKEN||object.size>maxDocumentBytes)return 'Documento no disponible.';
 // Recheck immediately before sending; the bot never accepts an arbitrary destination.
 const active=await currentTelegramCustomer(env,chatId);if(active?.id!==customer.id)return 'Vinculación no disponible.';
 const form=new FormData();form.append('chat_id',chatId);
 form.append('document',new Blob([await object.arrayBuffer()],{type:'application/octet-stream'}),file.filename);
 const sent=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendDocument',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
 if(!sent.ok||(await sent.json<any>())?.ok!==true)throw Error('No se pudo enviar el documento');
 return 'Documento enviado. Abre únicamente archivos de confianza.';
}
