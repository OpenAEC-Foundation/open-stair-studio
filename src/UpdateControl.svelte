<script>
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';

  export let dirty = false;
  let available = null;
  let checking = false;
  let installing = false;
  let message = '';

  async function checkForUpdate() {
    if (!isTauri() || checking || installing) return;
    checking = true;
    message = 'Updates controleren…';
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      available = await check();
      message = available ? `Versie ${available.version} beschikbaar` : 'Je gebruikt de nieuwste versie';
    } catch (error) {
      message = `Updatecontrole mislukt: ${error.message ?? error}`;
    } finally {
      checking = false;
    }
  }

  async function activate() {
    if (!available) return checkForUpdate();
    if (dirty) {
      message = 'Sla het project eerst op voordat je de update installeert.';
      return;
    }
    installing = true;
    message = `Versie ${available.version} downloaden…`;
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await available.downloadAndInstall();
      message = 'Update geïnstalleerd; app wordt opnieuw gestart…';
      await relaunch();
    } catch (error) {
      message = `Installatie mislukt: ${error.message ?? error}`;
      installing = false;
    }
  }

  onMount(() => { if (isTauri()) checkForUpdate(); });
</script>

{#if isTauri()}
  <button class="quick-button update-button" title={message || 'Controleer op updates'} aria-label={available ? `Installeer versie ${available.version}` : 'Controleer op updates'} disabled={checking || installing} onclick={activate}>
    {available ? `Update ${available.version}` : 'Updates'}
  </button>
  {#if message}<span class="update-status" role="status">{message}</span>{/if}
{/if}

<style>
  .update-button { width: auto; padding: 0 8px; white-space: nowrap; font-size: 11px; }
  .update-status { font-size: 11px; max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
