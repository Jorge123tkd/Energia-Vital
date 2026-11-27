<script lang="ts">
  import {onMount} from 'svelte';
  import {api,apiRequest} from '../lib/api';
  import {printCommercialQuote} from '../lib/commercial-quote-print';
  type Quote={can_decide?:boolean;decision?:{decision:string;note:string;decided_at:string}|null;id:string;request_id:string;title:string;version_no:number;total_cents:number;subtotal_cents:number;taxes_cents:number;freight_cents:number;discount_cents:number;valid_until:string;issued_at:string;delivery_terms?:string;warranty_terms?:string;payment_terms?:string;stock_notes?:string;tax_notes?:string;freight_notes?:string;items:{description:string;quantity:number;unit_price_usd_cents:number;line_total_usd_cents:number}[]};
  let quotes:Quote[]=$state([]),loading=$state(true),error=$state(''),busy=$state(false),notice=$state(''),chosen=$state(''),decision=$state('changes'),note=$state('');
  const money=(c:number)=>new Intl.NumberFormat('es-CU',{style:'currency',currency:'USD'}).format(c/100);
  async function load(){loading=true;error='';try{quotes=(await api.getMyQuotes()).quotes||[];}catch(e){error=e instanceof Error?e.message:'No se pudieron consultar las cotizaciones.';}finally{loading=false;}}
  const labels:Record<string,string>={accept:'Aceptada',changes:'Modificaciones solicitadas',reject:'No aceptada'};
  async function respond(q:Quote){
    if(busy||!q.can_decide)return;
    if(!window.confirm('¿Registrar tu decisión sobre esta versión? No equivale a firmar un contrato ni autoriza la instalación.'))return;
    busy=true;error='';notice='';
    try{await apiRequest('/api/private/quotes/'+encodeURIComponent(q.id)+'/decision',{method:'POST',body:JSON.stringify({decision,note:note.trim()})});chosen='';note='';notice='Respuesta registrada. El equipo de Bonaire revisará tu decisión.';await load()}catch(e){error=(e as Error).message}finally{busy=false}
  }
  onMount(()=>{void load();});
</script>
<section class="space-y-3 my-8">
  <div class="flex items-center justify-between"><h2 class="text-xl font-semibold">Mis cotizaciones</h2><button type="button" class="text-xs underline text-teal-800" disabled={loading} onclick={load}>Actualizar</button></div>
  {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
  {#if notice}<p role="status" class="text-sm text-teal-800">{notice}</p>{/if}
  {#if loading}<p class="text-sm text-slate-500">Cargando…</p>{/if}
  {#each quotes as q (q.id)}
    <article class="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <div class="flex flex-wrap justify-between gap-2"><strong>{q.title} · V{q.version_no}</strong><strong class="text-teal-800">{money(q.total_cents)} USD</strong></div>
      <p class="text-xs text-slate-600">Vigencia: {q.valid_until} · Emitida: {q.issued_at.slice(0,10)}</p>
      <p class="text-xs break-all text-slate-500">Solicitud: {q.request_id}</p>
      <button type="button" class="border rounded px-3 py-2 text-sm" onclick={()=>{try{printCommercialQuote(q,true)}catch(e){error=(e as Error).message}}}>Imprimir / guardar PDF</button>
      <details><summary class="cursor-pointer text-sm font-bold text-teal-800">Ver partidas y condiciones</summary>
        <div class="mt-3 space-y-2 text-sm">
          {#each q.items as item}<div class="flex flex-wrap justify-between gap-2 border-b py-1"><span>{item.quantity} × {item.description} ({money(item.unit_price_usd_cents)} c/u)</span><strong>{money(item.line_total_usd_cents)}</strong></div>{/each}
          <p>Subtotal: {money(q.subtotal_cents)} · Impuestos: {money(q.taxes_cents)} · Transporte: {money(q.freight_cents)} · Descuento: {money(q.discount_cents)}</p>
          <p>Entrega: {q.delivery_terms||'Consultar'}</p><p>Garantía: {q.warranty_terms||'Consultar'}</p><p>Pago: {q.payment_terms||'Consultar'}</p>
          <p>Disponibilidad: {q.stock_notes||'Consultar'}</p><p>Impuestos: {q.tax_notes||'Consultar'}</p><p>Transporte: {q.freight_notes||'Consultar'}</p>
          <p class="text-xs text-slate-500 break-all">Referencia: {q.id}. Consulta al equipo para aceptar o renovar la propuesta. No es un comprobante de pago.</p>
        </div>
      </details>
      {#if q.decision}<p class="text-sm font-semibold">{labels[q.decision.decision]||q.decision.decision} · {q.decision.decided_at.slice(0,10)}</p>{#if q.decision.note}<p class="text-sm whitespace-pre-wrap">{q.decision.note}</p>{/if}
      {:else if q.can_decide}
        <div class="flex flex-wrap gap-2">{#each [['accept','Aceptar propuesta'],['changes','Solicitar modificaciones'],['reject','No aceptar']] as option}<button type="button" disabled={busy} onclick={()=>{chosen=q.id;decision=option[0];note=''}} class="rounded border px-3 py-2 text-sm">{option[1]}</button>{/each}</div>
        {#if chosen===q.id}<form onsubmit={e=>{e.preventDefault();void respond(q)}} class="space-y-2 border rounded p-3"><p class="font-semibold">{labels[decision]}</p><label class="block text-sm">Observaciones {decision==='changes'?'(obligatorias)':'(opcionales)'}<textarea class="block w-full border rounded p-2" bind:value={note} required={decision==='changes'} minlength={decision==='changes'?3:0} maxlength="1000"></textarea></label><button disabled={busy} type="submit" class="rounded bg-teal-800 text-white px-3 py-2">Confirmar decisión</button><button type="button" disabled={busy} onclick={()=>chosen=''} class="ml-2">Cancelar</button></form>{/if}
      {/if}
    </article>
  {:else}{#if !loading&&!error}<p class="text-sm text-slate-500">No tienes cotizaciones emitidas todavía.</p>{/if}{/each}
</section>
