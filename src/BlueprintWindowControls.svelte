<script>
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';

  const appWindow = isTauri() ? getCurrentWindow() : null;
  let maximized = $state(false);
  onMount(() => {
    if (!appWindow) return;
    const update = async () => { maximized = await appWindow.isMaximized(); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });
</script>

{#if appWindow}
  <div class="window-controls">
    <button type="button" title="Minimaliseren" aria-label="Minimaliseren" onclick={() => appWindow.minimize()}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10"/></svg>
    </button>
    <button type="button" title={maximized ? 'Vorig formaat' : 'Maximaliseren'} aria-label={maximized ? 'Vorig formaat' : 'Maximaliseren'} onclick={() => appWindow.toggleMaximize()}>
      <svg viewBox="0 0 12 12" aria-hidden="true">{#if maximized}<path d="M3 3V1.5h7.5V9H9M1.5 3.5h7v7h-7z"/>{:else}<rect x="1.5" y="1.5" width="9" height="9"/>{/if}</svg>
    </button>
    <button type="button" class="close" title="Venster sluiten" aria-label="Venster sluiten" onclick={() => appWindow.close()}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8m0-8l-8 8"/></svg>
    </button>
  </div>
{/if}
<style>
  .window-controls { height: 100%; display: flex; margin-left: 4px; }
  button { display: grid; height: 100%; width: 40px; place-items: center; color: var(--oa-text); }
  button:hover { background: var(--oa-hover); }
  .close:hover { color: white; background: #b91c1c; }
  svg { width: 12px; height: 12px; fill: none; stroke: currentColor; }
</style>
