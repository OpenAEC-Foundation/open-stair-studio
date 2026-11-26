<script>
  import {
    camRanges, compileHousingJob, defaultCam, housingFileStem,
    validateCamField, writeHousingDxf, writeLinuxCnc
  } from './housing-cam.js';

  export let geometry;
  export let model;
  export let downloadFile;
  export let updateCam;
  export let selectedBeamId = '';
  export let selectedPocketId = '';

  const fields = [
    ['toolDiameter','Freesdiameter','mm',0.1], ['fluteLength','Snijlengte','mm',1],
    ['stepDown','Diepte per gang','mm',0.1], ['stepoverPercent','Baanstap','% van Ø',1],
    ['cutFeed','Snijvoeding','mm/min',10], ['plungeFeed','Insteekvoeding','mm/min',10],
    ['spindleSpeed','Toerental','omw/min',100], ['safeZ','Vrijloophoogte','mm',1]
  ];
  let inputError = '';
  let scope = 'whole-beam';
  $: setups = geometry.housings?.beams ?? [];
  $: setup = setups.find(b => b.id === selectedBeamId) ?? setups.find(b => b.pockets.length) ?? setups[0];
  $: parameters = { ...defaultCam, ...model.cam };
  $: metadata = { number:model.project.number, revision:model.project.revision, stairMark:model.stair.mark };
  $: pocket = setup?.pockets.find(p=>p.id===selectedPocketId) ?? setup?.pockets[0];
  $: onlyPocketId = scope === 'single-pocket' ? pocket?.id ?? '' : '';
  $: result = compile(setup, parameters, metadata, onlyPocketId);
  $: operations = result.job?.operations ?? [];
  $: activeOp = operations.find(op => op.id === selectedPocketId) ?? operations[0];
  $: detail = activeOp ? toolView(activeOp,parameters.toolDiameter) : null;
  const pts = points => points.map(p=>p.x+','+p.y).join(' ');
  function compile(setup, parameters, metadata, id) {
    try { return { job: compileHousingJob(setup,parameters,metadata,id) }; }
    catch (error) { return { problem:error.message }; }
  }
  function toolView(op, diameter) {
    const all = [...op.loop.points, ...op.relief];
    const xs = all.map(p=>p.x), ys = all.map(p=>p.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const pad = Math.max(3,diameter);
    return [minX-pad, -maxY-pad, maxX-minX+2*pad,maxY-minY+2*pad].join(' ');
  }
  function changeSetting(key, event) {
    const input = event.currentTarget;
    try {
      const value = validateCamField(key, key === 'cornerMode' ? input.value : input.valueAsNumber);
      updateCam(key,value);
      inputError = '';
    } catch (error) {
      input.value = parameters[key];
      inputError = error.message;
    }
  }
  function saveFile(ext) {
    if (!setup) return;
    const stem = housingFileStem(setup,metadata,ext === 'dxf' ? '' : onlyPocketId);
    if (ext === 'dxf') {
      downloadFile(stem+'.dxf',writeHousingDxf(setup,metadata),'application/dxf');
    } else if (result.job && ext === 'ngc') {
      downloadFile(stem+'.ngc',writeLinuxCnc(result.job),'text/plain');
    } else if (result.job && ext === 'json') {
      const job = {
        format:'OpenStairStudio.HousingCAM', version:1, units:'mm', ...metadata,
        controller:'LinuxCNC', fixture:'G54', beam:setup.id, side:setup.side, face:'inside',
        datum:'Lower-left of blank envelope. Positive X uphill from the low to the high stair end. Inside face at Z0, cutter above +Z.',
        scope:{type:scope,pocketId:onlyPocketId || null,stockPocketCount:setup.pockets.length},
        programStructure:result.job.subroutines ? 'LinuxCNC numbered O-subroutine per XY path, called at each Z level' : 'Explicit XY path at each Z level',
        ncBlocks:result.job.blocks,
        modelFrame:setup.frame, stock:{length:setup.length,width:setup.width,thickness:setup.thickness},
        outline:setup.outline, parameters,
        operations:result.job.operations.map(op=>({
          id:op.id, type:'pocket', tread:op.treadId, contour:op.loop.points,
          depth:op.depth, zLevels:op.levels, offsetContour:op.ring, cornerReliefCentres:op.relief,
          rasterToolCentres:op.raster
        }))
      };
      downloadFile(stem+'.cam.json',JSON.stringify(job,null,2),'application/json');
    }
  }
</script>

<div class="production-view housing-cam">
  <div class="production-head"><div><span class="eyebrow">CNC · WANGBEWERKING</span><h1>Tredehuizen frezen</h1><p>LinuxCNC · 3 assen · één binnenvlak per opspanning</p></div></div>
  {#if setup}
    <div class="setup">
      <label for="cam-beam">Wang op de machine</label>
      <select id="cam-beam" value={setup.id} onchange={e=>selectedBeamId=e.currentTarget.value}>
        {#each setups as beam}<option value={beam.id}>{beam.id} · {beam.side === 'left' ? 'links' : 'rechts'} · {beam.pockets.length} huizen</option>{/each}
      </select>
      <dl><dt>Boven</dt><dd>Binnenzijde van de wang</dd><dt>Nulpunt G54</dt><dd>X0 Y0 linksonder in de omhullende ruwe plank, Z0 op het binnenvlak. Positieve X volgt de nerf in de stijgrichting van het lage naar het hoge trapuiteinde. Positieve Z wijst naar de spil.</dd></dl>
    </div>
    <div class="controls">
      {#each fields as [key,label,unit,step]}
        <label>{label} <small>{unit}</small><input type="number" min={camRanges[key][0]} max={camRanges[key][1]} {step}
          value={parameters[key]} onchange={e=>changeSetting(key,e)} /></label>
      {/each}
    </div>
    <label for="corner-mode">Binnenhoeken</label>
    <select id="corner-mode" value={parameters.cornerMode} onchange={e=>changeSetting('cornerMode',e)}>
      <option value="dogbone">Dogbone · hoekontlasting voor rechte trede-lip</option>
      <option value="rounded">Rond · nabeitelen of hoeken van de lip afronden</option>
    </select>
    {#if inputError}<p class="problem" role="alert">{inputError}</p>{/if}
    {#if pocket}
      <div class="controls scope">
        <label for="cam-scope">Bewerkingen voor NC en CAM
          <select id="cam-scope" bind:value={scope}>
            <option value="whole-beam">Alle huizen op de wang</option>
            <option value="single-pocket">Alleen geselecteerd huis</option>
          </select>
        </label>
        <label for="cam-pocket">Geselecteerd huis
          <select id="cam-pocket" value={pocket.id} onchange={e=>selectedPocketId=e.currentTarget.value}>
            {#each setup.pockets as item}<option value={item.id}>{item.treadId}</option>{/each}
          </select>
        </label>
      </div>
    {/if}
    {#if activeOp}
      <div class="preview">
        <div><strong>{activeOp.treadId}</strong>
          <p>{activeOp.depth.toLocaleString('nl-NL')} mm diep · {activeOp.levels.length} dieptegangen</p>
          {#if result.job.subroutines}<p>XY-banen met O-code-herhaling · {result.job.blocks.toLocaleString('nl-NL')} NC-regels</p>{/if}
        </div>
        <svg viewBox={detail} role="img" aria-label="Freesbanen voor het geselecteerde tredehuis">
          <g transform="scale(1 -1)">
            <polygon points={pts(activeOp.loop.points)} class="contour" />
            <polyline points={pts(activeOp.raster)} class="raster"/>
            <polygon points={pts(activeOp.ring)} class="raster"/>
            {#each activeOp.relief as p, i}
              <line x1={activeOp.ring[i].x} y1={activeOp.ring[i].y} x2={p.x} y2={p.y} class="raster"/>
              <circle cx={p.x} cy={p.y} r={parameters.toolDiameter/2} class="relief"/>
            {/each}
          </g>
        </svg>
      </div>
    {/if}
    {#if result.problem}<p class="problem" role="status">{result.problem}</p>{/if}
    <div class="exports">
      <button class="action-btn" disabled={!result.job} onclick={()=>saveFile('ngc')}>LinuxCNC-programma (.ngc)</button>
      <button class="action-btn" disabled={!result.job} onclick={()=>saveFile('json')}>CAM-pakket (.json)</button>
      <button class="action-btn" disabled={!setup.pockets.length || setup.issues.some(i=>i.level==='error')} onclick={()=>saveFile('dxf')}>Volledige wang-DXF</button>
    </div>
    <p class="setup-note">Stel G54 in met de gemonteerde, centrumsnijdende vlakfrees en zonder gereedschapslengtecorrectie of extra G52/G92-verschuiving. Controleer de voeding, het toerental en de snijlengte voor het hout en de frees. Leg de klemmen buiten de banen en onder de vrijloophoogte. Simuleer het programma met de machine-instellingen en maak een proefstuk.</p>
  {:else}
    <p>Schakel de infrezingen voor de treden in om de opspanningen te zien.</p>
  {/if}
</div>

<style>
  .housing-cam label { display:block; color:var(--oa-text-secondary); font-size:11px; }
  .housing-cam select, .housing-cam input { width:100%; padding:4px 6px; border:1px solid var(--oa-border); background:var(--oa-field); border-radius:3px; color:var(--oa-text); }
  .housing-cam select { margin:3px 0 8px; }
  .setup { border-bottom:1px solid var(--oa-border); padding-bottom:8px; }
  .setup dl { display:grid; grid-template-columns:max-content 1fr; gap:4px 12px; margin:4px 0; font-size:11px; }
  .setup dd { margin:0; }
  .controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(124px,1fr)); gap:8px 12px; padding:14px 0; }
  .controls small { color:var(--oa-text-muted); }
  .controls input { margin-top:3px; }
  .preview { display:flex; gap:14px; padding:8px; border:1px solid var(--oa-border); align-items:center; margin:10px 0; }
  .preview div { flex:0 1 140px; }
  .preview svg { width:55%; flex:1; height:110px; }
  .contour { fill:#ece1c9; stroke:#614b2e; stroke-width:1.25px; vector-effect:non-scaling-stroke; }
  .raster,.relief { fill:none; stroke:#237668; stroke-width:0.85px; vector-effect:non-scaling-stroke; }
  .relief { stroke:#a34b22; }
  .problem { border-left:3px solid #bd672f; padding-left:8px; }
  .exports { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0 4px; }
  .exports button:disabled { opacity:.45; }
  .setup-note,.preview p { font-size:11px; color:var(--oa-text-secondary); }
</style>
