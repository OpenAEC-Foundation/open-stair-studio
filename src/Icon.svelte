<script>
  let { name, size = 16 } = $props();
  const master = $derived(size <= 20 ? 16 : 24);
</script>

<svg width={size} height={size} viewBox={`0 0 ${master} ${master}`} aria-hidden="true" focusable="false">
  <use href={`${import.meta.env.BASE_URL}blueprint/frame.svg#i${master}-${name}`} />
</svg>

<style>
  svg { flex: none; color: inherit; --icon-accent: var(--oa-accent-text); }
  :global(button:disabled) svg { --icon-accent: currentColor; }
</style>
