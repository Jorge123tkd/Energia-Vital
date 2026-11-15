<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';

  type Item={description:string;quantity:number;unit_price_usd_cents:number;
    line_total_usd_cents:number};
  type Version={id:string;request_id:string;version_no:number;title:string;currency:string;
    items:Item[];subtotal_cents:number;taxes_cents:number;freight_cents:number;
    discount_cents:number;total_cents:number;valid_until:string|null;
    delivery_terms:string|null;warranty_terms:string|null;payment_terms:string|null;
    stock_notes:string|null;tax_notes:string|null;freight_notes:string|null;
    internal_notes:string|null;status:string;created_by_email:string;
    reviewed_by_email?:string|null;review_reason?:string|null;created_at:string};
  type ItemEdit={key:number;description:string;quantity:number;price_usd:number};
  let {token,requestId,canReview=false}:{token:string;requestId:string;canReview?:boolean}=$props();
  let versions:Version[]=$state([]),loading=$state(false),busy=$state(false),
    editorOpen=$state(false),error=$state(''),success=$state(''),truncated=$state(false);
  let title=$state(''),items:ItemEdit[]=$state([]),validUntil=$state('');
  let taxesUsd=$state(0),freightUsd=$state(0),discountUsd=$state(0);
  let deliveryTerms=$state(''),warrantyTerms=$state(''),paymentTerms=$state('');
  let stockNotes=$state(''),taxNotes=$state(''),freightNotes=$state(''),internalNotes=$state('');
  let reviewReason=$state('');
  let nextKey=0;
  const states:Record<string,string>={
    draft:'Borrador interno',in_review:'Pendiente de revisión humana',
    approved_internal:'Aprobada internamente (no emitida)',
    rejected:'Rechazada',superseded:'Sustituida por nueva versión'
  };
  const amount=(c:number)=>new Intl.NumberFormat('es-CU',{
    minimumFractionDigits:2,maximumFractionDigits:2
  }).format(c/100)+' USD';
  const cents=(usd:number)=>Math.round(Number(usd)*100);
  const estimated=$derived(items.reduce((s,i)=>s+
    Math.round(Math.round(Number(i.quantity)*1000)*cents(i.price_usd)/1000),0)
    +cents(taxesUsd)+cents(freightUsd)-cents(discountUsd));
  function line():ItemEdit{return {key:++nextKey,description:'',quantity:1,price_usd:0};}
  async function reload(){
    loading=true;error='';
    try{
      const result=await api.quoteVersions(token,requestId);
      versions=result.versions||[];truncated=Boolean(result.truncated);
    }catch(e){error=e instanceof Error?e.message:'No se pudieron consultar las cotizaciones.';}
    finally{loading=false;}
  }
  function begin(){
    if(versions[0]?.status==='in_review')return;
    const last=versions[0];
    title=last?.title||'Propuesta comercial';
    items=last?.items?.length?last.items.map(i=>({
      key:++nextKey,description:i.description,quantity:i.quantity,
      price_usd:i.unit_price_usd_cents/100
    })):[line()];
    taxesUsd=(last?.taxes_cents||0)/100;
    freightUsd=(last?.freight_cents||0)/100;
    discountUsd=(last?.discount_cents||0)/100;
    validUntil=last?.valid_until||'';
    deliveryTerms=last?.delivery_terms||'';
    warrantyTerms=last?.warranty_terms||'';
    paymentTerms=last?.payment_terms||'';
    stockNotes=last?.stock_notes||'';
    taxNotes=last?.tax_notes||'';
    freightNotes=last?.freight_notes||'';
    internalNotes=last?.internal_notes||'';
    error='';success='';editorOpen=true;
  }
  async function saveDraft(e:SubmitEvent){
    e.preventDefault();
    if(busy)return;
    busy=true;error='';success='';
    try{
      const body={
        expected_latest_id:versions[0]?.id||null,title:title.trim(),
        items:items.map(i=>({
          description:i.description.trim(),quantity:Number(i.quantity),
          unit_price_usd_cents:cents(i.price_usd)
        })),
        taxes_usd_cents:cents(taxesUsd),freight_usd_cents:cents(freightUsd),
        discount_usd_cents:cents(discountUsd),valid_until:validUntil||null,
        delivery_terms:deliveryTerms.trim()||null,
        warranty_terms:warrantyTerms.trim()||null,
        payment_terms:paymentTerms.trim()||null,
        stock_notes:stockNotes.trim()||null,
        tax_notes:taxNotes.trim()||null,
        freight_notes:freightNotes.trim()||null,
        internal_notes:internalNotes.trim()||null
      };
      const r=await api.createQuoteVersion(token,requestId,body);
      success='Versión '+r.version_no+' guardada como borrador INTERNO. No se envió al cliente.';
      editorOpen=false;await reload();
    }catch(e){error=e instanceof Error?e.message:'No se pudo guardar el borrador.';}
    finally{busy=false;}
  }
  async function submit(v:Version){
    if(busy)return;
    if(!window.confirm('¿Enviar esta versión a revisión interna? No se enviará al cliente.'))return;
    busy=true;error='';success='';
    try{
      const r=await api.submitQuoteReview(token,v.id);
      success=r.message;await reload();
    }catch(e){error=e instanceof Error?e.message:'No se pudo solicitar la revisión.';}
    finally{busy=false;}
  }
  async function review(v:Version,decision:'approve'|'reject'){
    if(!canReview||busy)return;
    if(decision==='reject'&&reviewReason.trim().length<3){
      error='Debes escribir el motivo de rechazo (mínimo 3 caracteres).';return;
    }
    if(!window.confirm((decision==='approve'
      ?'¿Registrar aprobación SOLO INTERNA? No se emite ni envía ninguna oferta.'
      :'¿Rechazar esta versión y conservar el historial?')))return;
    busy=true;error='';success='';
    try{
      const r=await api.reviewQuote(token,v.id,decision,reviewReason.trim());
      success=r.message;reviewReason='';await reload();
    }catch(e){error=e instanceof Error?e.message:'No se pudo registrar la revisión.';}
    finally{busy=false;}
  }
  onMount(()=>{void reload();});
