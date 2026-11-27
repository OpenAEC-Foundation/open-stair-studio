<script>
  import {
    compileTreadJob, defaultTreadCam, treadCamRanges, treadFileStem, validateTreadCamField,
    writeTreadCamJson, writeTreadLinuxCnc
  } from './tread-cam.js';
  import { verifyTreadFit } from './tread-fit.js';
  import RiserGrooveSheet from './RiserGrooveSheet.svelte';
  import { riserFaceResults } from './riser-face-cam.js';

  export let part;
  export let model;
  export let workshop;
  export let downloadFile;
  export let updateTreadCam;
  export let backToSheet;

  const fields = [
    ['toolDiameter', 'Freesdiameter', 'mm', 0.1], ['fluteLength', 'Snijlengte', 'mm', 0.1],
    ['stepDown', 'Diepte per gang', 'mm', 0.1], ['breakthrough', 'Doorsteek in offerplaat', 'mm', 0.01],
    ['stockMargin', 'Opspanrand per zijde', 'mm', 0.5], ['safeZ', 'Vrijloophoogte', 'mm', 0.5],
    ['cutFeed', 'Snijvoeding', 'mm/min', 10], ['plungeFeed', 'Insteekvoeding', 'mm/min', 10],
    ['spindleSpeed', 'Toerental', 'omw/min', 100]
  ];
  const mm = n => n.toLocaleString('nl-NL', { maximumFractionDigits: 3 });
  const points = vertices => vertices.map(p => p.x + ',' + p.y).join(' ');
  const issueText = issue => typeof issue === 'string' ? issue : issue.message;
  let focusedPocket = '';
  let inputError = '';

  function compile(part, parameters, metadata) {
    try {
      return { job: compileTreadJob(part, parameters, metadata) };
    } catch (error) {
      return { problem: error.message };
    }
  }

  // SVG uses the same XY geometry as the postprocessor. Only the display Y axis is inverted.
  function drawingBox(job, tongue) {
    let minX = 0, minY = 0, maxX = job.stock.length, maxY = job.stock.width;
    if (tongue) {
      minX = Math.min(...tongue.points.map(p => p.x));
      minY = Math.min(...tongue.points.map(p => p.y));
      maxX = Math.max(...tongue.points.map(p => p.x));
      maxY = Math.max(...tongue.points.map(p => p.y));
    }
    const span = Math.max(maxX - minX, maxY - minY);
    const pad = Math.max(job.parameters.toolDiameter * 2.5, span * 0.05);
    return [minX-pad, -maxY-pad, maxX-minX+2*pad, maxY-minY+2*pad].join(' ');
  }

  function changeSetting(key, input) {
    try {
      const value = validateTreadCamField(key, input.valueAsNumber);
      updateTreadCam(key, value);
      inputError = '';
    } catch (error) {
      input.value = parameters[key];
      inputError = error.message;
    }
  }

  function lipCallout(tongue, rise) {
    const [root, left, right] = tongue.points;
    const x = (left.x + right.x) / 2, y = (left.y + right.y) / 2;
    const depth = Math.hypot(left.x - root.x, left.y - root.y);
    return { x, y, tx: x + (left.x-root.x)*rise/depth, ty: y + (left.y-root.y)*rise/depth };
  }

  function exportProgram(extension) {
    if (!exportable) return;
    const stem = treadFileStem(part, metadata);
    if (extension === 'ngc') downloadFile(stem + '.ngc', writeTreadLinuxCnc(job), 'text/plain');
    else downloadFile(stem + '.cam.json', writeTreadCamJson(job, fit), 'application/json');
  }

  $: metadata = { number: model.project.number, revision: model.project.revision, stairMark: model.stair.mark };
  $: parameters = { ...defaultTreadCam, ...model.treadCam };
  $: result = compile(part, parameters, metadata);
  $: job = result.job;
  $: fit = job ? verifyTreadFit(part, workshop, model.cam, job) : null;
  $: setupIssues = (fit?.issues ?? []).map(issueText).filter(message =>
    !fit.connections.some(c => c.status === 'blocked' && message === c.beamId + ' · ' + c.message));
  $: grooveResults = riserFaceResults(part,model,workshop.riserJoinery?.issues);
  $: exportable = !!job && !grooveResults.some(r=>r.problem) && (fit?.status === 'pass' || fit?.status === 'unconnected');
  $: tongue = job?.tongues.find(t => t.pocketId === focusedPocket);
  $: shoulder = job?.reliefs.find(relief => tongue ? relief.pocketId === tongue.pocketId : relief.pocketId);
  $: detailTongue = job?.tongues.find(t => t.pocketId === shoulder?.pocketId);
  $: detailSize = job && job.parameters.toolDiameter * 7;
  $: detailBox = shoulder && [shoulder.corner.x - detailSize/2, -shoulder.corner.y - detailSize/2, detailSize, detailSize].join(' ');
  $: box = job && drawingBox(job, tongue);
  $: axisSize = job && Math.max(job.stock.length, job.stock.width) * 0.045;
