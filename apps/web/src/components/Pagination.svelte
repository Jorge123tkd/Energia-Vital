<script lang="ts">
  let { page, total, perPage, onPage, disabled = false, label = 'registros' }: {
    page: number; total: number; perPage: number;
    onPage: (page: number) => void; disabled?: boolean; label?: string;
  } = $props();
  let pages = $derived(Math.max(1, Math.ceil(total / Math.max(1, perPage))));
  let current = $derived(Math.max(1, Math.min(page, pages)));
  let start = $derived(total ? (current - 1) * perPage + 1 : 0);
  let end = $derived(Math.min(total, current * perPage));
  // Máximo cinco páginas cercanas más los extremos: evita miles de opciones.
  function nearbyPages(active: number, last: number): number[] {
    const width = Math.min(5, last);
    const first = Math.max(1, Math.min(active - 2, last - width + 1));
    return [...new Set([1, ...Array.from({ length: width }, (_, i) => first + i), last])];
  }
  let pageNumbers = $derived(nearbyPages(current, pages));
  function go(next: number) {
    const target = Math.max(1, Math.min(pages, next));
    if (!disabled && target !== current) onPage(target);
  }
</script>

{#if total > 0}
  <nav aria-label={'Paginación de ' + label}
    class="flex flex-wrap items-center justify-between gap-3 mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
    <p aria-live="polite" class="text-xs sm:text-sm text-slate-600">
      Mostrando {start}–{end} de {total} {label}
    </p>
    {#if pages > 1}
      <div class="flex flex-wrap items-center gap-1.5" aria-label={'Controles de páginas de ' + label}>
        <button type="button" aria-label="Primera página" disabled={disabled || current === 1} onclick={() => go(1)}
          class="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-teal-800 disabled:opacity-35">«</button>
        <button type="button" disabled={disabled || current === 1} onclick={() => go(current - 1)}
          class="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-teal-800 disabled:opacity-35">Anterior</button>
        {#each pageNumbers as n, i (n)}
          {#if i > 0 && n - pageNumbers[i - 1] > 1}
            <span aria-hidden="true" class="px-0.5 text-slate-400">…</span>
          {/if}
          <button type="button" aria-label={'Ir a página ' + n + ' de ' + pages}
            aria-current={n === current ? 'page' : undefined}
            disabled={disabled || n === current} onclick={() => go(n)}
            class="min-w-9 rounded-lg border px-2.5 py-2 text-xs font-bold disabled:opacity-60 {n === current ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-teal-800 hover:bg-teal-50'}">
            {n}
          </button>
        {/each}
        <button type="button" disabled={disabled || current >= pages} onclick={() => go(current + 1)}
          class="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-teal-800 disabled:opacity-35">Siguiente</button>
        <button type="button" aria-label="Última página" disabled={disabled || current >= pages} onclick={() => go(pages)}
          class="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-teal-800 disabled:opacity-35">»</button>
      </div>
    {/if}
  </nav>
{/if}
