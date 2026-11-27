<script>
  import { newelDimensions } from './two-quarter-settings.js';
  export let stair;
  export let update;
</script>

<section class="property-section">
  <h3>Spillen en tredeaansluitingen</h3>
  {#each [['lower','Onderspil'],['upper','Bovenspil']] as [corner,label]}
    {@const prefix = corner+'Newel'}
    <label class="enable"><input id={prefix+'Enabled'} type="checkbox" checked={stair[prefix+'Enabled']}
      onchange={e=>update(prefix+'Enabled',e.currentTarget.checked)} /> {label}</label>
    {#if stair[prefix+'Enabled']}
      <details>
        <summary>{label} · {stair[prefix+'Width']} × {stair[prefix+'Depth']} mm</summary>
        {#each newelDimensions as field}
          {#if field.suffix!=='Clearance' || stair[prefix+'Housing']>0}
            {@const key = prefix+field.suffix}
            <label for={key}>{field.label} (mm)</label>
            <input class="text-field" id={key} type="number" min={field.min} max={field.max} step="any"
              value={stair[key]} onchange={e=>update(key,e.currentTarget)} />
          {/if}
        {/each}
        <small>Een insteekdiepte van 0 mm geeft een stuikende aansluiting.</small>
      </details>
    {/if}
  {/each}
</section>
<style>
  .enable { display:flex; align-items:center; gap:5px; }
  .enable input { width:auto; }
  summary { cursor:pointer; }
  details { margin:.25rem 0 .65rem; }
</style>
