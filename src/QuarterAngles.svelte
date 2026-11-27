<script>
  import {equalQuarterAngles, quarterAngleError} from './two-quarter-settings.js';
  export let stair;
  export let field;
  export let title;
  export let update;
  export let firstLevel;
  let error = '';
  $: angles = stair[field];
  $: id = field === 'firstQuarterAngles' ? 'lower-quarter' : 'upper-quarter';
  $: offsetsField = field.replace('Angles','Offsets');
  $: offsets = stair[offsetsField] ?? [];
  $: boundary = field === 'firstQuarterAngles' ? 'vóór' : 'na';

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
  function changeOffset(input, index) {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value)) {
      input.value = offsets[index] ?? 0;
      error = 'Voer een verschuiving in millimeters in.';
      return;
    }
    error = '';
    const values = offsets.length ? [...offsets] : Array(angles.length).fill(0);
    values[index] = value;
    update(offsetsField, values);
  }
</script>

<fieldset>
  <legend>{title}</legend>
  <label for={id+'-count'}>Verdreven treden</label>
  <select id={id+'-count'} value={angles.length} onchange={e => changeCount(e.currentTarget)}>
    {#each [2,3,4,5,6,7,8] as count}<option value={count}>{count}</option>{/each}
  </select>
  <div class="angle-grid">
    <span>Trede</span><span>Draaihoek (°)</span><span>Grens {boundary} (mm)</span>
    {#each angles as angle,i}
      {@const level = firstLevel+i}
      <label for={id+'-'+i}>TD{String(level).padStart(2,'0')}</label>
        {#if i < angles.length-1}
          <input id={id+'-'+i} aria-label={'Draaihoek trede '+level} class="text-field" type="number" min="0.001" max="89.999" step="any" value={angle} data-index={i}
            onchange={e=>changeAngle(e.currentTarget,i)} />
        {:else}
          <output id={id+'-'+i}>{angle.toLocaleString('nl-NL',{maximumFractionDigits:6})}°</output>
        {/if}
      <input id={id+'-offset-'+i} aria-label={'Verschuiving grens '+boundary+' trede '+level+' (mm)'} class="text-field"
        type="number" step="any" value={offsets[i] ?? 0} onchange={e=>changeOffset(e.currentTarget,i)} />
    {/each}
  </div>
  {#if offsets.length}
    <button type="button" class="action-btn" onclick={()=>{error='';update(offsetsField,[]);}}>Verschuivingen {title.toLowerCase()} op nul</button>
  {/if}
  {#if error}<small role="alert">{error}</small>{/if}
</fieldset>
<style>
  fieldset { margin: .6rem 0; padding: .45rem .5rem .6rem; min-width: 0; border: 1px solid var(--oa-border); }
  legend { font-weight: 600; padding: 0 .2rem; }
  .angle-grid { display: grid; grid-template-columns: max-content minmax(0,1fr) minmax(0,1fr); gap: .3rem .4rem; align-items:center; }
  .angle-grid label { margin:0; }
  .angle-grid input { width: 100%; min-width:0; box-sizing: border-box; }
  .angle-grid output { padding: .35rem 0; }
  button { margin-top:.45rem; }
</style>
