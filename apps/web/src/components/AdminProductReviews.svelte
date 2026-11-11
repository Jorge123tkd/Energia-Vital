<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let { token, products }: {token:string;products:any[]}=$props();
  let productId=$state('');
  let productSearch=$state('');
  let reviewSearch=$state('');
  let filteredProducts=$derived(products.filter(p=>
    !productSearch.trim()||[p.name,p.id,p.brand,p.model].some((value:unknown)=>
      String(value||'').toLocaleLowerCase('es').includes(productSearch.trim().toLocaleLowerCase('es')))));
  let filteredReviews=$derived(reviews.filter(r=>
    !reviewSearch.trim()||[r.product_name,r.customer_name,r.comment,r.id].some((value:unknown)=>
      String(value||'').toLocaleLowerCase('es').includes(reviewSearch.trim().toLocaleLowerCase('es')))));
  let customerId=$state('');
  let reference=$state('');
  let reviews:any[]=$state([]);
  let loading=$state(true),busy=$state(false),error=$state(''),notice=$state('');
  async function load(){
    loading=true;
    try{reviews=(await api.listAdminProductReviews(token)).reviews||[];}
    catch(e){error=e instanceof Error?e.message:'No se pudieron cargar las valoraciones';}
    finally{loading=false;}
  }
  onMount(()=>{void load();});
  async function verify(event:SubmitEvent){
    event.preventDefault();busy=true;error='';notice='';
    try{
      await api.verifyProductPurchase(token,productId,customerId.trim(),reference.trim());
      notice='Compra confirmada. El cliente ya puede valorar este producto desde su cuenta.';
      customerId='';reference='';
    }catch(e){error=e instanceof Error?e.message:'No se pudo verificar la compra';}
    finally{busy=false;}
  }
  async function setStatus(id:string,status:'published'|'rejected'|'pending'){
    busy=true;error='';notice='';
    try{await api.moderateProductReview(token,id,status);notice='Valoración actualizada.';await load();}
    catch(e){error=e instanceof Error?e.message:'No se pudo moderar la valoración';}
    finally{busy=false;}
  }
</script>
<section class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
  <div><h2 class="font-extrabold text-lg text-slate-900">Compras verificadas y valoraciones</h2>
    <p class="text-sm text-slate-500 mt-1">Solo comprueba compras que realmente consten en tus registros. Una valoración debe aprobarse para ser pública.</p>
  </div>
  {#if error}<p role="alert" class="rounded-xl bg-red-50 p-3 text-red-700 text-sm">{error}</p>{/if}
  {#if notice}<p role="status" class="rounded-xl bg-emerald-50 p-3 text-emerald-700 text-sm">{notice}</p>{/if}
  <form onsubmit={verify} class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end rounded-2xl bg-slate-50 border border-slate-100 p-4">
    <div class="space-y-2 min-w-0">
      <label class="block text-xs font-semibold text-slate-700">Buscar producto por nombre, marca o ID
        <input type="search" bind:value={productSearch} placeholder="Buscar equipo…" class="block w-full mt-2 border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm"/>
      </label>
      <label class="block text-xs font-semibold text-slate-700">Producto seleccionado
        <select required bind:value={productId} class="block w-full mt-2 border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm">
          <option value="">Seleccionar producto</option>
          {#each filteredProducts as product (product.id)}<option value={product.id}>{product.name} · {product.id.slice(0,8)}</option>{/each}
        </select>
      </label>
    </div>
    <label class="text-xs font-semibold text-slate-700">ID del cliente
      <input required bind:value={customerId} placeholder="Pega el ID de cliente" class="block w-full mt-2 border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm"/>
    </label>
    <label class="text-xs font-semibold text-slate-700">Referencia de compra (opcional)
      <input bind:value={reference} maxlength="200" placeholder="Factura o comprobante" class="block w-full mt-2 border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm"/>
    </label>
    <button disabled={busy} class="rounded-xl bg-teal-700 text-white font-bold px-4 py-3 text-sm">Verificar compra</button>
  </form>
  <div class="space-y-2">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <h3 class="text-sm font-extrabold text-slate-900">Reseñas recibidas ({reviews.length})</h3>
      <input type="search" aria-label="Buscar reseñas" bind:value={reviewSearch} placeholder="Buscar producto o cliente" class="rounded-xl border border-slate-300 p-2 text-xs w-full sm:w-56" />
    </div>
    {#if loading}<p class="text-xs text-slate-500">Cargando…</p>{/if}
    {#if !loading && reviews.length===0}<p class="text-xs text-slate-500">Todavía no hay reseñas.</p>{/if}
    {#each filteredReviews as review (review.id)}
      <article class="rounded-xl border border-slate-200 p-3.5 flex flex-wrap gap-3 justify-between">
        <div class="flex-1 min-w-0">
          <strong class="text-sm text-slate-900">{review.product_name}</strong>
          <p class="text-xs text-slate-500 mt-1">{review.customer_name} · {'★'.repeat(review.rating)} · {review.status}</p>
          {#if review.comment}<p class="mt-2 text-sm text-slate-700 whitespace-pre-line">{review.comment}</p>{/if}
        </div>
        <div class="flex gap-2 items-start">
          <button type="button" disabled={busy} onclick={()=>setStatus(review.id,'published')}
            class="rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2">Aprobar</button>
          <button type="button" disabled={busy} onclick={()=>setStatus(review.id,'rejected')}
            class="rounded-lg bg-red-50 text-red-700 text-xs font-bold px-3 py-2">Rechazar</button>
        </div>
      </article>
    {/each}
  </div>
</section>
