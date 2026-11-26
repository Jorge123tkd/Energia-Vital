<script lang="ts">
 import { onMount } from 'svelte';
 import { apiRequest,desktopStudioBridge } from '../lib/api';
 let {token,mode,project,projects,onSaved}:{token:string;mode:string;project:string;projects:{id:string;name:string}[];onSaved:()=>Promise<void>}=$props();
 const units=[['unit','Unidad'],['m','Metro'],['m2','Metro cuadrado'],['kg','Kilogramo'],['set','Juego'],['roll','Rollo'],['box','Caja']];
 const currencies=['USD','CUP','EUR','CNY'],incoterms=['EXW','FCA','FOB','CFR','CIF','DAP','DDP','LOCAL'];
 let items=$state<any[]>([]),suppliers=$state<any[]>([]),orders=$state<any[]>([]),payables=$state<any[]>([]);
 let opened=$state(false),ready=$state(false),busy=$state(false),error=$state(''),message=$state(''),oldNative=$state(false);
 let action=$state(''),orderId=$state(''),orderDetail=$state<any>(null),lines=$state<{key:string;itemId:string;quantity:string;total:string}[]>([]);
 let movementKind=$state('receive'),expenseCategory=$state('goods'),purchaseOrder=$state(''),decisionKind=$state(''),receiptLine=$state('');
 let eligibleOrders=$derived(orders.filter(o=>o.project_id===project&&['ordered','closed'].includes(o.status)));
 let selectedOrder=$derived(eligibleOrders.find(o=>o.id===purchaseOrder));
 let selectedLine=$derived(orderDetail?.lines?.find((l:any)=>l.id===receiptLine));
 let availableDecisions=$derived(orderDetail?.order?.status==='draft'?['approve','cancel']:orderDetail?.order?.status==='ordered'?[...(orderDetail.lines||[]).some((l:any)=>l.outstanding_milli>0)?['receive']:['close'],...(!(orderDetail.lines||[]).some((l:any)=>l.received_milli>0)?['cancel']:[])]:[]);
 let pending=$state<{fingerprint:string;id:string;body:any}|null>(null),disposed=false;
 const call=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 const base='/api/warehouse',finance='/api/business-finance';
 const actions:Record<string,{id:string;name:string}[]>={inventory:[{id:'item',name:'Crear artículo'},{id:'movement',name:'Registrar movimiento'}],suppliers:[{id:'supplier',name:'Registrar proveedor'}],orders:[{id:'order',name:'Crear pedido'},{id:'decision',name:'Gestionar pedido y recepción'}],shortages:[{id:'link',name:'Vincular solicitud comercial'},{id:'requirement',name:'Registrar necesidad aprobada'}],finance:[{id:'link',name:'Vincular solicitud comercial'},{id:'contract',name:'Registrar contrato aceptado'},{id:'obligation',name:'Registrar obligación documentada'},{id:'payment',name:'Registrar pago a proveedor'}]};
 async function collect(path:string,key:string){
  let result:any[]=[],cursor='';
  for(let page=0;page<20;page++){
   const r=await call(path+(cursor?'?after='+encodeURIComponent(cursor):''));
   if(!Array.isArray(r[key]))throw Error('Respuesta incompleta del servidor.');
   result=[...result,...r[key]];
   const next=r.next==null?'':String(r.next);
   if(!next)return result;
   if(next===cursor)throw Error('Paginación inválida.');
   cursor=next;
  }
  throw Error('Listado demasiado amplio; no se habilitan operaciones con referencias incompletas.');
 }
 function addLine(){if(lines.length<50)lines=[...lines,{key:crypto.randomUUID(),itemId:'',quantity:'',total:''}]}
 async function prepare(id:string){
  if(busy||pending)return;opened=true;action=id;ready=false;error='';message='';busy=true;orderDetail=null;orderId='';lines=[];movementKind='receive';expenseCategory='goods';purchaseOrder='';decisionKind='';receiptLine='';
  try{
   const bridge=desktopStudioBridge();
   if(bridge){const info=await bridge.account();if(/^3\.9\.0-beta\.(?:[1-9]|1[01])$/.test(info.version)){oldNative=true;throw Error('Actualiza Windows a beta 12 o posterior para registrar operaciones comerciales.');}}
   if(['movement','requirement','order'].includes(id))items=await collect(base+'/items','items');
   if(['order','obligation'].includes(id))suppliers=(await collect(base+'/procurement/suppliers','suppliers')).filter(x=>Number(x.active)===1);
   if(id==='decision'||id==='obligation')orders=await collect(base+'/procurement/orders','orders');
   if(id==='payment')payables=(await collect(finance+'/payables','payables')).filter(p=>p.project_id===project&&Number(p.outstanding_minor)>0);
   if(id==='order')addLine();
   if(!disposed)ready=true;
  }catch(e){if(!disposed)error=(e as Error).message||'No se pudo preparar la operación.'}
  finally{if(!disposed)busy=false}
 }
 async function inspectOrder(id:string){
  if(busy||pending)return;orderId=id;orderDetail=null;decisionKind='';receiptLine='';error='';if(!id)return;busy=true;
  try{const r=await call(base+'/procurement/orders/'+encodeURIComponent(id));if(!disposed){orderDetail=r;decisionKind=r.order?.status==='draft'?'approve':r.order?.status==='ordered'?(r.lines||[]).some((l:any)=>l.outstanding_milli>0)?'receive':'close':''}}
  catch(e){if(!disposed)error=(e as Error).message}finally{if(!disposed)busy=false}
 }
 const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
 function integerAmount(value:string,scale:number,min:number,max:number){
  if(!/^\d+(?:\.\d+)?$/.test(value))throw Error('Introduce una cantidad numérica válida.');
  const scaled=Number(value)*scale,n=Math.round(scaled);
  if(!Number.isSafeInteger(n)||Math.abs(n-scaled)>0.00001||n<min||n>max)throw Error('Cantidad fuera de rango o con demasiados decimales.');
  return n;
 }
 const qty=(s:string)=>integerAmount(s,1000,1,1000000000);
 const money=(s:string,zero=false)=>integerAmount(s,100,zero?0:1,1000000000000);
 function close(){if(busy||pending)return;opened=false;ready=false;error='';message='';action=''}
 function resolveUnknown(){if(busy||!pending)return;if(window.confirm('Comprueba primero el registro central. ¿Deseas cerrar este intento sin volver a enviarlo? No se revertirá ninguna operación ya registrada.')){pending=null;close();void onSaved();}}
 async function commit(path:string,body:Record<string,unknown>,withId=true){
  const fingerprint=JSON.stringify([path,body,withId]);
  if(pending&&pending.fingerprint!==fingerprint)throw Error('Hay una operación sin confirmación. Reintenta exactamente la misma solicitud.');
  if(!pending){
   if(!window.confirm('¿Confirmar este registro administrativo en Bonaire? Comprueba cantidades, moneda y referencias.'))return;
   const id=crypto.randomUUID();
   pending={fingerprint,id,body:withId?{...body,id}:body};
  }
  busy=true;error='';message='';
  try{
   await call(path,$state.snapshot(pending!.body));pending=null;
   if(!disposed){message='Operación confirmada por el servidor.';ready=false;await onSaved();}
  }catch(e){
   const status=(e as Error&{status?:number}).status;
   // A definitive client rejection can be corrected; unknown outcomes retain the exact operation ID.
   if(status&&[400,401,403,404,405,413,422].includes(status))pending=null;
   if(!disposed)error=((e as Error).message||'Resultado no confirmado.')+(pending?' Conserva este formulario y reintenta el mismo registro.':'');
  }finally{if(!disposed)busy=false}
 }
 async function submit(e:SubmitEvent){
  e.preventDefault();if(busy||!ready)return;
  const f=new FormData(e.currentTarget as HTMLFormElement);
  const v=(k:string)=>text(f,k);
  try{
   if(action==='item')await commit(base+'/items',{name:v('name'),unit:v('unit'),productId:v('productId')||null});
   else if(action==='supplier')await commit(base+'/procurement/suppliers',{name:v('name'),country:v('country'),contact:v('contact')||null});
   else if(action==='movement'){
    const kind=v('kind');if(kind!=='receive'&&!v('projectId'))throw Error('Selecciona el proyecto del movimiento.');if(['issue','consume','return'].includes(kind)&&!v('workId'))throw Error('Introduce una orden de trabajo vinculada.');
    await commit(base+'/movements',{itemId:v('itemId'),kind,quantityMilli:qty(v('quantity')),reference:v('reference'),projectId:kind==='receive'?null:v('projectId'),workId:['issue','consume','return'].includes(kind)?v('workId'):null});
   }else if(action==='link'){
    if(!project)throw Error('Selecciona un proyecto.');
    await commit(base+'/projects/'+encodeURIComponent(project)+'/link',{requestId:v('requestId')},false);
   }else if(action==='requirement'){
    if(!project)throw Error('Selecciona un proyecto.');
    await commit(base+'/projects/'+encodeURIComponent(project)+'/requirements',{itemId:v('itemId'),quantityMilli:qty(v('quantity'))},false);
   }else if(action==='order'){
    if(!lines.length||lines.some(l=>!l.itemId))throw Error('Completa todas las líneas.');
    await commit(base+'/procurement/orders',{supplierId:v('supplierId'),projectId:v('projectId')||null,currency:v('currency'),incoterm:v('incoterm'),reference:v('reference'),lines:lines.map(l=>({id:l.key,itemId:l.itemId,quantityMilli:qty(l.quantity),totalMinor:money(l.total,true)}))});
   }else if(action==='decision'){
    if(!orderDetail||orderDetail.order.id!==orderId)throw Error('Consulta un pedido vigente.');
    const decision=v('decision');
    if(!availableDecisions.includes(decision))throw Error('Operación no permitida para el estado del pedido.');
    if(decision==='receive'){const quantity=qty(v('quantity'));if(!selectedLine||quantity>selectedLine.outstanding_milli||!v('reference'))throw Error('Selecciona una línea pendiente, una cantidad disponible y la referencia de recepción.');await commit(base+'/procurement/receipts',{lineId:selectedLine.id,quantityMilli:quantity,reference:v('reference')});}
    else await commit(base+'/procurement/orders/'+encodeURIComponent(orderId)+'/decision',{decision},false);
   }else if(action==='contract'){
    if(!project)throw Error('Selecciona un proyecto.');
    await commit(finance+'/projects/'+encodeURIComponent(project)+'/contract',{quoteId:v('quoteId'),contractReference:v('reference'),acceptanceEvidence:v('evidence'),acceptedOn:v('date'),dueOn:v('dueOn')||null},false);
   }else if(action==='obligation'){
    if(!project)throw Error('Selecciona un proyecto.');
    const goods=expenseCategory==='goods';if(goods&&!selectedOrder)throw Error('Para materiales selecciona un pedido aprobado de este proyecto.');
    await commit(finance+'/obligations',{supplierId:goods?selectedOrder.supplier_id:v('supplierId'),projectId:project,purchaseOrderId:goods?selectedOrder.id:null,category:expenseCategory,currency:goods?selectedOrder.currency:v('currency'),amountMinor:money(v('amount')),documentReference:v('reference'),evidence:v('evidence'),issuedOn:v('date'),dueOn:v('dueOn')||null});
   }else if(action==='payment'){
    const payable=payables.find(p=>p.id===v('obligationId'));
    if(!payable)throw Error('Selecciona una obligación documentada del proyecto.');if(money(v('amount'))>payable.outstanding_minor)throw Error('El pago supera el saldo pendiente.');
    await commit(finance+'/supplier-payments',{obligationId:payable.id,currency:payable.currency,amountMinor:money(v('amount')),reference:v('reference'),evidence:v('evidence'),paidOn:v('date')});
   }
  }catch(err){error=(err as Error).message}
 }
 onMount(()=>()=>{disposed=true});
