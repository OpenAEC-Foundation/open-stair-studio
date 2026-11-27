<script>
  import { compileHousingJob, defaultCam, housingFileStem, writeHousingDxf } from './housing-cam.js';
  import {writeCutStringerDxf} from './cut-stringer.js';

  export let housings;
  export let selectedBeamId = '';
  export let selectedPocketId = '';
  export let metadata = {};
  export let downloadFile = null;
  export let openCam = null;
  export let cam = defaultCam;
  export let printSelection = null;
  export let printSet = null;
  export let embedded = false;

  let mode = selectedPocketId ? 'detail' : 'overzicht';
  const mm = value => value.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
  const extent = (points, key) => {
    const values = points.map(point => point[key]);
    return [Math.min(...values), Math.max(...values)];
  };
  const bounds = points => ({ x: extent(points, 'x'), y: extent(points, 'y') });
  const mid = ([low, high]) => (low + high) / 2;
  const plotWidth = 820;

  // All graphics use the CNC coordinates. Only the SVG projection flips Y.
  function fit(box, width, height, padding) {
    const dx = Math.max(1, box.x[1] - box.x[0]), dy = Math.max(1, box.y[1] - box.y[0]);
    const scale = Math.min((width - 2 * padding) / dx, (height - 2 * padding) / dy);
    const x = value => width / 2 + (value - mid(box.x)) * scale;
    const y = value => height / 2 - (value - mid(box.y)) * scale;
    return { x, y, scale, polygon: points => points.map(point => x(point.x) + ',' + y(point.y)).join(' ') };
  }

  function cutterPreview(stock, settings) {
    try { return { job: compileHousingJob(stock, settings ?? defaultCam) }; }
    catch (error) { return { problem: error.message }; }
  }
  function selectBeam(id) {
    selectedBeamId = id;
    showOverview();
  }
  function showOverview() {
    selectedPocketId = '';
    mode = 'overzicht';
  }
  function inspectPocket(id) {
    selectedPocketId = id;
    mode = 'detail';
  }
  function exportDxf() {
    downloadFile(housingFileStem(beam, metadata) + '.dxf', beam.profile==='cut'?writeCutStringerDxf(beam,metadata):writeHousingDxf(beam, metadata), 'application/dxf');
  }

  $: beams = housings?.beams ?? [];
  $: beam = beams.find(item => item.id === selectedBeamId) ?? beams[0];
  $: side = beam?.side === 'left' ? 'Links' : 'Rechts';
  $: rows = (beam?.pockets ?? []).filter(p => p.contour?.length >= 3).map((pocket, index) => ({
    pocket, number: index + 1, box: bounds(pocket.contour)
  }));
  $: active = rows.find(row => row.pocket.id === selectedPocketId) ?? rows[0];
  $: plotHeight = beam ? Math.min(235, Math.max(108, 82 + (plotWidth - 82) * beam.width / beam.length)) : 235;
  $: overview = beam && fit({ x: [0, beam.length], y: [0, beam.width] }, plotWidth, plotHeight, 41);
  $: detail = active && fit(active.box, 490, 210, 38);
  $: preview = mode === 'detail' && active && cutterPreview(beam, cam);
  $: operation = preview?.job?.operations.find(op => op.id === active.pocket.id);
  $: cornerField = operation ? 4 * preview.job.cam.toolDiameter : 0;
  $: cornerSide = operation ? detail.scale * cornerField : 0;
  $: cornerView = operation && [
    detail.x(active.pocket.contour[0].x) - cornerSide / 2,
    detail.y(active.pocket.contour[0].y) - cornerSide / 2, cornerSide, cornerSide
  ].join(' ');
  $: floorAxis = active && 18 + 54 * active.pocket.depth / beam.thickness;
  $: issues = [...new Set((beam?.issues ?? housings?.issues ?? []).map(issue => issue.message))];
</script>

