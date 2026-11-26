<script lang="ts">
 import {onMount,onDestroy,type Snippet} from 'svelte';
 import {apiRequest,ADMIN_TOKEN_KEY} from '../lib/api';
 import {transport} from '../lib/engineering-assets.js';
 import {STUDIO_RELEASE} from '../lib/studio-release';
 let {token,business,onExit,onLogout,account}:{token:string;business:Snippet<[string]>;onExit:()=>void;onLogout:()=>Promise<void>;account:{email:string;role:string}}=$props();
 let frame:HTMLIFrameElement|undefined=$state(),opened=$state(false),busy=$state(false),error=$state(''),workspaceError=$state('');
 let port:MessagePort|null=null,epoch=0,loads=0,operations=$state(0),firstRead:any=null,connected=false,closePending=$state(false);
 let section=$state('engineering');
 let closeAction:'exit'|'logout'='exit',closeTimer:ReturnType<typeof setTimeout>|undefined;
 function finishClose(){const action=closeAction;close();if(action==='logout')void onLogout();else onExit()}
 const names:Record<string,string>={catalog:'Catálogo comercial',team:'Colaboración y permisos',inventory:'Almacén y compras',finance:'Finanzas y compromisos',backup:'Copias de secciones compartidas',publication:'Publicaciones comerciales'};
 const route='/api/studio/v1/engineering';
 type EngineeringRequest=(method:string,suffix:string,payload?:unknown)=>Promise<any>;
 const auth=()=>({Authorization:'Bearer '+token});
 function close(){
  clearTimeout(closeTimer);epoch++;port?.close();port=null;connected=false;firstRead=null;opened=false;loads=0;operations=0;closePending=false;
  section='engineering';
 }
 function requestClose(action:'exit'|'logout'='exit'){
  if(closePending)return;closeAction=action;
  if(operations){workspaceError='Hay una lectura o guardado en curso. Espera su confirmación antes de cerrar.';return}
  if(port){closePending=true;port.postMessage({type:'check-close'});closeTimer=setTimeout(()=>{closePending=false;workspaceError='No se pudo verificar el guardado. Intenta de nuevo.'},8000);return}
  finishClose();
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

  }catch(e){if(run===epoch){opened=false;error=(e as Error).message||'Ingeniería online todavía no disponible.'}}
  finally{if(run===epoch)busy=false}
 }
 function loaded(){
  if(!opened)return;
  if(++loads!==1){close();error='La ventana cambió de documento. Vuelve a abrir Studio.'}
 }
 function connect(event:MessageEvent){
  if(!opened||connected||!frame?.contentWindow||event.source!==frame.contentWindow||event.origin!=='null'||event.data?.type!=='evpro-engineering-ready-v2')return;
  if(!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token||!account.email||!['admin','worker'].includes(account.role)){workspaceError='No se confirmó la identidad de Bonaire. Vuelve a iniciar sesión.';return}
  // Sandboxed opaque origin: source identity is mandatory; credentials never
  // leave this parent. The child explicitly signals its listener is ready.
  const current=epoch,channel=new MessageChannel();
  connected=true;port=channel.port1;
  channel.port1.onmessage=async(event)=>{
   const data=event.data;
   if(current!==epoch||!opened||!data)return;
   if(data.type==='close-state'&&closePending){
    clearTimeout(closeTimer);closePending=false;
    if(data.pending===false){finishClose();return}
    workspaceError='Hay cambios sin confirmar. Guárdalos o descarga un respaldo antes de salir.';
    return;
   }
   if(data.type==='studio-navigation'){
    if(data.section==='exit'||data.section==='logout'){requestClose(data.section);return}
    if(data.section==='engineering'||Object.hasOwn(names,data.section)){section=data.section;workspaceError=''}
    return;
   }
   if(!Number.isSafeInteger(data.id)||!['read','write','account'].includes(data.action))return;
   const reply=(v:Record<string,unknown>)=>{if(current===epoch&&opened)channel.port1.postMessage({id:data.id,...v})};
   operations++;workspaceError='';
   try{
    if(!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token)throw Object.assign(new Error('Sesión de Bonaire cambiada. Cierra y abre Studio.'),{status:401});
    if(data.action==='account'){reply({ok:true,result:{email:account.email,role:account.role,mode:'online',platform:'web',version:STUDIO_RELEASE}});return}
    const sync=transport(requestFor(current,true));
    let result;
    if(data.action==='read'&&firstRead!==null){result=firstRead;firstRead=null}
    else result=await sync(data.action==='read'?'GET':'PUT',data.payload);
    reply({ok:true,result});
   }catch(e){const err=e as Error&{status?:number};workspaceError=err.message;reply({ok:false,error:err.message,status:err.status||0})}
   finally{if(current===epoch)operations--}
  };
  channel.port1.start();
  frame.contentWindow.postMessage({type:'evpro-engineering-connect-v1',account:{email:account.email,role:account.role}},'*',[channel.port2]);
 }
 onMount(()=>{window.addEventListener('message',connect);void open();return()=>window.removeEventListener('message',connect)});
 onDestroy(close);
