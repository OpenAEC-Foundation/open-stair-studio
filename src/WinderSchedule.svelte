<script>
  import { createTreadDxf } from './tread-dxf.js';
  import RiserGrooveSheet from './RiserGrooveSheet.svelte';
  import { riserFaceResults } from './riser-face-cam.js';

  export let geometry;
  export let model;
  export let downloadFile;
  export let housingIssues = [];
  export let openHousing;
  export let openTreadCam;
  export let stockMargin = 0;

  export let mode = 'staat';
  export let selectedId = '';
  $: treads = geometry.parts.filter(part => part.kind === 'tread');
  $: selected = treads.find(tread => tread.id === selectedId) ?? treads.find(tread => tread.isWinder) ?? treads[0];
  $: connections = geometry.housings?.treads.find(tread => tread.id === selected?.id)?.tongues ?? [];
  $: grooveResults = riserFaceResults(selected,model,geometry.riserJoinery?.issues);
  const length = value => value.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
  const cubic = value => value.toLocaleString('nl-NL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const pointString = pts => pts.map(p => p.x + ',' + p.y).join(' ');
  $: windingSetup = geometry.dimensions.family.winder
    ? (model.stair.turnDirection==='right'?'Rechtsom':'Linksom')+' bij oplopen · neuspositie '+length(model.stair.nosing)+' mm'
    : '';

  function openDetail(id) {
    selectedId = id;
    mode = 'detail';
  }
</script>

<nav class="schedule-switcher" aria-label="Werkvoorbereiding weergave">
  <button type="button" aria-pressed={mode === 'staat'} onclick={() => mode = 'staat'}>Onderdelenstaat</button>
  <button type="button" aria-pressed={mode === 'detail'} onclick={() => mode = 'detail'}>Tredeblad</button>
</nav>

{#if mode === 'staat'}
  <p class="stock-note">De ruwmaat in mm omsluit het onderdeel. De nerf loopt bij treden langs de voorrand en bij wangdelen langs de helling. De calculatie past de uitvalfactor toe op het bruto plankvolume.</p>
  <div class="table-wrap">
    <table class="parts-table winder-table">
      <thead><tr><th>Merk</th><th>Onderdeel</th><th>Aantal</th><th>Ruw L × B × D</th><th>Netto m³</th><th>Bruto m³</th></tr></thead>
      <tbody>
        {#each geometry.parts as part (part.id)}
          <tr>
            <td>{#if part.kind === 'tread'}<button class="part-link" onclick={() => openDetail(part.id)} title={'Tredeblad ' + part.id}>{part.id}</button>{:else}{part.id}{/if}</td>
            <td>{part.name}</td><td>{part.quantity}</td>
            <td>{length(part.length)} × {length(part.width)} × {length(part.thickness)}</td>
            <td>{cubic(part.volume)}</td><td>{cubic(part.blankVolume)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot><tr><th colspan="4">Totaal voor deze trap</th><td>{cubic(geometry.volume)}</td><td>{cubic(geometry.blankVolume)}</td></tr></tfoot>
    </table>
  </div>
{:else if selected}
  <div class="detail-actions">
    <label for="wvb-tread">Trede</label>
    <select id="wvb-tread" value={selected.id} onchange={event => selectedId = event.currentTarget.value}>
      {#each treads as tread}<option value={tread.id}>{tread.id} · {tread.name}</option>{/each}
    </select>
    <button class="action-btn" disabled={housingIssues.length > 0} onclick={() => downloadFile(selected.id + '-contour.dxf', createTreadDxf(selected), 'application/dxf')}>Tredecontour DXF</button>
    <button class="action-btn go-cam" onclick={() => openTreadCam(selected.id)}>Trede frezen</button>
  </div>
  <article class="tread-sheet">
    <header><h2>{selected.id}</h2><p>{selected.name} · bovenaanzicht · bovenkant +{length(selected.elevation)} mm{windingSetup?' · '+windingSetup:''}</p></header>
    <div class="sheet-grid">
      <div class="board-view">
        <svg viewBox={[-20, -20, selected.length + 40, selected.width + 40].join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={'Contour van ' + selected.id + ' in de ruwe plank'}>
          <g transform={'translate(0 ' + selected.width + ') scale(1 -1)'}>
            <rect width={selected.length} height={selected.width} class="rough-board" />
            <polygon points={pointString(selected.contour)} class="tread-contour" />
            {#each selected.tongues ?? [] as tongue}
              <polygon points={pointString(tongue.points)} class="tread-lip"><title>Insteeklip voor {tongue.beamId}</title></polygon>
            {/each}
            <polyline points={pointString(selected.nose)} class="front-edge" />
          </g>
        </svg>
        <div class="key"><span><i class="blank"></i> Ruwe plank</span><span><i class="nose"></i> Voorrand</span>{#if selected.tongues?.length}<span><i class="lip"></i> Insteeklip</span>{/if}</div>
      </div>
      <dl>
        {#if selected.tongueCount != null}
          <dt>Insteeklippen in de contour</dt><dd>{selected.tongueCount} × {length(geometry.housings.settings.depth)} mm diep</dd>
        {/if}
        <dt>Ruwlengte langs voorrand</dt><dd>{length(selected.length)} mm</dd>
        <dt>Ruwbreedte</dt><dd>{length(selected.width)} mm</dd>
        <dt>CNC-opspanmaat · L × B</dt><dd>{length(selected.length + 2*stockMargin)} × {length(selected.width + 2*stockMargin)} mm</dd>
        <dt>Dikte</dt><dd>{length(selected.thickness)} mm</dd>
        {#each selected.newelJoints ?? [] as joint}
          <dt>Spilaansluiting {joint.postId}</dt><dd>{joint.depth > 0 ? length(joint.depth)+' mm insteek' : 'Stuikend'}</dd>
        {/each}
        <dt>Aantrede bij klimlijn</dt><dd>{length(selected.goingAtWalkline)} mm</dd>
        <dt>Tredevlak bij klimlijn</dt><dd>{length(selected.depthAtWalkline)} mm</dd>
        <dt>Kortste zijmaat langs wang</dt><dd>{length(selected.narrowDepth)} mm</dd>
        <dt>Netto contour</dt><dd>{length(selected.area / 100)} cm²</dd>
        <dt>Netto houtvolume</dt><dd>{cubic(selected.volume)} m³</dd>
        <dt>Bruto plankvolume</dt><dd>{cubic(selected.blankVolume)} m³</dd>
      </dl>
    </div>
    {#if connections.length}
      <div class="connections">
        <b>Bijbehorende wangbladen</b>
        {#each connections as connection}
          <button class="part-link" onclick={() => openHousing(connection.beamId, connection.pocketId)}>{connection.beamId} · {connection.side === 'left' ? 'links' : 'rechts'}</button>
        {/each}
      </div>
    {/if}
    <p class="stock-note">De DXF bevat de gesloten contour in millimeters. Het nulpunt ligt linksonder op de ruwe plank in dit bovenaanzicht. De ruwe plankmaat is naar boven afgerond op hele millimeters.</p>
    {#if grooveResults.length}
      <div class="groove-set">
        <p class="print-groove-title">{model.project.number} · revisie {model.project.revision} · {selected.id} · bewerkingsvlakken{windingSetup?' · '+windingSetup:''}</p>
        <RiserGrooveSheet results={grooveResults} {model} {downloadFile}/>
      </div>
    {/if}
  </article>
{/if}

<style>
  .tread-lip { fill: #bcd8ce; stroke: #297960; stroke-width: 0.8px; vector-effect: non-scaling-stroke; }
  .key .lip { border-top: 3px solid #297960; }
  .detail-actions .action-btn.go-cam { margin-left: 0; border-color: var(--oa-accent); color: var(--oa-accent-text); }
  .connections { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; margin: 12px 0; font-size: 11px; }
  .print-groove-title {display:none}
  @media print { .connections .part-link { color: black; text-decoration: none; } }
  .schedule-switcher, .detail-actions { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .schedule-switcher { border-bottom: 1px solid var(--oa-border); gap: 12px; }
  .schedule-switcher button { padding: 4px 0 6px; border-bottom: 2px solid transparent; color: var(--oa-text-secondary); }
  .schedule-switcher button[aria-pressed=true] { border-bottom-color: var(--oa-accent); color: var(--oa-text); }
  .stock-note { color: var(--oa-text-secondary); font: 11px/1.5 var(--oa-font-body); margin: 6px 0 14px; max-width: 85ch; }
  .table-wrap { overflow-x: auto; }
  .part-link { color: var(--oa-accent-text); text-decoration: underline; text-underline-offset: 2px; }
  .winder-table tfoot { border-top: 2px solid var(--oa-border); }
  .winder-table tfoot th { text-align: left; }
  .detail-actions select { border: 1px solid var(--oa-border); border-radius: 3px; padding: 5px 8px; color: var(--oa-text); background: var(--oa-field); }
  .detail-actions .action-btn { margin-left: auto; }
  .tread-sheet { border: 1px solid var(--oa-border); padding: 14px; background: var(--oa-panel); }
  .tread-sheet h2 { margin: 0; font: 600 16px var(--oa-font-heading); }
  .tread-sheet header p { color: var(--oa-text-secondary); font-size: 11px; }
  .sheet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 205px), 1fr)); gap: 18px; align-items: center; margin: 14px 0; }
  .board-view svg { display: block; width: 100%; height: 210px; }
  .rough-board { fill: none; stroke: #716b5e; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; }
  .tread-contour { fill: #dfc9a3; stroke: #6b563c; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .front-edge { fill: none; stroke: #a8481e; stroke-width: 3; vector-effect: non-scaling-stroke; }
  .key { display: flex; justify-content: center; gap: 12px; margin-top: 4px; color: var(--oa-text-secondary); font-size: 10px; }
  .key i { display: inline-block; width: 16px; vertical-align: middle; }
  .key .blank { border-top: 1px dashed #716b5e; }
  .key .nose { border-top: 3px solid #a8481e; }
  .sheet-grid dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 9px; margin: 0; font-size: 11px; }
  .sheet-grid dt { color: var(--oa-text-secondary); }
  .sheet-grid dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
  @media print {
    .schedule-switcher, .detail-actions { display: none; }
    .table-wrap { overflow: visible; }
    .part-link { text-decoration: none; color: inherit; }
    .winder-table thead { display: table-header-group; }
    .winder-table tfoot { display: table-row-group; }
    .tread-sheet { break-inside: avoid; }
    .tread-sheet:has(.groove-set) { break-inside:auto;border:0;padding:0; }
    .groove-set {break-before:page}
    .print-groove-title {display:block;font-size:10pt;font-weight:600;margin:0 0 2mm}
    :global(.production-view:has(.groove-set) .production-warning:not([role=status])) {display:none}
    :global(.production-view:has(.groove-set) .button-row) {display:none}
  }
</style>