<div class="production-view housing-workspace">
  {#if !embedded}<div class="production-head">
    <div><span class="eyebrow">WERKVOORBEREIDING</span><h1>Wangbladen</h1></div>
    {#if beam}
      <div class="button-row">
        <button class="action-btn" disabled={(!rows.length && beam.profile!=='cut') || beam.issues.some(issue => issue.level === 'error')} onclick={exportDxf}>Wang-DXF</button>
        <button class="action-btn" onclick={printSelection}>Afdrukken / PDF</button>
        <button class="action-btn" onclick={printSet}>Alle wangbladen / PDF</button>
        {#if openCam}<button class="action-btn" onclick={() => openCam(beam.id, mode === 'detail' ? active?.pocket.id : '')}>Naar CNC</button>{/if}
      </div>
    {/if}
  </div>{/if}
  {#if beam}
    {#if !embedded}<div class="sheet-controls">
      <label for="housing-beam">Wangdeel</label>
      <select id="housing-beam" value={beam.id} onchange={event => selectBeam(event.currentTarget.value)}>
        {#each beams as item}<option value={item.id}>{item.id} · {item.side === 'left' ? 'links' : 'rechts'} · {item.profile==='cut'?'uitgezaagde keepboom':item.pockets.length+' infrezingen'}</option>{/each}
      </select>
      <div class="sheet-modes">
        <button aria-pressed={mode === 'overzicht'} onclick={showOverview}>Overzicht</button>
        <button aria-pressed={mode === 'detail'} disabled={!rows.length} onclick={() => inspectPocket(active.pocket.id)}>Pocketdetail</button>
      </div>
    </div>{/if}
    <article class="housing-sheet">
      <header class="drawing-title">
        <div><h2>{beam.id}</h2><p>{side} bij oplopen · binnenvlak boven · maten in mm</p></div>
        <div class="stock"><span>Ruwmaat L × B × D</span><b>{mm(beam.length)} × {mm(beam.width)} × {mm(beam.thickness)}</b></div>
      </header>
      {#if mode === 'overzicht' || !active}
        <div class="view-heading"><h3>{beam.profile==='cut'?'Keepboom · uitgezaagde treden':'Positie van de infrezingen'}</h3><span>+X → hogere trapzijde</span></div>
        <svg viewBox={'0 0 ' + plotWidth + ' ' + plotHeight} class="overview" role="img" aria-label={'Werkplaatstekeningen binnenzijde ' + beam.id}>
          <rect class="blank" x={overview.x(0)} y={overview.y(beam.width)} width={overview.x(beam.length)-overview.x(0)} height={overview.y(0)-overview.y(beam.width)}/>
          <polygon points={overview.polygon(beam.outline)} class="face"/>
          {#each rows as row}
            <polygon points={overview.polygon(row.pocket.contour)} class="cut" class:riser={!!row.pocket.riserId} class:open-edge={row.pocket.openEdge}><title>{row.pocket.treadId}</title></polygon>
          {/each}
          {#each rows as row}
            {@const cx = overview.x(mid(row.box.x))}
            {@const cy = overview.y(mid(row.box.y))}
            {@const targetX = 47 + (row.number - 0.5) / rows.length * (plotWidth - 94)}
            <polyline class="leader" points={cx + ',' + cy + ' ' + cx + ',' + (overview.y(beam.width) - 5) + ' ' + targetX + ',25'}/>
            <circle class="callout" cx={targetX} cy="16" r="9"/><text class="number" x={targetX} y="16">{row.number}</text>
          {/each}
          <path class="axis" d={'M ' + overview.x(0) + ' ' + overview.y(0) + 'h 27 m -5 -3 l 5 3 -5 3 M ' + overview.x(0) + ' ' + overview.y(0) + 'v -24 m -3 5 l 3 -5 3 5'}/>
          <circle cx={overview.x(0)} cy={overview.y(0)} r="2.6" fill="#172f35"/>
          <text class="axis-text" x={overview.x(0)-1} y={overview.y(0)+16}>0,0</text>
          <text class="axis-text" x={overview.x(0)+30} y={overview.y(0)+4}>X</text>
          <text class="axis-text" x={overview.x(0)-5} y={overview.y(0)-29}>Y</text>
        </svg>
        <div class="key"><span><i class="stock-key"></i>Ruwe plank</span><span><i class="face-key"></i>{beam.profile==='cut'?'Keepcontour':'Binnenvlak'}</span>{#if beam.profile!=='cut'}<span><i class="cut-key"></i>Nominale infrezing</span>{/if}</div>
        {#if rows.some(r=>r.pocket.riserId)}<p class="instruction">De oranje groeven ontvangen de lippen van de stootborden.</p>{/if}
        {#if rows.length}
          <table class="coordinates operations">
            <caption>Infrezingen vanaf het binnenvlak</caption>
            <thead>
              {#if rows.length > 17}<tr class="table-identity"><th colspan="6">{beam.id} · {side} bij oplopen · {metadata.number ?? ''} · revisie {metadata.revision ?? '–'}</th></tr>{/if}
              <tr><th>Nr.</th><th>Onderdeel</th><th>X min / max</th><th>Y min / max</th><th>Z bodem</th><th>Ligging</th></tr>
            </thead>
            <tbody>
              {#each rows as row}
                <tr><td>{row.number}</td><td><button class="part-link" title={'Pocketdetail ' + row.pocket.treadId} onclick={() => inspectPocket(row.pocket.id)}>{row.pocket.treadId}</button></td>
                  <td>{mm(row.box.x[0])} / {mm(row.box.x[1])}</td><td>{mm(row.box.y[0])} / {mm(row.box.y[1])}</td>
                  <td>{mm(-row.pocket.depth)}</td><td>{row.pocket.openEdge ? 'Aan rand' : 'In vlak'}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="instruction">{beam.profile==='cut'?`De treden rusten op de uitgezaagde keep. De minimale rug is ${mm(beam.minWeb)} mm. Gebruik de DXF als nominale contour voor CAM; freesbaan, opspanning en onderslag vragen werkplaatsvalidatie.`:'Dit wangdeel bevat geen infrezingen.'}</p>
        {/if}
      {:else}
        <div class="detail-controls"><label for="housing-pocket">Infrezing</label>
          <select id="housing-pocket" value={active.pocket.id} onchange={event => selectedPocketId = event.currentTarget.value}>
            {#each rows as row}<option value={row.pocket.id}>{row.number} · {row.pocket.treadId}</option>{/each}
          </select>
        </div>
        <div class="view-heading"><h3>Infrezing {active.number} · {active.pocket.treadId}</h3><span>Nominale contour</span></div>
        <div class="detail-grid">
          <div>
            <svg viewBox="0 0 490 210" class="detail-view" role="img" aria-label={'Pocketcontour ' + active.pocket.treadId}>
              <g id="wangblad-freescontour">
                {#if operation}
                  {@const stroke = detail.scale * preview.job.cam.toolDiameter}
                  <polygon class="swept" points={detail.polygon(operation.ring)} stroke-width={stroke}/>
                  {#each operation.relief as endpoint, i}
                    <line class="relief" x1={detail.x(operation.ring[i].x)} y1={detail.y(operation.ring[i].y)} x2={detail.x(endpoint.x)} y2={detail.y(endpoint.y)} stroke-width={stroke}/>
                  {/each}
                {/if}
                <polygon points={detail.polygon(active.pocket.contour)} class="cut" class:nominal={!!operation}/>
              </g>
              {#each active.pocket.contour as point, index}
                <circle cx={detail.x(point.x)} cy={detail.y(point.y)} r="2.5" class="vertex"/>
                <text class="vertex-label" x={detail.x(point.x) + (point.x >= mid(active.box.x) ? 7 : -7)} y={detail.y(point.y) + (point.y >= mid(active.box.y) ? -6 : 13)} text-anchor={point.x >= mid(active.box.x) ? 'start' : 'end'}>{index + 1}</text>
              {/each}
            </svg>
            {#if operation}
              <div class="key"><span><i class="cut-key"></i>Nominale contour</span><span><i class="swept-key"></i>Freesbereik Ø{mm(preview.job.cam.toolDiameter)} · {operation.relief.length ? 'hoekontlasting' : 'ronde binnenhoeken'}</span></div>
            {:else if preview?.problem}<p class="section-note">Freesbereik niet beschikbaar. {preview.problem}</p>{/if}
          </div>
          <table class="coordinates vertices">
            <caption>Hoekpunten in wangcoördinaten</caption>
            <thead><tr><th>Punt</th><th>X (mm)</th><th>Y (mm)</th></tr></thead>
            <tbody>{#each active.pocket.contour as point, index}<tr><td>{index+1}</td><td>{mm(point.x)}</td><td>{mm(point.y)}</td></tr>{/each}</tbody>
          </table>
        </div>
        <div class="section-layout"><section class="depth-section">
          <h3>Doorsnede in Z · schematisch</h3>
          <svg viewBox="0 0 445 94" role="img" aria-label={'Doorsnede infrezing ' + active.pocket.treadId}>
            <path d={'M22 18 H98 V' + floorAxis + ' H200 V18 H261 V72 H22 Z'} class="face"/>
            <line class="datum" x1="17" y1="18" x2="282" y2="18"/>
            <line class="leader" x1="185" y1={floorAxis} x2="282" y2="45"/>
            <text x="292" y="21" class="axis-text">Z0 · binnenvlak</text>
            <text x="292" y="49" class="axis-text">Z{mm(-active.pocket.depth)} · bodem</text>
            <text x="292" y="76" class="axis-text">Z{mm(-beam.thickness)} · rug</text>
          </svg>
          <div class="section-note">Resterend hout volgens ruwmaat {mm(beam.thickness - active.pocket.depth)} mm.</div>
        </section>
        {#if operation}
          <section class="corner-section">
            <h3>Freeshoek bij punt 1</h3>
            <svg viewBox={cornerView} role="img" aria-label="Vergroting van de freesafwerking bij hoekpunt 1">
              <use href="#wangblad-freescontour"/>
            </svg>
            <span>Veld {mm(cornerField)} × {mm(cornerField)} mm</span>
          </section>
        {/if}</div>
      {/if}
      <p class="instruction">XY-nul ligt linksonder op de ruwe plank in het wangoverzicht. Positieve X loopt langs de nerf van de lage naar de hoge trapzijde. Z0 ligt op het binnenvlak. De freesdiepte is negatief. Positiematen zijn afgerond op 0,01 mm. De DXF bevat de nominale contour.</p>
      {#if issues.length}<ul class="sheet-issues">{#each issues as message}<li>{message}</li>{/each}</ul>{/if}
    </article>
  {:else}
    <p>Er zijn geen wangbladen beschikbaar voor deze trap en instellingen.</p>
    {#if issues.length}<ul class="sheet-issues">{#each issues as message}<li>{message}</li>{/each}</ul>{/if}
  {/if}
</div>

<style>
  .housing-workspace .production-head { margin-bottom: 12px; }
  .sheet-controls, .sheet-modes, .detail-controls, .key { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sheet-controls { margin-bottom: 12px; }
  .sheet-controls label, .detail-controls label { font-size: 11px; color: var(--oa-text-secondary); }
  .sheet-controls select, .detail-controls select { max-width: 100%; padding: 5px 7px; border: 1px solid var(--oa-border); border-radius: 3px; background: var(--oa-panel); }
  .sheet-modes { gap: 0; margin-left: auto; border: 1px solid var(--oa-border); border-radius: 4px; }
  .sheet-modes button { padding: 5px 8px; }
  .sheet-modes button[aria-pressed=true] { color: var(--oa-accent-text); background: var(--oa-selected); }
  .sheet-modes button:disabled { opacity: .45; }
  .housing-sheet { background: var(--oa-panel); border: 1px solid var(--oa-border); padding: 14px; color: var(--oa-text); }
  .drawing-title, .view-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .drawing-title { padding-bottom: 10px; border-bottom: 1px solid var(--oa-border); }
  .drawing-title h2 { margin: 0; font: 600 18px var(--oa-font-heading); }
  .drawing-title p, .view-heading span, .stock span, .instruction, .key { color: var(--oa-text-secondary); }
  .drawing-title p, .stock, .instruction, .key { font-size: 11px; }
  .stock span, .stock b { display: block; }
  .stock b { font-variant-numeric: tabular-nums; }
  .view-heading { margin: 12px 0 2px; }
  .view-heading h3, .coordinates caption { margin: 0; font-size: 12px; font-weight: 600; }
  .view-heading span { font-size: 10px; }
  svg.overview, svg.detail-view { display: block; width: 100%; height: auto; }
  .blank { fill: none; stroke: #687378; stroke-dasharray: 5 3; stroke-width: 1; }
  .face { fill: #efe7d8; stroke: #675c47; stroke-width: 1.3; }
  .cut { fill: #b8d9d1; stroke: #1c6058; stroke-width: 1.15; }
  .cut.open-edge { stroke-dasharray: 3 1; }
  .cut.riser { fill:#e9bb83;stroke:#975719; }
  .cut.nominal { fill: none; vector-effect: non-scaling-stroke; }
  .swept { fill: #9dc5ba; stroke: #9dc5ba; stroke-linejoin: round; }
  .relief { stroke: #9dc5ba; stroke-linecap: round; }
  .swept-key { height: 8px; background: #9dc5ba; }
  .datum { stroke: #496965; stroke-dasharray: 6 3; stroke-width: 1; }
  .axis, .leader { fill: none; stroke-width: 1; }
  .axis { stroke: #18383d; }
  .leader { stroke: #6c837d; stroke-width: .7; }
  .axis-text, .vertex-label, .number { font: 11px var(--oa-font-mono); fill: #233c3b; }
  .callout { stroke: #567c73; fill: #fff; }
  .number { text-anchor: middle; dominant-baseline: central; }
  .vertex { fill: #204d46; }
  .key { gap: 15px; margin: 0 0 14px; }
  .key i { display: inline-block; width: 15px; margin-right: 4px; vertical-align: middle; }
  .stock-key { border-top: 1px dashed #687378; }
  .face-key, .cut-key { height: 8px; border: 1px solid #675c47; background: #efe7d8; }
  .cut-key { border-color: #1c6058; background: #b8d9d1; }
  .coordinates { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; font-variant-numeric: tabular-nums; }
  .coordinates caption { text-align: left; margin: 0 0 5px; }
  .coordinates th, .coordinates td { border-bottom: 1px solid var(--oa-border); padding: 4px; }
  .coordinates th { font-size: 10px; color: var(--oa-text-secondary); }
  .table-identity { display: none; }
  .part-link { color: var(--oa-accent-text); text-decoration: underline; text-align: left; }
  .detail-controls { margin-top: 10px; }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(120px, 1fr); align-items: start; gap: 12px; margin: 12px 0; }
  .section-note { font-size: 11px; color: var(--oa-text-secondary); }
  .section-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(120px, 1fr); gap: 12px; border-top: 1px solid var(--oa-border); padding-top: 8px; }
  .depth-section h3, .corner-section h3 { font-size: 12px; }
  .corner-section svg { display: inline-block; width: 85px; height: 85px; border: 1px solid var(--oa-border); vertical-align: middle; background: #fff; overflow: hidden; }
  .corner-section span { display: inline-block; font-size: 10px; color: var(--oa-text-secondary); margin-left: 5px; }
  .depth-section svg { display: block; width: min(100%, 445px); }
  .instruction { margin: 12px 0 0; line-height: 1.5; }
  .sheet-issues { margin: 8px 0 0; padding-left: 16px; font-size: 11px; color: var(--oa-text-secondary); }
  @media print {
    .housing-workspace .production-head, .sheet-controls, .detail-controls { display: none; }
    .housing-workspace, :global(body:has(.housing-workspace)), :global(.editor-area:has(.housing-workspace)) { background: white; }
    .housing-sheet { border: none; padding: 0; }
    .drawing-title { padding-bottom: 4px; }
    .view-heading { margin: 5px 0 2px; }
    .key { margin-bottom: 5px; }
    .instruction { margin: 4px 0 0; line-height: 1.3; }
    .drawing-title, svg, .detail-grid, .key, .coordinates tr { break-inside: avoid; }
    .coordinates thead { display: table-header-group; }
    .table-identity { display: table-row; }
    .coordinates th, .coordinates td { padding: 1px 4px; line-height: 1.25; }
    .part-link { padding: 0; text-decoration: none; color: inherit; }
    .overview { max-height: 49mm; }
    .detail-view { max-height: 65mm; }
    .housing-sheet { print-color-adjust: exact; }
  }
</style>
