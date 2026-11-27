<script>
  export let stair;
  export let geometry;
  export let update;
  export let showPlan;
  $: twoQuarter = stair.type === 'two_quarter_winder';
  $: quarters = twoQuarter || stair.type === 'half_winder' ? 2 : 1;
  $: straightSteps = stair.risers - 1 - quarters * stair.windersPerQuarter;
  $: available = Math.max(0, straightSteps - (twoQuarter ? stair.middleSteps : 0));
  $: options = Array.from({ length: available + 1 }, (_, i) => i);
</script>

<section class="property-section winder-controls">
  <h3>Verdrijving <button onclick={showPlan}>Plattegrond ↗</button></h3>
  <label for="turn-direction">Draairichting bij oplopen</label>
  <select id="turn-direction" value={stair.turnDirection} onchange={e => update('turnDirection', e.currentTarget.value)}>
    <option value="left">Linksom</option><option value="right">Rechtsom</option>
  </select>
  <label for="outer-shape">Vorm buitenwang</label>
  <select id="outer-shape" value={stair.outerShape} onchange={e => update('outerShape', e.currentTarget.value)}>
    <option value="square">Haaks langs de wanden</option>
    <option value="faceted">Gefacetteerde boog</option>
  </select>
  <label for="winder-count">Treden per 90° op de klimlijn</label>
  <input class="text-field" id="winder-count" type="number" min="2" max="8" step="1" value={stair.windersPerQuarter}
    onchange={e => update('windersPerQuarter', e.currentTarget)} />
  {#if twoQuarter}
    <label for="middle-steps">Rechte treden tussen de kwartslagen</label>
    <input class="text-field" id="middle-steps" type="number" min="1" max={Math.max(1,straightSteps - Math.max(0,stair.entrySteps))} step="1" value={stair.middleSteps}
      onchange={e => update('middleSteps', e.currentTarget)} />
  {/if}
  <label for="entry-steps">{twoQuarter ? 'Rechte treden vóór de eerste kwartslag' : 'Treden vóór de boog'}</label>
  <select id="entry-steps" value={stair.entrySteps} onchange={e => update('entrySteps', e.currentTarget.value)}>
    <option value={-1}>Automatisch centreren</option>
    {#each options as count}<option value={count}>{count}</option>{/each}
    {#if stair.entrySteps > available}<option value={stair.entrySteps}>{stair.entrySteps} · te veel</option>{/if}
  </select>
  {#if geometry.treads.length}
    <div class="computed-row"><span>Verdreven treden</span><b>{geometry.treads.filter(t => t.isWinder).length} van {geometry.treads.length}</b></div>
    <div class="computed-row"><span>Straal klimlijn</span><b>{Math.round(geometry.dimensions.radius)} mm</b></div>
    <div class="computed-row"><span>Kleinste aantrede op klimlijn</span><b>{Math.min(...geometry.treads.map(t => t.goingAtWalkline)).toLocaleString('nl-NL', {maximumFractionDigits:1})} mm</b></div>
  {/if}
</section>
<style>
  .winder-controls h3 button { font-weight: 500; color: var(--oa-accent-text); }
  .winder-controls h3 { display: flex; align-items: center; justify-content: space-between; }
</style>
