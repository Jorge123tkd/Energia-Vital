<script lang="ts">
  import { onMount } from 'svelte';
  import { api,downloadRequestDocument } from '../lib/api';
  type Doc={id:string;filename:string;size_bytes:number;direction:string;created_at:string};
  let {requestId,token}:{requestId:string;token?:string}=$props();
  let documents:Doc[]=$state([]),loading=$state(true),busy=$state(false),error=$state(''),success=$state('');
  let input:HTMLInputElement;
  async function reload(){
    loading=true;error='';
    try{documents=(await api.listRequestDocuments(requestId,token)).documents||[];}
    catch(e){error=e instanceof Error?e.message:'No se pudieron consultar los documentos.';}
    finally{loading=false;}
  }
  async function upload(){
    const file=input?.files?.[0];
    if(!file||busy)return;
    if(file.size<=0||file.size>8*1024*1024||!(/\.(pdf|docx|xlsx)$/i.test(file.name))){error='Elige PDF, DOCX o XLSX de hasta 8 MB.';return;}
    if(token&&!window.confirm('Este archivo será visible para el titular del expediente. ¿Compartirlo?'))return;
    busy=true;error='';success='';
    try{await api.uploadRequestDocument(requestId,file,token);input.value='';success='Documento guardado en el expediente.';await reload();}
    catch(e){error=e instanceof Error?e.message:'No se pudo subir el archivo.';}
    finally{busy=false;}
  }
  async function download(d:Doc){
    if(busy)return;
    if(!window.confirm('Descarga únicamente archivos de confianza. No se ha realizado un análisis antivirus. ¿Continuar?'))return;
    busy=true;error='';
    try{await downloadRequestDocument(d.id,d.filename,token);}
    catch(e){error=e instanceof Error?e.message:'No se pudo descargar.';}
    finally{busy=false;}
  }
  onMount(()=>{void reload();});
</script>
<section class="rounded-2xl border border-slate-200 p-4 space-y-3">
  <div class="flex items-center justify-between gap-2">
    <h3 class="font-bold text-slate-900">Documentos del expediente</h3>
    <button type="button" class="text-xs underline text-teal-800" disabled={busy||loading} onclick={reload}>Actualizar</button>
  </div>
  <p class="text-xs text-slate-600">PDF, Word (.docx) y Excel (.xlsx). Hasta 20 documentos de 8 MB cada uno. Los archivos compartidos son visibles para el cliente y el personal autorizado. No adjuntes contraseñas ni documentos internos.</p>
  {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
  {#if success}<p role="status" class="text-sm text-teal-700">{success}</p>{/if}
  {#if loading}<p class="text-sm text-slate-500">Consultando documentos…</p>{/if}
  {#each documents as d (d.id)}
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2">
      <div class="min-w-0 text-sm"><p class="font-semibold break-all">{d.filename}</p><p class="text-xs text-slate-500">{d.direction==='staff'?'Compartido por Bonaire':'Enviado por cliente'} · {Math.ceil(d.size_bytes/1024)} KB · {d.created_at.slice(0,10)}</p></div>
      <button type="button" disabled={busy} onclick={()=>download(d)} class="rounded-lg border border-teal-200 px-3 py-2 text-xs font-bold text-teal-800">Descargar</button>
    </div>
  {:else}
    {#if !loading}<p class="text-sm text-slate-500">Sin documentos todavía.</p>{/if}
  {/each}
  <label class="block text-sm font-semibold">Seleccionar documento<input bind:this={input} type="file" accept=".pdf,.docx,.xlsx" disabled={busy||documents.length>=20} class="mt-2 block w-full text-xs"/></label>
  <button type="button" onclick={upload} disabled={busy||loading||documents.length>=20} class="rounded-lg bg-teal-700 px-3 py-2 text-white text-sm font-bold">{busy?'Procesando…':token?'Compartir con cliente':'Adjuntar documento'}</button>
</section>
