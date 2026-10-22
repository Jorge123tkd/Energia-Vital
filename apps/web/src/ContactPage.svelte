<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';

  let settings: any = $state({});
  let loading = true;

  onMount(async () => {
    try {
      const res = await api.getSettings();
      settings = res.settings ?? {};
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 mb-6">Contáctanos</h1>
      <form class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
          <input type="email" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
          <input type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
          <textarea required rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none"></textarea>
        </div>
        <button type="submit" class="w-full bg-energia-600 text-white py-3 rounded-lg font-medium hover:bg-energia-700 transition-colors">Enviar mensaje</button>
      </form>
    </div>

    <div class="space-y-6">
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">Información de contacto</h3>
        <p class="text-gray-600 mb-2">📍 Bogotá, Colombia</p>
        <p class="text-gray-600 mb-2">📞 +57 300 000 0000</p>
        <p class="text-gray-600 mb-2">✉️ info@energiavital.com</p>
        <p class="text-gray-600">🕐 Lunes a Viernes: 8:00 AM - 6:00 PM</p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">Síguenos en YouTube</h3>
        <p class="text-gray-600 mb-4">Mira nuestras instalaciones, tutoriales y consejos solares.</p>
        <a href="{settings.youtube_channel_url || 'https://youtube.com/@energiavital'}" target="_blank" class="inline-flex items-center gap-2 text-energia-600 font-medium hover:underline">
          Ver canal de YouTube ▶
        </a>
      </div>

      <div class="bg-energia-600 text-white rounded-xl p-6">
        <h3 class="text-xl font-bold mb-4">¿Necesitas ayuda urgente?</h3>
        <p class="text-gray-200 mb-4">Escríbenos por Telegram y te responderemos lo antes posible.</p>
        <button class="bg-white text-energia-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
          Abrir Telegram
        </button>
      </div>
    </div>
  </div>
</div>
