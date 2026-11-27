<script lang="ts">
 import {onMount,untrack} from 'svelte';
 import {apiRequest} from '../lib/api';
 import QuoteManager from './QuoteManager.svelte';
 let {token,requestId='',projectId='',canReview=false}:{token:string;requestId?:string;projectId?:string;canReview?:boolean}=$props();
 type Line={key:number;name:string;kind:'material'|'labor';unit:string;required:number;client:number;warehouse:number;price:string};
 type Proposal={revision:number;items:{description:string;quantity:number;unit_price_usd_cents:number}[];missing:string[];stockNotes:string;canImport:boolean};
 let id=$state(untrack(()=>requestId)),revision=$state(0),mode=$state('partial'),site=$state(''),notes=$state(''),lines=$state<Line[]>([]),proposal=$state<Proposal|null>(null),error=$state(''),notice=$state(''),busy=$state(false),ready=$state(false),dirty=$state(false);
 let lookup=$state<any[]>([]),search=$state(''),source=$state('products'),chosen=$state(''),next=$state<string|null>(null),finding=$state(false),serial=0;
 const base='/api/quotes/residential';
 const call=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 const blank=(kind:'material'|'labor'='material'):Line=>({key:++serial,name:'',kind,unit:'unit',required:1,client:0,warehouse:0,price:''});
 function add(kind:'material'|'labor'){if(lines.length<30){lines=[...lines,blank(kind)];dirty=true}}
 function apply(r:any){revision=r.revision;proposal=r.proposal||null;if(r.survey){const s=r.survey;mode=s.mode;site=s.site;notes=s.notes;lines=s.lines.map((l:any)=>({key:++serial,name:l.name,kind:l.kind,unit:l.unit,required:l.required_milli/1000,client:l.client_milli/1000,warehouse:l.warehouse_milli/1000,price:l.sale_cents==null?'':String(l.sale_cents/100)}))}else{site=r.request?.location||'';lines=[blank()];notes=''}dirty=false}
 async function load(){busy=true;error='';ready=false;try{if(projectId){const r=await call(base+'/project/'+encodeURIComponent(projectId));id=r.request_id}else id=requestId;if(!id)throw Error('Solicitud no disponible.');apply(await call(base+'/requests/'+encodeURIComponent(id)));ready=true}catch(e){error=(e as Error).message}finally{busy=false}}
 async function find(more=false){finding=true;error='';if(!more){lookup=[];next=null;chosen=''}try{const p=new URLSearchParams({search});if(more&&next)p.set('after',next);const r=await call('/api/quotes/tariffs'+(source==='products'?'/products':'')+'?'+p);lookup=more?[...lookup,...r.tariffs]:r.tariffs;next=r.next}catch(e){error=(e as Error).message}finally{finding=false}}
 function pick(){const t=lookup.find(x=>x.code===chosen);if(!t||lines.length>=30)return;const l=blank(source==='products'||t.category==='material'?'material':'labor');l.name=t.name.slice(0,130);l.unit=t.unit;l.price=String(t.sale_cents/100);lines=lines.length===1&&!lines[0].name?[l]:[...lines,l];chosen='';dirty=true}
 const qty=(v:number)=>Math.round(Number(v)*1000);
 function price(v:string){if(!v.trim())return null;if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v.trim()))throw Error('Importe USD inválido');return Math.round(Number(v)*100)}
 async function save(e:SubmitEvent){e.preventDefault();if(busy||!ready)return;busy=true;error='';notice='';try{const body={mode,site,notes,lines:lines.map(l=>({name:l.name,kind:l.kind,unit:l.unit,required_milli:qty(l.required),client_milli:l.kind==='labor'?0:qty(l.client),warehouse_milli:l.kind==='labor'?0:qty(l.warehouse),sale_cents:price(l.price)}))};const r=await call(base+'/requests/'+encodeURIComponent(id),{expected_revision:revision,survey:body});apply(r);notice='Levantamiento guardado. No se han reservado materiales ni enviado presupuestos.'}catch(e){error=(e as Error).message}finally{busy=false}}
 onMount(()=>{void load()});
