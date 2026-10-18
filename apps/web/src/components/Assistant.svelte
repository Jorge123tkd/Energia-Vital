<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { assistantSessionId, assistantMessages, isAssistantOpen, addNotification } from '../lib/store';

  let inputMessage = '';
  let isSending = false;
  let sessionId: string | null = null;
  let messages: { role: string; content: string }[] = [];

  onMount(() => {
    assistantSessionId.subscribe((v) => { sessionId = v; })();
    assistantMessages.subscribe((v) => { messages = v; })();

    if (!sessionId) {
      const newId = crypto.randomUUID();
      assistantSessionId.set(newId);
      sessionId = newId;
      addWelcomeMessage();
    }
  });

  function addWelcomeMessage() {
    const welcome = {
      role: 'assistant',
      content: '¡Hola! Soy el asistente de Energía Vital. ¿En qué puedo ayudarte hoy? Puedo ayudarte con equipos solares, precios, citas, mantenimiento y más.'
    };
    messages.push(welcome);
    assistantMessages.set(messages);
  }

  async function sendMessage() {
    if (!inputMessage.trim()) return;
    if (!sessionId) return;

    const userMsg = { role: 'user', content: inputMessage };
    messages.push(userMsg);
    assistantMessages.set(messages);

    const tempInput = inputMessage;
    inputMessage = '';
    isSending = true;

    try {
      const res = await api.postAssistantMessage({
        session_id: sessionId,
        message: tempInput,
        channel: 'web',
      });

      const assistantMsg = { role: 'assistant', content: res.response };
      messages.push(assistantMsg);
      assistantMessages.set(messages);
    } catch (e: any) {
      const errorMsg = { role: 'assistant', content: 'Lo siento, hubo un error procesando tu mensaje. Inténtalo de nuevo.' };
      messages.push(errorMsg);
      assistantMessages.set(messages);
      addNotification('error', e.message || 'Error al enviar mensaje');
    } finally {
      isSending = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="fixed bottom-6 right-6 z-[100]">
  <button onclick={toggleAssistant} class="bg-energia-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:bg-energia-700 transition-all transform active:scale-95">
    <span class="text-2xl">💬</span>
    <span class="sr-only">Abrir asistente</span>
  </button>

  {#if isAssistantOpen}
    <div class="absolute bottom-0 right-0 w-96 h-[600px] bg-white rounded-t-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
      <div class="bg-energia-600 text-white p-4">
        <div class="flex justify-between items-center">
          <h3 class="font-semibold">Asistente Energía Vital</h3>
          <button onclick={toggleAssistant} class="text-gray-200 hover:text-white">
            <span class="sr-only">Cerrar</span>✕
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {#each messages as msg}
          <div class="flex gap-3">
            {#if msg.role === 'user'}
              <div class="flex justify-end">
                <div class="bg-energia-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
                  {msg.content}
                </div>
              </div>
            {:else}
              <div class="flex justify-start">
                <div class="bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%]">
                  {msg.content}
                </div>
              </div>
            {/if}
          </div>
        {/each}
        {#if isSending}
          <div class="flex justify-start">
            <div class="bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%] animate-pulse">
              Escribiendo...
            </div>
          </div>
        {/if}
      </div>
      <div class="p-3 border-t border-gray-200 bg-white">
        <form on:submit|preventDefault={sendMessage} class="flex gap-2">
          <input bind:value={inputMessage} placeholder="Escribe tu mensaje..." class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-energia-500 outline-none text-sm" on:keydown={handleKeyDown} disabled={isSending} />
          <button type="submit" disabled={isSending || !inputMessage.trim()} class="bg-energia-600 text-white px-4 py-2 rounded-lg hover:bg-energia-700 transition-colors disabled:opacity-50">
            Enviar
          </button>
        </form>
      </div>
    </div>
  {/if}
</div>

<script>
  import { isAssistantOpen } from '../lib/store';

  function toggleAssistant() {
    isAssistantOpen.update((v) => !v);
  }
</script>

<style>
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>