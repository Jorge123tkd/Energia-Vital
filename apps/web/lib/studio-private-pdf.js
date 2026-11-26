// Optional private PDF rendering. No browser token is exposed to the client.
const LIMIT=12*1024*1024, PDF_LIMIT=20*1024*1024;
const account='466af6f26fce494d6dc640128e200e24';
const jsonHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:jsonHeaders});
export function pdfEnabled(env){return env?.STUDIO_PDF_ENABLED==='true'&&typeof env.STUDIO_PDF_TOKEN==='string'&&env.STUDIO_PDF_TOKEN.length>20}
async function limitedBytes(stream,limit){
 if(!stream)throw Error('empty');
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('limit')}chunks.push(value)}}finally{reader.releaseLock()}
 const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}return out;
}
export async function renderStudioPdf(request,env,transport=fetch){
 if(!pdfEnabled(env))return reply({error:'Generador PDF web todavía no habilitado.'},503);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply({error:'Formato inválido'},400);
 if(Number(request.headers.get('content-length')||0)>LIMIT)return reply({error:'Informe demasiado grande'},413);
 let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await limitedBytes(request.body,LIMIT)))}catch{return reply({error:'Informe inválido o demasiado grande'},400)}
 if(!input||Object.keys(input).join(',')!=='html'||typeof input.html!=='string'||!input.html.trim())return reply({error:'Informe inválido'},400);
 // HTML is supplied by the authenticated report renderer, never a URL.
 // Disable scripts and reject all non-data network requests even for old reports.
 const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; object-src \'none\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">';
 const html=/<head(?:\s[^>]*)?>/i.test(input.html)?input.html.replace(/<head(?:\s[^>]*)?>/i,m=>m+csp):csp+input.html;
 try{
 const result=await transport('https://api.cloudflare.com/client/v4/accounts/'+account+'/browser-rendering/pdf',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.STUDIO_PDF_TOKEN,'Content-Type':'application/json'},signal:AbortSignal.timeout(95000),body:JSON.stringify({html,setJavaScriptEnabled:false,rejectRequestPattern:['^(?!data:|about:blank$).*'],rejectResourceTypes:['script','xhr','fetch','websocket','media','ping'],actionTimeout:60000,pdfOptions:{printBackground:true,preferCSSPageSize:true,format:'a4'}})});
 if(!result.ok)return reply({error:result.status===429?'Límite temporal del generador PDF. Intenta nuevamente.':'Cloudflare no confirmó el PDF.'},result.status===429?429:502);
 const bytes=await limitedBytes(result.body,PDF_LIMIT);if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return reply({error:'Respuesta PDF inválida'},502);
 let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return reply({pdf:btoa(binary)});
 }catch{return reply({error:'No se pudo generar el PDF dentro de los límites establecidos.'},503)}
}
