<script>
  import { defaultEngineering, engineeringUses, inputUnits, structureTypes, supportTypes } from './engineering.js';
  import EngineeringChecks from './EngineeringChecks.svelte';

  export let model;
  export let geometry;
  export let dossier;
  export let updateEngineering;
  export let downloadFile;

  const number = value => value.toLocaleString('nl-NL', { maximumFractionDigits: 4 });
  const format = value => typeof value === 'number' ? number(value) : (value || 'Open');
  $: input = model.engineering;
  $: governing = dossier.resistance.rows.filter(r => Number.isFinite(r.ratio)).reduce((best, r) => !best || r.ratio > best.ratio ? r : best, null);
  const selectField = (key, event) => updateEngineering(key, event.currentTarget.value);

  function exportDossier() {
    const { project, stair } = model;
    const file = [project.number, project.revision && 'rev-' + project.revision, stair.mark, 'engineering']
      .filter(Boolean).join('_').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 150);
    const report = {
      format: 'OpenStairStudio.Engineering', version: 2, project: { ...project },
      stair: { ...stair }, regulatory: { ...model.regulatory },
      inputs: Object.fromEntries(Object.keys(defaultEngineering).map(key => [key, input[key]])),
      inputUnits,
      dossier
    };
    downloadFile(file + '.json', JSON.stringify(report, null, 2), 'application/json');
  }
</script>

