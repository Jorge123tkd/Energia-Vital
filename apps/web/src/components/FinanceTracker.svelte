<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';

  type Declaration={
    id:string;source:string;funding_stage:string;
    approved_funds_declared_cents:number|null;
    available_funds_declared_cents:number|null;advance_proposed_cents:number|null;
    payment_method:string;payment_deadline:string|null;
    expected_payment_date:string|null;notes:string;actor_email:string;created_at:string;
  };
  type Report={
    id:string;amount_usd_cents:number;payment_method:string;reported_on:string;
    reference:string|null;report_note:string;verification_status:string;
    verification_basis:string|null;review_note:string|null;reviewed_at:string|null;
    reported_by_email:string;reviewed_by_email:string|null;created_at:string;
  };
  let {token,requestId,canReview=false}:{
    token:string;requestId:string;canReview?:boolean;
  }=$props();
  let declarations:Declaration[]=$state([]),reports:Report[]=$state([]);
  let summary:{unverified_cents:number;reviewed_manual_cents:number;report_count:number}=$state({
    unverified_cents:0,reviewed_manual_cents:0,report_count:0
  });
  let truncated=$state(false),loading=$state(false),busy=$state(false),error=$state(''),success=$state('');
  let showDeclaration=$state(false),showReport=$state(false),reviewId=$state('');
  let source=$state('customer_reported'),fundingStage=$state('not_confirmed');
  let approvedUsd=$state(''),availableUsd=$state(''),advanceUsd=$state('');
  let paymentMethod=$state('undecided'),paymentDeadline=$state(''),expectedPaymentDate=$state('');
  let fundingNotes=$state('');
  let paidUsd=$state(''),reportedOn=$state(''),reportMethod=$state('transfer');
  let reference=$state(''),reportNotes=$state('');
  let decision:'manual_verify'|'reject'=$state('manual_verify');
  let verificationBasis=$state('bank_statement'),reviewNote=$state(''),independentlyChecked=$state(false);
  const currency=(v:number|null|undefined)=>
    v===null||v===undefined?'No declarado':
    new Intl.NumberFormat('es-CU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)/100)+' USD';
  const toCents=(s:string):number|null=>{
    if(!s.trim())return null;
    const t=s.trim().replace(',','.');
    if(!/^\d{1,9}(\.\d{1,2})?$/.test(t))return Number.NaN;
    const [whole,frac='']=t.split('.');
    return Number(whole)*100+Number((frac+'00').slice(0,2));
  };
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',
    month:'2-digit',day:'2-digit'}).format(new Date());
  const methodNames:Record<string,string>={
    transfer:'Transferencia',cash:'Efectivo',card:'Tarjeta',mixed:'Mixto',
    other:'Otro (revisar)',undecided:'Sin definir'
  };
  const stageNames:Record<string,string>={
    not_confirmed:'Sin confirmar',approval_pending:'Esperando aprobación',
    approval_reported:'Cliente declara aprobación',availability_reported:'Cliente declara fondos disponibles'
  };
  const reportNames:Record<string,string>={
    reported:'REPORTADO · no verificado',
    verified_manual:'REVISIÓN ADMINISTRATIVA MANUAL',
    rejected:'Reporte rechazado'
  };
  const basisNames:Record<string,string>={
    bank_statement:'Extracto comprobado por administrador',cash_count:'Recuento físico de efectivo',
    provider_confirmation:'Confirmación de proveedor',other:'Otra evidencia documentada'
  };
  async function load(){
    loading=true;error='';
    try{
      const r=await api.getRequestFinance(token,requestId);
      declarations=r.declarations||[];reports=r.reports||[];
      summary=r.summary||{unverified_cents:0,reviewed_manual_cents:0,report_count:0};
      truncated=Object.values(r.truncated||{}).some(Boolean);
    }catch(e){error=e instanceof Error?e.message:'No se pudo consultar el seguimiento económico.';}
    finally{loading=false;}
  }
  async function saveDeclaration(e:SubmitEvent){
    e.preventDefault();
    if(busy)return;
    busy=true;error='';success='';
    try{
      const approved=toCents(approvedUsd),available=toCents(availableUsd),advance=toCents(advanceUsd);
      if([approved,available,advance].some(x=>x!==null&&(!Number.isSafeInteger(x)||Number(x)<0)))
        throw Error('Escribe importes válidos con hasta dos decimales y en USD.');
      const r=await api.logFinancialDeclaration(token,requestId,{
        source,funding_stage:fundingStage,approved_funds_declared_cents:approved,
        available_funds_declared_cents:available,advance_proposed_cents:advance,
        payment_method:paymentMethod,payment_deadline:paymentDeadline||null,
        expected_payment_date:expectedPaymentDate||null,notes:fundingNotes.trim()
      });
      success=r.message;showDeclaration=false;
      approvedUsd='';availableUsd='';advanceUsd='';fundingNotes='';
      await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo guardar la declaración.';}
    finally{busy=false;}
  }
  async function saveReport(e:SubmitEvent){
    e.preventDefault();
    if(busy)return;
    busy=true;error='';success='';
    try{
      const amount=toCents(paidUsd);
      if(amount===null||!Number.isSafeInteger(amount)||amount<=0)
        throw Error('Indica un importe positivo en USD.');
      const r=await api.logPaymentReport(token,requestId,{
        amount_usd_cents:amount,payment_method:reportMethod,reported_on:reportedOn,
        reference:reference.trim()||null,report_note:reportNotes.trim()
      });
      success=r.message;showReport=false;
      paidUsd='';reference='';reportNotes='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo registrar el reporte.';}
    finally{busy=false;}
  }
  function openReview(id:string){
    reviewId=id;decision='manual_verify';verificationBasis='bank_statement';
    reviewNote='';independentlyChecked=false;error='';success='';
  }
  async function saveReview(e:SubmitEvent){
    e.preventDefault();
    if(!canReview||busy||!reviewId)return;
    if(decision==='manual_verify'&&!independentlyChecked){
      error='Confirma que comprobaste la evidencia por un medio independiente.';return;
    }
    if(!window.confirm(decision==='manual_verify'?
      '¿Registrar una comprobación administrativa MANUAL? No equivale a conciliación bancaria automática.':
      '¿Rechazar este reporte sin eliminarlo del historial?'))return;
    busy=true;error='';success='';
    try{
      const r=await api.reviewPaymentReport(token,reviewId,{
        decision,verification_basis:decision==='manual_verify'?verificationBasis:null,
        review_note:reviewNote.trim(),confirm_independent_check:independentlyChecked
      });
      success=r.message;reviewId='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo registrar la revisión.';}
    finally{busy=false;}
  }
  onMount(()=>{void load();});
</script>

<section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" aria-label="Seguimiento económico privado">
  <div class="flex flex-wrap justify-between gap-3 items-start">
    <div>
      <h3 class="text-lg font-extrabold text-slate-900">Seguimiento económico · USD</h3>
      <p class="text-xs text-slate-600">Fondos declarados, condiciones previstas y reportes de pago. Historial privado.</p>
    </div>
    <button type="button" onclick={load} disabled={busy||loading}
      class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Actualizar</button>
  </div>
  <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
    <strong>Importante:</strong> un presupuesto o fondos declarados no acreditan disponibilidad real.
    Un pago reportado no es dinero recibido. La revisión manual del administrador no es conciliación bancaria automática ni comprobación contable.
  </p>
  {#if error}<p role="alert" class="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>{/if}
  {#if success}<p role="status" class="rounded-lg bg-teal-50 border border-teal-200 p-3 text-sm text-teal-900">{success}</p>{/if}
  {#if loading}<p role="status" class="text-sm text-slate-500">Cargando información económica…</p>{/if}

  <div class="grid sm:grid-cols-2 gap-2">
    <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl">
      <p class="text-xs text-amber-900 font-bold">Reportado, sin verificar</p>
      <p class="text-xl font-extrabold text-amber-950">{currency(summary.unverified_cents)}</p>
    </div>
    <div class="p-3 bg-teal-50 border border-teal-200 rounded-xl">
      <p class="text-xs text-teal-900 font-bold">Revisado manualmente por administración</p>
      <p class="text-xl font-extrabold text-teal-950">{currency(summary.reviewed_manual_cents)}</p>
    </div>
  </div>
  <p class="text-xs text-slate-500">Estas cifras suman reportes registrados por categoría; no son saldo bancario, ingreso contable ni deuda exigible. Reportes rechazados no se suman.</p>
  <div class="flex flex-wrap gap-2">
    <button type="button" onclick={()=>{showDeclaration=!showDeclaration;showReport=false;}}
      class="rounded-lg bg-teal-700 text-white font-semibold text-xs px-3 py-2">
      {showDeclaration?'Cerrar formulario':'+ Registrar fondos o condiciones declaradas'}
    </button>
    <button type="button" onclick={()=>{showReport=!showReport;showDeclaration=false;reportedOn=today;}}
      class="rounded-lg border border-teal-200 text-teal-800 font-semibold text-xs px-3 py-2">
      {showReport?'Cerrar formulario':'+ Anotar pago reportado (NO verificado)'}
    </button>
  </div>

  {#if showDeclaration}
    <form onsubmit={saveDeclaration} class="space-y-3 rounded-xl border border-teal-200 p-3">
      <h4 class="font-extrabold text-sm">Declaración comercial · no verificada</h4>
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="block text-xs font-semibold">Origen de la información
          <select bind:value={source} class="block w-full border rounded-lg p-2 mt-1">
            <option value="customer_reported">Lo declara el cliente</option>
            <option value="terms_discussed">Condiciones conversadas con el gestor</option>
          </select>
        </label>
        <label class="block text-xs font-semibold">Estado informado de los fondos
          <select bind:value={fundingStage} class="block w-full border rounded-lg p-2 mt-1">
            <option value="not_confirmed">Sin confirmar</option>
            <option value="approval_pending">Pendiente de aprobación</option>
            <option value="approval_reported">Cliente declara tener aprobación</option>
            <option value="availability_reported">Cliente declara fondos disponibles</option>
          </select>
        </label>
        <label class="block text-xs font-semibold">Fondos declarados como aprobados (USD)
          <input inputmode="decimal" bind:value={approvedUsd} placeholder="Sin declaración"
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Fondos declarados como disponibles (USD)
          <input inputmode="decimal" bind:value={availableUsd} placeholder="Sin declaración"
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Anticipo propuesto, no recibido (USD)
          <input inputmode="decimal" bind:value={advanceUsd} placeholder="Opcional"
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Modalidad prevista
          <select bind:value={paymentMethod} class="block w-full border rounded-lg p-2 mt-1">
            {#each Object.entries(methodNames) as [code,name]}
              <option value={code}>{name}</option>
            {/each}
          </select>
        </label>
        <label class="block text-xs font-semibold">Plazo límite de pago previsto
          <input type="date" bind:value={paymentDeadline} class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Fecha en la que esperan pagar
          <input type="date" bind:value={expectedPaymentDate} class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
      </div>
      <label class="block text-xs font-semibold">Aclaraciones del cliente o gestor (obligatorio)
        <textarea rows="3" minlength="3" maxlength="1500" required bind:value={fundingNotes}
          placeholder="Ej.: empresa estatal informa que faltan autorizaciones; no tiene fondos confirmados"
          class="block w-full border rounded-lg p-2 mt-1"></textarea>
      </label>
      <button type="submit" disabled={busy}
        class="rounded-lg bg-teal-700 text-white font-semibold px-4 py-2 text-sm">
        {busy?'Guardando…':'Guardar declaración sin verificar'}
      </button>
    </form>
  {/if}

  {#if showReport}
    <form onsubmit={saveReport} class="space-y-3 rounded-xl border border-amber-200 p-3">
      <h4 class="text-sm font-extrabold text-amber-950">Reporte de un supuesto pago (no verificado)</h4>
      <p class="text-xs text-amber-900">Registrar aquí no confirma que Bonaire haya recibido dinero. No incluyas datos de cuentas ni credenciales.</p>
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="block text-xs font-semibold">Importe informado en USD
          <input inputmode="decimal" required bind:value={paidUsd} placeholder="0.00"
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Método informado
          <select bind:value={reportMethod} class="block w-full border rounded-lg p-2 mt-1">
            {#each Object.entries(methodNames).filter(x=>x[0]!=='undecided') as [code,name]}
              <option value={code}>{name}</option>
            {/each}
          </select>
        </label>
        <label class="block text-xs font-semibold">Fecha reportada
          <input type="date" bind:value={reportedOn} required max={today}
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
        <label class="block text-xs font-semibold">Referencia corta del comprobante (opcional)
          <input type="text" minlength="4" maxlength="80" bind:value={reference}
            placeholder="Identificador, NO número de cuenta"
            class="block w-full border rounded-lg p-2 mt-1"/>
        </label>
      </div>
      <label class="block text-xs font-semibold">Descripción del reporte (obligatoria)
        <textarea rows="2" minlength="3" maxlength="900" required bind:value={reportNotes}
          placeholder="Ej.: cliente comunica transferencia; todavía sin comprobar"
          class="block w-full border rounded-lg p-2 mt-1"></textarea>
      </label>
      <button type="submit" disabled={busy}
        class="rounded-lg bg-amber-700 text-white font-semibold px-4 py-2 text-sm">
        {busy?'Registrando…':'Registrar solo como reportado'}
      </button>
    </form>
  {/if}

  <section class="space-y-2">
    <h4 class="font-extrabold text-sm">Historial de fondos y condiciones declarados ({declarations.length})</h4>
    {#each declarations as item (item.id)}
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
        <p class="text-xs text-slate-600 font-semibold">{item.actor_email} · {item.created_at.slice(0,16).replace('T',' ')}
          · {item.source==='customer_reported'?'Declaración del cliente':'Condiciones conversadas'}</p>
        <p class="text-sm font-bold">{stageNames[item.funding_stage]||item.funding_stage}</p>
        <p class="text-xs">Aprobación declarada: {currency(item.approved_funds_declared_cents)} · Disponible declarado: {currency(item.available_funds_declared_cents)}</p>
        <p class="text-xs">Anticipo propuesto: {currency(item.advance_proposed_cents)} · Método: {methodNames[item.payment_method]||item.payment_method}</p>
        <p class="text-xs">Plazo: {item.payment_deadline||'Sin fecha'} · Fecha prevista: {item.expected_payment_date||'Sin fecha'}</p>
        <p class="text-sm whitespace-pre-wrap break-words">{item.notes}</p>
      </article>
    {:else}<p class="text-sm text-slate-500">No hay declaraciones adicionales; la información inicial del cliente se conserva arriba.</p>{/each}
  </section>

  <section class="space-y-2">
    <h4 class="font-extrabold text-sm">Reportes de pago y revisión ({reports.length})</h4>
    {#each reports as p (p.id)}
      <article class="rounded-xl border border-slate-200 p-3 space-y-2">
        <div class="flex flex-wrap justify-between gap-3">
          <div>
            <p class="font-bold text-sm">{currency(p.amount_usd_cents)} · {methodNames[p.payment_method]||p.payment_method}</p>
            <p class="text-xs text-slate-600">Reportado el {p.reported_on} por {p.reported_by_email}</p>
            {#if p.reference}<p class="text-xs text-slate-600">Referencia interna: {p.reference}</p>{/if}
          </div>
          <span class="text-xs font-bold {p.verification_status==='reported'?'text-amber-900':p.verification_status==='rejected'?'text-red-800':'text-teal-900'}">
            {reportNames[p.verification_status]||p.verification_status}
          </span>
        </div>
        <p class="text-sm whitespace-pre-wrap break-words">{p.report_note}</p>
        {#if p.reviewed_by_email}
          <p class="text-xs text-slate-600">Revisó: {p.reviewed_by_email} · {p.reviewed_at?.slice(0,16)}
            {p.verification_basis?' · '+(basisNames[p.verification_basis]||p.verification_basis):''}</p>
          <p class="text-xs whitespace-pre-wrap break-words">{p.review_note}</p>
        {/if}
        {#if canReview && p.verification_status==='reported'}
          <button type="button" onclick={()=>openReview(p.id)} disabled={busy}
            class="rounded-lg bg-teal-700 text-white font-semibold text-xs px-3 py-2">
            Revisar reporte (administrador)
          </button>
        {/if}
        {#if reviewId===p.id && canReview}
          <form onsubmit={saveReview} class="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
            <label class="block text-xs font-semibold">Resultado de revisión
              <select bind:value={decision} class="block w-full mt-1 border rounded-lg p-2">
                <option value="manual_verify">Validación administrativa MANUAL</option>
                <option value="reject">Rechazar reporte</option>
              </select>
            </label>
            {#if decision==='manual_verify'}
              <label class="block text-xs font-semibold">Fuente comprobada de manera independiente
                <select bind:value={verificationBasis} class="block w-full mt-1 border rounded-lg p-2">
                  {#each Object.entries(basisNames) as [code,name]}
                    <option value={code}>{name}</option>
                  {/each}
                </select>
              </label>
              <label class="flex items-start gap-2 text-xs text-amber-950">
                <input type="checkbox" bind:checked={independentlyChecked} required class="mt-0.5"/>
                Confirmo que personalmente comprobé una evidencia independiente.
                NO estoy validando solo la afirmación del cliente.
              </label>
            {/if}
            <label class="block text-xs font-semibold">Motivo/evidencia revisada
              <textarea rows="3" bind:value={reviewNote} required
                minlength={decision==='manual_verify'?15:3} maxlength="900"
                placeholder="Describir fuente y procedimiento; nunca pegar credenciales o cuenta bancaria"
                class="block mt-1 w-full border rounded-lg p-2"></textarea>
            </label>
            <div class="flex flex-wrap gap-2">
              <button type="submit" disabled={busy}
                class="rounded-lg bg-teal-700 text-white font-bold text-xs px-3 py-2">
                {decision==='manual_verify'?'Registrar comprobación manual':'Registrar rechazo'}
              </button>
              <button type="button" disabled={busy} onclick={()=>reviewId=''}
                class="rounded-lg border border-slate-300 px-3 py-2 font-bold text-xs">Cancelar</button>
            </div>
          </form>
        {/if}
      </article>
    {:else}<p class="text-sm text-slate-500">No hay pagos reportados para esta solicitud.</p>{/each}
  </section>
  {#if truncated}<p class="text-xs text-amber-900">Existen registros anteriores que no caben en este resumen; no se han eliminado.</p>{/if}
</section>
