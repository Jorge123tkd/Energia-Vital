<script lang="ts">
 import {apiRequest} from '../lib/api';
 let {token,quoteId}:{token:string;quoteId:string}=$props();
 let opened=$state(false),data=$state<any>(null),busy=$state(false),error=$state(''),notice=$state(''),reference=$state(''),customer=$state(''),date=$state(''),summary=$state(''),warranty=$state(''),end=$state(''),evidence=$state(''),reviewed=$state(false),fileInput:HTMLInputElement;
 const base=()=>'/api/quotes/contracts/execution/delivery/'+encodeURIComponent(quoteId);
 const call=(suffix='',body?:unknown)=>apiRequest(base()+suffix,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 async function load(){busy=true;error='';try{data=await call();if(!data.delivery){reference='ENT-'+quoteId.slice(0,24);customer=data.context.customer_name||'';warranty=data.context.warranty_terms||'';summary=data.context.scope||''}}catch(e){error=(e as Error).message}finally{busy=false}}
 const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 function printable(certificate=false){const d=data.delivery;const r=certificate?d.reference:reference,n=certificate?d.customer_name:customer,day=certificate?d.delivered_on:date,scope=certificate?d.summary:summary,terms=certificate?d.warranty_terms:warranty,until=certificate?d.warranty_end:end;
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Bonaire · Entrega y garantía</title><style>@page{size:A4;margin:16mm}body{font:13px/1.6 system-ui;color:#18323a}h1{color:#0f766e}p{white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:40px;break-inside:avoid}</style><h1>BONAIRE · Energía Vital</h1><h2>'+(certificate?'Certificado de garantía':'Acta de entrega — modelo para revisar y firmar')+'</h2><p>Referencia: '+esc(r)+'<br>Contrato: '+esc(data.context.contract_reference)+'<br>Orden de trabajo: '+esc(data.context.work_reference)+'<br>Cliente: '+esc(n)+'<br>Fecha: '+esc(day)+'</p><h3>Trabajos y comprobaciones</h3><p>'+esc(scope)+'</p><h3>Cobertura pactada</h3><p>'+esc(terms)+'</p><p>Fin de cobertura indicado: '+esc(until||'Según las condiciones contractuales')+'</p><p>La garantía se rige por el contrato y los derechos aplicables. Contacto: bnergiv.com/contacto.</p>'+(certificate?'<p>Acta firmada registrada: '+esc(d.reference)+'. Este certificado no acredita saldo pagado.</p>':'<p>Las partes declaran su conformidad con los trabajos y observaciones consignados, sin renunciar a los derechos de garantía aplicables.</p><footer>Firma del cliente: ____________________<br>Firma de Bonaire: ____________________</footer>');
 download(new Blob([html],{type:'text/html;charset=utf-8'}),'Bonaire-'+(certificate?'garantia-':'acta-')+quoteId+'.html')}
 async function save(e:SubmitEvent){e.preventDefault();const f=fileInput?.files?.[0];if(busy||!f||!reviewed)return;if(f.size>8*1024*1024||!f.name.toLowerCase().endsWith('.pdf')){error='Selecciona PDF de hasta 8 MB.';return}if(!window.confirm('¿Registrar acta firmada, trabajos revisados y garantía pactada? No registra pagos ni cierra el saldo.'))return;busy=true;error='';try{const bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));await call('',{reference,customer_name:customer,delivered_on:date,summary,warranty_terms:warranty,warranty_end:end||null,evidence,filename:f.name,pdf:btoa(raw),reviewed:true});await load();notice='Entrega documentada. El saldo financiero permanece independiente.'}catch(e){error=(e as Error).message}finally{busy=false}}
 async function signed(){busy=true;error='';try{const r=await call('/signed');download(new Blob([Uint8Array.from(atob(r.pdf),x=>x.charCodeAt(0))],{type:'application/pdf'}),r.filename)}catch(e){error=(e as Error).message}finally{busy=false}}
</script>
<section class="border rounded-lg p-3 space-y-2"><button type="button" class="font-bold text-teal-800 underline" onclick={()=>{opened=!opened;if(opened&&!data)void load()}}>Entrega y garantía</button>
{#if opened}
<p class="text-xs">Cierre comercial documentado, separado del cierre técnico y financiero. No certifica automáticamente una firma ni modifica las condiciones legales pactadas.</p>
{#if error}<p role="alert" class="bg-amber-50 p-2">{error}</p>{/if}{#if notice}<p role="status" class="bg-teal-50 p-2">{notice}</p>{/if}
<button type="button" disabled={busy} onclick={load} class="border rounded px-2 py-1">Actualizar comprobaciones</button>
{#if data}
{#if data.delivery}<p class="font-semibold text-teal-800">Entrega documentada · {data.delivery.reference}</p><p>{data.delivery.delivered_on} · {data.delivery.customer_name}</p><p class="text-xs break-all">SHA-256: {data.delivery.sha256}</p><button type="button" disabled={busy} onclick={signed} class="border rounded px-3 py-2">Descargar acta firmada</button> <button type="button" onclick={()=>printable(true)} class="border rounded px-3 py-2">Descargar garantía imprimible</button>
{:else}
<p class="text-sm">Trabajos terminados con informe: {data.checks.completed} · Pendientes: {data.checks.pending} · Partidas por conciliar: {data.checks.outstanding}</p>
<form onsubmit={save} class="space-y-2">
<label class="block">Referencia<input required minlength="3" maxlength="100" bind:value={reference} class="block w-full border rounded p-2"/></label>
<label class="block">Cliente<input required minlength="3" maxlength="300" bind:value={customer} class="block w-full border rounded p-2"/></label>
<label class="block">Fecha de entrega<input type="date" required bind:value={date} class="block border rounded p-2"/></label>
<label class="block">Trabajos realizados y comprobaciones<textarea required minlength="10" maxlength="2000" bind:value={summary} class="block w-full border rounded p-2"></textarea></label>
<label class="block">Garantía según contrato<textarea required minlength="10" maxlength="2000" bind:value={warranty} class="block w-full border rounded p-2"></textarea></label>
<label class="block">Fin de cobertura, si aplica<input type="date" bind:value={end} min={date} class="block border rounded p-2"/></label>
<button type="button" disabled={busy||!date||customer.trim().length<3||summary.trim().length<10||warranty.trim().length<10} onclick={()=>printable()} class="border rounded px-3 py-2">Descargar acta para firmar</button>
<label class="block">Evidencia de revisión y conformidad<textarea required minlength="15" maxlength="900" bind:value={evidence} class="block w-full border rounded p-2"></textarea></label>
<input type="file" accept=".pdf" required bind:this={fileInput}/>
<label class="flex gap-2"><input type="checkbox" required bind:checked={reviewed}/> Verifiqué ambas firmas, alcance, conformidad y condiciones de garantía.</label>
<button type="submit" disabled={busy||!reviewed||!data.checks.completed||data.checks.pending>0||data.checks.outstanding>0} class="bg-teal-800 text-white rounded px-3 py-2">Registrar entrega firmada</button>
</form>
{/if}{/if}{/if}</section>
