<script>
  import Icon from './Icon.svelte';
  import { appearanceOptions, loadPreferences, savePreferences } from './blueprint-shell.js';

  let dialog;
  let preferences = $state(loadPreferences());
  const labels = { theme: 'Thema', workspace: 'Werkruimte', statusbar: 'Statusbalk', text: 'Tekstgrootte' };

  function change(field, value) {
    preferences[field] = value;
    savePreferences(preferences);
  }

  function shortcut(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === ',' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (!dialog.open) dialog.showModal();
    }
  }
</script>

<svelte:window onkeydown={shortcut} />
<button class="oa-icon-button quick-button" type="button" aria-label="Instellingen" title="Instellingen (Ctrl+,)"
  aria-keyshortcuts="Control+," onclick={() => dialog.showModal()}><Icon name="ui.settings" /></button>
<dialog bind:this={dialog} class="oa-dialog appearance" aria-labelledby="appearance-heading">
  <header><h2 id="appearance-heading" class="oa-heading oa-heading--dialog">Weergave-instellingen</h2>
    <button class="oa-icon-button oa-icon-button--small" type="button" aria-label="Sluiten" onclick={() => dialog.close()}><Icon name="ui.close" /></button>
  </header>
  {#each Object.entries(appearanceOptions) as [field, options]}
    <div class="setting"><label for={'oa-setting-' + field}>{labels[field]}</label>
      <select id={'oa-setting-' + field} class="oa-field" value={preferences[field]} onchange={e => change(field, e.currentTarget.value)}
        disabled={preferences.theme.startsWith('high-contrast') && ['workspace', 'statusbar'].includes(field)}>
        {#each options as [id, label]}<option value={id}>{label}</option>{/each}
      </select>
    </div>
  {/each}
  {#if preferences.theme.startsWith('high-contrast')}<p>Het contrastthema bepaalt ook de kleuren van de werkruimte en statusbalk.</p>{/if}
  <div class="oa-dialog-actions"><button class="oa-button oa-button--primary" type="button" onclick={() => dialog.close()}>Gereed</button></div>
</dialog>

<style>
  .appearance { margin: auto; text-align: left; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--oa-space-lg); }
  .setting { display: grid; grid-template-columns: 1fr 1.5fr; align-items: center; gap: var(--oa-space-md); margin: var(--oa-space-sm) 0; }
  .setting select { min-width: 0; width: 100%; }
  p { margin-top: var(--oa-space-md); color: var(--oa-text-secondary); }
</style>
