<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {requestDownload,type OutputRequest,type OutputResult} from '../lib/studio-report-output';
 let {request,onFinish,pdfStatus,pdfRender}:{request:OutputRequest;onFinish:(result:OutputResult)=>void;pdfStatus?:()=>Promise<boolean>;pdfRender?:(html:string)=>Promise<Uint8Array>}=$props();
 let approved=$state(false),ready=$state(false),error=$state(''),notice=$state('');
 let reportFrame:HTMLIFrameElement|undefined=$state(),closeButton:HTMLButtonElement|undefined=$state();
 let pdfAvailable=$state(false),pdfBusy=$state(false);let active=true;
 onDestroy(()=>{active=false});
 onMount(()=>{if(request.kind==='preview'){approved=request.approved;void pdfStatus?.().then(value=>{if(active)pdfAvailable=value}).catch(()=>{})}closeButton?.focus()});
 async function savePDF(){
  if(request.kind!=='preview'||!approved||!pdfAvailable||!pdfRender||pdfBusy)return;
  pdfBusy=true;error='';notice='';
  try{const bytes=await pdfRender(request.html);if(!active)return;requestDownload(request.name+'.pdf',bytes,'application/pdf');notice='Descarga PDF solicitada. Comprueba la carpeta de descargas.'}
  catch(e){if(active)error=(e as Error).message||'No se pudo generar el PDF. Puedes imprimir o guardar PDF desde el navegador.'}
  finally{if(active)pdfBusy=false}
 }
 function printReport(){
  if(request.kind!=='preview'||!approved||!ready)return;
  try{const w=reportFrame?.contentWindow;if(!w)throw Error('La vista previa todavía no está lista.');w.focus();w.print();notice='Diálogo de impresión solicitado. Elige impresora o Guardar como PDF.';error=''}
  catch(e){error=(e as Error).message||'El navegador no pudo abrir la impresión. Descarga el HTML y ábrelo para imprimir.'}
 }
 function saveHTML(){
  if(request.kind!=='preview'||!approved)return;
  try{requestDownload(request.name+'.html',new TextEncoder().encode(request.html),'text/html;charset=utf-8');notice='Descarga HTML solicitada. Comprueba la carpeta de descargas.';error=''}catch(e){error=(e as Error).message}
 }
 function saveFile(){
  if(request.kind!=='download')return;
  try{requestDownload(request.name,request.bytes,request.mime);onFinish({state:'requested'})}catch(e){error=(e as Error).message}
 }
 function close(){onFinish(request.kind==='preview'?{opened:true,approved}:{state:'cancelled'})}
</script>
<div class="output-overlay" role="dialog" aria-modal="true" aria-label={request.kind==='preview'?'Vista previa de informe':'Guardar archivo'}>
 <header>
  <div><strong>{request.kind==='preview'?'Vista previa · '+request.name:'Guardar archivo'}</strong><p>{request.kind==='preview'?'Revisa el informe antes de imprimir o entregar.':'Confirma la descarga desde Bonaire.'}</p></div>
  <button bind:this={closeButton} type="button" onclick={close}>Cerrar / volver</button>
 </header>
 {#if request.kind==='preview'}
  <div class="output-actions">
   <label><input type="checkbox" disabled={pdfBusy} bind:checked={approved}/> He revisado y autorizo los textos e imágenes de esta entrega.</label>
   <div class="buttons">
    <button type="button" class="primary" disabled={!approved||!ready} onclick={printReport}>Imprimir / guardar PDF</button>
    {#if pdfAvailable}<button type="button" disabled={!approved||!ready||pdfBusy} onclick={savePDF}>{pdfBusy?'Generando PDF…':'Descargar PDF directo'}</button>{/if}
    <button type="button" disabled={!approved} onclick={saveHTML}>Descargar HTML</button>
    <button type="button" disabled={!approved} onclick={close}>Confirmar revisión y volver</button>
   </div>
   <p>Para obtener el PDF, selecciona «Guardar como PDF» en el diálogo de impresión del navegador.</p>
  </div>
  <iframe bind:this={reportFrame} title="Documento de informe sin scripts" sandbox="allow-same-origin allow-modals" referrerpolicy="no-referrer" srcdoc={request.document} onload={()=>ready=true}></iframe>
 {:else}
  <div class="file-confirm">
   <h2>{request.name}</h2>
   <p>{(request.bytes.byteLength/1024/1024).toFixed(2)} MiB. El navegador administra el destino de descarga.</p>
   <button type="button" class="primary" onclick={saveFile}>Descargar archivo</button>
   <button type="button" onclick={close}>Cancelar</button>
  </div>
 {/if}
 {#if notice}<p class="message" role="status">{notice}</p>{/if}
 {#if error}<p class="message error" role="alert">{error}</p>{/if}
</div>
<style>
 .output-overlay{position:absolute;inset:0;z-index:20;background:#f1f6f5;display:flex;flex-direction:column;overflow:hidden;color:#173840}
 header,.output-actions{padding:12px 20px;background:white;border-bottom:1px solid #d9e5e4}
 header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
 header p,.output-actions p{margin:3px 0;font-size:13px;color:#526d75}
 .output-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
 .output-actions label{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
 .buttons{display:flex;gap:8px;flex-wrap:wrap}
 button{border:1px solid #c3d4d3;background:white;color:#173840;border-radius:7px;padding:8px 12px;font-weight:600;font-size:14px}
 button.primary{background:#08685c;color:white;border-color:#08685c}
 button:disabled{opacity:.45;cursor:not-allowed}
 iframe{flex:1;min-height:0;width:100%;border:0;background:white}
 .file-confirm{max-width:620px;margin:auto;padding:26px;background:white;border:1px solid #d9e5e4;border-radius:12px;overflow-wrap:anywhere}
 .file-confirm h2{font-size:20px}.file-confirm p{margin:12px 0}
 .message{padding:10px 20px;background:#e0f2f1}.error{background:#fff2d6;color:#93421c}
 @media(max-width:650px){header,.output-actions{padding:8px 12px}.output-actions{gap:6px}.file-confirm{margin:20px}}
</style>
