<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '../lib/api';
  import { assistantSessionId, assistantMessages, isAssistantOpen } from '../lib/store';

  type ChatMessage = { role: 'user' | 'assistant'; content: string };
  let { userId, onContact, onAdvisor }: { userId: string; onContact: () => void; onAdvisor: () => void } = $props();
  let inputMessage = $state('');
  let isSending = $state(false);
  let loadingHistory = $state(true);
  let sessionId = $state<string | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let scrollBox: HTMLDivElement;
  const suggestions = ['Quiero un asesoramiento solar', 'Necesito paneles o baterías', 'Quiero conocer precios', 'Necesito mantenimiento'];
  const welcome = '¡Hola! Soy el asistente de Bonaire. Puedo orientarte sobre el catálogo, las baterías, los paneles solares y los servicios. ¿Qué necesitas resolver primero?';

  async function scrollToEnd() {
    await tick();
    if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  function addMessage(role: ChatMessage['role'], content: string) {
    messages = [...messages, { role, content }];
    assistantMessages.set(messages);
    void scrollToEnd();
  }

  onMount(() => {
    let mounted = true;
    const key = `energia_vital_chat_${userId}`;
    const persisted = sessionStorage.getItem(key);
    const cachedSession = get(assistantSessionId);
    const active = persisted || cachedSession || crypto.randomUUID();
    sessionId = active;
    assistantSessionId.set(active);
    sessionStorage.setItem(key, active);
    const cached = get(assistantMessages) as ChatMessage[];
    if (cached.length && cachedSession === active) {
      messages = cached;
      loadingHistory = false;
      void scrollToEnd();
    } else if (persisted) {
      api.getAssistantMessages(active).then((response: any) => {
        if (!mounted) return;
        const restored = Array.isArray(response.messages)
          ? response.messages.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '') }))
          : [];
        messages = restored.length ? restored : [{ role: 'assistant', content: welcome }];
        assistantMessages.set(messages);
      }).catch(() => {
        if (!mounted) return;
        sessionId = crypto.randomUUID();
        assistantSessionId.set(sessionId);
        sessionStorage.setItem(key, sessionId);
        messages = [{ role: 'assistant', content: welcome }];
        assistantMessages.set(messages);
      }).finally(() => {
        if (mounted) { loadingHistory = false; void scrollToEnd(); }
      });
    } else {
      messages = [{ role: 'assistant', content: welcome }];
      assistantMessages.set(messages);
      loadingHistory = false;
    }
    return () => { mounted = false; };
  });

  async function sendMessage(event?: SubmitEvent) {
    event?.preventDefault();
    const message = inputMessage.trim();
    if (!message || !sessionId || isSending || loadingHistory) return;
    addMessage('user', message);
    inputMessage = '';
    isSending = true;
    try {
      const response = await api.postAssistantMessage({ session_id: sessionId, message, channel: 'web' });
      addMessage('assistant', String(response.response || 'No tengo una respuesta confirmada. Puedes dejar tu consulta desde «Solicitar servicio».'));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error de conexión';
      addMessage('assistant', `No pude enviar tu consulta: ${detail}. Puedes volver a intentarlo; no se ha registrado ninguna solicitud.`);
    } finally {
      isSending = false;
    }
  }

  function quickQuestion(question: string) {
    inputMessage = question;
    void sendMessage();
  }
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }
  function close() { isAssistantOpen.set(false); }
  function requestConsultation() { close(); onContact(); }
  function openAdvisor() { close(); onAdvisor(); }
</script>

<section aria-label="Asistente de Bonaire" class="w-[calc(100vw-1.5rem)] sm:w-[27rem] h-[min(35rem,calc(100vh-7rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
  <header class="bg-energia-600 text-white p-4 flex justify-between items-center">
    <div><h2 class="font-semibold">Asistente Bonaire</h2><p class="text-xs text-white/85">Orientación solar y consultas comerciales</p></div>
    <button type="button" onclick={close} class="text-white hover:opacity-80 px-2" aria-label="Cerrar asistente">✕</button>
  </header>
  <div bind:this={scrollBox} class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50" role="log" aria-label="Conversación" aria-live="polite" aria-relevant="additions">
    {#if loadingHistory}
      <p class="text-sm text-gray-500">Cargando conversación…</p>
    {:else}
      {#each messages as msg, index (index)}
        <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <p class="whitespace-pre-wrap break-words max-w-[90%] px-4 py-3 text-sm rounded-2xl {msg.role === 'user' ? 'bg-energia-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'}">{msg.content}</p>
        </div>
      {/each}
    {/if}
    {#if isSending}<p class="text-sm text-gray-500" role="status">Preparando respuesta…</p>{/if}
  </div>
  {#if messages.length <= 1 && !loadingHistory}
    <div class="px-3 pt-2 flex gap-2 overflow-x-auto" aria-label="Preguntas sugeridas">
      {#each suggestions as suggestion}
        <button type="button" class="shrink-0 text-xs border border-energia-300 rounded-full px-3 py-2 text-energia-700 hover:bg-gray-50" onclick={() => quickQuestion(suggestion)} disabled={isSending}>{suggestion}</button>
      {/each}
    </div>
  {/if}
  <div class="px-3 pt-2">
    <div class="flex items-center flex-wrap gap-x-4 gap-y-2 pb-2">
      <button type="button" class="text-sm text-teal-700 font-semibold underline" onclick={openAdvisor}>Abrir asesor solar paso a paso</button>
      <button type="button" class="text-sm text-energia-700 underline" onclick={requestConsultation}>Solicitar visita técnica</button>
    </div>
  </div>
  <form onsubmit={sendMessage} class="p-3 border-t border-gray-200 bg-white flex items-end gap-2">
    <label for="assistant-input" class="sr-only">Mensaje para el asistente</label>
    <textarea id="assistant-input" rows="2" maxlength="4000" bind:value={inputMessage}
      placeholder="Escribe tu consulta…"
      onkeydown={handleKeydown} disabled={isSending || loadingHistory}
      class="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-energia-500 outline-none text-sm resize-none"></textarea>
    <button type="submit" disabled={isSending || loadingHistory || !inputMessage.trim()}
      class="bg-energia-600 text-white px-4 py-3 rounded-lg disabled:opacity-50" aria-label="Enviar mensaje">Enviar</button>
  </form>
</section>
