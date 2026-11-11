<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import Pagination from './Pagination.svelte';
  import ImagePicker from './ImagePicker.svelte';
  import AdminMediaGallery from './AdminMediaGallery.svelte';
  import AdminGalleryCategories from './AdminGalleryCategories.svelte';
  import AdminProductReviews from './AdminProductReviews.svelte';

  type Section = 'products' | 'services' | 'gallery' | 'site';
  let { token, tab, products, services, categories, onRefresh }: {
    token: string; tab: Section; products: any[]; services: any[]; categories: any[];
    onRefresh: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let showPurchaseModal = $state(false);
  let siteSection = $state<'slides' | 'contact' | 'channels' | 'links'>('slides');
  let productSearch = $state('');
  let productCategory = $state('');
  let productPage = $state(1);
  let productFeaturedCount = $derived(products.filter(p => Boolean(p.is_featured) && Boolean(p.is_active)).length);
  let serviceFeaturedCount = $derived(services.filter(s => Boolean(s.is_featured) && Boolean(s.is_active)).length);
  let servicePage = $state(1);
  let galleryPage = $state(1);
  const itemPageSize = 10;
  let servicePageCount = $derived(Math.max(1, Math.ceil(services.length / itemPageSize)));
  let visibleServices = $derived(services.slice((Math.min(servicePage,servicePageCount)-1)*itemPageSize,
    Math.min(servicePage,servicePageCount)*itemPageSize));
  const productPageSize = 10;
  let visibleProducts = $derived.by(() => {
    const term = productSearch.trim().toLocaleLowerCase('es');
    return products.filter(p => (!productCategory || p.category_id === productCategory) &&
      (!term || [p.id, p.name, p.brand, p.model, p.short_description].some(v =>
        String(v || '').toLocaleLowerCase('es').includes(term))));
  });
  let productPages = $derived(Math.max(1, Math.ceil(visibleProducts.length / productPageSize)));
  let pagedProducts = $derived(visibleProducts.slice((Math.min(productPage,productPages)-1)*productPageSize,
    Math.min(productPage,productPages)*productPageSize));
  let modal = $state<'category' | 'product' | 'service' | 'gallery' | 'gallery-edit' | null>(null);
  let notice = $state('');
  let error = $state('');
  let categoryName = $state('');
  let categoryDescription = $state('');
  let editingCategory = $state('');
  let categorySortOrder = $state(0);
  let categoryActive = $state(true);
  function newCategory() {
    editingCategory = '';
    categoryName = '';
    categoryDescription = '';
    categorySortOrder = 0;
    categoryActive = true;
    error = '';
    notice = '';
    modal = 'category';
  }
  function editCategory(cat: any) {
    editingCategory = String(cat.id);
    categoryName = cat.name || '';
    categoryDescription = cat.description || '';
    categorySortOrder = Number(cat.sort_order) || 0;
    categoryActive = Boolean(cat.is_active);
    error = '';
    notice = '';
    modal = 'category';
  }
  let editingProduct = $state('');
  let editingService = $state('');
  let productPhoto: File | null = $state(null);
  let servicePhoto: File | null = $state(null);
  let productPhotos: File[] = $state([]);
  let servicePhotos: File[] = $state([]);
  let productImageUrl = $state('');
  let serviceImageUrl = $state('');

  function blankProduct() {
    return { category_id: '', name: '', brand: '', model: '', short_description: '', description: '',
      price: undefined as number | undefined, currency: 'USD', stock_status: 'on_order',
      stock_quantity: undefined as number | undefined, specifications: '', warranty_months: undefined as number | undefined,
      compatibility: '', is_featured: false, is_active: true };
  }
  function blankService() {
    return { name: '', description: '', scope: '', price: undefined as number | undefined,
      price_type: 'quote', duration_minutes: undefined as number | undefined, is_featured: false, is_active: true };
  }
  let product = $state(blankProduct());
  let service = $state(blankService());
  const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function resetProduct() { editingProduct = ''; product = blankProduct(); product.category_id = categories[0]?.id || ''; productPhoto = null; productPhotos = []; productImageUrl = ''; }
  function resetService() { editingService = ''; service = blankService(); servicePhoto = null; servicePhotos = []; serviceImageUrl = ''; }
  function editProduct(p: any) {
    editingProduct = p.id; product = { ...blankProduct(), ...p, price: p.price ?? undefined, stock_quantity: p.stock_quantity ?? undefined,
      warranty_months: p.warranty_months ?? undefined }; productPhoto = null; productPhotos = []; productImageUrl = '';
    notice = ''; error = ''; modal = 'product';
  }
  function editService(s: any) {
    editingService = s.id; service = { ...blankService(), ...s, is_featured: Boolean(s.is_featured), price: s.price ?? undefined, duration_minutes: s.duration_minutes ?? undefined };
    servicePhoto = null; servicePhotos = []; serviceImageUrl = ''; notice = ''; error = ''; modal = 'service';
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
      const name = categoryName.trim();
      const body = { name, description: categoryDescription.trim(), sort_order: categorySortOrder, is_active: categoryActive };
      if (editingCategory) {
        await api.updateAdminCategory(token, editingCategory, body);
      } else {
        await api.createAdminCategory(token, { ...body, slug: slug(name) + '-' + Date.now() });
      }
      const wasEditing = !!editingCategory;
      await onRefresh();
      editingCategory = '';
      categoryName = '';
      categoryDescription = '';
      modal = null;
      notice = wasEditing ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.';
    });
  }
  async function saveProduct(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (!product.category_id) throw new Error('Crea o selecciona una categoría.');
      if (productPhotos.some(f => f.size > 8*1024*1024)) throw new Error('Las fotografías deben ocupar menos de 8 MB.');
      const data = { ...product, price: product.price ?? null, stock_quantity: product.stock_quantity ?? null,
        warranty_months: product.warranty_months ?? null };
      let id = editingProduct;
      if (id) await api.updateAdminProduct(token, id, data);
      else {
        const result = await api.createAdminProduct(token, { ...data, slug: slug(product.name) + '-' + Date.now() });
        id = result.id;
      }
      if (productPhotos.length) {
        for (const photo of productPhotos) await api.uploadProductImage(token, id, photo, product.name);
      } else if (productImageUrl.trim()) await api.setProductImageUrl(token, id, productImageUrl.trim());
      await onRefresh(); resetProduct(); modal = null; notice = 'Producto guardado y visible según su estado de publicación.';
    });
  }
  async function saveService(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (servicePhotos.some(f => f.size > 8*1024*1024)) throw new Error('Las fotografías deben ocupar menos de 8 MB.');
      const data = { ...service, price: service.price ?? null, duration_minutes: service.duration_minutes ?? null };
      let id = editingService;
      if (id) await api.updateAdminService(token, id, data);
      else {
        const result = await api.createAdminService(token, { ...data, slug: slug(service.name) + '-' + Date.now() });
        id = result.id;
      }
      if (servicePhotos.length) {
        for (const photo of servicePhotos) await api.uploadAdminServiceImage(token, id, photo);
      } else if (serviceImageUrl.trim()) await api.setServiceImageUrl(token, id, serviceImageUrl.trim());
      await onRefresh(); resetService(); modal = null; notice = 'Servicio guardado correctamente.';
    });
  }

  async function removeProduct(p: any) {
    if (!confirm('¿Eliminar definitivamente el producto «'+p.name+'» y sus fotografías? Si tiene compras verificadas o reseñas, Bonaire impedirá el borrado.')) return;
    await execute(async () => {
      await api.deleteAdminProduct(token, p.id);
      await onRefresh();
      notice='Producto eliminado correctamente.';
    });
  }
  async function removeService(s: any) {
    if (!confirm('¿Eliminar definitivamente el servicio «'+s.name+'» y sus fotografías? Si tiene citas vinculadas, Bonaire protegerá el historial.')) return;
    await execute(async () => {
      await api.deleteAdminService(token, s.id);
      await onRefresh();
      notice='Servicio eliminado correctamente.';
    });
  }
  async function removeCategory(cat: any) {
    if (!confirm('¿Eliminar la categoría «'+cat.name+'»? Solo se permitirá cuando no contenga equipos.')) return;
    await execute(async () => {
      await api.deleteAdminCategory(token, cat.id);
      await onRefresh();
      notice='Categoría eliminada.';
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
  async function setFeaturedProduct(item: any) {
    await execute(async () => {
      await api.updateAdminProduct(token, item.id, {is_featured: !item.is_featured});
      await onRefresh();
      notice = item.is_featured ? 'Producto retirado de Inicio.' : 'Producto destacado en Inicio.';
    });
  }
  async function setFeaturedService(item: any) {
    await execute(async () => {
      await api.updateAdminService(token, item.id, {is_featured: !item.is_featured});
      await onRefresh();
      notice = item.is_featured ? 'Servicio retirado de Inicio.' : 'Servicio destacado en Inicio.';
    });
  }
  async function setFeaturedGallery(item: any) {
    await execute(async () => {
      await api.updateAdminGallery(token, item.id, {is_featured: !item.is_featured});
      gallery = (await api.getAdminGallery(token)).gallery ?? [];
      notice = item.is_featured ? 'Proyecto retirado de Inicio.' : 'Proyecto destacado en Inicio.';
    });
  }

  let gallery: any[] = $state([]);
  let galleryFeaturedCount = $derived(gallery.filter(g => Boolean(g.is_featured) && Boolean(g.is_active)).length);
  let galleryPageCount = $derived(Math.max(1, Math.ceil(gallery.length / itemPageSize)));
  let visibleGallery = $derived(gallery.slice((Math.min(galleryPage,galleryPageCount)-1)*itemPageSize,
    Math.min(galleryPage,galleryPageCount)*itemPageSize));
  let galleryFeatured = $state(false);
  let galleryTitle = $state('');
  let galleryDescription = $state('');
  let galleryCategory = $state('');
  let galleryUrl = $state('');
  let galleryFile: File | null = $state(null);
  let galleryPhotos: File[] = $state([]);
  let galleryCategories: {id:string;name:string;is_active:number|boolean}[] = $state([]);
  async function loadGalleryCategories() {
    try { galleryCategories = (await api.listAdminGalleryCategories(token)).categories || []; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudieron cargar categorías de la galería.'; }
  }
  let galleryEdit: any = $state(null);

  function siteDefaults(): Record<string, string> {
    return { home_title: 'Bonaire', home_subtitle: '', footer_description: '',
      footer_cta_title: '', footer_cta_description: '',
      business_phone: '', business_email: '', business_address: '', business_hours: '',
      youtube_channel_url: '', facebook_url: '', instagram_url: '', telegram_public_url: '',
      bot_whatsapp_url: '', bot_telegram_url: '' };
  }
  let site = $state<Record<string, string>>(siteDefaults());

  type HomeSlide = { title: string; subtitle: string; image_url: string; link_label: string; link_url: string };
  function defaultSlides(): HomeSlide[] {
    return [
      { title: 'Bonaire', subtitle: 'Paneles solares, inversores, baterías y servicios de instalación y mantenimiento.', image_url: '', link_label: 'Explorar equipos', link_url: '/catalogo' },
      { title: 'Trabajos que hablan por nosotros', subtitle: 'Conoce nuestros proyectos e instalaciones de energía solar.', image_url: '', link_label: 'Ver nuestros trabajos', link_url: '/galeria' },
      { title: 'Novedades y soluciones solares', subtitle: 'Descubre equipos disponibles y las propuestas que mejor se adaptan a ti.', image_url: '', link_label: 'Ver catálogo', link_url: '/catalogo' },
    ];
  }
  const MAX_SLIDES = 6;
  let slides = $state<HomeSlide[]>(defaultSlides());
  let editingSlide = $state<number | null>(null);
  let draftSlide = $state<HomeSlide>({ ...defaultSlides()[0] });
  let slideFile = $state<File | null>(null);
  let uploadingSlide = $state(false);
  function editSlide(index: number) {
    if (editingSlide !== null) return;
    editingSlide = index;
    draftSlide = { ...slides[index] };
    slideFile = null; error = ''; notice = '';
  }
  function newSlide() {
    if (editingSlide !== null || slides.length >= MAX_SLIDES) return;
    editingSlide = slides.length;
    draftSlide = { title: '', subtitle: '', image_url: '', link_label: 'Conocer más', link_url: '/catalogo' };
    slideFile = null; error = ''; notice = '';
  }
  function cancelSlide() {
    if (uploadingSlide) return;
    editingSlide = null; slideFile = null; error = '';
  }
  function applySlide() {
    if (editingSlide === null || uploadingSlide) return;
    const title = draftSlide.title.trim();
    const link = draftSlide.link_url.trim();
    const image = draftSlide.image_url.trim();
    const https = (value: string) => {
      try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname); }
      catch { return false; }
    };
    if (!title || !link || !((link.startsWith('/') && !link.startsWith('//') && !link.includes(String.fromCharCode(92))) || https(link)) || (image && !https(image))) {
      error = 'Introduce un título, un enlace interno o HTTPS válido y una imagen HTTPS si corresponde.';
      return;
    }
    const item = { ...draftSlide, title, link_url: link, image_url: image };
    slides = editingSlide === slides.length ? [...slides, item] : slides.map((s, i) => i === editingSlide ? item : s);
    editingSlide = null; slideFile = null; error = '';
    notice = 'Cambio preparado. Pulsa «Guardar y publicar cambios del sitio» para publicarlo.';
  }
  function removeSlide(index: number) {
    if (editingSlide !== null || slides.length <= 1) return;
    if (!confirm('¿Quitar esta diapositiva? El cambio se publicará al guardar el sitio.')) return;
    slides = slides.filter((_, i) => i !== index);
    notice = 'Diapositiva retirada. Guarda los cambios para publicar.';
  }
  let phoneRows = $state<{ label: string; number: string }[]>([]);
  function addPhone() { phoneRows = [...phoneRows, { label: '', number: '' }]; }
  function removePhone(index: number) { phoneRows = phoneRows.filter((_, i) => i !== index); }
  async function uploadSlide() {
    if (editingSlide === null || !slideFile) { error = 'Selecciona primero una fotografía.'; return; }
    const file = slideFile;
    if (file.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
      error = 'Utiliza JPG, PNG o WebP de hasta 8 MB.'; return;
    }
    error = ''; notice = ''; uploadingSlide = true;
    try {
      const result = await api.uploadSiteMedia(token, file);
      draftSlide.image_url = result.image_url;
      slideFile = null;
      notice = 'Imagen subida a R2. Aplica la edición y publica los cambios del sitio.';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo subir la imagen'; }
    finally { uploadingSlide = false; }
  }
  let linksText = $state('');
  async function loadExtra() {
    try {
      const [g, cfg, cats] = await Promise.all([
        api.getAdminGallery(token), api.getAdminConfig(token), api.listAdminGalleryCategories(token)
      ]);
      galleryCategories = cats.categories || [];
      gallery = g.gallery ?? [];
      const next = siteDefaults();
      for (const item of cfg.settings ?? []) if (item.key in next) next[item.key] = String(item.value ?? '');
      if (next.home_title === 'Energía Vital') next.home_title = 'Bonaire';
      site = next;
      try {
        const phoneSetting = (cfg.settings ?? []).find((row: any) => row.key === 'business_phones');
        const value = JSON.parse(phoneSetting?.value || '[]');
        phoneRows = Array.isArray(value) ? value.filter((p: any) => p && typeof p.number === 'string')
          .map((p: any) => ({ label: String(p.label || ''), number: String(p.number || '') })) : [];
      } catch { phoneRows = []; }
      const row = (cfg.settings ?? []).find((x: any) => x.key === 'footer_links');
      let links: any[] = [];
      try { links = JSON.parse(row?.value || '[]'); } catch { /* configuración antigua */ }
      linksText = Array.isArray(links) ? links.map((l: any) => String(l.label) + ' | ' + String(l.url)).join('\n') : '';
      const slidesRow = (cfg.settings ?? []).find((x: any) => x.key === 'home_slides');
      try {
        const parsed = JSON.parse(slidesRow?.value || 'null');
        if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= MAX_SLIDES) {
          slides = parsed.map((s: any) => ({
            title: String(s.title === 'Energía Vital' ? 'Bonaire' : s.title || ''), subtitle: String(s.subtitle || ''),
            image_url: String(s.image_url || ''), link_label: String(s.link_label || ''),
            link_url: String(s.link_url || '')
          }));
        } else {
          slides = defaultSlides();
          if (next.home_title) slides[0].title = next.home_title === 'Energía Vital' ? 'Bonaire' : next.home_title;
          if (next.home_subtitle) slides[0].subtitle = next.home_subtitle;
        }
      } catch { slides = defaultSlides(); }
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar la configuración.'; }
  }
  onMount(() => { void loadExtra(); });

  async function saveGallery(event: SubmitEvent) {
    event.preventDefault();
    await execute(async () => {
      if (!galleryPhotos.length && !galleryUrl.trim())
        throw new Error('Selecciona fotos del proyecto o proporciona una URL HTTPS.');
      if (galleryPhotos.length > 15) throw new Error('Máximo 15 fotografías por proyecto.');
      if (!galleryPhotos.length && !/^https:\/\//i.test(galleryUrl.trim()))
        throw new Error('La URL de imagen debe comenzar por https://');
      const data = new FormData();
      data.append('title', galleryTitle.trim());
      data.append('description', galleryDescription.trim());
      data.append('category', galleryCategory.trim());
      data.append('is_active', 'true');
      data.append('is_featured', String(galleryFeatured));
      if (galleryPhotos.length) data.append('file', galleryPhotos[0]);
      else data.append('url', galleryUrl.trim());
      const created = await api.createAdminGallery(token, data);
      let saved = galleryPhotos.length ? 1 : 0;
      let partialError = '';
      for (const file of galleryPhotos.slice(1)) {
        try { await api.uploadAdminGalleryImage(token, created.id, file); saved += 1; }
        catch (e) { partialError = e instanceof Error ? e.message : 'Error de almacenamiento'; break; }
      }
      galleryTitle = ''; galleryDescription = ''; galleryCategory = ''; galleryUrl = '';
      galleryFile = null; galleryPhotos = [];
      gallery = (await api.getAdminGallery(token)).gallery ?? [];
      modal = null;
      notice = partialError
        ? `Proyecto creado; se guardaron ${saved} fotos. Añade las restantes desde Editar. ${partialError}`
        : 'Proyecto publicado con ' + (saved || 1) + ' foto(s).';
    });
  }
  async function updateGallery(event: SubmitEvent) {
    event.preventDefault();
    if (!galleryEdit) return;
    await execute(async () => {
      await api.updateAdminGallery(token, galleryEdit.id, { title: galleryEdit.title,
        description: galleryEdit.description, category: galleryEdit.category, is_active: Boolean(galleryEdit.is_active), is_featured: Boolean(galleryEdit.is_featured) });
      galleryEdit = null; modal = null; gallery = (await api.getAdminGallery(token)).gallery ?? [];
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
      if (editingSlide !== null) throw new Error('Aplica o cancela la edición antes de publicar.');
      const links = linksText.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const pos = line.indexOf('|');
        if (pos < 1) throw new Error('Enlaces: escribe una línea como Catálogo | /catalogo');
        return { label: line.slice(0, pos).trim(), url: line.slice(pos + 1).trim() };
      });
      await api.saveSiteSettings(token, { ...site, footer_links: JSON.stringify(links), home_slides: JSON.stringify(slides),
        business_phones: JSON.stringify(phoneRows.filter(p => p.number.trim()).map(p => ({ label: p.label.trim(), number: p.number.trim() }))) });
      notice = 'Contenido de la portada y el pie de página publicado.';
    });
  }
</script>

<div class="space-y-6">
  {#if error}<div role="alert" class="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4">{error}</div>{/if}
  {#if notice}<div role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-4">{notice}</div>{/if}

  {#if tab === 'products'}
    <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
      <div class="flex flex-wrap gap-3 justify-between items-start">
        <div><h2 class="text-2xl font-bold text-slate-900">Catálogo de equipos ({products.length})</h2>
          <p class="text-sm text-slate-500 mt-1">Crea y edita sin abandonar el catálogo. Las fichas se abren en ventanas independientes.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="admin-secondary" onclick={newCategory}>+ Nueva categoría</button>
          <button type="button" class="admin-primary" onclick={() => { resetProduct(); modal = 'product'; error = ''; }}>+ Nuevo equipo</button>
          <button type="button" class="admin-secondary border border-teal-200" onclick={() => showPurchaseModal = true}>★ Compras y valoraciones</button>
        </div>
      </div>
      <section aria-label="Administrar categorías" class="rounded-2xl bg-slate-50 border border-slate-200 p-3 sm:p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-base font-extrabold text-slate-900">Categorías ({categories.length})</h3>
            <p class="text-xs text-slate-500 mt-1">Las categorías existentes aparecen siempre aquí. Puedes editar nombre, descripción y orden.</p>
          </div>
          <button type="button" class="admin-secondary text-sm" onclick={newCategory}>+ Crear categoría</button>
        </div>
        {#if categories.length === 0}
          <p class="bg-white rounded-xl p-4 border border-dashed border-slate-300 text-sm text-slate-600">
            Todavía no hay categorías. Crea una para organizar tus equipos.
          </p>
        {:else}
          <div class="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
            {#each categories as cat (cat.id)}
              <article class="min-w-0 flex flex-col justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <div class="min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <strong class="text-sm text-slate-900 break-words">{cat.name}</strong>
                    <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold {cat.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                      {cat.is_active ? 'Visible' : 'Oculta'}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-slate-500 line-clamp-2">{cat.description || 'Sin descripción'}</p>
                </div>
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span class="text-[11px] text-slate-500">{products.filter((p: any) => p.category_id === cat.id).length} equipos · Orden {cat.sort_order ?? 0}</span>
                  <div class="flex gap-1.5 shrink-0">
                    <button type="button" class="text-xs rounded-lg border border-teal-200 bg-teal-50 text-teal-800 font-bold px-3 py-2 hover:bg-teal-100"
                      onclick={() => editCategory(cat)} aria-label={'Editar categoría ' + cat.name}>✎ Editar</button>
                    <button type="button" disabled={busy} class="text-xs rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold px-3 py-2 hover:bg-red-100"
                      onclick={() => removeCategory(cat)} aria-label={'Eliminar categoría ' + cat.name}>✕</button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>
      <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-end p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200">
        <label class="text-xs font-bold text-slate-600 flex-1">Buscar equipos por nombre, marca o ID
          <input class="admin-input" type="search" bind:value={productSearch} placeholder="Buscar entre todos los productos…" oninput={() => productPage = 1}/>
        </label>
        <label class="text-xs font-bold text-slate-600 md:w-60">Categoría
          <select class="admin-input" bind:value={productCategory} onchange={() => productPage = 1}>
            <option value="">Todas las categorías</option>
            {#each categories as cat (cat.id)}<option value={cat.id}>{cat.name}</option>{/each}
          </select>
        </label>
        <span class="text-sm text-slate-500 whitespace-nowrap py-2">{visibleProducts.length} resultados · Destacados {productFeaturedCount}/5</span>
      </div>
      <div class="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {#each pagedProducts as p (p.id)}
            <article class="group rounded-xl border border-slate-200 overflow-hidden bg-white hover:shadow-lg hover:border-teal-200 transition">
              {#if p.primary_image_url}<div class="overflow-hidden bg-teal-50"><img src={p.primary_image_url} alt={p.name} class="h-32 sm:h-36 w-full object-cover object-center transition-transform duration-300 group-hover:scale-110" /></div>{:else}<div class="h-28 sm:h-32 bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center text-slate-400 text-sm">Sin fotografía</div>{/if}
              <div class="p-3 space-y-2">
                <div class="flex justify-between gap-2"><h3 class="font-semibold text-slate-900">{p.name}</h3><span class="text-xs whitespace-nowrap {p.is_active ? 'text-emerald-700' : 'text-orange-600'}">{p.is_active ? 'Publicado' : 'Oculto'}</span></div>
                <p class="text-xs text-slate-500 line-clamp-2">{p.short_description || p.description || 'Sin descripción'}</p>
                <p class="font-bold">{p.price == null ? 'Consultar precio' : Number(p.price).toLocaleString('es-CU') + ' ' + (p.currency || 'USD')}</p>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="button" class="admin-secondary flex-1" onclick={() => editProduct(p)}>✎ Editar</button>
                  <button type="button" class="admin-secondary text-xs" disabled={busy || (!p.is_featured && productFeaturedCount>=5 && p.is_active)}
                    onclick={() => setFeaturedProduct(p)}>{p.is_featured ? '★ Quitar' : '☆ Destacar'}</button>
                  <button type="button" disabled={busy} class="admin-link" onclick={() => toggleProduct(p)}>{p.is_active ? 'Ocultar' : 'Publicar'}</button>
                  <button type="button" disabled={busy} class="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold px-3 py-2" onclick={() => removeProduct(p)} aria-label={'Eliminar producto '+p.name} title="Eliminar producto">✕ Borrar</button>
                </div>
              </div>
            </article>
          {/each}
        </div>
        
      {#if products.length === 0}<p class="text-slate-500 text-sm py-8">Aún no hay equipos. Crea una categoría y añade el primer producto.</p>{/if}
      {#if visibleProducts.length}
        <nav aria-label="Paginación de equipos" class="flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 pt-4">
          <p class="text-xs text-slate-500">Página {Math.min(productPage,productPages)} de {productPages} · {visibleProducts.length} equipos</p>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="admin-secondary text-xs" disabled={productPage<=1} onclick={() => productPage = Math.max(1,productPage-1)}>← Anterior</button>
            <select aria-label="Ir a página" class="admin-input !mt-0 !w-auto text-xs" value={Math.min(productPage,productPages)} onchange={e=>productPage=Number(e.currentTarget.value)}>
              {#each Array.from({length:productPages},(_,i)=>i+1) as page}
                <option value={page}>Página {page}</option>
              {/each}
            </select>
            <button type="button" class="admin-secondary text-xs" disabled={productPage>=productPages} onclick={() => productPage = Math.min(productPages,productPage+1)}>Siguiente →</button>
          </div>
        </nav>
      {/if}
      {#if !visibleProducts.length && products.length}<p class="text-sm text-slate-500">No hay equipos que coincidan con la búsqueda.</p>{/if}
    </section>
  {:else if tab === 'services'}
    <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
      <div class="flex flex-wrap gap-3 justify-between items-center">
        <div><h2 class="text-2xl font-bold text-slate-900">Servicios ({services.length})</h2>
          <p class="text-xs text-teal-800 font-semibold mt-1">Destacados en Inicio: {serviceFeaturedCount}/5 · Selecciona o retira con ★</p>
          <p class="text-sm text-slate-500 mt-1">Publica servicios completos con fotografías, descripción y precio.</p>
        </div>
        <button type="button" class="admin-primary" onclick={() => { resetService(); modal = 'service'; error = ''; }}>+ Nuevo servicio</button>
      </div>
      <div class="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {#each visibleServices as s (s.id)}
            <article class="group border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-teal-200 transition">
              {#if s.image_url}<div class="overflow-hidden"><img class="w-full h-32 sm:h-36 object-cover object-center group-hover:scale-110 transition-transform duration-300" src={s.image_url} alt={s.name} /></div>{:else}<div class="h-28 sm:h-32 bg-slate-100 flex items-center justify-center text-slate-400">Sin fotografía</div>{/if}
              <div class="p-3 space-y-2">
                <h3 class="font-semibold">{s.name}</h3>
                {#if s.is_featured}<span class="text-xs font-semibold text-teal-800">Destacado en inicio</span>{/if}
                <p class="text-xs text-slate-500 line-clamp-2">{s.description || 'Sin descripción'}</p>
                <p class="text-sm font-semibold">{s.price_type === 'fixed' && s.price != null ? Number(s.price).toLocaleString('es-CU') + ' USD' : s.price_type === 'free' ? 'Gratuito' : 'Bajo presupuesto'}</p>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="button" class="admin-secondary flex-1" onclick={() => editService(s)}>✎ Editar</button>
                  <button type="button" class="admin-secondary text-xs" disabled={busy || (!s.is_featured && serviceFeaturedCount>=5 && s.is_active)}
                    onclick={() => setFeaturedService(s)}>{s.is_featured ? '★ Quitar' : '☆ Destacar'}</button>
                  <button type="button" disabled={busy} class="admin-link" onclick={() => toggleService(s)}>{s.is_active ? 'Ocultar' : 'Publicar'}</button>
                  <button type="button" disabled={busy} class="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold px-3 py-2" onclick={() => removeService(s)} aria-label={'Eliminar servicio '+s.name} title="Eliminar servicio">✕ Borrar</button>
                </div>
              </div>
            </article>
          {/each}
        </div>
        
      <Pagination page={Math.min(servicePage,servicePageCount)} total={services.length} perPage={itemPageSize}
        label="servicios" onPage={n => servicePage = n} />
      {#if services.length === 0}<p class="text-slate-500">Aún no hay servicios publicados.</p>{/if}
    </section>
  {:else if tab === 'gallery'}
    <section class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5 min-w-0">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">Galería de proyectos ({gallery.length})</h2>
          <p class="text-xs text-teal-800 font-semibold mt-1">Destacados en Inicio: {galleryFeaturedCount}/5 · Selecciona o retira con ★</p>
          <p class="text-sm text-slate-500 mt-1">Trabajos, instalaciones y resultados en tarjetas compactas.</p>
        </div>
        <button type="button" class="admin-primary" onclick={() => { galleryEdit = null; galleryFeatured = false; galleryTitle = ''; galleryDescription = ''; galleryCategory = ''; galleryFile = null; galleryPhotos = []; galleryUrl = ''; error = ''; modal = 'gallery'; }}>
          + Añadir proyecto
        </button>
      </header>
      <AdminGalleryCategories {token} onUpdate={loadGalleryCategories} />
      <div class="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
  {#each visibleGallery as g (g.id)}
    <article class="group rounded-xl border border-slate-200 overflow-hidden bg-white min-w-0 hover:shadow-lg hover:border-teal-200 transition">
      {#if g.url}
        <div class="overflow-hidden"><img src={g.url} alt={g.title} loading="lazy" class="w-full h-32 sm:h-36 object-cover object-center group-hover:scale-110 transition-transform duration-300" /></div>
      {:else}<div class="h-32 sm:h-36 bg-slate-100 flex items-center justify-center text-slate-400">Sin foto</div>{/if}
      <div class="p-3 space-y-2">
        <div class="flex items-start justify-between gap-1">
          <h3 class="font-semibold text-sm text-slate-900 line-clamp-2">{g.title}</h3>
                {#if g.is_featured}<span class="text-xs font-semibold text-teal-800">Destacado en inicio</span>{/if}
          <span class="text-[11px] shrink-0 {g.is_active ? 'text-emerald-700' : 'text-orange-700'}">{g.is_active ? 'Visible' : 'Oculto'}</span>
        </div>
        <p class="text-xs text-slate-500 line-clamp-2 min-h-[2rem]">{g.description || 'Sin descripción'}</p>
        <div class="flex gap-1 pt-1">
          <button class="admin-secondary text-xs flex-1" onclick={() => { galleryEdit = { ...g, is_featured: Boolean(g.is_featured) }; modal = 'gallery-edit'; error = ''; }}>Editar</button>
          <button type="button" class="admin-secondary text-xs" disabled={busy || (!g.is_featured && galleryFeaturedCount>=5 && g.is_active)}
            onclick={() => setFeaturedGallery(g)}>{g.is_featured ? '★ Quitar' : '☆ Destacar'}</button>
          <button disabled={busy} class="admin-link text-xs text-red-700" onclick={() => removeGallery(g)}>Eliminar</button>
        </div>
      </div>
    </article>
  {/each}
</div>
      <Pagination page={Math.min(galleryPage,galleryPageCount)} total={gallery.length} perPage={itemPageSize}
        label="proyectos" onPage={n => galleryPage = n} />
      {#if gallery.length === 0}<p class="text-sm text-slate-500 py-8">Aquí aparecerán las fotografías de tus proyectos. Pulsa «Añadir proyecto».</p>{/if}
    </section>
  {:else if tab === 'site'}
    <section class="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 shadow-sm w-full min-w-0 max-w-6xl mx-auto space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div><h2 class="text-2xl font-bold text-slate-900">Personalizar la web</h2><p class="text-slate-500 mt-1">Controla los textos principales, el contacto, las redes sociales y los enlaces del pie de página sin editar código.</p></div>
        <div class="flex flex-wrap gap-2">
          {#each [{path:'/',label:'Inicio'},{path:'/catalogo',label:'Catálogo'},{path:'/servicios',label:'Servicios'},{path:'/galeria',label:'Galería'}] as link}
            <a href={link.path} target="_blank" rel="noopener noreferrer"
              class="rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold px-3 py-2.5"
              aria-label={'Ver '+link.label+' en una pestaña nueva'}>↗ Ver {link.label}</a>
          {/each}
        </div>
      </div>
      <nav aria-label="Secciones de personalización del sitio" class="grid grid-cols-2 lg:grid-cols-4 gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-2">
        {#each [
          {id:'slides',label:'Portada',desc:'Diapositivas'},
          {id:'contact',label:'Contacto',desc:'Empresa y teléfonos'},
          {id:'channels',label:'Redes y bots',desc:'Canales públicos'},
          {id:'links',label:'Pie de página',desc:'Enlaces rápidos'}
        ] as item (item.id)}
          <button type="button" aria-current={siteSection === item.id ? 'page' : undefined}
            onclick={() => siteSection = item.id as typeof siteSection}
            class="text-left rounded-xl px-3 py-3 border transition {siteSection === item.id ? 'bg-teal-700 text-white border-teal-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'}">
            <span class="block text-sm font-extrabold">{item.label}</span>
            <span class="block text-[11px] mt-0.5 {siteSection === item.id ? 'text-teal-50' : 'text-slate-500'}">{item.desc}</span>
          </button>
        {/each}
      </nav>
      <form onsubmit={saveSite} class="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-start min-w-0">
        {#if siteSection === 'slides'}
        <fieldset class="space-y-4 min-w-0 xl:col-span-12">
          <legend class="text-lg font-semibold mb-3">Carrusel de portada · {slides.length} diapositivas</legend>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-slate-500">Conserva tus tres diapositivas actuales y añade hasta tres más. Edita o elimina con botones.</p>
            <button type="button" class="admin-secondary" disabled={editingSlide !== null || slides.length >= MAX_SLIDES}
              onclick={newSlide}>＋ Crear diapositiva</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {#each slides as item, index (index)}
              <article class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 min-w-0">
                {#if item.image_url && item.image_url.startsWith('https://')}
                  <img src={item.image_url} alt={'Imagen de '+item.title} class="h-24 sm:h-28 w-full object-cover rounded-lg"/>
                {:else}
                  <div class="h-24 sm:h-28 w-full rounded-lg bg-gradient-to-br from-slate-900 to-teal-700 flex items-center justify-center text-white text-sm">Sin fotografía</div>
                {/if}
                <div>
                  <span class="text-xs font-bold text-teal-700">Diapositiva {index + 1}</span>
                  <h3 class="font-bold text-slate-900 break-words">{item.title}</h3>
                  <p class="text-xs text-slate-500 line-clamp-2">{item.subtitle || 'Sin descripción'}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="admin-secondary text-sm" disabled={editingSlide !== null} onclick={() => editSlide(index)}>✎ Editar</button>
                  <button type="button" class="admin-link text-sm text-red-700" disabled={editingSlide !== null || slides.length <= 1}
                    onclick={() => removeSlide(index)}>Eliminar</button>
                </div>
              </article>
            {/each}
          </div>
          {#if editingSlide !== null}
            <div class="rounded-2xl border-2 border-teal-300 bg-white p-4 sm:p-6 space-y-4" aria-label="Editor de diapositivas">
              <div class="flex flex-wrap justify-between items-center gap-2">
                <h3 class="font-bold text-lg">{editingSlide === slides.length ? 'Crear diapositiva' : 'Editar diapositiva '+(editingSlide + 1)}</h3>
                <button type="button" class="admin-secondary" disabled={uploadingSlide} onclick={cancelSlide}>Cancelar</button>
              </div>
              <label class="admin-label">Título<input required maxlength="120" class="admin-input" bind:value={draftSlide.title}/></label>
              <label class="admin-label">Descripción<textarea maxlength="450" rows="3" class="admin-input" bind:value={draftSlide.subtitle}></textarea></label>
              <div class="space-y-2 rounded-xl border border-teal-100 p-3">
                <label class="admin-label">Subir imagen a Cloudflare R2
                  <input type="file" accept="image/jpeg,image/png,image/webp" class="admin-input"
                    onchange={e => slideFile = e.currentTarget.files?.[0] ?? null}/>
                </label>
                <button type="button" class="admin-secondary w-full" disabled={uploadingSlide || !slideFile}
                  onclick={uploadSlide}>{uploadingSlide ? 'Subiendo imagen…' : 'Subir fotografía'}</button>
                <p class="text-xs text-slate-500">JPG, PNG o WebP, máximo 8 MB.</p>
              </div>
              <label class="admin-label">O elegir fotografía de la galería
                <select class="admin-input" bind:value={draftSlide.image_url}>
                  <option value="">Sin imagen (fondo de color)</option>
                  {#each gallery.filter((g: any) => g.url && g.is_active) as g (g.id)}
                    <option value={g.url}>{g.title || 'Trabajo sin título'}</option>
                  {/each}
                  {#if draftSlide.image_url && !gallery.some((g: any) => g.url === draftSlide.image_url)}
                    <option value={draftSlide.image_url}>Imagen guardada o externa</option>
                  {/if}
                </select>
              </label>
              <label class="admin-label">O introducir URL HTTPS<input type="url" maxlength="600" class="admin-input" placeholder="https://..." bind:value={draftSlide.image_url}/></label>
              {#if draftSlide.image_url && draftSlide.image_url.startsWith('https://')}
                <img src={draftSlide.image_url} alt="Vista previa de la diapositiva" class="rounded-xl max-h-52 w-full object-cover"/>
              {/if}
              <div class="grid sm:grid-cols-2 gap-3">
                <label class="admin-label">Texto del botón<input maxlength="60" class="admin-input" bind:value={draftSlide.link_label}/></label>
                <label class="admin-label">Enlace del botón<input required maxlength="500" class="admin-input" placeholder="/galeria" bind:value={draftSlide.link_url}/></label>
              </div>
              <button type="button" class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3"
                disabled={uploadingSlide} onclick={applySlide}>{editingSlide === slides.length ? '＋ Añadir diapositiva' : 'Aplicar edición'}</button>
            </div>
          {/if}
        </fieldset>
        {/if}
        {#if siteSection === 'contact'}
        <fieldset class="space-y-3 min-w-0 xl:col-span-12"><legend class="text-lg font-semibold mb-3">Contacto de la empresa</legend>
          <label class="admin-label">Texto sobre la empresa<textarea rows="3" class="admin-input" bind:value={site.footer_description}></textarea></label>
          <div class="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
            <h3 class="font-extrabold text-slate-900 text-sm">Recuadro de asesoría del pie de página</h3>
            <p class="text-xs text-slate-500">Puedes personalizar el mensaje que invita a los visitantes a consultar con Bonaire.</p>
            <label class="admin-label">Título del recuadro
              <input class="admin-input" maxlength="160" placeholder="¿Necesitas una solución solar?" bind:value={site.footer_cta_title} />
            </label>
            <label class="admin-label">Descripción breve
              <textarea rows="2" maxlength="450" class="admin-input" bind:value={site.footer_cta_description}></textarea>
            </label>
          </div>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">Teléfono / WhatsApp principal
              <input class="admin-input" type="tel" placeholder="+53 ..." bind:value={site.business_phone} />
            </label>
            <label class="admin-label">Correo público<input class="admin-input" type="email" placeholder="info@..." bind:value={site.business_email} /></label>
            <label class="admin-label">Dirección<input class="admin-input" bind:value={site.business_address} /></label>
            <label class="admin-label">Horario<input class="admin-input" bind:value={site.business_hours} /></label>
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3">
            <div class="flex justify-between items-center gap-2">
              <strong class="text-sm text-slate-800">Teléfonos adicionales</strong>
              <button type="button" class="admin-secondary text-xs" onclick={addPhone}>+ Añadir teléfono</button>
            </div>
            {#each phoneRows as row, i}
              <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2 items-end">
                <label class="admin-label">Etiqueta<input class="admin-input" maxlength="60" placeholder="Ventas, soporte…" bind:value={row.label} /></label>
                <label class="admin-label">Número<input class="admin-input" type="tel" maxlength="25" placeholder="+53 ..." bind:value={row.number} /></label>
                <button type="button" class="admin-secondary" aria-label="Quitar teléfono" onclick={() => removePhone(i)}>Quitar</button>
              </div>
            {/each}
            {#if phoneRows.length === 0}<p class="text-xs text-slate-500">Puedes añadir varios números para ventas, atención y soporte.</p>{/if}
          </div>
        </fieldset>
        {/if}
        {#if siteSection === 'channels'}
        <fieldset class="space-y-3 min-w-0 xl:col-span-6"><legend class="text-lg font-semibold mb-3">Redes sociales</legend>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">YouTube<input type="url" class="admin-input" placeholder="https://youtube.com/..." bind:value={site.youtube_channel_url} /></label>
            <label class="admin-label">Facebook<input type="url" class="admin-input" placeholder="https://facebook.com/..." bind:value={site.facebook_url} /></label>
            <label class="admin-label">Instagram<input type="url" class="admin-input" placeholder="https://instagram.com/..." bind:value={site.instagram_url} /></label>
            <label class="admin-label">Canal de Telegram (red social, no chatbot)<input type="url" class="admin-input" placeholder="https://t.me/..." bind:value={site.telegram_public_url} /></label>
          </div>
        </fieldset>
        <fieldset class="space-y-3 min-w-0 xl:col-span-6">
          <legend class="text-lg font-semibold mb-2">Canales del asistente automático</legend>
          <p class="text-xs text-slate-500">Configura los enlaces de los bots, no los números o cuentas personales del equipo. Estos botones solo se mostrarán cuando haya URLs válidas. Añadir un enlace no activa por sí solo una integración con la plataforma.</p>
          <label class="admin-label">Bot de WhatsApp (enlace directo)
            <input type="url" class="admin-input" placeholder="https://wa.me/..." bind:value={site.bot_whatsapp_url} />
          </label>
          <label class="admin-label">Bot de Telegram (enlace al bot)
            <input type="url" class="admin-input" placeholder="https://t.me/NombreDelBot" bind:value={site.bot_telegram_url} />
          </label>
        </fieldset>
        {/if}
        {#if siteSection === 'links'}
        <fieldset class="space-y-3 min-w-0 xl:col-span-6"><legend class="text-lg font-semibold mb-2">Enlaces del pie de página</legend>
          <p class="text-sm text-slate-500">Un enlace por línea con el formato «Texto | dirección». Puedes usar rutas internas o direcciones HTTPS.</p>
          <label class="admin-label">Páginas que quieres mostrar<textarea rows="6" class="admin-input font-mono" placeholder="Catálogo | /catalogo&#10;Servicios | /servicios&#10;Galería | /galeria&#10;Nuestro canal | https://youtube.com/..." bind:value={linksText}></textarea></label>
        </fieldset>
        <aside class="min-w-0 xl:col-span-6 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 sm:p-5 space-y-3">
          <h3 class="text-base font-extrabold text-slate-900">Estructura del pie de página</h3>
          <p class="text-sm text-slate-700">Los enlaces aparecen junto a los datos públicos de contacto, los canales sociales y los accesos para solicitar servicios.</p>
          <div class="rounded-xl bg-white border border-slate-200 p-3 text-sm space-y-2">
            {#each linksText.split('\n').map(t => t.trim()).filter(Boolean).slice(0,8) as item, i}
              <p class="text-slate-700 break-words">{i + 1}. {item.split('|')[0]?.trim() || 'Enlace'}</p>
            {/each}
            {#if !linksText.trim()}<p class="text-slate-500">Introduce al menos un enlace para ver el resumen.</p>{/if}
          </div>
          <p class="text-xs text-slate-600">Recomendación: mantén entre cuatro y ocho accesos claros. Las páginas de catálogo, servicios, proyectos y atención son las más importantes.</p>
        </aside>
        {/if}
        <div class="xl:col-span-12 flex justify-end pt-2 border-t border-slate-100">
          <button disabled={busy || uploadingSlide} class="admin-primary">{busy ? 'Publicando…' : 'Guardar y publicar cambios del sitio'}</button>
        </div>
      </form>
    </section>
  {/if}
</div>

{#if showPurchaseModal}
  <div class="fixed inset-0 z-[210] bg-slate-950/75 p-3 sm:p-6 flex items-center justify-center">
    <button type="button" class="absolute inset-0" aria-label="Cerrar verificación de compras" onclick={() => showPurchaseModal = false}></button>
    <dialog open aria-label="Compras verificadas y valoraciones" class="relative m-0 w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-50 shadow-2xl p-4 sm:p-6">
      <div class="flex items-center justify-between gap-3 mb-4">
        <div><h2 class="text-xl font-extrabold text-slate-900">Compras verificadas y valoraciones</h2><p class="text-xs text-slate-500 mt-1">Registra una compra y modera las valoraciones desde aquí, sin desplazarte por el catálogo.</p></div>
        <button type="button" aria-label="Cerrar ventana" class="rounded-xl bg-white border border-slate-200 px-3 py-2 font-bold text-slate-700" onclick={() => showPurchaseModal = false}>✕ Cerrar</button>
      </div>
      <AdminProductReviews {token} {products}/>
    </dialog>
  </div>
{/if}
{#if modal}
  <div class="fixed inset-0 z-[180] bg-slate-950/70 flex justify-center items-center p-4">
    <dialog open aria-label={modal === 'category' ? (editingCategory ? 'Editar categoría' : 'Nueva categoría') : modal === 'product' ? 'Datos del equipo' : modal === 'service' ? 'Datos del servicio' : 'Proyecto de galería'}
      class="relative m-0 bg-white rounded-2xl shadow-2xl w-full {modal === 'category' ? 'max-w-lg' : 'max-w-3xl'} max-h-[92vh] overflow-y-auto p-5 sm:p-7">
      <header class="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">
            {modal === 'category' ? (editingCategory ? 'Editar categoría' : 'Nueva categoría') : modal === 'product' ? (editingProduct ? 'Editar equipo' : 'Nuevo equipo') : modal === 'service' ? (editingService ? 'Editar servicio' : 'Nuevo servicio') : modal === 'gallery' ? 'Añadir proyecto' : 'Editar proyecto'}
          </h2>
          <p class="text-sm text-slate-500 mt-1">Completa la información y pulsa guardar para publicar los cambios.</p>
        </div>
        <button class="admin-secondary" type="button" aria-label="Cerrar formulario" onclick={() => modal = null}>✕</button>
      </header>
      {#if error}<p role="alert" class="mb-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3">{error}</p>{/if}
      {#if modal === 'category'}
        <form onsubmit={saveCategory} class="space-y-3">
            <label class="block text-sm font-medium">Nombre de la categoría
              <input required maxlength="120" class="admin-input" placeholder="Ej. Paneles solares" bind:value={categoryName} />
            </label>
            <label class="block text-sm font-medium">Descripción breve
              <textarea rows="3" maxlength="1000" class="admin-input" placeholder="Ej. Paneles monocristalinos para hogares y negocios" bind:value={categoryDescription}></textarea>
            </label>
            <label class="block text-sm font-medium">Orden en el catálogo
              <input type="number" min="0" max="9999" step="1" class="admin-input" bind:value={categorySortOrder} />
            </label>
            {#if editingCategory}
              <label class="flex gap-3 items-center p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
                <input type="checkbox" bind:checked={categoryActive} />
                Mostrar esta categoría en los filtros del catálogo
              </label>
              <p class="text-xs text-slate-500">Ocultar una categoría no borra sus equipos ni los oculta automáticamente.</p>
            {/if}
            <div class="flex gap-2">
              <button disabled={busy} class="admin-primary flex-1">{busy ? 'Guardando…' : editingCategory ? 'Guardar cambios' : 'Crear categoría'}</button>
              <button type="button" class="admin-secondary" onclick={() => modal = null}>Cancelar</button>
            </div>
          </form>
      {:else if modal === 'product'}
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
            <ImagePicker max={15} label="Imágenes del equipo · selecciona varias fotos"
              onFiles={(files) => productPhotos = files} />
            <label class="admin-label">O usar una URL HTTPS de imagen (opcional)
              <input type="url" maxlength="600" class="admin-input" placeholder="https://…" bind:value={productImageUrl} />
            </label>
            <p class="text-xs text-slate-500">Si eliges un archivo y escribes una URL, tendrá prioridad el archivo guardado en Cloudflare R2. Las URLs son imágenes externas.</p>
            <div class="flex flex-wrap gap-4 py-2">
              <label class="flex gap-2 items-center text-sm"><input type="checkbox" bind:checked={product.is_featured}
  disabled={!product.is_featured && productFeaturedCount >= 5 && product.is_active} />
  Destacar en inicio · {productFeaturedCount}/5 publicados</label>
              <label class="flex gap-2 items-center text-sm"><input type="checkbox" bind:checked={product.is_active} /> Publicado</label>
            </div>
            <button disabled={busy} class="admin-primary">{busy ? 'Guardando…' : editingProduct ? 'Guardar cambios del producto' : 'Publicar producto'}</button>
          </form>
          {#if editingProduct}
            <div class="mt-5">
              <AdminMediaGallery {token} id={editingProduct} kind="product" onUpdated={onRefresh} />
            </div>
          {/if}
      {:else if modal === 'gallery'}
        <p class="text-sm text-slate-500 mb-4">Sube una fotografía de un trabajo real de Bonaire o utiliza una imagen HTTPS.</p>
        <form class="space-y-4" onsubmit={saveGallery}>
          <label class="admin-label">Título<input required class="admin-input" placeholder="Instalación solar residencial" bind:value={galleryTitle} /></label>
          <label class="admin-label">Descripción<textarea rows="4" class="admin-input" placeholder="Qué se instaló, contexto del proyecto y resultado..." bind:value={galleryDescription}></textarea></label>
          <label class="admin-label">Categoría del proyecto
            <select bind:value={galleryCategory} class="admin-input">
              <option value="">Sin categoría</option>
              {#each galleryCategories.filter(x=>x.is_active) as cat (cat.id)}
                <option value={cat.name}>{cat.name}</option>
              {/each}
            </select>
          </label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={galleryFeatured}
  disabled={!galleryFeatured && galleryFeaturedCount >= 5} />
  Destacar en inicio · {galleryFeaturedCount}/5 publicados</label>
          <ImagePicker max={15} label="Fotografías del proyecto" onFiles={(files)=>galleryPhotos=files}/>
          <p class="text-xs text-slate-500">Si no subes un archivo, puedes utilizar una imagen HTTPS externa.</p>
          <label class="admin-label">URL de imagen (opcional)<input type="url" class="admin-input" placeholder="https://..." bind:value={galleryUrl} /></label>
          <button disabled={busy} class="admin-primary w-full">{busy ? 'Subiendo…' : 'Publicar proyecto'}</button>
        </form>
      {:else if modal === 'gallery-edit' && galleryEdit}
        <p class="text-sm text-slate-500 mb-4">Edita la información y el estado de publicación.</p>
        <form onsubmit={updateGallery} class="grid md:grid-cols-2 gap-4">
          <label class="admin-label">Título<input required class="admin-input" bind:value={galleryEdit.title} /></label>
          <label class="admin-label">Categoría
            <select bind:value={galleryEdit.category} class="admin-input">
              <option value="">Sin categoría</option>
              {#each galleryCategories as cat (cat.id)}<option value={cat.name}>{cat.name}</option>{/each}
            </select>
          </label>
          <label class="admin-label md:col-span-2">Descripción<textarea rows="3" class="admin-input" bind:value={galleryEdit.description}></textarea></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={galleryEdit.is_featured}
  disabled={!galleryEdit.is_featured && galleryFeaturedCount >= 5 && galleryEdit.is_active} />
  Destacar en inicio · {galleryFeaturedCount}/5 publicados</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={galleryEdit.is_active} /> Proyecto publicado</label>
          <div class="flex gap-2"><button disabled={busy} class="admin-primary">Guardar proyecto</button><button type="button" class="admin-secondary" onclick={() => { galleryEdit = null; modal = null; }}>Cancelar</button></div>
        </form>
        <div class="mt-5">
          <AdminMediaGallery {token} id={galleryEdit.id} kind="gallery"
            onUpdated={async()=>{gallery=(await api.getAdminGallery(token)).gallery??[];}} />
        </div>
      {:else if modal === 'service'}
        <form class="space-y-4" onsubmit={saveService}>
          <label class="admin-label">Nombre del servicio<input required maxlength="120" class="admin-input" placeholder="Instalación de paneles solares" bind:value={service.name} /></label>
          <label class="admin-label">Descripción detallada<textarea required rows="4" class="admin-input" placeholder="Qué incluye el servicio, para quién es y qué ventajas ofrece..." bind:value={service.description}></textarea></label>
          <label class="admin-label">Alcance y condiciones<textarea rows="3" class="admin-input" placeholder="Incluye revisión, instalación, puesta en marcha..." bind:value={service.scope}></textarea></label>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="admin-label">Tipo de precio<select class="admin-input" bind:value={service.price_type}><option value="quote">Bajo presupuesto</option><option value="fixed">Precio fijo</option><option value="free">Gratuito</option></select></label>
            <label class="admin-label">Precio (si es fijo)<input type="number" min="0" step="0.01" class="admin-input" bind:value={service.price} /></label>
            <label class="admin-label">Duración estimada (minutos)<input type="number" min="0" step="1" class="admin-input" bind:value={service.duration_minutes} /></label>
          </div>
          <ImagePicker max={10} label="Fotografías del servicio" onFiles={(files)=>servicePhotos=files}/>
          <label class="admin-label">O pegar una URL HTTPS de imagen (opcional)
            <input type="url" maxlength="600" class="admin-input" placeholder="https://…" bind:value={serviceImageUrl} />
          </label>
          <p class="text-xs text-slate-500">Si seleccionas un archivo, lo guardaremos en Cloudflare R2 y tendrá prioridad sobre el enlace externo.</p>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={service.is_featured}
  disabled={!service.is_featured && serviceFeaturedCount >= 5 && service.is_active} />
  Destacar en inicio · {serviceFeaturedCount}/5 publicados</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={service.is_active} /> Publicado en la página de servicios</label>
          <button disabled={busy} class="admin-primary w-full">{busy ? 'Guardando…' : editingService ? 'Guardar cambios' : 'Crear servicio'}</button>
        </form>
        {#if editingService}
          <div class="mt-5"><AdminMediaGallery {token} id={editingService} kind="service" onUpdated={onRefresh}/></div>
        {/if}
      {/if}
    </dialog>
  </div>
{/if}

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
