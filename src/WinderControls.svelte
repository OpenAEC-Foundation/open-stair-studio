<script>
  import QuarterAngles from './QuarterAngles.svelte';
  export let stair;
  export let geometry;
  export let details;
  export let update;
  export let showPlan;
  export let applyReference;
  $: twoQuarter = stair.type === 'two_quarter_winder';
  $: dimensioned = twoQuarter && stair.twoQuarterLayout === 'dimensioned';
  $: quarters = twoQuarter || stair.type === 'half_winder' ? 2 : 1;
  $: turnSteps = dimensioned ? stair.firstQuarterAngles.length + stair.secondQuarterAngles.length : quarters * stair.windersPerQuarter;
  $: straightSteps = stair.risers - 1 - turnSteps;
  $: available = Math.max(0, straightSteps - (twoQuarter ? stair.middleSteps : 0));
  $: options = Array.from({ length: available + 1 }, (_, i) => i);
  function overallSize(footprint, parts) {
    let xMin = footprint.x, xMax = xMin + footprint.width;
    let yMin = footprint.y, yMax = yMin + footprint.depth;
    for (const part of parts) for (const face of part.faces ?? []) for (const p of face) {
      xMin = Math.min(xMin,p.x); xMax = Math.max(xMax,p.x);
      yMin = Math.min(yMin,p.y); yMax = Math.max(yMax,p.y);
    }
    return [yMax-yMin,xMax-xMin].map(mm=>mm.toLocaleString('nl-NL',{maximumFractionDigits:1})).join(' × ');
  }
  $: includingRail = dimensioned && geometry.treads.length && stair.railSide !== 'none'
    ? overallSize(geometry.footprint,details) : '';
</script>

<section class="property-section winder-controls">
  <h3>Verdrijving <button onclick={showPlan}>Plattegrond ↗</button></h3>
  <label for="turn-direction">Draairichting bij oplopen</label>
  <select id="turn-direction" value={stair.turnDirection} onchange={e => update('turnDirection', e.currentTarget.value)}>
    <option value="left">Linksom</option><option value="right">Rechtsom</option>
  </select>
  {#if twoQuarter}
    <label for="two-quarter-layout">Maatvoering tweekwart</label>
    <select id="two-quarter-layout" value={stair.twoQuarterLayout} onchange={e=>update('twoQuarterLayout', e.currentTarget.value)}>
      <option value="automatic">Afgeleid van de klimlijn</option><option value="dimensioned">Vaste buitenmaten</option>
    </select>
    <button class="action-btn" title="Past 16 optredes, 45 mm wel en stuikende stootborden toe. Wanghuizen kun je op het werkblad toevoegen." onclick={applyReference}>De Vries-voorbeeld toepassen · 3140 × 992 mm</button>
  {/if}
  {#if dimensioned}
    <small>De buitenmaten lopen over de treden, stootborden en wangen.</small>
    <label for="outer-length">Buitenlengte langs het tussenstuk (mm)</label>
    <input id="outer-length" class="text-field" type="number" min="1" max="30000" step="any" value={stair.outerLength}
      onchange={e=>update('outerLength',e.currentTarget)} />
    <label for="outer-depth">Buitendiepte dwars op het tussenstuk (mm)</label>
    <input id="outer-depth" class="text-field" type="number" min="1" max="30000" step="any" value={stair.outerDepth}
      onchange={e=>update('outerDepth',e.currentTarget)} />
    {#if includingRail}<div class="computed-row"><span>Met balustrade</span><b>{includingRail} mm</b></div>{/if}
    <label for="middle-offset">Tussenstuk uit het midden (+ naar bovenkwart, mm)</label>
    <input id="middle-offset" class="text-field" type="number" step="any" value={stair.middleOffset}
      onchange={e=>update('middleOffset',e.currentTarget)} />
    <small>Hoeken in graden, van beneden naar boven. De laatste trede vult ieder kwart aan tot 90°.</small>
    <QuarterAngles {stair} {update} field="firstQuarterAngles" title="Onderkwart" />
    <QuarterAngles {stair} {update} field="secondQuarterAngles" title="Bovenkwart" />
  {/if}
  <label for="outer-shape">Vorm buitenwang</label>
  <select id="outer-shape" value={stair.outerShape} onchange={e => update('outerShape', e.currentTarget.value)}>
    <option value="square">Haaks langs de wanden</option>
    <option value="faceted">Gefacetteerde boog</option>
  </select>
  {#if !dimensioned}
  <label for="winder-count">Treden per 90° op de klimlijn</label>
  <input class="text-field" id="winder-count" type="number" min="2" max="8" step="1" value={stair.windersPerQuarter}
    onchange={e => update('windersPerQuarter', e.currentTarget)} />
  {/if}
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
    {#if !dimensioned}<div class="computed-row"><span>Straal klimlijn</span><b>{Math.round(geometry.dimensions.radius)} mm</b></div>{/if}
    <div class="computed-row"><span>Kleinste aantrede op klimlijn</span><b>{Math.min(...geometry.treads.map(t => t.goingAtWalkline)).toLocaleString('nl-NL', {maximumFractionDigits:1})} mm</b></div>
  {/if}
</section>
<style>
  .winder-controls h3 button { font-weight: 500; color: var(--oa-accent-text); }
  .winder-controls h3 { display: flex; align-items: center; justify-content: space-between; }
</style>