{#snippet memo(key, title, description = '', multiline = false)}
  <div class="field">
    <label for={'eng-' + key}>{title}</label>
    {#if description}<small>{description}</small>{/if}
    {#if multiline}
      <textarea id={'eng-' + key} rows="2" value={input[key]} onchange={e => selectField(key, e)}></textarea>
    {:else}
      <input id={'eng-' + key} type="text" value={input[key]} onchange={e => selectField(key, e)} />
    {/if}
    <span class="printed">{format(input[key])}</span>
  </div>
{/snippet}

{#snippet measure(key, title, unit, min)}
  <div class="field">
    <label for={'eng-' + key}>{title}</label>
    <div class="measure"><input id={'eng-' + key} type="number" {min} step="any" value={input[key] ?? ''} onchange={e => updateEngineering(key, e.currentTarget)} /><span>{unit}</span></div>
    <span class="printed">{input[key] == null ? 'Open' : number(input[key]) + ' ' + unit}</span>
  </div>
{/snippet}

<div class="production-view engineering">
  <header class="production-head">
    <div><h1>Engineeringdossier</h1><p>{model.stair.mark} · {model.stair.name} · {model.project.number} · revisie {model.project.revision}</p></div>
    <div class="actions">
      <button class="action-btn" onclick={() => window.print()}>Dossier als PDF</button>
      <button class="action-btn" onclick={exportDossier}>Dossier als JSON</button>
    </div>
  </header>

  {#if governing || dossier.escape.capacity != null}
    <div class="overview">
      {#if governing}<p><b>Maatgevende berekende benutting</b> {number(governing.ratio * 100)}% · {governing.label}{dossier.resistance.status === 'open' ? ' · onderbouwing open' : ''}</p>{/if}
      {#if dossier.escape.capacity != null}<p><b>Vluchtroute</b> {input.escapePersons} aangewezen personen · capaciteit {dossier.escape.capacity} personen</p>{/if}
    </div>
  {/if}
  <div class="system">
    <div class="field">
      <label for="eng-structureType">Tredesysteem</label>
      <select id="eng-structureType" value={input.structureType} onchange={e => selectField('structureType', e)}>
        {#each structureTypes as option}<option value={option.id}>{option.label}</option>{/each}
      </select>
      <span class="printed">{dossier.structureLabel}</span>
    </div>
    <div class="field">
      <label for="eng-use">Gebruik van de trap</label>
      <select id="eng-use" value={input.use} onchange={e => selectField('use', e)}>
        {#each engineeringUses as option}<option value={option.id}>{option.label}</option>{/each}
      </select>
      <span class="printed">{dossier.useLabel}</span>
    </div>
    <p class="geometry">Referentiemodel · {format(dossier.geometry.treadCount)} treden · vloerhoogte {format(dossier.geometry.floorHeightMm)} mm · buitenwerkse trapbreedte {format(dossier.geometry.overallWidthMm)} mm</p>
  </div>

  <div class="design">
    <section class="construction">
      <h2>Opbouw en oplegging</h2>
      {#if input.structureType === 'custom'}
        {@render memo('customDescription', 'Bijzondere constructie', 'Beschrijf de vorm, afzonderlijke onderdelen en hun krachtsafdracht.', true)}
      {/if}
      {@render memo('sourceProduct', 'Product en bron', 'Fabrikant, type en document- of tekeningnummer.')}
      {@render memo('productBasis', 'Technische opbouw', dossier.productHint, true)}
      <div class="field">
        <label for="eng-support">Oplegmodel van de trede</label>
        <select id="eng-support" value={input.support} onchange={e => selectField('support', e)}>
          {#each supportTypes as option}<option value={option.id}>{option.label}</option>{/each}
        </select>
        <span class="printed">{dossier.supportLabel}</span>
      </div>
      {@render memo('arrangement', 'Oplegdetail en verbindingen', '', true)}
      {#if input.use !== 'regular'}
        {@render memo('escapeBasis', 'Uitgangspunten vluchtroute', 'Leg gebruiksfunctie, bezetting en de positie in het vluchtrouteplan vast.', true)}
      {/if}
    </section>

    <section class="loading">
      <h2>Lastwerking per trede</h2>
      <div class="loads">
        {@render measure('spanMm', 'Overspanning hart-op-hart', 'mm', 0)}
        {@render measure('loadArea', 'Veranderlijke vlaklast qₖ', 'kN/m²', 0)}
        {@render measure('loadPoint', 'Veranderlijke puntlast Qₖ', 'kN', 0)}
      </div>
      <p class="scope">{dossier.scope}</p>
      {#if dossier.cases.length}
        <div class="results">
          {#each dossier.cases as loadCase}
            <article class="case">
              <h3>{loadCase.label}</h3>
              <p>{loadCase.assumption}</p>
              <dl>
                <div><dt>Maximaal moment</dt><dd>{number(loadCase.moment)} <small>{loadCase.momentUnit}</small></dd></div>
                <div><dt>Reactie per oplegging</dt><dd>{number(loadCase.reaction)} <small>{loadCase.reactionUnit}</small></dd></div>
              </dl>
            </article>
          {/each}
        </div>
      {:else}
        <p class="empty">{input.support === 'two-edge' ? 'Vul de overspanning en ten minste één belasting in om de bijbehorende lastwerking te zien.' : 'Voor het éénrichtingsmodel kiest u twee vrij opgelegde, evenwijdige lijnopleggingen. Andere steuncondities vragen een projectspecifiek rekenmodel.'}</p>
      {/if}
      {@render memo('notes', 'Projectnotities', '', true)}
    </section>
  </div>

  <EngineeringChecks {input} {dossier} {updateEngineering} winder={!!geometry?.dimensions?.family?.winder} />
  <section class="review">
    <div>
      <h2>Open dossiergegevens</h2>
      {#if dossier.missing.length}
        <ul>{#each dossier.missing as entry}<li>{entry}</li>{/each}</ul>
      {:else}<p>Alle gevraagde basisgegevens zijn ingevuld.</p>{/if}
      <section class="sources"><h2>Referenties</h2>
        <ul>{#each dossier.sources as source}<li><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>{/each}</ul>
      </section>
    </div>
    <div>
      <h2>Verder te toetsen</h2>
      <ul>{#each dossier.checks as entry}<li>{entry}</li>{/each}</ul>
    </div>
  </section>
</div>

<style>
  .engineering { container-type:inline-size; }
  .overview { display:flex; flex-wrap:wrap; gap:3px 20px; margin:0 0 10px; }
  .overview p { margin:0; }
  h2 { font:600 14px var(--oa-font-heading); margin:0 0 10px; }
  h3 { font:600 12px var(--oa-font-heading); margin:0; }
  p, li { font:11px/1.5 var(--oa-font-body); }
  .system, .case { border:1px solid var(--oa-border); background:var(--oa-panel); }
  .actions { display:flex; flex-wrap:wrap; gap:6px; }
  .system { display:grid; grid-template-columns:1.3fr 1fr; gap:8px 14px; padding:12px 14px; border-left:3px solid var(--oa-accent); }
  .geometry { grid-column:1/-1; border-top:1px solid var(--oa-border-subtle); padding-top:6px; margin:0; color:var(--oa-text-secondary); }
  .design,.review { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:18px; padding:16px 0; border-bottom:1px solid var(--oa-border); }
  .field { display:flex; flex-direction:column; align-items:stretch; gap:3px; margin:0 0 10px; min-width:0; }
  .system .field, .loads .field { margin:0; }
  label { color:var(--oa-text); font:600 11px var(--oa-font-body); }
  .field small, .case p, .scope, .empty { color:var(--oa-text-secondary); font:11px/1.45 var(--oa-font-body); }
  select, input, textarea { min-width:0; max-width:100%; padding:5px 6px; color:var(--oa-text); border:1px solid var(--oa-border); background:var(--oa-field); border-radius:3px; font:12px var(--oa-font-body); }
  textarea { resize:vertical; min-height:40px; }
  .loads { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px 10px; }
  .loads .field:first-child { grid-column:1/-1; }
  .measure { display:flex; align-items:stretch; }
  .measure input { width:100%; border-radius:3px 0 0 3px; }
  .measure span { display:flex; align-items:center; flex:0 0 auto; padding:0 5px; border:1px solid var(--oa-border); border-left:0; color:var(--oa-text-secondary); font-size:10px; }
  .scope,.empty { margin:10px 0; }
  .empty { padding:8px 10px; border-left:2px solid var(--oa-border); }
  .case { margin:7px 0; padding:8px 10px; }
  .case p { margin:3px 0 7px; }
  .case dl { display:flex; align-items:start; flex-wrap:wrap; gap:8px 14px; }
  dl, dt, dd { margin:0; }
  dt { font:10px var(--oa-font-body); color:var(--oa-text-secondary); }
  dd { font:600 14px var(--oa-font-mono); margin-top:2px; }
  dd small { font:11px var(--oa-font-body); }
  ul { margin:4px 0; padding-left:16px; }
  li + li { margin-top:4px; }
  .sources { margin-top:14px; }
  .sources ul { display:flex; flex-wrap:wrap; gap:4px 14px; padding:0; list-style:none; }
  .sources li { margin:0; }
  .sources a { color:var(--oa-accent-text); text-decoration:underline; text-underline-offset:2px; }
  .printed { display:none; }
  @container (max-width: 550px) {
    .design,.review { grid-template-columns:1fr; gap:12px; }
  }
  @media print {
    :global(body:has(.engineering)), :global(.editor-area:has(.engineering)) { background:white; }
    .engineering { container-type:normal; padding:0; color:#171d21; background:#fff; }
    .engineering :global(.production-head) { margin-bottom:2mm; }
    .engineering :global(.production-head h1) { font-size:13pt; }
    .engineering :global(.production-head p) { display:none; }
    .actions,select,input,textarea,.field > small,.measure { display:none; }
    .printed { display:block; font-size:8pt; white-space:pre-wrap; overflow-wrap:anywhere; }
    label,dt { font:600 7pt var(--oa-font-body); color:#45545a; }
    .system,.case { background:white; }
    .system { grid-template-columns:1fr 1fr; gap:1mm 4mm; padding:2mm 3mm; }
    .geometry { padding-top:1mm; }
    .design,.review { display:grid; grid-template-columns:1fr 1fr; gap:5mm; padding:2.5mm 0; }
    .field,.case { margin:0 0 1.6mm; break-inside:avoid; }
    .field { gap:0; }
    .loads { grid-template-columns:1fr 1fr 1fr; gap:2mm; }
    .loads .field:first-child { grid-column:auto; }
    h2 { font-size:10pt; margin-bottom:1.4mm; break-after:avoid; }
    h3 { font-size:8pt; }
    p,li,.scope,.empty,.case p,.geometry { font-size:7.5pt; line-height:1.3; }
    .scope,.empty { margin:1.3mm 0; }
    .case { padding:1.5mm 2mm; }
    .case p { margin:.5mm 0 1mm; }
    dd { font-size:9pt; } dd small { font-size:7pt; }
    ul { padding-left:3.6mm; }
    li { break-inside:avoid; } li + li { margin-top:.6mm; }
    .sources { margin-top:2mm; } .sources a { color:#23444c; }
    .sources ul { display:block; } .sources li { margin:.4mm 0; }
  }
</style>