</script>
<div class="ev-workspace" aria-label="EV Pro Studio">
 {#if opened}
  <iframe bind:this={frame} onload={loaded} title="EV Pro Ingeniería original" src="/studio-engineering/index.html?v=studio-3.9.0-beta.8" sandbox="allow-scripts allow-downloads allow-modals" referrerpolicy="no-referrer"></iframe>
  {#if section!=='engineering'}
    <section class="ev-business" aria-label={names[section]}>
      <header class="ev-business-header"><span>Studio / {names[section]}</span><div class="flex flex-wrap gap-2"><button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={()=>section='engineering'}>Volver a ingeniería</button><button type="button" class="rounded-lg border px-3 py-2 text-sm" disabled={operations>0||closePending} onclick={()=>requestClose('exit')}>Volver a Bonaire</button><span class="text-xs">{account.email}</span><button type="button" class="rounded-lg border px-3 py-2 text-sm" disabled={operations>0||closePending} onclick={()=>requestClose('logout')}>Cerrar sesión</button></div></header>
      <main class="ev-business-main"><h1 class="text-2xl sm:text-3xl font-bold mb-5">{names[section]}</h1>{@render business(section)}</main>
    </section>
  {/if}
  {#if workspaceError}<div role="alert" class="ev-error bg-amber-50 text-amber-900 px-4 py-2 text-sm flex items-center gap-3"><span class="flex-1">{workspaceError}</span><button type="button" onclick={()=>workspaceError=''}>Cerrar aviso</button></div>{/if}
  {#if closePending}<div role="status" class="ev-error bg-white p-3">Verificando guardado…</div>{/if}
 {:else}
  <div class="grid h-full place-items-center p-5"><section class="w-full max-w-lg border rounded-xl bg-white p-6 space-y-4"><h1 class="text-2xl font-bold">EV Pro Studio</h1>{#if error}<p role="alert" class="text-amber-900">{error}</p><button type="button" class="border rounded-lg px-3 py-2" disabled={busy} onclick={open}>Reintentar conexión</button>{:else}<p role="status">Cargando tu espacio de ingeniería…</p>{/if}<button type="button" class="border rounded-lg px-3 py-2" onclick={()=>requestClose('exit')}>Volver a Bonaire</button><button type="button" class="border rounded-lg px-3 py-2" onclick={()=>requestClose('logout')}>Cerrar sesión</button></section></div>
 {/if}
</div>
<style>
 .ev-workspace{position:fixed;inset:0;width:100%;height:100dvh;overflow:hidden;background:#f1f6f5;color:#18323a;z-index:100}
 .ev-workspace iframe{display:block;width:100%;height:100%;border:0}
 .ev-business{position:absolute;inset:0 0 0 246px;overflow:auto;background:#f1f6f5}
 .ev-business-header{position:sticky;top:0;z-index:2;background:white;border-bottom:1px solid #d9e5e4;min-height:65px;padding:13px 30px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:#62767b}
 .ev-business-main{max-width:1540px;margin:auto;padding:30px 34px 60px}
 .ev-error{position:absolute;bottom:12px;left:258px;right:12px;border:1px solid #e7c889;border-radius:9px;z-index:3}
 @media(max-width:850px){.ev-business{left:0}.ev-business-header{padding:12px 14px}.ev-business-main{padding:18px 14px 36px}.ev-error{left:12px}}
</style>
