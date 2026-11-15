<script lang="ts">
  import { onMount } from 'svelte';
  import { api, authorizedImageBlob } from '../lib/api';
  type Work={id:string;title:string;work_date:string;status:string;brigade_name:string;
    brigade_chief_name:string;estimated_minutes:number};
  type Report={id:string;work_id:string;report_type:string;information_source:string;
    summary:string;evidence_note:string|null;evidence_image_id:string|null;
    review_status:string;review_note:string|null;actor_email:string;reviewer_email:string|null;
    created_at:string};
  type Case={id:string;work_id:string|null;case_type:string;priority:string;
    title:string;description:string;warranty_claim_details:string|null;status:string;
    opened_by_email:string;created_at:string;resolved_by_email:string|null;
    resolution_note:string|null};
  type Note={id:string;case_id:string;note:string;actor_email:string;created_at:string};
  type Image={id:string;created_at:string};
  type ChiefReport={id:string;work_id:string;report_type:string;summary:string;
    evidence_note:string|null;chief_email:string;created_at:string};
  type ChiefImage={id:string;work_id:string;stage:string;captured_note:string|null;
    content_type:string;size_bytes:number;chief_email:string;created_at:string};
  let {token,requestId,canReview=false}:{
    token:string;requestId:string;canReview?:boolean;
  }=$props();

  let works:Work[]=$state([]),reports:Report[]=$state([]),cases:Case[]=$state([]);
  let notes:Note[]=$state([]),images:Image[]=$state([]);
  let chiefReports:ChiefReport[]=$state([]),chiefPhotos:ChiefImage[]=$state([]);
  let openedPhotoId=$state(''),openedPhotoUrl=$state('');
  let error=$state(''),success=$state(''),loading=$state(false),busy=$state(false);
  let truncated=$state(false),showReport=$state(false),showCase=$state(false);
  let workId=$state(''),reportType=$state('progress'),informationSource=$state('staff_observed');
  let summary=$state(''),evidenceNote=$state(''),evidenceImageId=$state('');
  let reviewId=$state(''),reviewDecision=$state('accept'),reviewNote=$state(''),
    evidenceChecked=$state(false);
  let caseType=$state('incident'),casePriority=$state('medium'),caseTitle=$state(''),
    caseDescription=$state(''),warrantyDetails=$state(''),caseWorkId=$state('');
  let noteCaseId=$state(''),caseNote=$state(''),closingId=$state(''),resolutionNote=$state('');
  const completed=$derived(works.filter(x=>x.status==='completed').length);
  const pending=$derived(reports.filter(x=>x.review_status==='pending_review').length);
  const typeLabels:Record<string,string>={
    progress:'Avance',incident:'Incidencia técnica',completion_proposed:'Finalización propuesta',
    warranty_claim:'Reclamación de garantía',post_sale_followup:'Seguimiento de posventa'
  };
  const statusLabels:Record<string,string>={
    scheduled:'Programado',pending_approval:'Pendiente de asignación',rejected:'Rechazado',
    cancelled:'Cancelado',completed:'Cierre técnico aceptado',
    note_only:'Nota sin certificado',pending_review:'Esperando revisión',
    accepted:'Informe aceptado',open:'Abierto',resolved:'Resuelto'
  };
  const when=(s:string)=>s.replace('T',' ').slice(0,16);
  async function load(){
    loading=true;error='';
    try{
      const response=await api.getRequestTechnical(token,requestId);
      works=response.works||[];reports=response.reports||[];
      cases=response.cases||[];notes=response.notes||[];
      images=response.evidence_images||[];
      chiefReports=response.chief_reports||[];
      chiefPhotos=response.chief_evidence||[];
      truncated=Object.values(response.truncated||{}).some(Boolean);
      if(!works.some(x=>x.id===workId&&x.status==='scheduled'))
        workId=works.find(x=>x.status==='scheduled')?.id||'';
    }catch(e){error=e instanceof Error?e.message:'No se pudo consultar el seguimiento técnico.';}
    finally{loading=false;}
  }
  async function saveReport(e:SubmitEvent){
    e.preventDefault();
    if(busy||!workId)return;
    busy=true;error='';success='';
    try{
      const result=await api.addWorkReport(token,workId,{
        report_type:reportType,information_source:informationSource,
        summary:summary.trim(),evidence_note:evidenceNote.trim()||null,
        evidence_image_id:evidenceImageId||null
      });
      success=result.message;showReport=false;
      summary='';evidenceNote='';evidenceImageId='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo registrar el informe.';}
    finally{busy=false;}
  }
  function openReview(id:string){
    reviewId=id;reviewDecision='accept';reviewNote='';evidenceChecked=false;
    error='';success='';
  }
  async function decideReview(e:SubmitEvent){
    e.preventDefault();
    if(busy||!canReview||!reviewId)return;
    if(reviewDecision==='accept'&&!evidenceChecked){
      error='Confirma que revisaste las evidencias del trabajo.';return;
    }
    if(!window.confirm(reviewDecision==='accept'
      ?'¿Aceptar el informe y finalizar el trabajo? NO cierra la solicitud comercial ni genera cobro.'
      :'¿Rechazar esta propuesta de finalización y mantener el trabajo programado?'))return;
    busy=true;error='';success='';
    try{
      const r=await api.reviewWorkReport(token,reviewId,{
        decision:reviewDecision,review_note:reviewNote.trim(),
        confirm_technical_evidence:evidenceChecked
      });
      success=r.message;reviewId='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo revisar el trabajo.';}
    finally{busy=false;}
  }
  async function addCase(e:SubmitEvent){
    e.preventDefault();
    if(busy)return;
    busy=true;error='';success='';
    try{
      const r=await api.openServiceCase(token,requestId,{
        work_id:caseWorkId||null,case_type:caseType,priority:casePriority,
        title:caseTitle.trim(),description:caseDescription.trim(),
        warranty_claim_details:warrantyDetails.trim()||null
      });
      success=r.message;showCase=false;caseTitle='';caseDescription='';
      warrantyDetails='';caseWorkId='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo abrir el caso.';}
    finally{busy=false;}
  }
  async function saveCaseNote(e:SubmitEvent){
    e.preventDefault();if(busy||!noteCaseId)return;
    busy=true;error='';success='';
    try{
      const r=await api.addServiceCaseNote(token,noteCaseId,caseNote.trim());
      success=r.message;noteCaseId='';caseNote='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo registrar la nota.';}
    finally{busy=false;}
  }
  async function closeCase(e:SubmitEvent){
    e.preventDefault();if(!canReview||busy||!closingId)return;
    if(!window.confirm('¿Resolver administrativamente este caso? Una reclamación de garantía no implica cobertura aceptada.'))return;
    busy=true;error='';success='';
    try{
      const r=await api.resolveServiceCase(token,closingId,{
        resolution_note:resolutionNote.trim(),confirm_review:true
      });
      success=r.message;closingId='';resolutionNote='';await load();
    }catch(err){error=err instanceof Error?err.message:'No se pudo resolver el caso.';}
    finally{busy=false;}
  }
  function closePhoto(){
    if(openedPhotoUrl){URL.revokeObjectURL(openedPhotoUrl);openedPhotoUrl='';}
    openedPhotoId='';
  }
  async function viewPhoto(w:Work,pic:ChiefImage){
    if(openedPhotoId===pic.id){closePhoto();return;}
    closePhoto();busy=true;error='';
    try{
      const blob=await authorizedImageBlob(
        '/api/chief/staff/works/'+encodeURIComponent(w.id)+'/evidence/'+encodeURIComponent(pic.id),token
      );
      openedPhotoUrl=URL.createObjectURL(blob);openedPhotoId=pic.id;
    }catch(e){error=e instanceof Error?e.message:'No se pudo abrir la evidencia privada.';}
    finally{busy=false;}
  }
  onMount(()=>{void load();return ()=>closePhoto();});
