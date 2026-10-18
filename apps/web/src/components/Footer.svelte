<script lang="ts">
  export let settings: any = {};
</script>

<footer class="bg-gray-900 text-white mt-auto py-8 border-t border-gray-800">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
      <div>
        <h3 class="text-lg font-bold mb-4 text-energia-400">Energía Vital</h3>
        <p class="text-gray-400 text-sm">
          Soluciones solares para tu hogar y negocio. Asesoramiento, venta, instalación y mantenimiento.
        </p>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Servicios</h4>
        <ul class="space-y-2 text-sm text-gray-400">
          <li><a href="/servicios" class="hover:text-white">Instalación solar</a></li>
          <li><a href="/servicios" class="hover:text-white">Mantenimiento</a></li>
          <li><a href="/servicios" class="hover:text-white">Reparación de inversores</a></li>
          <li><a href="/asesor-solar" class="hover:text-white">Asesor solar</a></li>
        </ul>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Contacto</h4>
        <ul class="space-y-2 text-sm text-gray-400">
          <li>WhatsApp/Telegram: <a href="#" class="hover:text-white">+57 300 000 0000</a></li>
          <li>Email: <a href="mailto:info@energiavital.com" class="hover:text-white">info@energiavital.com</a></li>
          <li>Bogotá, Colombia</li>
        </ul>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Síguenos</h4>
        <div class="flex gap-4">
          <a href="#" class="text-gray-400 hover:text-white">YouTube</a>
          <a href="#" class="text-gray-400 hover:text-white">Instagram</a>
          <a href="#" class="text-gray-400 hover:text-white">Facebook</a>
        </div>
        <p class="mt-4 text-xs text-gray-500">
          {$settings.youtube_channel_url || 'Canal de YouTube'}
        </p>
      </div>
    </div>

    <div class="border-t border-gray-800 pt-8 text-center text-xs text-gray-500">
      © 2026 Energía Vital. Todos los derechos reservados.
    </div>
  </div>
</footer>