</script>
<section class="rounded-2xl border bg-white p-4 space-y-3">
 <h3 class="font-extrabold text-lg">Levantamiento residencial</h3>
 <p class="text-sm text-slate-600">Equipos del cliente, suministro de Bonaire y mano de obra. El almacén indicado es una previsión, no una existencia verificada ni una reserva.</p>
 {#if error}<p role="alert" class="bg-amber-50 rounded p-2">{error}</p>{/if}
 {#if notice}<p role="status" class="bg-teal-50 rounded p-2">{notice}</p>{/if}
 <button type="button" disabled={busy} onclick={()=>{if(!dirty||window.confirm('¿Descartar la edición no guardada?'))void load()}} class="border rounded px-3 py-1">Actualizar</button>
 {#if ready}
 <form class="space-y-3" onsubmit={save} oninput={()=>dirty=true}>
  <div class="grid gap-2 md:grid-cols-2"><label>Modalidad<select bind:value={mode}><option value="installation">Solo instalación</option><option value="partial">Suministro parcial</option><option value="turnkey">Llave en mano</option></select></label><label>Ubicación<input required minlength="3" maxlength="240" bind:value={site}/></label></div>
  <label>Observaciones técnicas<textarea bind:value={notes} maxlength="1200" placeholder="Equipos, compatibilidad, cubierta, estado de la instalación, seguridad…"></textarea></label>
  <div class="bg-slate-50 rounded p-3 space-y-2"><p class="font-semibold text-sm">Buscar productos y tarifas existentes</p><select aria-label="Origen" bind:value={source} disabled={finding} onchange={()=>{lookup=[];chosen='';next=null}}><option value="products">Productos en USD</option><option value="tariffs">Tarifas de servicios</option></select><div class="flex gap-2"><input aria-label="Buscar partida" maxlength="100" bind:value={search}/><button type="button" disabled={finding} onclick={()=>find()} class="border rounded px-2">Buscar</button></div><select aria-label="Resultado" bind:value={chosen} disabled={finding}><option value="">Seleccionar partida</option>{#each lookup as t (t.code)}<option value={t.code}>{t.name} · {(t.sale_cents/100).toFixed(2)} USD</option>{/each}</select><button type="button" disabled={!chosen||finding||lines.length>=30} onclick={pick} class="border rounded px-2">Agregar selección</button>{#if next}<button type="button" disabled={finding} onclick={()=>find(true)} class="border rounded px-2 ml-2">Más</button>{/if}</div>
  {#each lines as l (l.key)}
  <article class="border rounded-xl p-3 space-y-2"><div class="grid gap-2 md:grid-cols-3"><label>Descripción<input required minlength="3" maxlength="130" bind:value={l.name}/></label><label>Tipo<select bind:value={l.kind}><option value="material">Equipo o material</option><option value="labor">Trabajo o servicio</option></select></label><label>Unidad<select bind:value={l.unit}>{#each ['unit','m','m2','kg','set','hour','visit','trip','service'] as u}<option value={u}>{u}</option>{/each}</select></label><label>Necesidad total<input type="number" required min="0.001" max="100000" step="0.001" bind:value={l.required}/></label>{#if l.kind==='material'}<label>Aporta cliente<input type="number" required min="0" max={l.required} step="0.001" bind:value={l.client}/></label><label>Almacén previsto<input type="number" required min="0" max={Math.max(0,l.required-l.client)} step="0.001" bind:value={l.warehouse}/></label>{/if}<label>Venta USD por unidad<input inputmode="decimal" placeholder="Por definir" bind:value={l.price}/></label></div>
  <p class="text-xs text-slate-600">{#if l.kind==='material'}Proveedor previsto: {Math.max(0,l.required-l.client-l.warehouse).toFixed(3)} · Suministro a cobrar: {Math.max(0,l.required-l.client).toFixed(3)}{:else}Se cobra el trabajo independientemente de quién aporte el equipo.{/if}</p>
  <button type="button" disabled={lines.length<=1} onclick={()=>{lines=lines.filter(x=>x.key!==l.key);dirty=true}} class="text-red-800 text-xs underline">Quitar</button></article>
  {/each}
  <div class="flex flex-wrap gap-2"><button type="button" disabled={lines.length>=30} onclick={()=>add('material')} class="border rounded px-3 py-2">+ Material</button><button type="button" disabled={lines.length>=30} onclick={()=>add('labor')} class="border rounded px-3 py-2">+ Mano de obra</button><button type="submit" disabled={busy} class="rounded bg-teal-800 text-white px-3 py-2">Guardar levantamiento</button></div>
 </form>
 {#if proposal}<p class="text-sm">Revisión guardada {proposal.revision}. {proposal.missing.length?'Faltan precios: '+proposal.missing.join(', '):proposal.canImport?'Lista para preparar presupuesto.':'Revisa extensión del resumen o partidas facturables.'}</p>{/if}
 {/if}
</section>
{#if id}{#key id}<QuoteManager {token} requestId={id} {canReview} residentialProposal={!ready||dirty?null:proposal}/>{/key}{/if}
<style>label{font-size:.875rem;font-weight:600}input,select,textarea{display:block;width:100%;border:1px solid #cbd5e1;border-radius:.5rem;padding:.5rem;margin-top:.25rem;font-weight:400}</style>