</script>

<section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" aria-label="Cotizaciones privadas">
  <div class="flex flex-wrap justify-between items-start gap-3">
    <div>
      <h3 class="font-extrabold text-lg text-slate-900">Cotizaciones comerciales · Versiones</h3>
      <p class="text-xs text-slate-600 mt-1">Gestión privada y en USD; importes y condiciones requieren comprobación humana.</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button type="button" onclick={reload} disabled={busy||loading}
        class="text-xs font-bold rounded-lg border border-slate-300 px-3 py-2">Actualizar</button>
      <button type="button" onclick={begin} disabled={busy||loading||versions[0]?.status==='in_review'}
        class="text-xs font-bold rounded-lg bg-teal-700 text-white px-3 py-2">
        {versions.length?'+ Crear nueva versión':'+ Primer borrador'}
      </button>
    </div>
  </div>
  <p class="rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs p-3">
    <strong>No es un contrato ni una oferta emitida.</strong> Incluso una versión aprobada
    internamente necesita un proceso separado de emisión autorizado. No se envía correo,
    WhatsApp, factura ni propuesta contractual desde este módulo.
  </p>
  {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>{/if}
  {#if success}<p role="status" class="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{success}</p>{/if}
  {#if loading}<p role="status" class="text-sm text-slate-600">Cargando cotizaciones…</p>{/if}
  {#if truncated}<p class="text-xs text-amber-900">Hay más de 100 versiones; este resumen solo muestra las recientes.</p>{/if}
  {#each versions as v (v.id)}
    <article class="rounded-xl border border-slate-200 p-3 space-y-3">
      <div class="flex flex-wrap justify-between gap-3">
        <div>
          <h4 class="font-extrabold">Versión {v.version_no} · {v.title}</h4>
          <p class="text-xs text-slate-500 mt-1">Preparó: {v.created_by_email} · {v.created_at.slice(0,10)}</p>
        </div>
        <div class="text-right">
          <p class="font-extrabold text-teal-900">{amount(v.total_cents)}</p>
          <p class="text-xs font-semibold">{states[v.status]||v.status}</p>
        </div>
      </div>
      <details>
        <summary class="text-xs font-bold text-teal-800 underline cursor-pointer">Ver partidas, importes y condiciones</summary>
        <div class="mt-3 space-y-2 text-xs">
          {#each v.items as i}
            <div class="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1">
              <span>{i.quantity} × {i.description} ({amount(i.unit_price_usd_cents)} c/u)</span>
              <strong>{amount(i.line_total_usd_cents)}</strong>
            </div>
          {/each}
          <p>Subtotal: {amount(v.subtotal_cents)} · Impuestos: {amount(v.taxes_cents)} · Transporte: {amount(v.freight_cents)} · Descuento: {amount(v.discount_cents)}</p>
          <p>Vigencia: {v.valid_until||'Pendiente'} · Entrega: {v.delivery_terms||'Pendiente'} · Garantía: {v.warranty_terms||'Pendiente'}</p>
          <p>Pago: {v.payment_terms||'Pendiente'}</p>
          <p>Existencias: {v.stock_notes||'Por revisar'}</p>
          <p>Impuestos: {v.tax_notes||'Por revisar'}</p>
          <p>Transporte: {v.freight_notes||'Por revisar'}</p>
          {#if v.internal_notes}<p class="whitespace-pre-wrap">Nota interna: {v.internal_notes}</p>{/if}
        </div>
      </details>
      {#if v.reviewed_by_email}
        <p class="text-xs text-slate-600">Revisó: {v.reviewed_by_email}{v.review_reason?' · '+v.review_reason:''}</p>
      {/if}
      {#if v.status==='draft'}
        <button type="button" disabled={busy} onclick={()=>submit(v)}
          class="rounded-lg bg-teal-700 text-white font-semibold text-xs px-3 py-2">Enviar a revisión interna</button>
        <p class="text-xs text-slate-500">Para corregir los importes debes crear otra versión; el historial original se conserva.</p>
      {/if}
      {#if v.status==='in_review'}
        {#if canReview}
          <label class="block text-xs font-semibold">Observaciones del administrador (obligatorias al rechazar)
            <textarea rows="2" maxlength="500" bind:value={reviewReason}
              class="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"></textarea>
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onclick={()=>review(v,'approve')}
              class="rounded-lg bg-teal-700 text-white font-semibold text-xs px-3 py-2">Aprobar INTERNAMENTE</button>
            <button type="button" disabled={busy} onclick={()=>review(v,'reject')}
              class="rounded-lg border border-red-300 text-red-800 font-semibold text-xs px-3 py-2">Rechazar versión</button>
          </div>
        {:else}
          <p class="text-xs text-amber-900">Esperando revisión de un administrador general.</p>
        {/if}
      {/if}
    </article>
  {:else}
    {#if !loading}<p class="text-sm text-slate-500">Todavía no existen versiones para esta solicitud.</p>{/if}
  {/each}
</section>

{#if editorOpen}
  <div class="fixed inset-0 z-[255] bg-slate-950/80 flex justify-center items-center p-2 sm:p-4">
    <dialog open aria-label="Borrador interno de cotización"
      class="m-0 w-full max-w-3xl max-h-[94dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 space-y-4">
      <div class="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <h3 class="font-extrabold text-lg">Nueva versión {versions.length?(versions[0].version_no+1):1}</h3>
          <p class="text-xs text-slate-600">Los cambios nunca borran ni editan la versión anterior.</p>
        </div>
        <button type="button" onclick={()=>editorOpen=false} disabled={busy} aria-label="Cerrar" class="rounded-lg bg-slate-100 p-2">✕</button>
      </div>
      {#if error}<p role="alert" class="rounded-lg bg-red-50 p-3 text-red-800 text-sm">{error}</p>{/if}
      <form onsubmit={saveDraft} class="space-y-4">
        <label class="block text-sm font-semibold">Asunto
          <input type="text" bind:value={title} minlength="3" maxlength="180" required
            class="block w-full mt-1 border border-slate-300 rounded-lg p-2"/>
        </label>
        <fieldset class="border border-slate-200 rounded-xl p-3 space-y-2">
          <legend class="font-bold text-sm px-1">Partidas y precios unitarios en USD</legend>
          {#each items as i (i.key)}
            <div class="grid grid-cols-1 sm:grid-cols-[1fr_85px_115px_auto] gap-2 items-end">
              <label class="block text-xs font-semibold">Descripción
                <input type="text" bind:value={i.description} minlength="3" maxlength="180" required
                  class="block w-full mt-1 border rounded-lg p-2"/>
              </label>
              <label class="block text-xs font-semibold">Cantidad
                <input type="number" min="0.001" max="100000" step="0.001" bind:value={i.quantity} required
                  class="block w-full mt-1 border rounded-lg p-2"/>
              </label>
              <label class="block text-xs font-semibold">Precio unitario USD
                <input type="number" min="0" max="999999999" step="0.01" bind:value={i.price_usd} required
                  class="block w-full mt-1 border rounded-lg p-2"/>
              </label>
              <button type="button" disabled={items.length===1||busy}
                onclick={()=>items=items.filter(x=>x.key!==i.key)}
                aria-label="Quitar partida" class="rounded-lg border border-red-200 text-red-800 p-2">Quitar</button>
            </div>
          {/each}
          <button type="button" disabled={items.length>=60||busy} onclick={()=>items=[...items,line()]}
            class="text-xs font-bold text-teal-800 underline">+ Agregar partida</button>
        </fieldset>
        <div class="grid sm:grid-cols-3 gap-3">
          <label class="block text-xs font-semibold">Impuestos USD (verificar aplicabilidad)
            <input type="number" min="0" step="0.01" bind:value={taxesUsd} required class="mt-1 w-full border rounded-lg p-2"/>
          </label>
          <label class="block text-xs font-semibold">Transporte USD
            <input type="number" min="0" step="0.01" bind:value={freightUsd} required class="mt-1 w-full border rounded-lg p-2"/>
          </label>
          <label class="block text-xs font-semibold">Descuento USD
            <input type="number" min="0" step="0.01" bind:value={discountUsd} required class="mt-1 w-full border rounded-lg p-2"/>
          </label>
        </div>
        <p class="rounded-lg bg-teal-50 p-3 font-extrabold text-teal-950">Total estimado: {Number.isFinite(estimated)?amount(estimated):'Revisar importes'}</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block text-xs font-semibold">Vigencia de la propuesta
            <input type="date" bind:value={validUntil} class="block w-full mt-1 border rounded-lg p-2"/>
          </label>
          <label class="block text-xs font-semibold">Plazo y condiciones de entrega
            <textarea bind:value={deliveryTerms} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Garantía y soporte
            <textarea bind:value={warrantyTerms} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Condiciones y modalidad de pago
            <textarea bind:value={paymentTerms} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Comprobación de existencias
            <textarea bind:value={stockNotes} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Base de impuestos y autorizaciones
            <textarea bind:value={taxNotes} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Transporte y logística
            <textarea bind:value={freightNotes} maxlength="600" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
          <label class="block text-xs font-semibold">Nota interna adicional
            <textarea bind:value={internalNotes} maxlength="1000" rows="2" class="block w-full mt-1 border rounded-lg p-2"></textarea>
          </label>
        </div>
        <p class="text-xs text-slate-500">Se permite guardar un borrador incompleto. Para enviarlo a revisión se exige vigencia, entrega, garantía, pago, stock, impuestos, transporte y un total mayor que cero.</p>
        <button type="submit" disabled={busy||!Number.isFinite(estimated)||estimated<0}
          class="w-full rounded-xl bg-teal-700 text-white font-bold p-3 disabled:opacity-50">
          {busy?'Guardando…':'Guardar nueva versión INTERNA'}
        </button>
      </form>
    </dialog>
  </div>
{/if}
