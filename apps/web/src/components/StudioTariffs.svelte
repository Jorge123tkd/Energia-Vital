<script lang="ts">
 import {onMount} from 'svelte';
 import {apiRequest} from '../lib/api';
 let {token}:{token:string}=$props();
 type Row={code:string;revision:number;name:string;category:string;unit:string;service_id:string|null;sale_cents:number|null;cost_cents:number|null;conditions:string;active:number};
 let rows=$state<Row[]>([]),next=$state<string|null>(null),busy=$state(false),error=$state(''),notice=$state(''),editing=$state(false);
 let services=$state<{id:string;name:string}[]>([]),serviceSearch=$state(''),serviceNext=$state<string|null>(null),serviceBusy=$state(false);
 let code=$state(''),revision=$state(0),name=$state(''),category=$state('labor'),unit=$state('unit'),serviceId=$state<string|null>(null),sale=$state(''),cost=$state(''),conditions=$state(''),active=$state(true);
 const cats=[['labor','Mano de obra'],['material','Material'],['transport','Transporte'],['handling','Manipulación'],['other','Otros']];
 const units=[['unit','Unidad'],['m','Metro'],['m2','Metro cuadrado'],['kg','Kilogramo'],['set','Conjunto'],['hour','Hora'],['visit','Visita'],['trip','Viaje'],['service','Servicio']];
 const url='/api/quotes/tariffs/manage';
 const call=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 const label=(v:number|null)=>v===null?'Por definir':(v/100).toFixed(2)+' USD';
 async function load(more=false){busy=true;error='';try{const r=await call(url+(more&&next?'?after='+encodeURIComponent(next):''));rows=more?[...rows,...r.tariffs]:r.tariffs;next=r.next}catch(e){error=(e as Error).message}finally{busy=false}}
 async function loadServices(more=false){serviceBusy=true;error='';try{const p=new URLSearchParams({search:serviceSearch});if(more&&serviceNext)p.set('after',serviceNext);const r=await call(url+'/services?'+p);services=more?[...services,...r.services]:r.services;serviceNext=r.next}catch(e){error=(e as Error).message}finally{serviceBusy=false}}
 function edit(r?:Row){code=r?.code||'';revision=r?.revision||0;name=r?.name||'';category=r?.category||'labor';unit=r?.unit||'unit';serviceId=r?.service_id||null;sale=r?.sale_cents==null?'':String(r.sale_cents/100);cost=r?.cost_cents==null?'':String(r.cost_cents/100);conditions=r?.conditions||'';active=r?!!r.active:true;editing=true;error='';notice='';serviceSearch='';void loadServices()}
 function cents(v:string){if(!v.trim())return null;if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v.trim()))throw Error('Introduce importes USD con hasta dos decimales.');return Math.round(Number(v)*100)}
 async function save(e:SubmitEvent){e.preventDefault();if(busy)return;error='';notice='';try{const body={code,expected_revision:revision,name,category,unit,service_id:serviceId,sale_cents:cents(sale),cost_cents:cents(cost),conditions,active};if(!window.confirm('¿Guardar esta revisión del tarifario? No modifica presupuestos ni existencias.'))return;busy=true;await call(url,body);editing=false;notice='Tarifa registrada. Las cotizaciones anteriores se conservan.';await load()}catch(e){error=(e as Error).message}finally{busy=false}}
 onMount(()=>{void load()});
</script>
<section class="space-y-3" aria-label="Tarifario central">
 <p class="text-sm text-slate-600">Precios unitarios en USD. Solo administración puede modificar las tarifas y consultar costos. Una tarifa sin precio no se ofrece en presupuestos.</p>
 <div class="flex gap-2"><button type="button" disabled={busy||editing} onclick={()=>edit()} class="rounded-lg bg-teal-800 text-white px-3 py-2">Nueva tarifa</button><button type="button" disabled={busy} onclick={()=>load()} class="rounded-lg border px-3 py-2">Actualizar</button></div>
 {#if error}<p role="alert" class="bg-amber-50 p-3 rounded">{error}</p>{/if}
 {#if notice}<p role="status" class="bg-teal-50 p-3 rounded">{notice}</p>{/if}
 {#if editing}<form onsubmit={save} class="grid gap-3 md:grid-cols-2 border rounded-xl p-3">
 <label>Código único<input required pattern="[a-z0-9_-]{3,80}" readonly={revision>0} bind:value={code}/></label>
 <label>Nombre<input required minlength="3" maxlength="150" bind:value={name}/></label>
 <label>Categoría<select bind:value={category}>{#each cats as c}<option value={c[0]}>{c[1]}</option>{/each}</select></label>
 <label>Unidad<select bind:value={unit}>{#each units as u}<option value={u[0]}>{u[1]}</option>{/each}</select></label>
 <div class="md:col-span-2 space-y-2"><label>Servicio de Bonaire vinculado (opcional)<select bind:value={serviceId} disabled={serviceBusy}><option value={null}>Tarifa interna independiente</option>{#if serviceId&&!services.some(s=>s.id===serviceId)}<option value={serviceId}>Servicio ya vinculado</option>{/if}{#each services as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label><div class="flex gap-2"><input aria-label="Buscar servicio existente" bind:value={serviceSearch} maxlength="100"/><button type="button" disabled={serviceBusy} onclick={()=>loadServices()} class="border rounded px-2">Buscar servicio</button>{#if serviceNext}<button type="button" disabled={serviceBusy} onclick={()=>loadServices(true)} class="border rounded px-2">Más</button>{/if}</div></div>
 <label>Precio de venta USD<input inputmode="decimal" placeholder="Por definir" bind:value={sale}/></label>
 <label>Costo interno USD<input inputmode="decimal" placeholder="Por definir" bind:value={cost}/></label>
 <label class="md:col-span-2">Condiciones<textarea maxlength="500" bind:value={conditions}></textarea></label>
 <label class="flex gap-2 items-center"><input type="checkbox" bind:checked={active}/> Activa</label>
 <div class="flex gap-2"><button disabled={busy} type="submit" class="rounded bg-teal-800 text-white px-3 py-2">Guardar revisión</button><button type="button" disabled={busy} onclick={()=>editing=false} class="border rounded px-3">Cancelar</button></div>
 </form>{/if}
 {#each rows as r (r.code)}<article class="border rounded-xl p-3 flex justify-between gap-3"><div><p class="font-bold">{r.name} · {r.unit}</p><p class="text-xs">{r.code} · Revisión {r.revision} · {r.active?'Activa':'Inactiva'}</p><p>Venta: {label(r.sale_cents)} · Costo: {label(r.cost_cents)}</p><p class="text-xs">{r.conditions}</p></div><button type="button" disabled={busy||editing} onclick={()=>edit(r)} class="border rounded px-3">Editar</button></article>{/each}
 {#if !rows.length&&!busy&&!error}<p>No hay tarifas definidas. Agrega las que Bonaire autorice.</p>{/if}
 {#if next}<button type="button" disabled={busy} onclick={()=>load(true)} class="border rounded px-3 py-2">Más tarifas</button>{/if}
</section>
<style>label{font-size:.875rem;font-weight:600}input:not([type=checkbox]),select,textarea{display:block;width:100%;border:1px solid #cbd5e1;border-radius:.5rem;padding:.5rem;margin-top:.25rem;font-weight:400}</style>
