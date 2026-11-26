// Local report/output capability. No credentials, remote upload, or executable preview.
export const MAX_REPORT_HTML=30*1024*1024;
export const MAX_OUTPUT_BYTES=280*1024*1024;
export type PreviewRequest={kind:'preview';name:string;html:string;document:string;approved:boolean;intent:'preview'|'print'|'pdf'};
export type DownloadRequest={kind:'download';name:string;bytes:Uint8Array;mime:string};
export type OutputRequest=PreviewRequest|DownloadRequest;
export type OutputResult={opened?:boolean;approved?:boolean;state?:'requested'|'cancelled'};
export function safeOutputName(name:unknown):string{
 if(typeof name!=='string'||!name.trim()||name.length>180||/[\\/:*?"<>|\x00-\x1f]/.test(name)||name==='.'||name==='..')throw Error('Nombre de archivo inválido.');
 return name;
}
export function staticReport(html:string):string{
 // The detached template is inert, including during parsing. Never insert report HTML in the host DOM.
 const t=document.createElement('template');t.innerHTML=html;
 for(const el of t.content.querySelectorAll('script,iframe,frame,frameset,object,embed,link,meta,base,form,button,input,select,textarea,audio,video,source,template,portal,foreignObject,.r-no-print'))el.remove();
 for(const el of t.content.querySelectorAll('*')){
  for(const attr of Array.from(el.attributes)){
   const name=attr.name.toLowerCase();
   if(name.startsWith('on')||['href','xlink:href','srcset','action','formaction','ping','poster','background','autofocus','contenteditable','tabindex'].includes(name)||(name==='src'&&!(el.tagName.toLowerCase()==='img'&&/^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(attr.value))))el.removeAttribute(attr.name);
  }
 }
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; object-src \'none\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'+t.innerHTML+'</body></html>';
}
export function outputRequest(action:string,payload:any):OutputRequest{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Solicitud de archivo inválida.');
 if(action==='preview'){
  const {html,options}=payload;
  if(typeof html!=='string'||!html.trim()||new TextEncoder().encode(html).byteLength>MAX_REPORT_HTML)throw Error('Informe vacío o superior a 30 MiB.');
  if(!options||typeof options!=='object'||!['preview','print','pdf'].includes(options.intent)||typeof options.approved!=='boolean')throw Error('Opciones de informe inválidas.');
  return {kind:'preview',name:safeOutputName(options.name||'EV-Pro-Studio-informe'),html,document:staticReport(html),approved:options.approved,intent:options.intent};
 }
 if(action==='save-file'){
  const {name,bytes,mime}=payload;
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_OUTPUT_BYTES)throw Error('Archivo vacío o superior a 280 MiB.');
  return {kind:'download',name:safeOutputName(name),bytes,mime:typeof mime==='string'&&/^[a-z0-9.+/-]+(?:;charset=utf-8)?$/i.test(mime)?mime:'application/octet-stream'};
 }
 throw Error('Operación de archivo no permitida.');
}
export function requestDownload(name:string,bytes:Uint8Array,mime:string):void{
 // User clicks the explicit save button in the authenticated top-level web app.
 const blob=new Blob([bytes.slice().buffer as ArrayBuffer],{type:mime});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeOutputName(name);document.body.append(a);
 try{a.click()}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
}