</script>

{#snippet profile()}
  <rect class="stock" x="0" y="0" width={job.stock.length} height={job.stock.width}/>
  <polygon class="board" points={points(job.contour)}/>
  {#each job.tongues as t}
    <polygon class="lip" class:focused={t.pocketId === tongue?.pocketId} points={points(t.points)}><title>Insteeklip voor {t.beamId}</title></polygon>
  {/each}
  <polyline class="nose" points={points(job.nose)}/>
  <polyline class="sweep" stroke-width={parameters.toolDiameter} points={points(job.path)}/>
  <polyline class="path" points={points(job.path)}/>
  {#each job.reliefs as relief}
    <circle class="relief" cx={relief.center.x} cy={relief.center.y} r={relief.radius}/>
  {/each}
{/snippet}

<div class="production-view tread-cam">
  <header class="production-head">
    <div><span class="eyebrow">CNC · BUITENCONTOUR</span><h1>{part.id}</h1><p>{part.name} · bovenzijde boven · LinuxCNC · 3 assen</p></div>
    <div class="header-actions"><button class="action-btn" onclick={() => backToSheet(part.id)}>Naar tredeblad</button>
      <button class="action-btn" disabled={!job} onclick={() => window.print()}>Opstelblad / PDF</button></div>
  </header>

  {#if job}
    {#if job.secondaryOperation}
      <p class="nose-operation"><b>Vervolg op contourprogramma</b> · {job.secondaryOperation.instruction} Behoud de volle dikte van de insteeklippen.</p>
    {/if}
    <section class="drawing">
      <header class="drawing-header">
        <div><h2>Opspanning G54</h2><p>Werkstuk {mm(job.stock.length)} × {mm(job.stock.width)} × {mm(job.stock.thickness)} mm</p></div>
        {#if job.tongues.length}
          <label for="tread-cam-detail">Weergave
            <select id="tread-cam-detail" value={tongue?.pocketId ?? ''} onchange={e => focusedPocket = e.currentTarget.value}>
              <option value="">Volledige trede</option>
              {#each job.tongues as t, i}<option value={t.pocketId}>Lip {i+1} · {t.beamId}</option>{/each}
            </select>
          </label>
        {/if}
      </header>
      <div class="print-view">{tongue ? 'Detail insteeklip · ' + tongue.beamId : 'Gehele productiecontour'}</div>
      <div class="plots" class:with-detail={shoulder}>
      <svg class="overview" viewBox={box} preserveAspectRatio="xMidYMid meet" role="img" aria-label={'Tredecontour en gereedschapsbaan ' + part.id}>
        <g transform="scale(1 -1)">
          {@render profile()}
          {#if !tongue}
            <path class="datum" d={'M0 '+axisSize+'V0H'+axisSize+'m-'+axisSize*0.2+' '+axisSize*0.1+'L'+axisSize+' 0l-'+axisSize*0.2+' -'+axisSize*0.1+'M-'+axisSize*0.1+' '+axisSize*0.8+'L0 '+axisSize+'l'+axisSize*0.1+' -'+axisSize*0.2}/>
          {/if}
        </g>
        {#if !tongue}
          <text class="datum-label" x="0" y={axisSize*0.56} font-size={axisSize*0.38}>G54 · 0,0</text>
          <text class="datum-label" x={axisSize*1.12} y={axisSize*0.1} font-size={axisSize*0.38}>X</text>
          <text class="datum-label" x={-axisSize*0.5} y={-axisSize} font-size={axisSize*0.38}>Y</text>
          {#each job.tongues as t, i}
            {@const tag = lipCallout(t, axisSize * 0.62)}
            <line class="callout" x1={tag.x} y1={-tag.y} x2={tag.tx} y2={-tag.ty}/>
            <circle class="lip-index" cx={tag.tx} cy={-tag.ty} r={axisSize*0.22}/>
            <text class="lip-text" x={tag.tx} y={-tag.ty} font-size={axisSize*0.32} dominant-baseline="central" text-anchor="middle">{i+1}</text>
          {/each}
        {/if}
      </svg>
      {#if shoulder}
        <figure class="magnifier">
          <figcaption>Schouderdetail · {detailTongue.beamId}</figcaption>
          <svg viewBox={detailBox} preserveAspectRatio="xMidYMid slice" role="img" aria-label={'Schouderontlasting voor ' + detailTongue.beamId}>
            <g transform="scale(1 -1)">{@render profile()}</g>
          </svg>
        </figure>
      {/if}
      </div>
      <div class="legend">
        <span><i class="key-nose"></i>Voorrand</span>{#if job.tongues.length}<span><i class="key-lip"></i>Insteeklip</span>{/if}
        <span><i class="key-path"></i>Freesbaan Ø{mm(parameters.toolDiameter)}</span>
        {#if job.reliefs.length}<span><i class="key-relief"></i>Schouderontlasting</span>{/if}
      </div>
    </section>
  {/if}

  <section class="fit-result" class:blocked={fit?.status === 'blocked' || result.problem} aria-live="polite">
    <h2>{part.newelJoints?.length?'Passing van de tredeaansluitingen':'Passing in de wanghuizen'}</h2>
    {#if result.problem}<p role="status">{result.problem}</p>
    {:else if fit}
      <p>{fit.status === 'blocked' ? 'Freesuitvoer geblokkeerd. Pas de onderstaande verbinding of instelling aan.' : fit.message}</p>
      {#if setupIssues.length}<ul>{#each setupIssues as issue}<li>{issue}</li>{/each}</ul>{/if}
      {#each fit.newels??[] as joint}
        <p><b>{joint.postId}</b> · {joint.requiresFinishing?'Hoogtespeling per rand '+mm(joint.edgeClearance)+' mm. Steek het voorgefreesde spilhuis na volgens het spilblad.':'Stuikend tegen de spil.'}</p>
      {/each}
      {#if fit.connections?.length}
        <table class="connections">
          <thead><tr><th>Insteeklip / wang</th><th>Speling per rand¹</th><th>Ruimte achter lip</th><th>Passing</th></tr></thead>
          <tbody>{#each fit.connections as connection, i}
            <tr>
              <td><button class:current={tongue?.pocketId === connection.pocketId} aria-pressed={tongue?.pocketId === connection.pocketId} onclick={() => focusedPocket = focusedPocket === connection.pocketId ? '' : connection.pocketId}>Lip {i+1} · {connection.beamId}</button></td>
              <td>{Number.isFinite(connection.edgeClearance) ? mm(connection.edgeClearance) + ' mm' : '—'}</td>
              <td>{Number.isFinite(connection.depthClearance) ? mm(connection.depthClearance) + ' mm' : '—'}</td>
              <td>{connection.status === 'pass' ? 'Past' : connection.message}</td>
            </tr>
          {/each}</tbody>
        </table>
        <p class="measurement-note">¹ Kleinste nominale speling, gemeten in het wangvlak.</p>
      {/if}
    {/if}
  </section>

  <section class="setup">
    <h2>Gereedschap en opspanning</h2>
    <div class="controls">
      {#each fields as [key,label,unit,step]}
        <label for={'tread-cam-'+key}>{label} <small>{unit}</small>
          <input id={'tread-cam-'+key} type="number" min={treadCamRanges[key][0]} max={treadCamRanges[key][1]}
            {step} value={parameters[key]} onchange={e => changeSetting(key, e.currentTarget)} />
          <b class="print-value">{mm(parameters[key])}</b>
        </label>
      {/each}
    </div>
    {#if inputError}<p class="input-error" role="alert">{inputError}</p>{/if}
    <p>Leg de bovenzijde boven en zet G54 op de linkeronderhoek van het werkstuk inclusief opspanrand. X loopt langs de voorrand en de nerf. Z0 ligt op het bovenvlak.</p>
    {#if job}<p class="depth-readout">{job.levels.length} dieptegangen · bodem Z{mm(job.levels.at(-1))} mm · doorsteek {mm(parameters.breakthrough)} mm in de offerplaat.</p>{/if}
    <p>Frees op een offerplaat met een centrumsnijdende frees. Houd trede en resthout afzonderlijk vast met vacuüm tijdens de doorlopende laatste gang. Stel G54 in met het gemonteerde gereedschap, zonder lengtecorrectie of extra G52/G92-verschuiving.</p>
  </section>

  <RiserGrooveSheet results={grooveResults} {model} {downloadFile}/>
  <div class="exports">
    <button class="action-btn primary" disabled={!exportable} onclick={() => exportProgram('ngc')}>Tredeprogramma (.ngc)</button>
    <button class="action-btn" disabled={!exportable} onclick={() => exportProgram('json')}>Trede-CAM (.json)</button>
  </div>
</div>

<style>
  .tread-cam { max-width: 100%; }
  .nose-operation { grid-column:1/-1; padding:6px 10px; border-left:3px solid var(--oa-accent); }
  .tread-cam h2 { font: 600 13px var(--oa-font-heading); margin: 0; }
  .tread-cam p { font: 11px/1.5 var(--oa-font-body); color: var(--oa-text-secondary); }
  .drawing { background: var(--oa-panel); border: 1px solid var(--oa-border); padding: 12px; }
  .drawing-header, .legend, .exports,.header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
  .drawing-header { justify-content: space-between; gap: 8px; }
  .drawing-header label { display: flex; align-items: center; gap: 6px; }
  .plots { display: grid; align-items: center; gap: 10px; margin: 8px 0; }
  .plots.with-detail { grid-template-columns: minmax(0,3fr) minmax(90px,1fr); }
  .overview { width: 100%; height: clamp(168px, 25vh, 286px); display: block; }
  .magnifier { border: 1px solid var(--oa-border-subtle); background: #faf8f3; }
  .magnifier figcaption { background: var(--oa-panel); padding: 4px 6px; color: var(--oa-text-secondary); font: 10px var(--oa-font-body); }
  .magnifier svg { display: block; width: 100%; height: clamp(75px, 12vh, 145px); }
  .stock { fill: #faf8f3; stroke: #8e877a; stroke-dasharray: 5 3; }
  .board { fill: #eddfc4; stroke: #715d41; }
  .lip { fill: #a4d4c4; stroke: #28715b; }
  .lip.focused { fill: #82c7b1; }
  .stock,.board,.lip,.nose,.path,.datum,.relief { vector-effect: non-scaling-stroke; }
  .nose { stroke: #aa542f; stroke-width: 2; fill: none; }
  .sweep { stroke: #30777a; opacity: .26; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .path { stroke: #235e65; stroke-width: .85; fill: none; }
  .relief { fill: none; stroke: #a54d17; stroke-width: 1; }
  .datum { fill: none; stroke: #223438; stroke-width: 1.4; }
  .datum-label { fill: #223438; font-family: var(--oa-font-mono); }
  .callout,.lip-index { stroke: #376e5b; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .lip-index { fill: #f2faf6; } .lip-text { fill: #244a3d; font-family: var(--oa-font-mono); }
  .legend { color: var(--oa-text-secondary); font-size: 10px; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend i { display: inline-block; width: 13px; height: 4px; }
  .key-nose { background: #aa542f; } .key-lip { background: #77b49d; }
  .key-path { background: #30777a; } .key-relief { border: 1px solid #a54d17; border-radius: 9px; }
  .fit-result { padding: 8px 10px; margin: 10px 0 14px; border-left: 3px solid #497a6b; background: var(--oa-panel); }
  .fit-result.blocked { border-color: #b7602e; }
  .fit-result p, .setup p { margin-top: 4px; }
  .fit-result ul { padding-left: 16px; font-size: 11px; }
  .connections { width: 100%; margin-top: 6px; border-collapse: collapse; text-align: left; font-size: 10px; }
  .connections th { font-weight: 500; color: var(--oa-text-secondary); }
  .connections th,.connections td { border-bottom: 1px solid var(--oa-border-subtle); padding: 3px 5px 3px 0; }
  .fit-result .measurement-note { font-size: 10px; }
  .connections button { color: var(--oa-accent-text); font-size: 11px; text-decoration: underline; text-underline-offset: 2px; }
  .connections .current { font-weight: 600; }
  .controls { display: grid; grid-template-columns: repeat(auto-fit,minmax(120px,1fr)); gap: 6px 10px; margin: 8px 0; }
  .tread-cam label { color: var(--oa-text-secondary); font-size: 11px; }
  .tread-cam small { color: var(--oa-text-muted); }
  .tread-cam input, .tread-cam select { min-width: 0; padding: 3px 6px; border-radius: 3px; border: 1px solid var(--oa-border); background: var(--oa-field); }
  .controls input { width: 100%; display: block; margin-top: 2px; }
  .setup p { max-width: 90ch; }
  .setup .depth-readout { color: var(--oa-text); font-weight: 600; }
  .setup .input-error { color: #93441a; }
  .exports { margin-top: 12px; }
  .exports .primary { border-color: var(--oa-accent); color: var(--oa-accent-text); }
  .exports button:disabled { opacity: .5; }
  .print-value,.print-view { display: none; }
  @media print {
    :global(body:has(.tread-cam)),:global(.editor-area:has(.tread-cam)) { background: white; }
    :global(.editor-area:has(.tread-cam) > .tread-picker) { display: none; }
    .header-actions,.exports,.drawing-header label,.controls input { display: none; }
    .print-value,.print-view { display: block; }
    .print-view { font-size: 10px; margin-top: 2px; }
    .tread-cam { overflow: visible; display: grid; grid-template-columns: 5fr 6fr; gap: 5px 18px; background: white; }
    .production-head,.drawing { grid-column: 1 / -1; }
    .tread-cam .production-head { margin-bottom: 4px; }
    .drawing { padding: 6px; }
    .plots { margin: 1px 0; }
    .overview { height: 53mm; }
    .magnifier svg { height: 30mm; }
    .fit-result { margin: 2px 0; padding: 4px 8px; align-self: start; }
    .controls { grid-template-columns: repeat(3, 1fr); margin: 3px 0; }
    .tread-cam p { line-height: 1.3; }
    .connections button { text-decoration: none; color: inherit; font: inherit; }
    .drawing,.fit-result,.controls { break-inside: avoid; }
  }
</style>
