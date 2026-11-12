<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api } from '../lib/api';
  import { assistantSessionId, assistantMessages, isAssistantOpen } from '../lib/store';
  import LinkedText from './LinkedText.svelte';

  type ChatMessage = {role:'user'|'assistant';content:string;id?:string};
  type Session = {id:string;title:string;updated_at:string;message_count:number};
  let { userId, onContact, onAdvisor, fullPage=false, onExpand=()=>{}, onBack=()=>{} }: {
    userId:string;onContact:()=>void;onAdvisor:()=>void;fullPage?:boolean;
    onExpand?:()=>void;onBack?:()=>void;
  }=$props();
  const welcome='¡Hola! Soy el asistente de Bonaire. Puedo ayudarte con productos, servicios y asesoramiento solar. ¿Qué necesitas hoy?';
  const suggestions=['Quiero un asesoramiento solar','Necesito paneles o baterías','Quiero conocer precios','Necesito mantenimiento'];
  let sessions:Session[]=$state([]);
  let sessionId:string|null=$state(null);
  let messages:ChatMessage[]=$state([]);
  let chatInput=$state('');
  let query=$state('');
  let busy=$state(false),loading=$state(true),loadingMore=$state(false),loadError=$state('');
  let notice=$state(''),sidebarOpen=$state(false),hasMore=$state(false),page=$state(1);
  let renamed=$state<Session|null>(null),newTitle=$state('');
  let scrollBox:HTMLDivElement|undefined=$state();
  let activeTitle=$derived(sessions.find(x=>x.id===sessionId)?.title||'Nueva conversación');
  let visibleSessions=$derived(sessions.filter(s=>
    !query.trim()||s.title.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))));
  const key=()=> 'energia_vital_chat_'+userId;
  async function scrollEnd(){
    await tick();
    if(scrollBox)scrollBox.scrollTop=scrollBox.scrollHeight;
  }
  function cache(id:string|null,msgs:ChatMessage[]){
    sessionId=id;messages=msgs;
    assistantSessionId.set(id);assistantMessages.set(msgs);
    if(id)sessionStorage.setItem(key(),id);
    else sessionStorage.removeItem(key());
    void scrollEnd();
  }
  async function loadList(nextPage=1) {
    const result=await api.getAssistantSessions(nextPage);
    const rows:Session[]=Array.isArray(result.sessions)?result.sessions:[];
    if(nextPage===1)sessions=rows;
    else sessions=[...sessions,...rows.filter(row=>!sessions.some(x=>x.id===row.id))];
    page=nextPage;hasMore=Boolean(result.has_more);
  }
  async function loadMore(){
    if(loadingMore||!hasMore)return;
    loadingMore=true;
    try{await loadList(page+1);}
    catch(e){loadError=e instanceof Error?e.message:'No fue posible cargar más conversaciones.';}
    finally{loadingMore=false;}
  }
  async function switchChat(id:string|null) {
    if(busy || loading)return;
    if(!id){cache(null,[]);sidebarOpen=false;return;}
    loading=true;loadError='';
    try{
      const data=await api.getAssistantMessages(id);
      const restored:ChatMessage[]=Array.isArray(data.messages)?data.messages.map((m:any)=>({
        id:String(m.id||''),role:m.role==='user'?'user':'assistant',content:String(m.content||'')
      })):[];
      cache(id,restored);
      sidebarOpen=false;
    }catch(e){
      loadError=e instanceof Error?e.message:'No se pudo abrir la conversación.';
    }finally{loading=false;}
  }
  onMount(()=>{
    let mounted=true;
    const init=async()=>{
      loading=true;
      try{
        const res=await api.getAssistantSessions();
        if(!mounted)return;
        sessions=res.sessions||[];hasMore=Boolean(res.has_more);page=1;
        const persisted=sessionStorage.getItem(key());
        const selected=sessions.find(x=>x.id===persisted)||sessions[0];
        if(selected){
          const history=await api.getAssistantMessages(selected.id);
          if(!mounted)return;
          cache(selected.id,(history.messages||[]).map((m:any)=>({
            id:String(m.id||''),role:m.role==='user'?'user':'assistant',content:String(m.content||'')
          })));
        }else cache(null,[]);
      }catch(e){
        if(mounted)loadError=e instanceof Error?e.message:'No fue posible recuperar el historial de conversaciones.';
      }finally{if(mounted)loading=false;}
    };
    void init();
    return ()=>{mounted=false;};
  });
  async function newChat(){
    if(busy||loading)return;
    loading=true;loadError='';notice='';
    try{
      const res=await api.createAssistantSession();
      const session:Session=res.session;
      sessions=[session,...sessions];
      cache(session.id,[]);
      chatInput='';sidebarOpen=false;
    }catch(e){loadError=e instanceof Error?e.message:'No se pudo crear una conversación.';}
    finally{loading=false;}
  }
  async function sendMessage(event?:SubmitEvent){
    event?.preventDefault();
    const value=chatInput.trim();
    if(!value||busy||loading)return;
    busy=true;loadError='';notice='';
    let id=sessionId;
    try{
      if(!id){
        const created=await api.createAssistantSession();
        id=created.session.id;
        sessions=[created.session,...sessions];
        cache(id,[]);
      }
      if(!id)throw Error('No se pudo abrir el chat.');
      cache(id,[...messages,{role:'user',content:value}]);
      chatInput='';
      const result=await api.postAssistantMessage({session_id:id,message:value,channel:'web'});
      const answer=String(result.response||'No tengo una respuesta confirmada. Puedes solicitar una consulta a nuestro equipo.');
      cache(id,[...messages,{role:'assistant',content:answer,id:result.message_id}]);
      await loadList();
    }catch(e){
      const reason=e instanceof Error?e.message:'No se pudo enviar el mensaje.';
      loadError='No se pudo completar este mensaje: '+reason;
      chatInput=value;
      // El mensaje visible no equivale necesariamente a un mensaje guardado en D1.
      if(id){
        try{
          const restored=await api.getAssistantMessages(id);
          cache(id,(restored.messages||[]).map((m:any)=>({
            id:String(m.id||''),role:m.role==='user'?'user':'assistant',content:String(m.content||'')
          })));
        }catch{cache(id,[]);}
      }
    }finally{busy=false;void scrollEnd();}
  }
  function quickQuestion(message:string){chatInput=message;void sendMessage();}
  function keydown(event:KeyboardEvent){
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendMessage();}
  }
  function close(){isAssistantOpen.set(false);}
  function contact(){close();onContact();}
  function advisor(){close();onAdvisor();}
  function rename(session:Session){renamed=session;newTitle=session.title;sidebarOpen=false;}
  async function saveTitle(e:SubmitEvent){
    e.preventDefault();
    if(!renamed||newTitle.trim().length<2)return;
    loading=true;loadError='';
    try{
      await api.renameAssistantSession(renamed.id,newTitle.trim());
      sessions=sessions.map(s=>s.id===renamed?.id?{...s,title:newTitle.trim()}:s);
      renamed=null;
    }catch(e){loadError=e instanceof Error?e.message:'No se pudo cambiar el nombre.';}
    finally{loading=false;}
  }
  async function remove(session:Session){
    if(!confirm('¿Eliminar «'+session.title+'» y todos sus mensajes? No podrás recuperarlos.'))return;
    if(busy||loading)return;
    loading=true;loadError='';
    try{
      await api.deleteAssistantSession(session.id);
      sessions=sessions.filter(x=>x.id!==session.id);
      if(sessionId===session.id){
        const next=sessions[0];
        if(next){
          const history=await api.getAssistantMessages(next.id);
          cache(next.id,(history.messages||[]).map((m:any)=>({
            id:String(m.id||''),role:m.role==='user'?'user':'assistant',content:String(m.content||'')
          })));
        }else cache(null,[]);
      }
    }catch(e){loadError=e instanceof Error?e.message:'No se pudo eliminar la conversación.';}
    finally{loading=false;}
  }
  async function share(){
    if(!messages.length){notice='Todavía no hay mensajes para compartir.';return;}
    const transcript=['Bonaire · '+activeTitle,
      ...messages.map(m=>(m.role==='user'?'Cliente':'Asistente')+': '+m.content)].join('\n\n');
    loadError='';notice='';
    try{
      if(typeof navigator.share==='function')
        await navigator.share({title:'Conversación de Bonaire',text:transcript});
      else {await navigator.clipboard.writeText(transcript);notice='Conversación copiada al portapapeles.';}
    }catch(e){
      if(e instanceof Error && e.name==='AbortError')return;
      try{await navigator.clipboard.writeText(transcript);notice='Conversación copiada al portapapeles.';}
      catch{loadError='No fue posible compartir o copiar la conversación.';}
    }
  }
