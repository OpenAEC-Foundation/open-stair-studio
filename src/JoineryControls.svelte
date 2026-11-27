<script>
  export let joinery;
  export let update;
  export let riserGrooves = false;
  const fields = [
    { key: 'depth', label: 'Insteekdiepte', min: 0.1, max: 150, step: 0.1 },
    { key: 'clearance', label: 'Totale passpeling', min: 0, max: 10, step: 0.1 },
    { key: 'endMargin', label: 'Schoudermaat', min: 0, max: 300, step: 0.5 }
  ];
</script>

<section class="property-section">
  <h3>Trede in trapboom</h3>
  <label for="joinery-type">Verbinding</label>
  <select id="joinery-type" value={joinery.type} onchange={e => update('type', e.currentTarget.value)}>
    <option value="housed">Ingefreesd · met insteeklip</option>
    <option value="none">Zonder uitgewerkte verbinding</option>
  </select>
  {#if joinery.type === 'housed' || riserGrooves}
    {#each fields.filter(field => field.key!=='endMargin' || joinery.type==='housed') as field}
      <label for={'joinery-' + field.key}>{field.label}</label>
      <div class="numeric-input"><input id={'joinery-' + field.key} type="number" min={field.min} max={field.max} step={field.step} value={joinery[field.key]} onchange={e => update(field.key, e.currentTarget)} /><span>mm</span></div>
    {/each}
    <p>De insteekdiepte geldt voor het huis in de boom. De passpeling wordt over beide randen verdeeld.</p>
  {/if}
</section>

<style>
  p { color: var(--oa-text-secondary); font-size: 11px; line-height: 1.45; margin: 8px 0 0; }
</style>
