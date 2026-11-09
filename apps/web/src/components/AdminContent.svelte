<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';

  type Section = 'products' | 'services' | 'gallery' | 'site';
  let { token, tab, products, services, categories, onRefresh }: {
    token: string; tab: Section; products: any[]; services: any[]; categories: any[];
    onRefresh: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let notice = $state('');
  let error = $state('');
  let categoryName = $state('');
  let categoryDescription = $state('');
  let editingProduct = $state('');
  let editingService = $state('');
  let productPhoto: File | null = $state(null);
  let servicePhoto: File | null = $state(null);

  function blankProduct() {
    return { category_id: '', name: '', brand: '', model: '', short_description: '', description: '',
      price: undefined as number | undefined, currency: 'USD', stock_status: 'on_order',
      stock_quantity: undefined as number | undefined, specifications: '', warranty_months: undefined as number | undefined,
      compatibility: '', is_featured: false, is_active: true };
  }
  function blankService() {
    return { name: '', description: '', scope: '', price: undefined as number | undefined,
      price_type: 'quote', duration_minutes: undefined as number | undefined, is_active: true };
  }
  let product = $state(blankProduct());
  let service = $state(blankService());
  const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function resetProduct() { editingProduct = ''; product = blankProduct(); product.category_id = categories[0]?.id || ''; productPhoto = null; }
  function resetService() { editingService = ''; service = blankService(); servicePhoto = null; }
  function editProduct(p: any) {
    editingProduct = p.id; product = { ...blankProduct(), ...p, price: p.price ?? undefined, stock_quantity: p.stock_quantity ?? undefined,
      warranty_months: p.warranty_months ?? undefined }; productPhoto = null;
    notice = ''; error = '';
  }
  function editService(s: any) {
    editingService = s.id; service = { ...blankService(), ...s, price: s.price ?? undefined, duration_minutes: s.duration_minutes ?? undefined };
    servicePhoto = null; notice = ''; error = '';
  }

  async function execute(task: () => Promise<void>) {
    busy = true; error = ''; notice = '';
    try { await task(); }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo guardar. Revisa la conexión.'; }
    finally { busy = false; }
  }
  async function saveCategory(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      await api.createAdminCategory(token, { name: categoryName.trim(), description: categoryDescription.trim(),
        slug: slug(categoryName) + '-' + Date.now() });
      categoryName = ''; categoryDescription = ''; await onRefresh(); notice = 'Categoría creada correctamente.';
    });
  }
  async function saveProduct(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (!product.category_id) throw new Error('Crea o selecciona una categoría.');
      if (productPhoto && productPhoto.size > 8 * 1024 * 1024) throw new Error('La foto debe ocupar menos de 8 MB.');
      const data = { ...product, price: product.price ?? null, stock_quantity: product.stock_quantity ?? null,
        warranty_months: product.warranty_months ?? null };
      let id = editingProduct;
      if (id) await api.updateAdminProduct(token, id, data);
      else {
        const result = await api.createAdminProduct(token, { ...data, slug: slug(product.name) + '-' + Date.now() });
        id = result.id;
      }
      if (productPhoto) await api.uploadProductImage(token, id, productPhoto, product.name);
      await onRefresh(); resetProduct(); notice = 'Producto guardado y visible según su estado de publicación.';
    });
  }
  async function saveService(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (servicePhoto && servicePhoto.size > 8 * 1024 * 1024) throw new Error('La foto debe ocupar menos de 8 MB.');
      const data = { ...service, price: service.price ?? null, duration_minutes: service.duration_minutes ?? null };
      let id = editingService;
      if (id) await api.updateAdminService(token, id, data);
      else {
        const result = await api.createAdminService(token, { ...data, slug: slug(service.name) + '-' + Date.now() });
        id = result.id;
      }
      if (servicePhoto) await api.uploadServiceImage(token, id, servicePhoto);
      await onRefresh(); resetService(); notice = 'Servicio guardado correctamente.';
    });
  }
  async function toggleProduct(p: any) {
    await execute(async () => {
      await api.updateAdminProduct(token, p.id, { is_active: !p.is_active });
      await onRefresh(); notice = p.is_active ? 'Producto ocultado.' : 'Producto publicado.';
    });
  }
  async function toggleService(s: any) {
    await execute(async () => {
      await api.updateAdminService(token, s.id, { is_active: !s.is_active });
      await onRefresh(); notice = s.is_active ? 'Servicio ocultado.' : 'Servicio publicado.';
    });
  }

  let gallery: any[] = $state([]);
  let galleryTitle = $state('');
  let galleryDescription = $state('');
  let galleryCategory = $state('');
  let galleryUrl = $state('');
  let galleryFile: File | null = $state(null);
  let galleryEdit: any = $state(null);

  function siteDefaults(): Record<string, string> {
    return { home_title: 'Energía Vital', home_subtitle: '', footer_description: '',
      business_phone: '', business_email: '', business_address: '', business_hours: '',
      youtube_channel_url: '', facebook_url: '', instagram_url: '', telegram_public_url: '' };
  }
  let site = $state<Record<string, string>>(siteDefaults());
  let linksText = $state('');
  async function loadExtra() {
    try {
      const [g, cfg] = await Promise.all([api.getAdminGallery(token), api.getAdminConfig(token)]);
      gallery = g.gallery ?? [];
      const next = siteDefaults();
      for (const item of cfg.settings ?? []) if (item.key in next) next[item.key] = String(item.value ?? '');
      site = next;
      const row = (cfg.settings ?? []).find((x: any) => x.key === 'footer_links');
      let links: any[] = [];
      try { links = JSON.parse(row?.value || '[]'); } catch { /* configuración antigua */ }
      linksText = Array.isArray(links) ? links.map((l: any) => String(l.label) + ' | ' + String(l.url)).join('\n') : '';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar la configuración.'; }
  }
  onMount(() => { void loadExtra(); });

  async function saveGallery(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (!galleryFile && !galleryUrl.trim()) throw new Error('Selecciona una foto o proporciona su URL HTTPS.');
      if (galleryFile && galleryFile.size > 8 * 1024 * 1024) throw new Error('La foto debe ocupar menos de 8 MB.');
      if (!galleryFile && !/^https:\/\//i.test(galleryUrl.trim())) throw new Error('La URL de la imagen debe comenzar por https://');
      const data = new FormData();
      data.append('title', galleryTitle.trim()); data.append('description', galleryDescription.trim());
      data.append('category', galleryCategory.trim()); data.append('is_active', 'true');
      if (galleryFile) data.append('file', galleryFile);
      else data.append('url', galleryUrl.trim());
      await api.createAdminGallery(token, data);
      galleryTitle = ''; galleryDescription = ''; galleryCategory = ''; galleryUrl = ''; galleryFile = null;
      gallery = (await api.getAdminGallery(token)).gallery ?? []; notice = 'Proyecto añadido a la galería.';
    });
  }
  async function updateGallery(event: SubmitEvent) {
    event.preventDefault();
    if (!galleryEdit) return;
    await execute(async () => {
      await api.updateAdminGallery(token, galleryEdit.id, { title: galleryEdit.title,
        description: galleryEdit.description, category: galleryEdit.category, is_active: Boolean(galleryEdit.is_active) });
      galleryEdit = null; gallery = (await api.getAdminGallery(token)).gallery ?? [];
      notice = 'Proyecto actualizado.';
    });
  }
  async function removeGallery(item: any) {
    if (!window.confirm('¿Eliminar definitivamente este proyecto de la galería?')) return;
    await execute(async () => {
      await api.deleteAdminGallery(token, item.id);
      gallery = (await api.getAdminGallery(token)).gallery ?? []; notice = 'Proyecto eliminado.';
    });
  }
  async function saveSite(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      const links = linksText.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const pos = line.indexOf('|');
        if (pos < 1) throw new Error('Enlaces: escribe una línea como Catálogo | /catalogo');
        return { label: line.slice(0, pos).trim(), url: line.slice(pos + 1).trim() };
      });
      await api.saveSiteSettings(token, { ...site, footer_links: JSON.stringify(links) });
      notice = 'Contenido de la portada y el pie de página publicado.';
    });
  }
