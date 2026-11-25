<script lang="ts">
 import {onMount,onDestroy,tick} from 'svelte';
 import {apiRequest,ADMIN_TOKEN_KEY} from '../lib/api';
 import {transport} from '../lib/engineering-assets.js';
 let {token,autoOpen=true}:{token:string;autoOpen?:boolean}=$props();
 let frame:HTMLIFrameElement|undefined=$state(),dialog:HTMLDialogElement|undefined=$state(),opened=$state(false),busy=$state(false),error=$state(''),workspaceError=$state('');
 let port:MessagePort|null=null,epoch=0,loads=0,operations=$state(0),firstRead:any=null,connected=false,closePending=$state(false);
 const route='/api/studio/v1/engineering';
 type EngineeringRequest=(method:string,suffix:string,payload?:unknown)=>Promise<any>;
 const auth=()=>({Authorization:'Bearer '+token});
 function close(){
  epoch++;port?.close();port=null;connected=false;firstRead=null;opened=false;loads=0;operations=0;closePending=false;
  if(dialog?.open)dialog.close();
 }
 function requestClose(){
  if(operations){workspaceError='Hay una lectura o guardado en curso. Espera su confirmación antes de cerrar.';return}
  if(port){closePending=true;port.postMessage({type:'check-close'});return}
  close();
 }
 function requestFor(current:number,requireOpen:boolean):EngineeringRequest{
  return async(method,suffix,payload)=>{
   if(current!==epoch||(requireOpen&&!opened)||!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token)throw Object.assign(new Error('La sesión de Bonaire cambió. Vuelve a abrir Studio.'),{status:401});
   if(!(['/manifest','/assets/check'].includes(suffix)||/^\/assets\/[a-f0-9]{64}$/.test(suffix)))throw Error('Ruta de ingeniería inválida');
   return apiRequest(route+suffix,{method,headers:auth(),cache:'no-store',...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  };
 }
 async function open(){
  if(busy||opened)return;busy=true;error='';workspaceError='';const run=++epoch;
  try{
   // Resolve the real manifest and attachments before opening the renderer.
   // Failure is shown in Bonaire, not disguised as damaged local encryption.
   const result=await transport(requestFor(run,false))('GET');
   if(run!==epoch)return;
   if(!result||!Object.hasOwn(result,'snapshot')||typeof result.rev!=='string')throw Error('Respuesta de ingeniería online inválida');
   firstRead=result;loads=0;connected=false;opened=true;
   await tick();if(run!==epoch)return;dialog?.showModal();
  }catch(e){if(run===epoch){opened=false;error=(e as Error).message||'Ingeniería online todavía no disponible.'}}
  finally{if(run===epoch)busy=false}
 }
 function loaded(){
  if(!opened)return;
  if(++loads!==1){close();error='La ventana cambió de documento. Vuelve a abrir Studio.'}
 }
 function connect(event:MessageEvent){
  if(!opened||connected||!frame?.contentWindow||event.source!==frame.contentWindow||event.origin!=='null'||event.data?.type!=='evpro-engineering-ready-v2')return;
  // Sandboxed opaque origin: source identity is mandatory; credentials never
  // leave this parent. The child explicitly signals its listener is ready.
  const current=epoch,channel=new MessageChannel();
  connected=true;port=channel.port1;
  channel.port1.onmessage=async(event)=>{
   const data=event.data;
   if(current!==epoch||!opened||!data)return;
   if(data.type==='close-state'&&closePending){
    closePending=false;
    if(data.pending===false){close();return}
    workspaceError='Hay cambios sin confirmar. Guárdalos o descarga un respaldo antes de salir.';
    return;
   }
   if(!Number.isSafeInteger(data.id)||!['read','write'].includes(data.action))return;
   const reply=(v:Record<string,unknown>)=>{if(current===epoch&&opened)channel.port1.postMessage({id:data.id,...v})};
   operations++;workspaceError='';
   try{
    if(!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token)throw Object.assign(new Error('Sesión de Bonaire cambiada. Cierra y abre Studio.'),{status:401});
    const sync=transport(requestFor(current,true));
    let result;
    if(data.action==='read'&&firstRead!==null){result=firstRead;firstRead=null}
    else result=await sync(data.action==='read'?'GET':'PUT',data.payload);
    reply({ok:true,result});
   }catch(e){const err=e as Error&{status?:number};workspaceError=err.message;reply({ok:false,error:err.message,status:err.status||0})}
   finally{if(current===epoch)operations--}
  };
  channel.port1.start();
  frame.contentWindow.postMessage({type:'evpro-engineering-connect-v1'},'*',[channel.port2]);
 }
 onMount(()=>{window.addEventListener('message',connect);if(autoOpen)void open();return()=>window.removeEventListener('message',connect)});
 onDestroy(close);
</script>
<section class="rounded-2xl border bg-white p-4 space-y-3" aria-label="Ingeniería EV Pro original online">
 <div class="flex items-center justify-between flex-wrap gap-3">
  <div><h3 class="text-xl font-extrabold">EV Pro · Ingeniería completa</h3>
   <p class="text-sm text-slate-500">Abre el espacio de ingeniería original en pantalla completa. Guardado privado en línea.</p></div>
  <button type="button" class="rounded-xl bg-teal-800 text-white px-4 py-3 font-semibold disabled:opacity-50" disabled={busy||opened} onclick={open}>{busy?'Abriendo ingeniería…':'Abrir EV Pro Online'}</button>
 </div>
 {#if error}<p role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>{/if}
 {#if opened}
  <dialog bind:this={dialog} aria-label="EV Pro Studio a pantalla completa" class="ev-workspace" oncancel={e=>{e.preventDefault();requestClose()}}>
   <div class="ev-layout">
    <header class="flex items-center justify-between gap-3 bg-slate-900 text-white px-4 py-2 shrink-0">
     <div class="flex items-center gap-3 min-w-0"><strong class="truncate">EV Pro Studio</strong><span class="hidden sm:inline text-xs text-teal-200">Ingeniería online · Bonaire</span></div>
     <button type="button" class="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={operations>0||closePending} onclick={requestClose}>{closePending?'Verificando guardado…':'← Volver a Bonaire'}</button>
    </header>
    {#if workspaceError}<div role="alert" class="bg-amber-50 text-amber-900 px-4 py-2 text-sm flex items-center gap-3"><span class="flex-1">{workspaceError}</span><button type="button" onclick={()=>workspaceError=''}>Cerrar aviso</button></div>{/if}
    <iframe bind:this={frame} onload={loaded} title="EV Pro Ingeniería original" src="/studio-engineering/index.html" sandbox="allow-scripts allow-downloads allow-modals" referrerpolicy="no-referrer"></iframe>
   </div>
  </dialog>
 {/if}
</section>
<style>
 .ev-workspace{position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100dvh;max-width:none;max-height:none;overflow:hidden;background:#eff4f3}
 .ev-workspace::backdrop{background:#0f172a}
 .ev-layout{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}
 .ev-layout iframe{display:block;width:100%;flex:1;min-height:0;border:0}
</style>
