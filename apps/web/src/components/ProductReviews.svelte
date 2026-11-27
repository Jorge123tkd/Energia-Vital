<script lang="ts">
  import { onMount } from 'svelte';
  import { api, customerToken } from '../lib/api';
  let { productId }: { productId:string }=$props();
  let reviews:any[]=$state([]);
  let average:number|null=$state(null);
  let count=$state(0);
  let eligible=$state(false);
  let previous:any=$state(null);
  let rating=$state(5);
  let comment=$state('');
  let loading=$state(true),sending=$state(false),error=$state(''),notice=$state('');
  async function load(){
    error='';
    try{
      const result=await api.getProductReviews(productId);
      reviews=result.reviews||[];average=result.average;count=result.count||0;
      if(customerToken()){
        try{
          const status=await api.getReviewEligibility(productId);
          eligible=Boolean(status.verified);previous=status.review||null;
        }catch{/* La ficha y las reseñas siguen siendo públicas. */}
      }
    }catch(e){error=e instanceof Error?e.message:'No se pudieron consultar las valoraciones';}
    finally{loading=false;}
  }
  onMount(()=>{void load();});
  async function send(event:SubmitEvent){
    event.preventDefault();sending=true;error='';notice='';
    try{
      await api.sendProductReview(productId,rating,comment);
      notice='Valoración enviada. Se publicará después de la revisión del equipo.';
      await load();
    }catch(e){error=e instanceof Error?e.message:'No se pudo enviar la valoración';}
    finally{sending=false;}
  }
</script>
<section class="mt-5 border-t border-slate-200 pt-5 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-base font-extrabold text-slate-900">Valoraciones de compradores</h3>
    {#if count>0}<span class="text-sm font-bold text-amber-700">★ {average?.toFixed(1)} / 5 · {count} reseñas</span>{/if}
  </header>
  {#if loading}<p class="text-xs text-slate-500">Cargando valoraciones…</p>{/if}
  {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
  {#if notice}<p role="status" class="text-sm text-emerald-700">{notice}</p>{/if}
  {#if eligible && !previous}
    <form onsubmit={send} class="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
      <p class="text-xs font-semibold text-emerald-700">✓ Compra comprobada por Bonaire</p>
      <p class="text-sm font-bold text-slate-800">¿Qué valoración le das a este equipo?</p>
      <div class="flex gap-2" role="group" aria-label="Elegir puntuación">
        {#each [1,2,3,4,5] as n}
          <button type="button" aria-pressed={rating===n} aria-label={n+' estrellas'}
            onclick={()=>rating=n} class="text-2xl {n<=rating?'text-amber-500':'text-slate-300'}">★</button>
        {/each}
      </div>
      <label class="block text-sm font-semibold text-slate-700">Tu experiencia (opcional)
        <textarea rows="3" maxlength="1500" bind:value={comment} class="block w-full rounded-xl border border-slate-300 p-3 mt-1 text-sm" placeholder="Cuéntanos cómo te fue con este producto."></textarea>
      </label>
      <button type="submit" disabled={sending} class="rounded-xl bg-teal-700 text-white font-bold px-4 py-2.5 text-sm">{sending?'Enviando…':'Enviar valoración'}</button>
    </form>
  {:else if previous}
    <p class="rounded-xl bg-teal-50 text-teal-800 p-3 text-xs">
      Ya enviaste tu valoración. Estado: {previous.status==='pending'?'pendiente de revisión':previous.status==='published'?'publicada':'no publicada'}.
    </p>
  {:else if customerToken()}
    <p class="text-xs text-slate-500">Para valorar este equipo, la compra debe estar registrada y comprobada por Bonaire.</p>
  {:else}
    <p class="text-xs text-slate-500">Inicia sesión para consultar si tu compra está verificada y dejar una valoración.</p>
  {/if}
  {#if !loading && !reviews.length}<p class="text-xs text-slate-500">Este equipo todavía no tiene valoraciones publicadas.</p>{/if}
  <div class="space-y-3">
    {#each reviews as review (review.id)}
      <article class="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
        <div class="flex items-center justify-between gap-2">
          <strong class="text-xs text-slate-800">{review.customer_name} · Compra verificada</strong>
          <span class="text-amber-600 font-bold text-sm">{'★'.repeat(review.rating)}</span>
        </div>
        {#if review.comment}<p class="mt-2 text-sm text-slate-600 whitespace-pre-line">{review.comment}</p>{/if}
      </article>
    {/each}
  </div>
</section>
