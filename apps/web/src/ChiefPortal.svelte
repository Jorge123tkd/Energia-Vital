<script lang="ts">
  import { onMount } from 'svelte';
  import { api, authorizedImageBlob } from './lib/api';

  type Work={id:string;title:string;work_date:string;estimated_minutes:number;status:string;brigade_name:string};
  type Report={id:string;report_type:string;summary:string;evidence_note:string|null;created_at:string};
  type Evidence={id:string;stage:string;size_bytes:number;sha256_hex:string;captured_note:string|null;created_at:string};
  const key='bonaire_brigade_chief_session';
  let token=$state(''),account=$state<{email:string;brigade_id:string}|null>(null),
    brigade=$state<{name:string;leader_name:string}|null>(null);
  let checking=$state(true),busy=$state(false),loading=$state(false);
  let email=$state(''),password=$state(''),error=$state(''),message=$state('');
  let works:Work[]=$state([]),activeWork=$state('');
  let reports:Report[]=$state([]),evidence:Evidence[]=$state([]);
  let reportType=$state('progress'),reportSummary=$state(''),reportEvidence=$state('');
  let photoStage=$state('during'),photoNote=$state(''),selectedFile:File|null=$state(null);
  let visibleImageId=$state(''),imageUrl=$state('');
  const selected=$derived(works.find(w=>w.id===activeWork));
  const statuses:Record<string,string>={scheduled:'Programado',completed:'Finalizado por administración',
    pending_approval:'Pendiente de autorización',cancelled:'Cancelado'};
  const reportLabels:Record<string,string>={progress:'Avance',incident:'Incidencia',completion_proposed:'Finalización informada'};
  const stageNames:Record<string,string>={before:'Antes del trabajo',during:'Durante la ejecución',after:'Después del trabajo'};
  const formClass='block w-full mt-1 border border-slate-300 bg-white rounded-xl px-3 py-2.5 text-sm';

  async function validateSession(){
    const cached=sessionStorage.getItem(key);
    if(!cached){checking=false;return;}
    token=cached;
    try{
      const r=await api.chiefMe(token);
      account=r.account;brigade=r.brigade;
      await refreshWorks();
    }catch{
      sessionStorage.removeItem(key);token='';account=null;brigade=null;
    }finally{checking=false;}
  }
  onMount(()=>{void validateSession();return ()=>{revokeImage();};});
  async function signIn(e:SubmitEvent){
    e.preventDefault();if(busy)return;
    busy=true;error='';message='';
    try{
      const r=await api.chiefLogin(email.trim(),password);
      token=r.access_token;sessionStorage.setItem(key,token);
      account=r.account;password='';
      const me=await api.chiefMe(token);
      brigade=me.brigade;
      await refreshWorks();
    }catch(e){
      token='';sessionStorage.removeItem(key);
      error=e instanceof Error?e.message:'No se pudo iniciar sesión.';
    }finally{busy=false;}
  }
  async function logout(){
    if(busy)return;busy=true;error='';
    try{if(token)await api.chiefLogout(token);}catch{/* revoke locally regardless */}
    revokeImage();sessionStorage.removeItem(key);token='';account=null;brigade=null;
    works=[];activeWork='';reports=[];evidence=[];busy=false;
  }
  async function refreshWorks(){
    if(!token)return;
    loading=true;error='';
    try{
      const r=await api.chiefWorks(token);
      works=r.works||[];
      if(!works.some(x=>x.id===activeWork))activeWork=works[0]?.id||'';
      await refreshSelected();
    }catch(e){error=e instanceof Error?e.message:'No se pudieron consultar los trabajos.';}
    finally{loading=false;}
  }
  async function selectWork(id:string){
    activeWork=id;revokeImage();error='';message='';
    await refreshSelected();
  }
  async function refreshSelected(){
    if(!token||!activeWork){reports=[];evidence=[];return;}
    try{
      const [r,p]=await Promise.all([
        api.chiefWorkReports(token,activeWork),api.chiefWorkEvidence(token,activeWork)
      ]);
      reports=r.reports||[];evidence=p.images||[];
    }catch(e){error=e instanceof Error?e.message:'No se pudo consultar el historial.';}
  }
  async function saveReport(e:SubmitEvent){
    e.preventDefault();if(busy||!activeWork)return;
    busy=true;error='';message='';
    try{
      const r=await api.chiefAddReport(token,activeWork,{
        report_type:reportType,summary:reportSummary.trim(),
        evidence_note:reportEvidence.trim()||null
      });
      message=r.message;reportSummary='';reportEvidence='';
      await refreshSelected();
    }catch(err){error=err instanceof Error?err.message:'No se guardó el informe.';}
    finally{busy=false;}
  }
  async function upload(e:SubmitEvent){
    e.preventDefault();
    if(busy||!selectedFile||!activeWork)return;
    if(selectedFile.size>5*1024*1024){error='La foto supera el máximo de 5 MB.';return;}
    busy=true;error='';message='';
    try{
      const r=await api.chiefUploadEvidence(token,activeWork,selectedFile,photoStage,photoNote.trim());
      message=r.message;selectedFile=null;photoNote='';
      await refreshSelected();
    }catch(err){error=err instanceof Error?err.message:'No se pudo guardar la evidencia.';}
    finally{busy=false;}
  }
  function revokeImage(){
    if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl='';}
    visibleImageId='';
  }
  async function openImage(id:string){
    if(!token||!activeWork)return;
    if(id===visibleImageId){revokeImage();return;}
    revokeImage();busy=true;error='';
    try{
      const blob=await authorizedImageBlob(
        '/api/chief/works/'+encodeURIComponent(activeWork)+'/evidence/'+encodeURIComponent(id),token
      );
      imageUrl=URL.createObjectURL(blob);visibleImageId=id;
    }catch(err){error=err instanceof Error?err.message:'No se pudo abrir la fotografía.';}
    finally{busy=false;}
  }
