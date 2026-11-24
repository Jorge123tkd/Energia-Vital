<script lang="ts">
 import {onDestroy} from 'svelte';
 import {apiRequest,ADMIN_TOKEN_KEY} from '../lib/api';
 let {token}:{token:string}=$props();
 let frame:HTMLIFrameElement|undefined=$state(), opened=$state(false),busy=$state(false),error=$state('');
 let port:MessagePort|null=null,epoch=0,loads=0;
 const route='/api/studio/v1/engineering/workspace';
 const auth=()=>({Authorization:'Bearer '+token});
 function close(){epoch++;port?.close();port=null;opened=false;loads=0}
 async function open(){
  if(busy)return;busy=true;error='';
  try{await apiRequest(route,{headers:auth(),cache:'no-store'});loads=0;opened=true}
  catch(e){error=(e as Error).message||'Ingeniería online todavía no disponible.'}
  finally{busy=false}
 }
 function connect(){
  if(!opened||!frame?.contentWindow)return;
  // Second document load revokes the channel. Never expose JWTs to the child.
  if(++loads!==1){close();error='La ventana cambió de documento. Vuelve a abrir Studio.';return}
  const current=++epoch,channel=new MessageChannel();
  port=channel.port1;
  channel.port1.onmessage=async(event)=>{
   const data=event.data;
   if(current!==epoch||!opened||!data||!Number.isSafeInteger(data.id)||!['read','write'].includes(data.action))return;
   const reply=(v:Record<string,unknown>)=>{if(current===epoch&&opened)channel.port1.postMessage({id:data.id,...v})};
   try{
    if(!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token)throw Object.assign(new Error('Sesión de Bonaire cambiada. Cierra y abre Studio.'),{status:401});
    let result;
    if(data.action==='read')result=await apiRequest(route,{headers:auth(),cache:'no-store'});
    else{
     const payload=JSON.stringify(data.payload);
     if(!payload||new TextEncoder().encode(payload).length>8*1024*1024)throw Object.assign(new Error('Espacio supera 8 MiB; exporta un respaldo antes de reducir adjuntos.'),{status:413});
     result=await apiRequest(route,{method:'PUT',headers:auth(),body:payload,cache:'no-store'});
    }
    reply({ok:true,result});
   }catch(e){const err=e as Error&{status?:number};reply({ok:false,error:err.message,status:err.status||0})}
  };
  channel.port1.start();
  frame.contentWindow.postMessage({type:'evpro-engineering-connect-v1'},'*',[channel.port2]);
 }
 onDestroy(close);
</script>
<section class="rounded-2xl border bg-white p-4 space-y-3" aria-label="Ingeniería EV Pro original online">
 <div class="flex items-center justify-between flex-wrap gap-3">
  <div><h3 class="text-xl font-extrabold">EV Pro · Ingeniería completa</h3>
   <p class="text-sm text-slate-500">Mismo motor e interfaz de EV Pro 3.8. Espacio privado de la cuenta con guardado online autorizado por revisión.</p></div>
  {#if opened}<button type="button" class="border rounded-xl px-4 py-2" onclick={close}>Cerrar ingeniería</button>
  {:else}<button type="button" class="rounded-xl bg-teal-800 text-white px-4 py-3 font-semibold disabled:opacity-50" disabled={busy} onclick={open}>{busy?'Verificando…':'Abrir EV Pro Online'}</button>{/if}
 </div>
 {#if error}<p role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>{/if}
 {#if opened}
  <p class="text-xs text-slate-500">Espacio privado, sin cambios de stock o publicaciones. Límite inicial 8 MiB; no es aún colaboración multiusuario por proyecto. Guarda y verifica antes de cerrar. Los PDF nativos están disponibles en Windows.</p>
  <iframe bind:this={frame} onload={connect} title="EV Pro Ingeniería original" src="/studio-engineering/index.html" sandbox="allow-scripts allow-downloads allow-modals" referrerpolicy="no-referrer" class="w-full min-h-[820px] border rounded-lg"></iframe>
 {/if}
</section>
