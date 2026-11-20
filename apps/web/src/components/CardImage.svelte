<script lang="ts">
  let { src, alt }: { src?: string | null; alt: string } = $props();
  let failed = $state(false);
  $effect(() => { src; failed = false; });
</script>

<div class="card-media">
  {#if src && !failed}
    <img {src} {alt} loading="lazy" onerror={() => failed = true} />
  {:else}
    <div class="placeholder">Fotografía próximamente</div>
  {/if}
</div>

<style>
  .card-media { width: 100%; height: 12rem; overflow: hidden; background: #f1f5f9; }
  img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; transition: transform 300ms ease; }
  .placeholder { height: 100%; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: .875rem; }
  :global(button:hover) .card-media img,
  :global(button:focus-visible) .card-media img { transform: scale(1.05); }
  :global(button:focus-visible):has(.card-media) { outline: 3px solid #0f766e; outline-offset: -3px; }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } :global(button:hover) .card-media img, :global(button:focus-visible) .card-media img { transform: none; } }
</style>