</script>
<section class="space-y-3 border rounded-xl p-3" aria-label="Registrar operaciones">
 <h4 class="font-semibold">Registrar operaciones</h4>
 <p class="text-xs text-slate-600">Operaciones centrales con permisos de administrador. No se modifica automáticamente el presupuesto técnico ni se crean cobros bancarios.</p>
 <div class="flex flex-wrap gap-2">{#each actions[mode]||[] as a}<button type="button" class="border rounded-lg px-3 py-2 text-sm" disabled={busy||!!pending||(['finance','shortages'].includes(mode)&&!project)} onclick={()=>prepare(a.id)}>{a.name}</button>{/each}</div>
 {#if error}<p role="alert" class="bg-amber-50 p-2 text-sm">{error}</p>{/if}
 {#if message}<p role="status" class="bg-teal-50 p-2 text-sm">{message}</p>{/if}
 {#if opened&&ready}
  <form class="grid gap-3 md:grid-cols-2" onsubmit={submit}>
   {#if action==='item'||action==='supplier'}<label>Nombre<input name="name" required maxlength="200"/></label>{/if}
   {#if action==='item'}<label>Unidad<select name="unit">{#each units as u}<option value={u[0]}>{u[1]}</option>{/each}</select></label><label>Referencia de producto publicado (opcional)<input name="productId" maxlength="100"/></label>{/if}
   {#if action==='supplier'}<label>País<input name="country" required maxlength="100"/></label><label>Contacto<input name="contact" maxlength="300"/></label>{/if}
   {#if action==='movement'||action==='requirement'}<label>Artículo<select name="itemId" required><option value="">Seleccionar</option>{#each items as i (i.id)}<option value={i.id}>{i.name} · {i.unit}</option>{/each}</select></label><label>Cantidad<input name="quantity" type="number" required min="0.001" max="1000000" step="0.001"/></label>{/if}
   {#if action==='movement'}<label>Movimiento<select name="kind" bind:value={movementKind}><option value="receive">Entrada</option><option value="reserve">Reservar</option><option value="release">Liberar reserva</option><option value="issue">Entregar</option><option value="consume">Consumir</option><option value="return">Devolver</option></select></label>{#if movementKind!=='receive'}<label>Proyecto<select name="projectId" required><option value="">Seleccionar proyecto</option>{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label>{/if}{#if ['issue','consume','return'].includes(movementKind)}<label>Orden de trabajo vinculada<input name="workId" required maxlength="100"/></label>{/if}{/if}
   {#if action==='link'}<label>Identificador de solicitud existente<input name="requestId" required maxlength="100"/></label>{/if}
   {#if action==='order'||(action==='obligation'&&expenseCategory!=='goods')}<label>Proveedor<select name="supplierId" required><option value="">Seleccionar</option>{#each suppliers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>{/if}
   {#if action==='order'}<label>Proyecto<select name="projectId"><option value="">Compra general</option>{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label><label>Incoterm<select name="incoterm">{#each incoterms as i}<option>{i}</option>{/each}</select></label>
    <div class="md:col-span-2 space-y-2"><p class="font-semibold">Líneas del pedido (importe total por línea)</p>{#each lines as l (l.key)}<div class="grid gap-2 md:grid-cols-4"><select aria-label="Artículo" required bind:value={l.itemId}><option value="">Seleccionar artículo</option>{#each items as i (i.id)}<option value={i.id}>{i.name}</option>{/each}</select><input aria-label="Cantidad" type="text" inputmode="decimal" required placeholder="Cantidad" bind:value={l.quantity}/><input aria-label="Importe total" type="text" inputmode="decimal" required placeholder="Importe total" bind:value={l.total}/><button type="button" disabled={lines.length===1||busy||!!pending} onclick={()=>lines=lines.filter(x=>x.key!==l.key)}>Quitar</button></div>{/each}<button type="button" disabled={busy||!!pending||lines.length>=50} onclick={addLine}>Agregar línea</button></div>
   {/if}
   {#if action==='decision'}<label>Pedido<select value={orderId} disabled={busy||!!pending} onchange={e=>inspectOrder(e.currentTarget.value)}><option value="">Seleccionar</option>{#each orders as o (o.id)}<option value={o.id}>{o.reference} · {o.status}</option>{/each}</select></label>
    {#if orderDetail}<label>Operación<select name="decision" bind:value={decisionKind} required><option value="">Seleccionar</option>{#each availableDecisions as d}<option value={d}>{({approve:'Aprobar pedido',close:'Cerrar pedido',cancel:'Cancelar pedido',receive:'Registrar recepción'} as Record<string,string>)[d]}</option>{/each}</select></label>{#if !availableDecisions.length}<p class="text-sm">Este pedido está finalizado y no admite cambios.</p>{/if}{#if decisionKind==='receive'}<label>Línea pendiente<select name="lineId" bind:value={receiptLine} required><option value="">Seleccionar</option>{#each (orderDetail.lines||[]).filter((l:any)=>l.outstanding_milli>0) as l (l.id)}<option value={l.id}>{l.name} · {l.outstanding_milli/1000} {l.unit} pendientes</option>{/each}</select></label><label>Cantidad recibida<input name="quantity" type="number" required min="0.001" max={selectedLine?selectedLine.outstanding_milli/1000:1000000} step="0.001"/></label>{/if}{/if}
   {/if}
   {#if action==='contract'}<label>Identificador de cotización aceptada<input name="quoteId" required maxlength="100"/></label>{/if}
   {#if action==='obligation'}<label>Categoría<select name="category" bind:value={expenseCategory}><option value="goods">Materiales</option><option value="freight">Flete</option><option value="customs">Aduana</option><option value="insurance">Seguro</option><option value="installation">Instalación</option><option value="labor">Mano de obra</option><option value="other">Otros</option></select></label>{#if expenseCategory==='goods'}<label>Pedido aprobado<select name="purchaseOrderId" bind:value={purchaseOrder} required><option value="">Seleccionar</option>{#each eligibleOrders as o (o.id)}<option value={o.id}>{o.reference} · {o.supplier_name} · {o.currency}</option>{/each}</select></label>{#if selectedOrder}<p class="text-sm">Proveedor: {selectedOrder.supplier_name} · Moneda: {selectedOrder.currency}</p>{:else if !eligibleOrders.length}<p class="text-sm">Primero aprueba un pedido asociado a este proyecto.</p>{/if}{/if}{/if}
   {#if action==='payment'}<label>Obligación<select name="obligationId" required><option value="">Seleccionar</option>{#each payables as p (p.id)}<option value={p.id}>{p.supplier_name} · {p.document_reference||p.id} · {p.outstanding_minor/100} {p.currency} pendientes</option>{/each}</select></label>{/if}
   {#if action==='order'||(action==='obligation'&&expenseCategory!=='goods')}<label>Moneda<select name="currency">{#each currencies as c}<option>{c}</option>{/each}</select></label>{/if}
   {#if action==='obligation'||action==='payment'}<label>Importe<input name="amount" type="number" min="0.01" step="0.01" required/></label>{/if}
   {#if ['movement','order','decision','contract','obligation','payment'].includes(action)}<label>Referencia documental<input name="reference" required={action!=='decision'||decisionKind==='receive'} maxlength={action==='payment'?150:200}/></label>{/if}
   {#if ['contract','obligation','payment'].includes(action)}<label>Fecha del documento o pago<input name="date" type="date" required/></label><label>Evidencia verificable<textarea name="evidence" required minlength="15" maxlength="900"></textarea></label>{/if}
   {#if action==='contract'||action==='obligation'}<label>Vencimiento (opcional)<input name="dueOn" type="date"/></label>{/if}
   <div class="md:col-span-2 flex gap-2"><button type="submit" disabled={busy||(action==='decision'&&(!orderDetail||!availableDecisions.includes(decisionKind)))||(action==='obligation'&&expenseCategory==='goods'&&!selectedOrder)||(action==='payment'&&!payables.length)}>{busy?'Procesando…':pending?'Reintentar mismo registro':'Confirmar registro'}</button><button type="button" disabled={busy||!!pending} onclick={close}>Cerrar formulario</button></div>
   {#if pending}<p class="md:col-span-2 text-xs text-slate-600">No cambies ni abandones el formulario hasta confirmar el resultado. La misma solicitud se reintenta con su identificador original.</p><button type="button" disabled={busy} onclick={resolveUnknown}>He revisado el registro central: cerrar intento</button>{/if}
  </form>
 {:else if opened&&busy}<p role="status" class="text-sm">Consultando referencias…</p>{:else if opened&&!oldNative}<button type="button" onclick={close}>Cerrar</button>{/if}
</section>
<style>
 label{display:block;font-size:.875rem;font-weight:600} input,select,textarea{display:block;width:100%;border:1px solid #cbd5e1;border-radius:.5rem;padding:.5rem;margin-top:.25rem;font-weight:400;min-width:0} form button{border:1px solid #94a3b8;border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem} button[type=submit]{background:#115e59;color:white} button:disabled{opacity:.5}
</style>