</script>

<section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" aria-label="Seguimiento técnico y posventa privado">
  <div class="flex flex-wrap justify-between items-start gap-3">
    <div>
      <h3 class="text-lg font-extrabold text-slate-900">Trabajos técnicos y posventa</h3>
      <p class="text-xs text-slate-600 mt-1">Informes por brigada, evidencias vinculadas, incidencias y reclamaciones.</p>
    </div>
    <button type="button" onclick={load} disabled={busy||loading}
      class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Actualizar</button>
  </div>
  <p class="rounded-xl border border-amber-200 bg-amber-50 text-amber-950 text-xs p-3">
    <strong>Control de responsabilidades:</strong> el personal puede registrar información propia o
    retransmitida por el jefe de brigada. Esto no constituye firma del jefe, certificación de
    calidad, aceptación de garantía ni autorización de pagos. El cierre técnico exige revisión administrativa.
    Las fotos existentes pueden haberse tomado antes de la ejecución del trabajo.
  </p>
  {#if error}<p role="alert" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>{/if}
  {#if success}<p role="status" class="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{success}</p>{/if}
  {#if loading}<p role="status" class="text-sm text-slate-600">Cargando historial técnico…</p>{/if}
  <div class="grid grid-cols-3 gap-2">
    <div class="rounded-xl bg-slate-50 p-3 border">
      <p class="text-xs text-slate-600">Trabajos</p><p class="font-extrabold text-xl">{works.length}</p>
    </div>
    <div class="rounded-xl bg-amber-50 p-3 border border-amber-100">
      <p class="text-xs text-amber-900">Informes pendientes</p><p class="font-extrabold text-xl">{pending}</p>
    </div>
    <div class="rounded-xl bg-teal-50 p-3 border border-teal-100">
      <p class="text-xs text-teal-900">Cierres técnicos</p><p class="font-extrabold text-xl">{completed}</p>
    </div>
  </div>

  <section class="space-y-2">
    <div class="flex flex-wrap justify-between gap-3 items-center">
      <h4 class="font-extrabold">Informes de brigada</h4>
      <button type="button" onclick={()=>showReport=!showReport}
        disabled={busy||!works.some(x=>x.status==='scheduled')}
        class="rounded-lg bg-teal-700 text-white font-semibold text-xs px-3 py-2 disabled:opacity-50">
        {showReport?'Cerrar formulario':'+ Registrar avance o propuesta de cierre'}
      </button>
    </div>
    {#if showReport}
      <form onsubmit={saveReport} class="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
        <label class="block text-xs font-bold">Trabajo programado
          <select bind:value={workId} required class="block mt-1 w-full rounded-lg border p-2 bg-white">
            {#each works.filter(x=>x.status==='scheduled') as w (w.id)}
              <option value={w.id}>{w.brigade_name} · {w.work_date} · {w.title}</option>
            {/each}
          </select>
        </label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block text-xs font-bold">Tipo de informe
            <select bind:value={reportType} class="block mt-1 w-full rounded-lg border p-2 bg-white">
              <option value="progress">Avance de trabajo</option>
              <option value="incident">Incidencia durante la ejecución</option>
              <option value="completion_proposed">Proponer trabajo finalizado</option>
            </select>
          </label>
          <label class="block text-xs font-bold">Origen de la información
            <select bind:value={informationSource} class="block mt-1 w-full rounded-lg border p-2 bg-white">
              <option value="staff_observed">Observado personalmente por el gestor</option>
              <option value="chief_relayed">Información retransmitida por el jefe de brigada</option>
            </select>
          </label>
        </div>
        <label class="block text-xs font-bold">Descripción técnica (obligatoria)
          <textarea rows="3" required minlength="8" maxlength="1500" bind:value={summary}
            placeholder="Qué se hizo, qué falta o qué incidencia ocurrió"
            class="block mt-1 w-full rounded-lg border p-2"></textarea>
        </label>
        <label class="block text-xs font-bold">Descripción de la evidencia
          <textarea rows="2" bind:value={evidenceNote} maxlength="1200"
            minlength={reportType==='completion_proposed'?20:0} required={reportType==='completion_proposed'}
            placeholder="Describir pruebas funcionales, mediciones, actas o hallazgos; sin inventar comprobantes"
            class="block mt-1 w-full rounded-lg border p-2"></textarea>
        </label>
        <label class="block text-xs font-bold">Fotografía ya adjunta a esta solicitud (opcional)
          <select bind:value={evidenceImageId} class="block mt-1 w-full rounded-lg border p-2 bg-white">
            <option value="">Sin fotografía enlazada</option>
            {#each images as img (img.id)}
              <option value={img.id}>Foto {img.id.slice(0,8)} · {img.created_at.slice(0,10)} (no certificada)</option>
            {/each}
          </select>
        </label>
        <p class="text-xs text-slate-600">No se suben fotos nuevas desde este formulario. Las fotos de la solicitud se gestionan en Solicitudes; una foto previa no prueba finalización.</p>
        <button type="submit" disabled={busy||!workId}
          class="rounded-lg bg-teal-700 text-white font-bold text-xs px-4 py-2">Registrar informe interno</button>
      </form>
    {/if}
    {#each works as w (w.id)}
      <article class="rounded-xl border border-slate-200 p-3 space-y-2">
        <div class="flex flex-wrap justify-between gap-2">
          <p class="font-bold text-sm">{w.brigade_name} · {w.title}</p>
          <span class="text-xs font-semibold">{statusLabels[w.status]||w.status}</span>
        </div>
        <p class="text-xs text-slate-600">Fecha: {w.work_date} · Jefe designado: {w.brigade_chief_name}</p>
        {#each chiefReports.filter(r=>r.work_id===w.id) as cr (cr.id)}
          <div class="rounded-lg border border-teal-200 bg-teal-50 p-3 space-y-1">
            <p class="text-xs font-bold text-teal-950">
              Informe ingresado por jefe AUTENTICADO · {typeLabels[cr.report_type]||cr.report_type}
            </p>
            <p class="text-xs text-teal-900">{cr.chief_email} · {when(cr.created_at)}</p>
            <p class="text-sm whitespace-pre-wrap break-words">{cr.summary}</p>
            {#if cr.evidence_note}
              <p class="text-xs text-teal-900 whitespace-pre-wrap break-words">{cr.evidence_note}</p>
            {/if}
            <p class="text-xs text-teal-950">Autenticación de cuenta ≠ firma digital ni cierre técnico. La aceptación final permanece reservada a dirección.</p>
          </div>
        {/each}
        {#each chiefPhotos.filter(photo=>photo.work_id===w.id) as photo (photo.id)}
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p class="text-xs font-bold">Foto privada de trabajo · {photo.stage==='before'?'Antes':photo.stage==='after'?'Después':'Durante'}</p>
            <p class="text-xs text-slate-600">{photo.chief_email} · {when(photo.created_at)} · {photo.captured_note||'Sin observación'}</p>
            <button type="button" onclick={()=>viewPhoto(w,photo)} disabled={busy}
              class="text-xs rounded-lg border border-teal-300 text-teal-800 font-bold px-3 py-2">
              {openedPhotoId===photo.id?'Cerrar fotografía':'Ver evidencia de R2 privado'}
            </button>
            {#if openedPhotoId===photo.id && openedPhotoUrl}
              <img src={openedPhotoUrl} alt="Fotografía técnica privada de la brigada"
                class="rounded-xl max-h-[60dvh] object-contain w-full bg-slate-100"/>
            {/if}
          </div>
        {/each}
        {#each reports.filter(r=>r.work_id===w.id) as r (r.id)}
          <div class="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
            <p class="text-xs font-bold">{typeLabels[r.report_type]||r.report_type}
              · {statusLabels[r.review_status]||r.review_status}</p>
            <p class="text-xs text-slate-500">{r.actor_email} · {when(r.created_at)}
              · {r.information_source==='chief_relayed'?'Informado por jefe (retransmitido)':'Observación del gestor'}</p>
            <p class="text-sm whitespace-pre-wrap break-words">{r.summary}</p>
            {#if r.evidence_note}<p class="text-xs whitespace-pre-wrap break-words">Evidencia declarada: {r.evidence_note}</p>{/if}
            {#if r.evidence_image_id}<p class="text-xs text-slate-500">Foto vinculada: {r.evidence_image_id.slice(0,10)} (ver en Solicitudes)</p>{/if}
            {#if r.reviewer_email}
              <p class="text-xs text-teal-900">Revisó: {r.reviewer_email} · {r.review_note}</p>
            {/if}
            {#if canReview && r.review_status==='pending_review'}
              <button type="button" onclick={()=>openReview(r.id)} disabled={busy}
                class="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-2">
                Revisar propuesta de finalización
              </button>
            {/if}
            {#if reviewId===r.id && canReview}
              <form onsubmit={decideReview} class="space-y-2 border border-teal-200 p-3 rounded-lg">
                <label class="block text-xs font-bold">Decisión
                  <select bind:value={reviewDecision} class="block w-full mt-1 border rounded-lg p-2">
                    <option value="accept">Aceptar y cerrar técnicamente este trabajo</option>
                    <option value="reject">Rechazar finalización, mantener programado</option>
                  </select>
                </label>
                <label class="block text-xs font-bold">Motivo y revisión de evidencias
                  <textarea rows="2" bind:value={reviewNote} required
                    minlength={reviewDecision==='accept'?12:3} maxlength="1000"
                    class="block w-full mt-1 border rounded-lg p-2"></textarea>
                </label>
                {#if reviewDecision==='accept'}
                  <label class="flex items-start gap-2 text-xs">
                    <input type="checkbox" bind:checked={evidenceChecked} required class="mt-0.5"/>
                    Confirmo que revisé la información técnica y decido aceptar el cierre.
                  </label>
                {/if}
                <div class="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy}
                    class="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-2">
                    Registrar decisión
                  </button>
                  <button type="button" onclick={()=>reviewId=''} class="rounded-lg border px-3 py-2 text-xs">Cancelar</button>
                </div>
              </form>
            {/if}
          </div>
        {/each}
      </article>
    {:else}
      <p class="text-sm text-slate-500">Todavía no hay trabajos de brigada vinculados a la solicitud.</p>
    {/each}
  </section>

  <section class="space-y-3 border-t border-slate-200 pt-4">
    <div class="flex flex-wrap justify-between gap-2 items-center">
      <h4 class="font-extrabold">Incidencias, garantías y posventa</h4>
      <button type="button" onclick={()=>showCase=!showCase} disabled={busy}
        class="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-2">
        {showCase?'Cerrar':'+ Abrir caso'}
      </button>
    </div>
    <p class="text-xs text-slate-600">Abrir una reclamación de garantía NO implica que la cobertura haya sido reconocida por Bonaire.</p>
    {#if showCase}
      <form onsubmit={addCase} class="rounded-xl border border-teal-200 p-3 space-y-3">
        <div class="grid sm:grid-cols-2 gap-2">
          <label class="block text-xs font-bold">Tipo de caso
            <select bind:value={caseType} class="mt-1 block w-full border rounded-lg p-2">
              <option value="incident">Incidencia</option>
              <option value="warranty_claim">Reclamación de garantía (no aceptada)</option>
              <option value="post_sale_followup">Seguimiento posventa</option>
            </select>
          </label>
          <label class="block text-xs font-bold">Prioridad
            <select bind:value={casePriority} class="mt-1 block w-full border rounded-lg p-2">
              <option value="low">Baja</option><option value="medium">Media</option>
              <option value="high">Alta</option><option value="urgent">Urgente</option>
            </select>
          </label>
          <label class="block text-xs font-bold sm:col-span-2">Trabajo asociado (opcional)
            <select bind:value={caseWorkId} class="mt-1 block w-full border rounded-lg p-2">
              <option value="">Caso general de esta solicitud</option>
              {#each works as w (w.id)}
                <option value={w.id}>{w.brigade_name} · {w.work_date} · {w.title}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="block text-xs font-bold">Asunto
          <input bind:value={caseTitle} required minlength="3" maxlength="180"
            class="block mt-1 w-full border rounded-lg p-2"/>
        </label>
        <label class="block text-xs font-bold">Situación informada
          <textarea bind:value={caseDescription} required minlength="8" maxlength="1500" rows="3"
            class="block mt-1 w-full border rounded-lg p-2"></textarea>
        </label>
        {#if caseType==='warranty_claim'}
          <label class="block text-xs font-bold">Detalles de garantía alegada (no verificada)
            <textarea bind:value={warrantyDetails} maxlength="1000" rows="2"
              placeholder="Fecha y condiciones que menciona el cliente, sin reconocer cobertura"
              class="block mt-1 w-full border rounded-lg p-2"></textarea>
          </label>
        {/if}
        <button type="submit" disabled={busy}
          class="rounded-lg bg-teal-700 text-white font-bold text-xs px-4 py-2">Registrar caso abierto</button>
      </form>
    {/if}
    {#each cases as sc (sc.id)}
      <article class="rounded-xl border border-slate-200 p-3 space-y-2">
        <div class="flex flex-wrap justify-between gap-2">
          <p class="font-bold text-sm">{typeLabels[sc.case_type]||sc.case_type} · {sc.title}</p>
          <span class="text-xs font-semibold">{statusLabels[sc.status]||sc.status} · {sc.priority}</span>
        </div>
        <p class="text-xs text-slate-500">Abierto por {sc.opened_by_email} · {when(sc.created_at)}</p>
        <p class="text-sm whitespace-pre-wrap break-words">{sc.description}</p>
        {#if sc.warranty_claim_details}
          <p class="text-xs text-amber-900 whitespace-pre-wrap">Cobertura alegada (sin verificar): {sc.warranty_claim_details}</p>
        {/if}
        {#each notes.filter(n=>n.case_id===sc.id) as n (n.id)}
          <p class="rounded-lg bg-slate-50 p-2 text-sm whitespace-pre-wrap">
            <span class="text-xs text-slate-500">{n.actor_email} · {when(n.created_at)}</span>
            {n.note}
          </p>
        {/each}
        {#if sc.resolved_by_email}
          <p class="text-xs text-teal-900">Resolución administrativa: {sc.resolved_by_email} · {sc.resolution_note}</p>
        {/if}
        {#if sc.status==='open'}
          <div class="flex flex-wrap gap-2">
            <button type="button" onclick={()=>{noteCaseId=sc.id;caseNote='';}} disabled={busy}
              class="border rounded-lg px-3 py-2 text-xs font-semibold">+ Nota de seguimiento</button>
            {#if canReview}
              <button type="button" onclick={()=>{closingId=sc.id;resolutionNote='';}} disabled={busy}
                class="rounded-lg bg-teal-700 text-white px-3 py-2 text-xs font-semibold">Cerrar caso</button>
            {/if}
          </div>
          {#if noteCaseId===sc.id}
            <form onsubmit={saveCaseNote} class="flex flex-col gap-2">
              <textarea bind:value={caseNote} required minlength="5" maxlength="1000" rows="2"
                class="border rounded-lg p-2 text-sm" placeholder="Añade evidencia o seguimiento interno"></textarea>
              <div class="flex gap-2"><button type="submit" disabled={busy}
                class="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-2">Guardar nota</button>
              <button type="button" onclick={()=>noteCaseId=''} class="rounded-lg border px-3 py-2 text-xs">Cancelar</button></div>
            </form>
          {/if}
          {#if canReview && closingId===sc.id}
            <form onsubmit={closeCase} class="flex flex-col gap-2">
              <textarea bind:value={resolutionNote} required minlength="12" maxlength="1000" rows="2"
                class="border rounded-lg p-2 text-sm" placeholder="Resolución comprobada, sin reconocer garantía automáticamente"></textarea>
              <div class="flex gap-2">
                <button type="submit" disabled={busy}
                  class="rounded-lg bg-teal-700 text-white text-xs font-semibold px-3 py-2">Confirmar cierre administrativo</button>
                <button type="button" onclick={()=>closingId=''} class="rounded-lg border px-3 py-2 text-xs">Cancelar</button>
              </div>
            </form>
          {/if}
        {/if}
      </article>
    {:else}
      <p class="text-sm text-slate-500">No hay incidencias o reclamaciones de posventa registradas.</p>
    {/each}
  </section>
  {#if truncated}<p class="text-xs text-amber-900">Hay más de 100 registros en alguna sección; el historial no se ha eliminado.</p>{/if}
</section>
