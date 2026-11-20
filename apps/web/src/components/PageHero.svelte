<script lang="ts">
  let { eyebrow, title, description }: { eyebrow: string; title: string; description: string } = $props();
</script>

<header class="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 px-5 py-8 sm:px-10 sm:py-11 text-white shadow-xl">
  <div aria-hidden="true" class="pointer-events-none absolute -right-20 -top-32 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl"></div>
  <div aria-hidden="true" class="pointer-events-none absolute right-8 -bottom-24 w-52 h-52 rounded-full bg-sky-300/10 blur-3xl"></div>
  <div class="relative max-w-3xl min-w-0">
    <p class="inline-flex rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-teal-100">{eyebrow}</p>
    <h1 class="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight break-words">{title}</h1>
    <p class="mt-3 text-sm sm:text-base text-teal-50 leading-relaxed">{description}</p>
  </div>
</header>