</script>

<div class="min-h-screen bg-slate-50 px-3 sm:px-6 py-6 text-slate-900">
  <main class="max-w-3xl mx-auto space-y-5">
    <header class="rounded-2xl bg-white border border-slate-200 p-5 flex flex-wrap justify-between gap-3">
      <div>
        <p class="text-xs uppercase font-bold text-teal-700 tracking-wide">Bonaire · Acceso técnico privado</p>
        <h1 class="text-2xl sm:text-3xl font-extrabold">Portal del jefe de brigada</h1>
        <p class="text-sm text-slate-600 mt-1">Solo tus trabajos y evidencias. Sin acceso a clientes, precios, cuentas o pagos.</p>
      </div>
      {#if account}
        <button type="button" onclick={logout} disabled={busy}
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">Cerrar sesión</button>
      {:else}
        <a href="/" class="text-teal-800 font-semibold underline text-sm">Volver a Bonaire</a>
      {/if}
    </header>
    {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>{/if}
    {#if message}<p role="status" class="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{message}</p>{/if}
    {#if checking}
      <p class="text-sm text-slate-600">Comprobando identidad…</p>
    {:else if !account}
      <form onsubmit={signIn} class="max-w-lg rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
        <h2 class="text-lg font-extrabold">Iniciar sesión técnica</h2>
        <p class="text-sm text-slate-600">La dirección crea las credenciales de cada jefe. Las sesiones expiran a las ocho horas.</p>
        <label class="block text-sm font-bold">Correo del jefe
          <input type="email" bind:value={email} required autocomplete="username" class={formClass}/>
        </label>
        <label class="block text-sm font-bold">Contraseña
          <input type="password" bind:value={password} required autocomplete="current-password" class={formClass}/>
        </label>
        <button type="submit" disabled={busy}
          class="rounded-xl bg-teal-700 text-white px-5 py-3 font-bold w-full">
          {busy?'Verificando…':'Entrar a mis trabajos'}
        </button>
      </form>
    {:else}
      <section class="rounded-xl bg-teal-50 border border-teal-200 p-4">
        <p class="font-extrabold">{brigade?.name||'Brigada asignada'}</p>
        <p class="text-xs text-teal-800">Cuenta: {account.email} · Responsable: {brigade?.leader_name||'Por confirmar'}</p>
      </section>
      <div class="flex flex-wrap justify-between gap-2 items-center">
        <h2 class="text-lg font-extrabold">Mis trabajos ({works.length})</h2>
        <button type="button" disabled={busy||loading} onclick={refreshWorks}
          class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Actualizar</button>
      </div>
      {#if loading}<p class="text-sm text-slate-600">Actualizando trabajos…</p>{/if}
      <div class="grid sm:grid-cols-2 gap-2">
        {#each works as w (w.id)}
          <button type="button" onclick={()=>selectWork(w.id)}
            class="text-left p-3 rounded-xl border {activeWork===w.id?'border-teal-700 bg-teal-50':'border-slate-200 bg-white'}">
            <p class="font-bold text-sm">{w.title}</p>
            <p class="text-xs text-slate-600 mt-1">{w.work_date} · {statuses[w.status]||w.status}</p>
          </button>
        {:else}<p class="text-sm text-slate-500">No tienes trabajos vinculados actualmente.</p>{/each}
      </div>
      {#if selected}
        <section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <h2 class="font-extrabold text-lg">{selected.title}</h2>
          <p class="text-sm text-slate-600">Fecha Cuba: {selected.work_date} · Tiempo estimado: {selected.estimated_minutes} minutos</p>
          <p class="text-xs text-amber-900 bg-amber-50 border border-amber-100 p-2 rounded-lg">
            Una fotografía no es una firma ni un certificado. Un informe de finalización no cierra el trabajo automáticamente.
          </p>
          <h3 class="font-extrabold">Informes del jefe</h3>
          {#each reports as r (r.id)}
            <article class="rounded-lg bg-slate-50 border p-3 space-y-1">
              <p class="text-xs font-bold">{reportLabels[r.report_type]||r.report_type} · {r.created_at.slice(0,16).replace('T',' ')}</p>
              <p class="text-sm whitespace-pre-wrap break-words">{r.summary}</p>
              {#if r.evidence_note}<p class="text-xs text-slate-600 whitespace-pre-wrap break-words">Pruebas declaradas: {r.evidence_note}</p>{/if}
            </article>
          {:else}<p class="text-sm text-slate-500">Aún no tienes informes para este trabajo.</p>{/each}
          {#if selected.status==='scheduled'}
            <form onsubmit={saveReport} class="space-y-3 rounded-xl border border-teal-200 p-3">
              <h4 class="font-bold">Registrar un nuevo informe</h4>
              <label class="block text-xs font-bold">Tipo
                <select bind:value={reportType} class={formClass}>
                  <option value="progress">Avance</option>
                  <option value="incident">Incidencia</option>
                  <option value="completion_proposed">Propongo finalización</option>
                </select>
              </label>
              <label class="block text-xs font-bold">Qué sucedió
                <textarea rows="3" bind:value={reportSummary} minlength="8" maxlength="1500" required class={formClass}></textarea>
              </label>
              <label class="block text-xs font-bold">Descripción de pruebas y evidencias
                <textarea rows="2" bind:value={reportEvidence}
                  minlength={reportType==='completion_proposed'?20:0} maxlength="1200"
                  required={reportType==='completion_proposed'} class={formClass}></textarea>
              </label>
              <button type="submit" disabled={busy}
                class="rounded-xl bg-teal-700 text-white px-4 py-2 font-bold text-sm w-full">Guardar informe técnico</button>
            </form>
          {/if}
        </section>
        <section class="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
          <h3 class="text-lg font-extrabold">Fotografías técnicas privadas ({evidence.length}/12)</h3>
          <p class="text-xs text-slate-600">Las imágenes se guardan en R2 privado y quedan asociadas al trabajo. No serán públicas ni se mezclan con fotos aportadas por clientes.</p>
          <p class="text-xs text-amber-900 bg-amber-50 border border-amber-100 p-3 rounded-lg" role="note">
            Antes de subir una foto, confirma que está autorizado fotografiar ese lugar o equipo. Evita rostros, matrículas, documentos, pantallas y datos personales innecesarios, también en la nota. El servidor elimina metadatos habituales EXIF/GPS/XMP, pero una foto puede conservar información visible o incluida en perfiles de color. Comprueba la orientación de la imagen antes de enviarla.
          </p>
          {#if selected.status==='scheduled'}
            <form onsubmit={upload} class="space-y-3 p-3 bg-slate-50 rounded-xl">
              <label class="block text-xs font-bold">Fotografía JPG, PNG o WebP · máximo 5 MB
                <input type="file" accept="image/jpeg,image/png,image/webp" required
                  onchange={e=>selectedFile=e.currentTarget.files?.[0]||null}
                  class={formClass}/>
              </label>
              <label class="block text-xs font-bold">Etapa de la foto
                <select bind:value={photoStage} class={formClass}>
                  <option value="before">Antes del trabajo</option>
                  <option value="during">Durante la ejecución</option>
                  <option value="after">Después del trabajo</option>
                </select>
              </label>
              <label class="block text-xs font-bold">Nota (opcional)
                <textarea rows="2" maxlength="500" bind:value={photoNote} class={formClass}
                  placeholder="Qué equipo muestra, prueba o zona fotografiada"></textarea>
              </label>
              <button type="submit" disabled={busy||!selectedFile||evidence.length>=12}
                class="rounded-xl bg-teal-700 text-white px-4 py-2 font-bold text-sm w-full disabled:opacity-50">
                {busy?'Guardando…':'Guardar fotografía privada'}
              </button>
            </form>
          {/if}
          {#each evidence as im (im.id)}
            <div class="rounded-lg border border-slate-200 p-3 flex flex-wrap justify-between gap-3 items-center">
              <div>
                <p class="text-sm font-semibold">{stageNames[im.stage]||im.stage} · {im.created_at.slice(0,10)}</p>
                <p class="text-xs text-slate-500">{im.captured_note||'Sin nota'} · Código {im.id.slice(0,8)}</p>
              </div>
              <button type="button" onclick={()=>openImage(im.id)} disabled={busy}
                class="rounded-lg border border-teal-300 text-teal-800 text-xs font-bold px-3 py-2">Ver foto privada</button>
            </div>
          {/each}
          {#if imageUrl}
            <figure class="space-y-2">
              <img src={imageUrl} alt="Evidencia técnica privada del trabajo seleccionado"
                class="rounded-xl max-h-[65dvh] object-contain w-full bg-slate-100"/>
              <button type="button" onclick={revokeImage}
                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Cerrar fotografía</button>
            </figure>
          {/if}
        </section>
      {/if}
    {/if}
  </main>
</div>
