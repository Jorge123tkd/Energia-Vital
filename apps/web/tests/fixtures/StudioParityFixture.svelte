<script lang="ts">
 import StudioCommercialActions from '../../src/components/StudioCommercialActions.svelte';
 import StudioEngineeringFrame from '../../src/components/StudioEngineeringFrame.svelte';
 import {ADMIN_TOKEN_KEY} from '../../src/lib/api';
 const token='qa-fixture-no-real-credentials';
 sessionStorage.setItem(ADMIN_TOKEN_KEY,token);
 let closed=$state('');
 const mode=new URLSearchParams(location.search).get('commercial');
 const projects=[{id:'p1',name:'Proyecto QA'},{id:'p2',name:'Otro proyecto QA'}];
</script>
{#snippet business(section:string)}<p data-testid="business-section">{section}</p>{/snippet}
{#if mode}<StudioCommercialActions {token} {mode} project="p1" {projects} onSaved={async()=>{}}/>
{:else if closed}<p>{closed}</p>{:else}
<StudioEngineeringFrame {token} {business} account={{email:'qa@example.invalid',role:'admin'}} onExit={()=>closed='exit'} onLogout={async()=>{closed='logout'}}/>
{/if}
