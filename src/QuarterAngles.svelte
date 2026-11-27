<script>
  import {equalQuarterAngles, quarterAngleError} from './two-quarter-settings.js';
  export let stair;
  export let field;
  export let title;
  export let update;
  let error = '';
  $: angles = stair[field];
  $: id = field === 'firstQuarterAngles' ? 'lower-quarter' : 'upper-quarter';

  function apply(increments, input) {
    const rest = 90 - increments.reduce((sum, value) => sum + value, 0);
    const values = [...increments, Number(rest.toFixed(6))];
    error = quarterAngleError(values) ?? '';
    if (error) {
      input.value = angles[Number(input.dataset.index)];
      return;
    }
    update(field, values);
  }
  function changeCount(input) {
    const count = Number(input.value);
    error = '';
    update(field, equalQuarterAngles(count));
  }
  function changeAngle(input, index) {
    const leading = angles.slice(0, -1);
    leading[index] = input.valueAsNumber;
    apply(leading, input);
  }
</script>

<fieldset>
  <legend>{title}</legend>
  <label for={id+'-count'}>Verdreven treden</label>
  <select id={id+'-count'} value={angles.length} onchange={e => changeCount(e.currentTarget)}>
    {#each [2,3,4,5,6,7,8] as count}<option value={count}>{count}</option>{/each}
  </select>
  <div class="angle-grid">
    {#each angles as angle,i}
      <label for={id+'-'+i}>Trede {i+1}
        {#if i < angles.length-1}
          <input id={id+'-'+i} class="text-field" type="number" min="0.001" max="89.999" step="any" value={angle} data-index={i}
            onchange={e=>changeAngle(e.currentTarget,i)} />
        {:else}
          <output id={id+'-'+i}>{angle.toLocaleString('nl-NL',{maximumFractionDigits:6})}°</output>
        {/if}
      </label>
    {/each}
  </div>
  {#if error}<small role="alert">{error}</small>{/if}
</fieldset>
<style>
  fieldset { margin: .6rem 0; padding: .45rem .5rem .6rem; min-width: 0; border: 1px solid var(--oa-border); }
  legend { font-weight: 600; padding: 0 .2rem; }
  .angle-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(64px,1fr)); gap: .3rem .5rem; }
  .angle-grid label, .angle-grid output { display: block; }
  .angle-grid input { width: 100%; box-sizing: border-box; }
  .angle-grid output { padding: .35rem 0; }
</style>
