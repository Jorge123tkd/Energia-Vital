<script lang="ts">
 import StudioEngineeringFrame from '../../src/components/StudioEngineeringFrame.svelte';
 import {ADMIN_TOKEN_KEY} from '../../src/lib/api';
 const token='qa-fixture-no-real-credentials';
 sessionStorage.setItem(ADMIN_TOKEN_KEY,token);
 let closed=$state('');
</script>
{#snippet business(section:string)}<p data-testid="business-section">{section}</p>{/snippet}
{#if closed}<p>{closed}</p>{:else}
<StudioEngineeringFrame {token} {business} account={{email:'qa@example.invalid',role:'admin'}} onExit={()=>closed='exit'} onLogout={async()=>{closed='logout'}}/>
{/if}