</script>

<section aria-label="Asistente Bonaire"
  class="bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col {fullPage
    ? 'w-full h-full min-h-0 rounded-none border-0 shadow-none'
    : 'w-[calc(100vw-1.5rem)] sm:w-[29rem] h-[min(38rem,calc(100dvh-6rem))] rounded-2xl'}">
  <header class="bg-gradient-to-r from-slate-950 to-teal-900 text-white px-3.5 py-3 flex gap-2 items-center justify-between">
    <div class="flex gap-2 items-center min-w-0">
      {#if fullPage}
        <button type="button" onclick={onBack} aria-label="Volver a Bonaire"
          class="shrink-0 w-9 h-9 rounded-lg hover:bg-white/15 font-bold">←</button>
        <button type="button" class="md:hidden shrink-0 w-9 h-9 rounded-lg hover:bg-white/15"
          aria-label="Mostrar historial" aria-expanded={sidebarOpen} onclick={()=>sidebarOpen=!sidebarOpen}>☰</button>
      {/if}
      <span class="shrink-0 w-9 h-9 rounded-xl bg-teal-600 flex justify-center items-center font-black text-lg">B</span>
      <div class="min-w-0">
        <h1 class="font-extrabold text-sm sm:text-base truncate">{fullPage?'Asistente Bonaire':'Asistente Bonaire'}</h1>
        <p class="text-[11px] text-teal-100 truncate">{fullPage?activeTitle:'Consultas y orientación solar'}</p>
      </div>
    </div>
    <div class="flex gap-1.5 shrink-0 items-center">
      <button type="button" onclick={newChat} disabled={busy||loading}
        class="px-2.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs sm:text-sm font-bold disabled:opacity-50"
        aria-label="Crear nuevo chat" title="Nuevo chat">＋<span class="hidden sm:inline"> Nuevo chat</span></button>
      {#if !fullPage}
        <button type="button" onclick={onExpand} title="Abrir asistente en pantalla completa"
          aria-label="Abrir chat y su historial en pantalla completa"
          class="rounded-lg px-2.5 py-2 hover:bg-white/15 text-lg">⛶</button>
        <button type="button" onclick={close} aria-label="Cerrar asistente" class="rounded-lg px-2.5 py-2 hover:bg-white/15 text-lg">✕</button>
      {:else}
        <button type="button" onclick={share} disabled={!messages.length}
          class="rounded-lg px-2.5 py-2 hover:bg-white/15 text-xs sm:text-sm font-bold disabled:opacity-50"
          aria-label="Compartir texto de la conversación">↗<span class="hidden sm:inline"> Compartir</span></button>
      {/if}
    </div>
  </header>

  <div class="min-h-0 flex flex-1 relative">
    {#if fullPage}
      {#if sidebarOpen}
        <button class="absolute inset-0 z-20 bg-slate-950/55 md:hidden" type="button"
          aria-label="Cerrar historial" onclick={()=>sidebarOpen=false}></button>
      {/if}
      <aside class="absolute inset-y-0 left-0 w-[min(85vw,300px)] z-30 bg-slate-50 border-r border-slate-200
        flex flex-col transition-transform duration-200 md:relative md:translate-x-0
        {sidebarOpen?'translate-x-0':'-translate-x-full'}"
        aria-label="Historial de conversaciones">
        <div class="p-3 border-b border-slate-200 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-extrabold text-slate-800 text-sm">Tus conversaciones</h2>
            <button type="button" class="md:hidden text-slate-700 px-2 py-1" onclick={()=>sidebarOpen=false} aria-label="Cerrar historial">✕</button>
          </div>
          <button type="button" onclick={newChat} disabled={busy||loading}
            class="w-full text-left rounded-xl bg-teal-700 text-white px-3 py-2.5 font-bold text-sm disabled:opacity-50">＋ Nueva conversación</button>
          <input type="search" bind:value={query} placeholder="Buscar en el historial…"
            aria-label="Buscar conversaciones por título" class="w-full rounded-lg border border-slate-300 bg-white text-sm p-2.5"/>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {#each visibleSessions as session (session.id)}
            <div class="group flex items-center gap-1 rounded-xl {sessionId===session.id?'bg-teal-100':'hover:bg-slate-100'}">
              <button type="button" disabled={busy||loading} onclick={()=>switchChat(session.id)}
                class="text-left flex-1 min-w-0 py-3 pl-3 pr-1 disabled:opacity-50">
                <span class="block font-semibold text-sm truncate text-slate-800">{session.title}</span>
                <span class="block text-[11px] text-slate-500">{session.message_count} mensajes</span>
              </button>
              <button type="button" onclick={()=>rename(session)} aria-label={'Renombrar '+session.title}
                title="Renombrar" class="p-1.5 text-slate-500 hover:text-teal-800">✎</button>
              <button type="button" onclick={()=>remove(session)} disabled={busy||loading}
                aria-label={'Eliminar '+session.title} title="Eliminar definitivamente"
                class="p-1.5 mr-1 text-slate-500 hover:text-red-700 disabled:opacity-50">✕</button>
            </div>
          {/each}
          {#if !sessions.length&&!loading}<p class="text-sm p-4 text-slate-500">Todavía no tienes conversaciones guardadas.</p>{/if}
          {#if sessions.length&&!visibleSessions.length}<p class="text-xs p-3 text-slate-500">No hay títulos que coincidan.</p>{/if}
          {#if hasMore}
            <button type="button" disabled={loadingMore||loading} onclick={loadMore}
              class="w-full rounded-lg border border-slate-200 p-2 text-xs text-teal-800 font-bold">
              {loadingMore?'Cargando…':'Cargar más conversaciones'}
            </button>
          {/if}
        </div>
        <p class="p-3 border-t border-slate-200 text-[11px] text-slate-500">El historial es privado de tu cuenta. Puedes renombrar o eliminar tus chats.</p>
      </aside>
    {/if}

    <div class="flex-1 min-w-0 min-h-0 flex flex-col">
      <div class="flex items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-slate-100 bg-white">
        <span class="text-xs text-slate-500 truncate">{activeTitle}</span>
        <div class="flex gap-2 shrink-0">
          {#if !fullPage}
            <button type="button" class="text-xs text-teal-700 underline font-bold"
              onclick={onExpand}>Historial / Chat completo</button>
          {:else}
            <button type="button" class="text-xs text-teal-700 font-bold" onclick={share}
              disabled={!messages.length}>Compartir texto</button>
          {/if}
        </div>
      </div>

      <div bind:this={scrollBox} class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-5 bg-slate-50 space-y-4"
        role="log" aria-label="Mensajes del asistente" aria-live="polite" aria-relevant="additions">
        {#if loading}
          <p class="text-sm text-slate-500">Cargando conversación…</p>
        {:else if !messages.length}
          <div class="max-w-lg mx-auto text-center pt-10 sm:pt-16 space-y-3">
            <div class="mx-auto flex justify-center items-center rounded-2xl bg-teal-100 text-teal-800 w-14 h-14 font-black text-2xl">B</div>
            <h2 class="text-2xl font-extrabold text-slate-900">¿Qué quieres resolver hoy?</h2>
            <p class="text-sm text-slate-600">{welcome}</p>
            <div class="flex flex-wrap justify-center gap-2 pt-4">
              {#each suggestions as item}
                <button type="button" onclick={()=>quickQuestion(item)} disabled={busy}
                  class="rounded-full border border-teal-200 bg-white hover:bg-teal-50 text-xs font-semibold text-teal-800 px-3 py-2">{item}</button>
              {/each}
            </div>
          </div>
        {:else}
          {#each messages as m,i (m.id||i)}
            <div class="flex {m.role==='user'?'justify-end':'justify-start'}">
              <div class="max-w-[93%] sm:max-w-[85%] lg:max-w-[75%] rounded-2xl p-3 sm:p-4 text-sm leading-relaxed
                {m.role==='user'?'bg-teal-700 text-white rounded-tr-sm':'bg-white border border-slate-200 text-slate-900 rounded-tl-sm shadow-sm'}">
                {#if m.role==='assistant'}<p><LinkedText content={m.content}/></p>
                {:else}<p class="whitespace-pre-wrap break-words">{m.content}</p>{/if}
              </div>
            </div>
          {/each}
        {/if}
        {#if busy}<p class="text-sm text-slate-500" role="status">Preparando respuesta…</p>{/if}
      </div>
      {#if loadError}<p role="alert" class="px-4 py-2 text-xs text-red-700 bg-red-50">{loadError}</p>{/if}
      {#if notice}<p role="status" class="px-4 py-2 text-xs text-teal-800 bg-teal-50">{notice}</p>{/if}
      <div class="px-3 sm:px-5 py-2 flex flex-wrap gap-x-4 gap-y-2 bg-white">
        <button type="button" class="text-xs font-semibold text-teal-800 underline" onclick={advisor}>Asesor solar paso a paso</button>
        <button type="button" class="text-xs font-semibold text-teal-800 underline" onclick={contact}>Solicitar visita técnica</button>
      </div>
      <form onsubmit={sendMessage} class="flex gap-2 items-end p-3 sm:p-4 bg-white border-t border-slate-200">
        <label class="sr-only" for={fullPage?'assistant-full-input':'assistant-panel-input'}>Escribe al asistente</label>
        <textarea id={fullPage?'assistant-full-input':'assistant-panel-input'} bind:value={chatInput}
          maxlength="4000" rows="2" onkeydown={keydown} disabled={busy||loading}
          placeholder="Pregúntame sobre energía solar, equipos o servicios…"
          class="flex-1 min-w-0 max-h-32 rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-teal-200 resize-none"></textarea>
        <button type="submit" disabled={busy||loading||!chatInput.trim()}
          class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-3 text-sm disabled:opacity-50">Enviar</button>
      </form>
      <p class="pb-2 px-3 text-center text-[10px] text-slate-500 bg-white">Bonaire orienta; la selección e instalación eléctrica requieren verificación técnica.</p>
    </div>
  </div>
</section>

{#if renamed}
  <div class="fixed inset-0 z-[250] bg-slate-950/60 flex justify-center items-center p-4">
    <dialog open aria-label="Cambiar título de conversación" class="relative m-0 max-w-md w-full rounded-2xl bg-white p-5 shadow-2xl">
      <form onsubmit={saveTitle} class="space-y-4">
        <h2 class="text-lg font-extrabold text-slate-900">Renombrar conversación</h2>
        <label class="block text-sm text-slate-700 font-semibold">Título
          <input minlength="2" maxlength="90" required bind:value={newTitle}
            class="block w-full rounded-xl border border-slate-300 p-3 mt-2 font-normal"/>
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" onclick={()=>renamed=null} class="rounded-xl border border-slate-200 p-3 text-sm font-bold">Cancelar</button>
          <button type="submit" disabled={loading} class="rounded-xl bg-teal-700 text-white p-3 text-sm font-bold">Guardar</button>
        </div>
      </form>
    </dialog>
  </div>
{/if}
