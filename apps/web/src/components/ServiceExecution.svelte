<script lang="ts">
 import {onMount} from 'svelte';
 import {apiRequest} from '../lib/api';
 import ServiceDelivery from './ServiceDelivery.svelte';
 let {token,quoteId}:{token:string;quoteId:string}=$props();
 let data=$state<any>(null),availability=$state<any>(null),busy=$state(false),error=$state(''),notice=$state(''),reference=$state(''),scope=$state(''),note=$state(''),mode=$state('warehouse'),date=$state(''),brigade=$state(''),minutes=$state(480),ack=$state(false);
 const base='/api/quotes/contracts/execution/'+encodeURIComponent(quoteId);
 const call=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 async function load(){busy=true;error='';try{data=await call(base);if(!data.order){reference='OT-'+quoteId.slice(0,24);scope=data.context.title||''}}catch(e){error=(e as Error).message}finally{busy=false}}
 async function authorize(e:SubmitEvent){e.preventDefault();if(busy||!window.confirm('¿Autorizar el trabajo según contrato firmado y materiales comprobados? No se descuentan existencias ni se asigna brigada.'))return;busy=true;error='';try{data=await call(base,{reference,scope,readiness_note:note,material_mode:mode});notice='Orden autorizada.'}catch(e){error=(e as Error).message}finally{busy=false}}
 async function check(){busy=true;error='';availability=null;brigade='';ack=false;try{availability=await call('/api/brigade-work/availability?date='+encodeURIComponent(date));brigade=availability.recommended_brigade_id||''}catch(e){error=(e as Error).message}finally{busy=false}}
 async function schedule(e:SubmitEvent){e.preventDefault();if(busy||availability?.date!==date||!window.confirm('¿Registrar esta asignación en la agenda técnica? Confirma la fecha con el cliente antes.'))return;busy=true;error='';try{const r=await call('/api/brigade-work',{brigade_id:brigade,request_id:data.context.request_id,work_date:date,estimated_minutes:Number(minutes),busy_acknowledged:ack,work_order_quote_id:quoteId});notice=r.message;availability=null;await load()}catch(e){error=(e as Error).message}finally{busy=false}}
 onMount(()=>{void load()});
</script>
<section class="border rounded-lg p-3 space-y-3">
 <h3 class="font-bold">Orden de trabajo y planificación</h3>
 <p class="text-xs text-slate-600">La cobertura se calcula con reservas, entregas y consumos registrados; un pedido pendiente no equivale a material disponible. Comprueba también la seguridad, el acceso y el alcance pactado.</p>
 {#if error}<p role="alert" class="bg-amber-50 p-2">{error}</p>{/if}{#if notice}<p role="status" class="bg-teal-50 p-2">{notice}</p>{/if}
 <button type="button" disabled={busy} onclick={load} class="border rounded px-2 py-1">Actualizar</button>
 {#if data}<p class="text-sm">Contrato: {data.context.contract_reference} · Proyecto: {data.context.project_id||'No vinculado'}</p>
 {#each data.requirements as r (r.item_id)}<div class="text-sm border-b py-1">{r.name}: necesario {r.required_milli/1000} · reservado {r.reserved_milli/1000} · faltante {r.uncovered_milli/1000} {r.unit}</div>{/each}
 {#if data.requirements_truncated}<p>Consulta el listado completo en Almacén y compras.</p>{/if}
 {#if !data.order}<form onsubmit={authorize} class="space-y-2"><label class="block">Referencia<input required minlength="3" maxlength="100" bind:value={reference} class="block w-full border rounded p-2"/></label><label class="block">Trabajos a realizar<textarea required minlength="3" maxlength="2000" bind:value={scope} class="block w-full border rounded p-2"></textarea></label><label class="block">Origen de los materiales<select bind:value={mode} class="block border rounded p-2"><option value="warehouse">Necesidades registradas y cubiertas en almacén</option><option value="customer_only">Todo aportado por cliente / no requiere materiales</option></select></label><label class="block">Evidencia de comprobación de equipos, seguridad, materiales y acceso<textarea required minlength="15" maxlength="1000" bind:value={note} class="block w-full border rounded p-2"></textarea></label><button type="submit" disabled={busy||!data.context.project_id} class="bg-teal-800 text-white rounded px-3 py-2">Autorizar orden</button></form>
 {:else}<p class="font-semibold text-teal-800">{data.order.reference} · Autorizada</p><p class="whitespace-pre-wrap text-sm">{data.order.scope}</p>
 <form onsubmit={schedule} class="space-y-2"><label class="block">Fecha acordada (Cuba)<input type="date" required bind:value={date} onchange={()=>{availability=null;brigade=''}} class="block border rounded p-2"/></label><button type="button" disabled={busy||!date} onclick={check} class="border rounded px-3 py-2">Consultar disponibilidad</button>
 {#if availability?.date===date}<label class="block">Brigada<select required bind:value={brigade} class="block w-full border rounded p-2"><option value="">Seleccionar</option>{#each availability.brigades as b (b.id)}<option value={b.id}>{b.name} · {b.day_jobs?'Ocupada':'Disponible'}{b.id===availability.recommended_brigade_id?' · Recomendada':''}</option>{/each}</select></label><label class="block">Duración estimada (min)<input type="number" min="30" max="1440" required bind:value={minutes} class="block border rounded p-2"/></label><label class="flex gap-2"><input type="checkbox" bind:checked={ack}/> Reconozco la ocupación si procede.</label><button type="submit" disabled={busy||!brigade} class="bg-teal-800 text-white rounded px-3 py-2">Programar brigada</button>{/if}</form>
 {#each data.works as w (w.id)}<p class="text-sm">{w.work_date} · {w.brigade_name} · {w.status}</p>{/each}
 <ServiceDelivery {token} {quoteId}/>
 {/if}{/if}
</section>