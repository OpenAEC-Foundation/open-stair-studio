<script>
  import { resistanceFields } from './tread-resistance.js';
  import { escapeFields } from './escape-capacity.js';
  import { supportModeOptions } from './support-detail.js';

  export let input, dossier, updateEngineering, winder;
  const stateLabels = { pass: 'Voldoet binnen rekenmodel', fail: 'Voldoet niet', open: 'Gegevens of onderbouwing nodig', na: 'Buiten toepassingsgebied' };
  const number = value => Number.isFinite(value) ? value.toLocaleString('nl-NL', { maximumFractionDigits: 4 }) : '—';
  const displayed = field => field.type === 'select' ? field.options.find(([id]) => id === input[field.key])?.[1]
    : field.type === 'text' ? input[field.key] || 'Open' : input[field.key] == null ? 'Open' : number(input[field.key]) + ' ' + (field.unit || '');
  $: material = resistanceFields.filter(f => (!f.systems || f.systems.includes(input.structureType)) && (!f.visible || f.visible(input)));
  $: groups = [...new Set(material.map(f => f.group))];
  $: route = escapeFields.filter(f => (!f.winder || winder) && (!f.part || input.escapeSection.includes(f.part)));
</script>

{#snippet fieldEditor(field)}
  <div class="value" class:wide={field.type === 'text' || field.type === 'select'}>
    <label for={'eng-' + field.key}>{field.label}{field.unit ? ' (' + field.unit + ')' : ''}</label>
    {#if field.type === 'select'}
      <select class="oa-field" id={'eng-' + field.key} value={input[field.key]} onchange={e => updateEngineering(field.key, e.currentTarget.value)}>
        {#each (field.key === 'supportDetailMode' ? supportModeOptions(input) : field.options) as [id, title]}<option value={id}>{title}</option>{/each}
      </select>
    {:else if field.type === 'text'}
      <input class="oa-field" id={'eng-' + field.key} type="text" value={input[field.key]} onchange={e => updateEngineering(field.key, e.currentTarget.value)} />
    {:else}
      <input class="oa-field" id={'eng-' + field.key} type="number" min={field.min ?? 0} max={field.max} step={field.integer ? 1 : 'any'}
        value={input[field.key] ?? ''} onchange={e => updateEngineering(field.key, e.currentTarget)} />
    {/if}
    <span class="print-value">{displayed(field)}</span>
    {#if field.hint}<small>{field.hint}</small>{/if}
  </div>
{/snippet}

{#snippet notes(result)}
  {#if result.reasons.length}
    <ul class="reasons">{#each result.reasons as reason}<li>{reason}</li>{/each}</ul>
  {/if}
{/snippet}

{#if ['glass', 'grating', 'clt'].includes(input.structureType)}
  <section class="calculation" aria-labelledby="resistance-heading" data-check="resistance" data-status={dossier.resistance.status}>
    <header><h2 id="resistance-heading">Draagkracht, doorbuiging en oplegverbinding</h2><strong>{stateLabels[dossier.resistance.status]}</strong></header>
    <p>{dossier.resistance.scope}</p>
    {#each groups as group}
      <h3>{group}</h3>
      <div class="values">{#each material.filter(f => f.group === group) as field}{@render fieldEditor(field)}{/each}</div>
    {/each}
    {#if dossier.resistance.rows.length}
      <div class="table-wrap"><table>
        <thead><tr><th>Toets en belastinggeval</th><th>Effect</th><th>Grens</th><th>Eenheid</th><th>Benutting</th></tr></thead>
        <tbody>{#each dossier.resistance.rows as row}
          <tr data-id={row.id} data-status={row.status}><th scope="row">{row.label}{#if row.caseLabel}<small>{row.caseLabel}</small>{/if}{#if row.formula}<small>{row.formula}</small>{/if}</th>
            <td>{number(row.demand)}</td><td>{number(row.limit)}</td><td>{row.unit}</td><td>{row.ratio == null ? 'Open' : number(row.ratio * 100) + '%'}{#if row.status === 'fail'} · overschreden{/if}</td></tr>
        {/each}</tbody>
      </table></div>
    {/if}
    {@render notes(dossier.resistance)}
  </section>
{/if}

{#if input.use !== 'regular'}
  <section class="calculation" aria-labelledby="egress-heading" data-check="escape" data-status={dossier.escape.status}>
    <header><h2 id="egress-heading">Doorstroomcapaciteit vluchttrap</h2><strong>{stateLabels[dossier.escape.status]}</strong></header>
    <p>{dossier.escape.scope}</p>
    {#if dossier.escape.modelBandLimitMm != null}<p>Geometrische bovengrens bij 170 mm aantrede op de maatgevende trede <b>{number(Math.floor(dossier.escape.modelBandLimitMm + 1e-7))} mm</b>. Leg de doorlopende vrije strook tussen alle obstakels vast.</p>{/if}
    <div class="values">{#each route as field}{@render fieldEditor(field)}{/each}</div>
    {#if dossier.escape.rows.length}
      <div class="table-wrap"><table>
        <thead><tr><th>Doorsnede</th><th>Breedte (mm)</th><th>Personen/m</th><th>Capaciteit</th><th>Aangewezen</th></tr></thead>
        <tbody>{#each dossier.escape.rows as row}
          <tr data-id={row.id} data-status={row.status}><th scope="row">{row.label}{#if dossier.escape.governing.includes(row.id)}<small>Maatgevend</small>{/if}</th>
            <td>{number(row.widthMm)}</td><td>{row.rate}</td><td>{row.capacity}</td><td>{row.persons ?? 'Open'}{#if row.status === 'fail'} · te veel{/if}</td></tr>
        {/each}</tbody>
      </table></div>
    {/if}
    {#if dossier.escape.capacity != null}<p class="total">Capaciteit van het opgegeven gedeelte <b>{dossier.escape.capacity} personen</b></p>{/if}
    {@render notes(dossier.escape)}
  </section>
{/if}

<style>
  .calculation { padding:16px 0; border-bottom:1px solid var(--oa-border); }
  header { display:flex; align-items:baseline; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  h2 { font:600 14px var(--oa-font-heading); margin:0; }
  h3 { font:600 12px var(--oa-font-heading); margin:12px 0 6px; }
  strong { font:600 11px var(--oa-font-body); }
  p, li, label, small { font:11px/1.45 var(--oa-font-body); }
  p { margin:6px 0 12px; }
  .values { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(185px,100%),1fr)); gap:9px 12px; }
  .value { display:flex; flex-direction:column; gap:3px; min-width:0; }
  label { font-weight:600; }
  small { display:block; color:var(--oa-text-secondary); font-size:10px; }
  input,select { box-sizing:border-box; width:100%; min-width:0; }
  .wide { grid-column:1/-1; }
  .print-value { display:none; }
  .reasons { padding-left:17px; margin:10px 0 0; }
  .table-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; margin:10px 0 0; }
  th,td { padding:5px 7px; font:11px var(--oa-font-body); text-align:right; border-bottom:1px solid var(--oa-border); }
  thead th { font-weight:600; }
  th:first-child { text-align:left; }
  td { font-variant-numeric:tabular-nums; }
  [data-status="fail"] > header > strong,tr[data-status="fail"] td:last-child { color:var(--oa-danger, #ab3028); font-weight:700; }
  .total { text-align:right; }
  .total b { margin-left:8px; }
  @media print {
    .calculation { padding:2.4mm 0; }
    header,h2 { break-after:avoid; }
    .values { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1mm 4mm; }
    input,select,.value small { display:none; }
    .print-value { display:block; font-size:8pt; overflow-wrap:anywhere; }
    .value,tr { break-inside:avoid; }
    .wide { grid-column:span 3; }
    .table-wrap { overflow:visible; }
    p,li,th,td,small,strong,label { font-size:7.5pt; line-height:1.28; }
    h2 { font-size:10pt; }
    h3 { font-size:8pt; margin:1.6mm 0 1mm; break-after:avoid; }
    p { margin:1mm 0 2mm; }
    table { margin-top:2mm; }
    th,td { padding:1mm; }
    .reasons { margin-top:1.5mm; }
  }
</style>