</script>

<div class="space-y-6">
  {#if error}<div role="alert" class="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4">{error}</div>{/if}
  {#if notice}<div role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-4">{notice}</div>{/if}

  {#if tab === 'products'}
    <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 items-start">
      <div class="space-y-6">
        <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 class="text-lg font-bold text-slate-900 mb-1">Categorías</h2>
          <p class="text-sm text-slate-500 mb-4">Agrupa los equipos para facilitar la búsqueda en el catálogo.</p>
          <form onsubmit={saveCategory} class="space-y-3">
            <label class="block text-sm font-medium">Nombre de la categoría
              <input required maxlength="120" class="admin-input" placeholder="Ej. Paneles solares" bind:value={categoryName} />
            </label>
            <label class="block text-sm font-medium">Descripción breve
              <textarea rows="2" class="admin-input" placeholder="Ej. Paneles monocristalinos para hogares y negocios" bind:value={categoryDescription}></textarea>
            </label>
            <button disabled={busy} class="admin-secondary w-full">+ Añadir categoría</button>
          </form>
          <div class="flex flex-wrap gap-2 mt-4">{#each categories as cat (cat.id)}<span class="text-xs px-3 py-1.5 bg-slate-100 rounded-full text-slate-700">{cat.name}</span>{/each}</div>
        </section>
        <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div class="flex justify-between items-center gap-3 mb-4">
            <div><h2 class="text-xl font-bold">{editingProduct ? 'Editar equipo' : 'Nuevo equipo'}</h2><p class="text-sm text-slate-500">Toda la información que necesita el cliente.</p></div>
            {#if editingProduct}<button type="button" class="text-sm underline" onclick={resetProduct}>Cancelar edición</button>{/if}
          </div>
          <form class="grid gap-3" onsubmit={saveProduct}>
            <label class="admin-label">Categoría
              <select required class="admin-input" bind:value={product.category_id}><option value="">Selecciona una categoría</option>{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
            </label>
            <label class="admin-label">Nombre del equipo
              <input required maxlength="120" class="admin-input" placeholder="Panel solar monocristalino 550 W" bind:value={product.name} />
            </label>
            <div class="grid sm:grid-cols-2 gap-3">
              <label class="admin-label">Marca<input class="admin-input" placeholder="Marca" bind:value={product.brand} /></label>
              <label class="admin-label">Modelo<input class="admin-input" placeholder="Modelo" bind:value={product.model} /></label>
            </div>
            <label class="admin-label">Resumen para el catálogo
              <textarea rows="2" class="admin-input" placeholder="Lo más importante del producto en dos frases" bind:value={product.short_description}></textarea>
            </label>
            <label class="admin-label">Descripción completa
              <textarea rows="4" class="admin-input" placeholder="Rendimiento, ventajas, usos recomendados y detalles..." bind:value={product.description}></textarea>
            </label>
            <label class="admin-label">Especificaciones técnicas
              <textarea rows="3" class="admin-input" placeholder="Potencia: 550 W&#10;Eficiencia: ...&#10;Dimensiones: ..." bind:value={product.specifications}></textarea>
            </label>
            <div class="grid sm:grid-cols-2 gap-3">
              <label class="admin-label">Precio (opcional)<input type="number" min="0" step="0.01" class="admin-input" bind:value={product.price} /></label>
              <label class="admin-label">Moneda<select class="admin-input" bind:value={product.currency}><option value="USD">USD</option><option value="CUP">CUP</option><option value="MLC">MLC</option></select></label>
              <label class="admin-label">Inventario<select class="admin-input" bind:value={product.stock_status}><option value="in_stock">Disponible</option><option value="on_order">Bajo pedido</option><option value="out_of_stock">Agotado</option></select></label>
              <label class="admin-label">Existencias<input type="number" min="0" step="1" class="admin-input" bind:value={product.stock_quantity} /></label>
              <label class="admin-label">Garantía (meses)<input type="number" min="0" step="1" class="admin-input" bind:value={product.warranty_months} /></label>
            </div>
            <label class="admin-label">Fotografía principal (JPG, PNG o WebP · máximo 8 MB)
              <input type="file" accept="image/jpeg,image/png,image/webp" class="admin-input" onchange={e => productPhoto = e.currentTarget.files?.[0] ?? null} />
            </label>
            <div class="flex flex-wrap gap-4 py-2">
              <label class="flex gap-2 items-center text-sm"><input type="checkbox" bind:checked={product.is_featured} /> Destacar en inicio</label>
              <label class="flex gap-2 items-center text-sm"><input type="checkbox" bind:checked={product.is_active} /> Publicado</label>
            </div>
            <button disabled={busy} class="admin-primary">{busy ? 'Guardando…' : editingProduct ? 'Guardar cambios del producto' : 'Publicar producto'}</button>
          </form>
        </section>
      </div>
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 class="text-xl font-bold mb-1">Catálogo administrado <span class="text-slate-400 text-sm font-normal">({products.length})</span></h2>
        <p class="text-sm text-slate-500 mb-4">Pulsa «Editar» para ajustar descripción, precio o fotografía. Los cambios se guardan automáticamente en la base de datos.</p>
        <div class="grid sm:grid-cols-2 gap-4">
          {#each products as p (p.id)}
            <article class="rounded-xl border border-slate-200 overflow-hidden bg-white">
              {#if p.primary_image_url}<img src={p.primary_image_url} alt={p.name} class="h-40 w-full object-cover" />{:else}<div class="h-40 bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center text-slate-400 text-sm">Sin fotografía</div>{/if}
              <div class="p-4 space-y-2">
                <div class="flex justify-between gap-2"><h3 class="font-semibold text-slate-900">{p.name}</h3><span class="text-xs whitespace-nowrap {p.is_active ? 'text-emerald-700' : 'text-orange-600'}">{p.is_active ? 'Publicado' : 'Oculto'}</span></div>
                <p class="text-sm text-slate-500 line-clamp-2">{p.short_description || p.description || 'Sin descripción'}</p>
                <p class="font-bold">{p.price == null ? 'Consultar precio' : Number(p.price).toLocaleString('es-CU') + ' ' + (p.currency || 'USD')}</p>
                <div class="flex flex-wrap gap-2"><button class="admin-secondary flex-1" onclick={() => editProduct(p)}>Editar</button><button disabled={busy} class="admin-link" onclick={() => toggleProduct(p)}>{p.is_active ? 'Ocultar' : 'Publicar'}</button></div>
              </div>
            </article>
          {/each}
        </div>
        {#if products.length === 0}<p class="text-slate-500 text-sm py-8">Aún no hay equipos. Crea una categoría y añade el primer producto.</p>{/if}
      </section>
    </div>
  {:else if tab === 'services'}
    <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6 items-start">
      <section class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div class="flex justify-between items-center gap-2 mb-4"><h2 class="text-xl font-bold">{editingService ? 'Editar servicio' : 'Nuevo servicio'}</h2>{#if editingService}<button class="admin-link" onclick={resetService}>Cancelar</button>{/if}</div>
        <form class="space-y-4" onsubmit={saveService}>
          <label class="admin-label">Nombre del servicio<input required maxlength="120" class="admin-input" placeholder="Instalación de paneles solares" bind:value={service.name} /></label>
          <label class="admin-label">Descripción detallada<textarea required rows="4" class="admin-input" placeholder="Qué incluye el servicio, para quién es y qué ventajas ofrece..." bind:value={service.description}></textarea></label>
          <label class="admin-label">Alcance y condiciones<textarea rows="3" class="admin-input" placeholder="Incluye revisión, instalación, puesta en marcha..." bind:value={service.scope}></textarea></label>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">Tipo de precio<select class="admin-input" bind:value={service.price_type}><option value="quote">Bajo presupuesto</option><option value="fixed">Precio fijo</option><option value="free">Gratuito</option></select></label>
            <label class="admin-label">Precio (si es fijo)<input type="number" min="0" step="0.01" class="admin-input" bind:value={service.price} /></label>
            <label class="admin-label">Duración estimada (minutos)<input type="number" min="0" step="1" class="admin-input" bind:value={service.duration_minutes} /></label>
          </div>
          <label class="admin-label">Imagen del servicio (JPG, PNG o WebP · máximo 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" class="admin-input" onchange={e => servicePhoto = e.currentTarget.files?.[0] ?? null} /></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={service.is_active} /> Publicado en la página de servicios</label>
          <button disabled={busy} class="admin-primary w-full">{busy ? 'Guardando…' : editingService ? 'Guardar cambios' : 'Crear servicio'}</button>
        </form>
      </section>
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 class="text-xl font-bold mb-4">Servicios ({services.length})</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          {#each services as s (s.id)}
            <article class="border border-slate-200 rounded-xl overflow-hidden">
              {#if s.image_url}<img class="w-full h-40 object-cover" src={s.image_url} alt={s.name} />{:else}<div class="h-40 bg-slate-100 flex items-center justify-center text-slate-400">Sin fotografía</div>{/if}
              <div class="p-4 space-y-2">
                <h3 class="font-semibold">{s.name}</h3>
                <p class="text-sm text-slate-500 line-clamp-3">{s.description || 'Sin descripción'}</p>
                <p class="text-sm font-semibold">{s.price_type === 'fixed' && s.price != null ? Number(s.price).toLocaleString('es-CU') + ' USD' : s.price_type === 'free' ? 'Gratuito' : 'Bajo presupuesto'}</p>
                <div class="flex gap-2"><button class="admin-secondary flex-1" onclick={() => editService(s)}>Editar</button><button disabled={busy} class="admin-link" onclick={() => toggleService(s)}>{s.is_active ? 'Ocultar' : 'Publicar'}</button></div>
              </div>
            </article>
          {/each}
        </div>
        {#if services.length === 0}<p class="text-slate-500">Aún no hay servicios publicados.</p>{/if}
      </section>
    </div>
  {:else if tab === 'gallery'}
    <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 items-start">
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-xl font-bold mb-2">Añadir proyecto a la galería</h2>
        <p class="text-sm text-slate-500 mb-5">Muestra instalaciones, resultados y trabajos reales de Energía Vital.</p>
        <form class="space-y-4" onsubmit={saveGallery}>
          <label class="admin-label">Título<input required class="admin-input" placeholder="Instalación solar residencial" bind:value={galleryTitle} /></label>
          <label class="admin-label">Descripción<textarea rows="4" class="admin-input" placeholder="Qué se instaló, contexto del proyecto y resultado..." bind:value={galleryDescription}></textarea></label>
          <label class="admin-label">Categoría<input class="admin-input" placeholder="Residencial, negocio, mantenimiento…" bind:value={galleryCategory} /></label>
          <label class="admin-label">Foto del trabajo<input type="file" accept="image/jpeg,image/png,image/webp" class="admin-input" onchange={e => galleryFile = e.currentTarget.files?.[0] ?? null} /></label>
          <p class="text-xs text-slate-500">Si no subes un archivo, puedes utilizar una imagen HTTPS externa.</p>
          <label class="admin-label">URL de imagen (opcional)<input type="url" class="admin-input" placeholder="https://..." bind:value={galleryUrl} /></label>
          <button disabled={busy} class="admin-primary w-full">{busy ? 'Subiendo…' : 'Publicar proyecto'}</button>
        </form>
      </section>
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 class="text-xl font-bold mb-4">Proyectos ({gallery.length})</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          {#each gallery as g (g.id)}
            <article class="rounded-xl border border-slate-200 overflow-hidden">
              {#if g.url}<img src={g.url} alt={g.title} class="w-full h-40 object-cover" />{:else}<div class="h-40 bg-slate-100"></div>{/if}
              <div class="p-4 space-y-2">
                <h3 class="font-bold">{g.title}</h3>
                <p class="text-sm text-slate-500 line-clamp-3">{g.description || 'Sin descripción'}</p>
                <div class="flex gap-2"><button class="admin-secondary flex-1" onclick={() => galleryEdit = { ...g }}>Editar</button><button disabled={busy} class="admin-link text-red-700" onclick={() => removeGallery(g)}>Eliminar</button></div>
              </div>
            </article>
          {/each}
        </div>
        {#if gallery.length === 0}<p class="text-sm text-slate-500">Aquí aparecerán las fotografías de tus proyectos.</p>{/if}
      </section>
    </div>
    {#if galleryEdit}
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold mb-4">Editar proyecto</h3>
        <form onsubmit={updateGallery} class="grid md:grid-cols-2 gap-4">
          <label class="admin-label">Título<input required class="admin-input" bind:value={galleryEdit.title} /></label>
          <label class="admin-label">Categoría<input class="admin-input" bind:value={galleryEdit.category} /></label>
          <label class="admin-label md:col-span-2">Descripción<textarea rows="3" class="admin-input" bind:value={galleryEdit.description}></textarea></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={galleryEdit.is_active} /> Proyecto publicado</label>
          <div class="flex gap-2"><button disabled={busy} class="admin-primary">Guardar proyecto</button><button type="button" class="admin-secondary" onclick={() => galleryEdit = null}>Cancelar</button></div>
        </form>
      </section>
    {/if}
  {:else if tab === 'site'}
    <section class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-4xl space-y-5">
      <div><h2 class="text-2xl font-bold text-slate-900">Personalizar la web</h2><p class="text-slate-500 mt-1">Controla los textos principales, el contacto, las redes sociales y los enlaces del pie de página sin editar código.</p></div>
      <form onsubmit={saveSite} class="space-y-7">
        <fieldset class="space-y-3"><legend class="text-lg font-semibold mb-3">Portada</legend>
          <label class="admin-label">Título principal<input maxlength="120" class="admin-input" bind:value={site.home_title} /></label>
          <label class="admin-label">Descripción de bienvenida<textarea rows="4" class="admin-input" placeholder="Explica por qué elegir Energía Vital" bind:value={site.home_subtitle}></textarea></label>
        </fieldset>
        <fieldset class="space-y-3"><legend class="text-lg font-semibold mb-3">Pie de página y contacto</legend>
          <label class="admin-label">Texto sobre la empresa<textarea rows="3" class="admin-input" bind:value={site.footer_description}></textarea></label>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">Teléfono / WhatsApp<input class="admin-input" placeholder="+53 ..." bind:value={site.business_phone} /></label>
            <label class="admin-label">Correo público<input class="admin-input" type="email" placeholder="info@..." bind:value={site.business_email} /></label>
            <label class="admin-label">Dirección<input class="admin-input" bind:value={site.business_address} /></label>
            <label class="admin-label">Horario<input class="admin-input" bind:value={site.business_hours} /></label>
          </div>
        </fieldset>
        <fieldset class="space-y-3"><legend class="text-lg font-semibold mb-3">Redes sociales</legend>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">YouTube<input type="url" class="admin-input" placeholder="https://youtube.com/..." bind:value={site.youtube_channel_url} /></label>
            <label class="admin-label">Facebook<input type="url" class="admin-input" placeholder="https://facebook.com/..." bind:value={site.facebook_url} /></label>
            <label class="admin-label">Instagram<input type="url" class="admin-input" placeholder="https://instagram.com/..." bind:value={site.instagram_url} /></label>
            <label class="admin-label">Telegram<input type="url" class="admin-input" placeholder="https://t.me/..." bind:value={site.telegram_public_url} /></label>
          </div>
        </fieldset>
        <fieldset class="space-y-3"><legend class="text-lg font-semibold mb-2">Enlaces del footer</legend>
          <p class="text-sm text-slate-500">Un enlace por línea con el formato «Texto | dirección». Puedes usar rutas internas o direcciones HTTPS.</p>
          <label class="admin-label">Páginas que quieres mostrar<textarea rows="6" class="admin-input font-mono" placeholder="Catálogo | /catalogo&#10;Servicios | /servicios&#10;Galería | /galeria&#10;Nuestro canal | https://youtube.com/..." bind:value={linksText}></textarea></label>
        </fieldset>
        <button disabled={busy} class="admin-primary">{busy ? 'Publicando…' : 'Guardar y publicar cambios del sitio'}</button>
      </form>
    </section>
  {/if}
</div>

<style>
  .admin-input { display: block; width: 100%; padding: .65rem .8rem; margin-top: .35rem; border: 1px solid #cbd5e1; border-radius: .75rem; background: white; color: #0f172a; }
  .admin-input:focus { outline: 2px solid #0d9488; outline-offset: 1px; }
  .admin-label { display: block; font-size: .875rem; font-weight: 600; color: #334155; }
  .admin-primary { background: #0f766e; color: white; font-weight: 700; padding: .75rem 1.2rem; border-radius: .75rem; }
  .admin-primary:hover { background: #115e59; }
  .admin-secondary { background: #f1f5f9; color: #0f172a; padding: .6rem 1rem; font-weight: 600; border-radius: .7rem; }
  .admin-secondary:hover { background: #e2e8f0; }
  .admin-link { font-size: .875rem; font-weight: 600; padding: .5rem .75rem; color: #0f766e; }
  button:disabled { opacity: .6; cursor: not-allowed; }
</style>
