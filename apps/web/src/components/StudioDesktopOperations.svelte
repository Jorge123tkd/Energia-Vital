<script lang="ts">
 import {onMount} from 'svelte';
 import {desktopStudioBridge} from '../lib/api';
 import StudioEntrance from './StudioEntrance.svelte';
 const sections=new Set(['team','catalog','backup','inventory','finance','publication']);
 const section=new URLSearchParams(window.location.search).get('section')||'';
 let authorized=$state(false),error=$state(''),leaving=$state(false);
 async function leave(action:'engineering'|'logout'){
  if(leaving)return;leaving=true;error='';
  try{await desktopStudioBridge()?.leave(action)}catch(e){error=String((e as Error).message||e)}
  finally{leaving=false}
 }
 onMount(()=>{void (async()=>{try{const bridge=desktopStudioBridge();if(!bridge||!sections.has(section))throw Error('Este módulo se abre desde EV Pro Studio para Windows.');const account=await bridge.account();if(account.role!=='admin'||!account.email)throw Error('Cuenta de Studio no autorizada.');authorized=true}catch(e){error=(e as Error).message}})()});
</script>
{#if authorized}
 <StudioEntrance token="desktop-session" desktopSection={section} onExit={()=>void leave('engineering')} onLogout={()=>leave('logout')}/>
{:else}<main class="min-h-screen p-8"><h1 class="font-bold text-2xl">EV Pro Studio</h1><p>{error||'Comprobando sesión de Windows…'}</p></main>{/if}
{#if authorized&&error}<div role="alert" class="fixed bottom-3 right-3 left-3 rounded-lg bg-amber-100 p-3">{error}</div>{/if}
