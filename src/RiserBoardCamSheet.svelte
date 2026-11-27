<script>
  import { mm, stockText } from './timber-sheet.js';
  import { checkRiserBoardFit } from './riser-board-fit.js';
  import { compileRiserBoardJob, writeRiserBoardLinuxCnc } from './riser-board-cam.js';
  import { camRanges, validateCamField } from './housing-cam.js';
  export let part, model, geometry, downloadFile, updateRiserCam, updateRiserDetailCam;

  function compile(board, workshop, project) {
    try {
      const fit = checkRiserBoardFit(board,workshop,project);
      if (fit.problems.length) return {problem:fit.problems.join(' ')};
      if (board.fabricationIssue) return {problem:board.fabricationIssue};
      const metadata = {number:project.project.number,revision:project.project.revision,stairMark:project.stair.mark,
        turnDirection:project.stair.turnDirection,nosing:project.stair.nosing};
      return {fit,job:compileRiserBoardJob(board,project.riserCam,metadata,workshop.riserJoinery?.issues??[],project.riserDetailCam)};
    } catch (error) { return {problem:error.message}; }
  }
  const fields=[
    ['toolDiameter','Freesdiameter','mm',0.1], ['fluteLength','Snijlengte','mm',1],
    ['stepDown','Diepte per gang','mm',0.1], ['stepoverPercent','Baanstap','% van Ø',1],
    ['cutFeed','Snijvoeding','mm/min',10], ['plungeFeed','Insteekvoeding','mm/min',10],
    ['spindleSpeed','Toerental','omw/min',100], ['safeZ','Vrijloophoogte','mm',1]
  ];
  let inputError='', selectedSetup='', toolGroup='main';
  $: toolSettings = toolGroup==='detail'?model.riserDetailCam:model.riserCam;
  function changeField(key,input) {
    try {
      const value=validateCamField(key,input.valueAsNumber);
      if(toolGroup==='detail') updateRiserDetailCam(key,value);
      else updateRiserCam(key,value);
      inputError='';
    } catch (error) {
      input.value=toolSettings[key];
      inputError=error.message;
    }
  }
  $: result = compile(part,geometry,model);
  $: job = result.job;
  $: activeSetup = job?.setups.find(s=>s.id===selectedSetup)??job?.setups[0];
  $: hand = model.stair.type==='straight' ? '' : (model.stair.turnDirection==='right'?'Rechtsom':'Linksom')+' bij oplopen';
  const loop=points=>points.map(p=>p.x+','+p.y).join(' ');
  const component=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:5,useGrouping:false});
  const vector=axis=>[axis.x,axis.y,axis.z].map(n=>component.format(Math.abs(n)<.000005?0:n)).join(' / ');
  const heightOnMachine=(stock,axis)=>Math.abs(axis.x)*stock.thickness+Math.abs(axis.y)*stock.length+Math.abs(axis.z)*stock.height;
  // End-face measurements are taken from the original blank. The G54 frame
  // changes when the same compound end is offered to the spindle again.
  function endDetail(board,stock,setup) {
    if(!setup.endEdge?.length || !board.planPoints) return null;
    const f=board.riserFrame;
    const project=p=>{
      const dx=p.x-f.origin.x,dy=p.y-f.origin.y;
      return {x:dx*f.yAxis.x+dy*f.yAxis.y, y:dx*f.xAxis.x+dy*f.xAxis.y};
    };
    const blank=stock.corners.map(project);
    const zeroX=Math.min(...blank.map(p=>p.x)),zeroY=Math.min(...blank.map(p=>p.y));
    const fromBlank=p=>({x:p.x-zeroX,y:p.y-zeroY});
    const plan=board.planPoints.map(project).map(fromBlank);
    const edge=setup.endEdge.map(p=>fromBlank({x:p.y,y:p.x})).sort((a,b)=>a.y-b.y);
    const left=Math.min(...edge.map(p=>p.x))-stock.thickness*.7;
    const right=Math.max(...edge.map(p=>p.x))+stock.thickness*.7;
    return {plan,edge,viewBox:[left,-stock.thickness-3,right-left,stock.thickness+6].join(' ')};
  }
  function preview(setup) {
    const bottom=setup.paths.reduce((z,path)=>Math.min(z,path.z),Infinity);
    const passes=setup.paths.filter(path=>Math.abs(path.z-bottom)<.0001);
    const cut=passes.map(path=>'M'+path.points.map(p=>p.x+' '+p.y).join('L')).join('');
    let xmin=0,xmax=setup.width,ymin=0,ymax=setup.height;
    for(const points of [setup.outline,...passes.map(path=>path.points)]) for(const p of points) {
      xmin=Math.min(xmin,p.x); xmax=Math.max(xmax,p.x);
      ymin=Math.min(ymin,p.y); ymax=Math.max(ymax,p.y);
    }
    const pad=Math.max(5,(xmax-xmin)*.015,(ymax-ymin)*.015);
    return {cut,bottom,viewBox:[xmin-pad,-ymax-pad,xmax-xmin+2*pad,ymax-ymin+2*pad].join(' ')};
  }
  $: drawings = job?.setups.map(preview)??[];
  function save(setup) {
    const program=writeRiserBoardLinuxCnc(job,setup);
    downloadFile(setup.fileStem+'.ngc',program,'text/plain');
  }
</script>

<div class="board-cam" aria-label="CNC-stootbordblad">
  <div class="cam-tools">
    {#if activeSetup}
      <label>Opspanning<select aria-label="Opspanning" value={activeSetup.id} onchange={e=>selectedSetup=e.currentTarget.value}>
        {#each job.setups as s,i}<option value={s.id}>{i+1}. {s.label} · Ø {mm((s.parameters??job.parameters).toolDiameter)}</option>{/each}
      </select></label>
    {/if}
    <details>
      <summary>Gereedschap en snijgegevens</summary>
      <label class="tool-select">Gereedschap<select aria-label="Gereedschap" bind:value={toolGroup}>
        <option value="main">Hoofdfrees</option><option value="detail">Detailfrees voor kopvlakken</option>
      </select></label>
      <div class="parameters">
        {#each fields as [key,name,unit,step]}
          <label>{name} ({unit})<input type="number" {step} min={camRanges[key][0]} max={camRanges[key][1]}
            value={toolSettings[key]} onchange={e=>changeField(key,e.currentTarget)} /></label>
        {/each}
      </div>
      {#if inputError}<p role="alert">{inputError}</p>{/if}
    </details>
    {#if job?.setups.length}<button class="action-btn" onclick={() => window.print()}>CNC-bladen PDF</button>{/if}
  </div>
  {#if result.problem}
    <div class="problem" role="status"><h2>{part.id} · CNC-stootbordblad</h2><p>{result.problem}</p></div>
  {:else if !job.setups.length}
    <div class="stock-only"><h2>{part.id} · CNC-stootbordblad</h2><p>De rechthoekige ruwplank van {stockText([job.stock.length,job.stock.height,job.stock.thickness])} mm heeft al de getekende eindvorm. Er zijn geen freesbanen.</p></div>
  {:else}
    {#each job.setups as setup,i}
      {@const draw=drawings[i]}
      {@const end=endDetail(part,job.stock,setup)}
      {@const cam=setup.parameters??job.parameters}
      <section class="board-setup" class:inactive={setup!==activeSetup}>
        <header class="identity">
          <div><p>{model.project.number} · {model.project.name} · revisie {model.project.revision}</p><h2>{part.id} · CNC-stootbordblad</h2></div>
          <div><b>Opspanning {i+1} / {job.setups.length}</b><p>{hand}{hand?' · ':''}neuspositie {mm(model.stair.nosing)} mm</p></div>
        </header>
        <div class="setup-title"><h3>{setup.label}</h3><button class="action-btn" onclick={() => save(setup)}>LinuxCNC-programma (.ngc)</button></div>
        <dl class="metrics">
          <div><dt>Ruwe plank L × H × D (mm)</dt><dd>{stockText([job.stock.length,job.stock.height,job.stock.thickness])}</dd></div>
          <div><dt>{setup.toolRole==='detail'?'Detailfrees':'Hoofdfrees'} · centrumsnijdend</dt><dd>Ø {mm(cam.toolDiameter)} mm · snijlengte {mm(cam.fluteLength)} mm</dd></div>
          <div><dt>Laagste Z in G54</dt><dd>{mm(draw.bottom)} mm</dd></div>
          <div><dt>Benodigde snijlengte in hout</dt><dd>{mm(setup.depth)} mm</dd></div>
          <div><dt>Toerental</dt><dd>{mm(cam.spindleSpeed)} omw/min</dd></div>
        </dl>
        <p>{setup.description}</p>
        <div class:paired={end} class="diagram-grid">
        <figure>
          <svg viewBox={draw.viewBox} role="img" aria-label={setup.label+' · freesbanen in machinecoördinaten'}>
            <g transform="scale(1 -1)">
              <polygon class="outline" points={loop(setup.outline)} />
              {#each setup.islands as island}<polygon class="lip" points={loop(island)}/>{/each}
              <path class="cut" d={draw.cut}/>
              <path class="origin" d="M-3 0H3 M0 -3V3"/>
              <circle class="datum" cx={setup.datum.x} cy={setup.datum.y} r="2.5"/>
            </g>
          </svg>
          <figcaption><span><i class="wood-key"></i>Ruwe plank</span>{#if setup.islands.length}<span><i class="lip-key"></i>Lip</span>{/if}<span><i class="cut-key"></i>Freescentrum op Z {mm(draw.bottom)} mm</span><span>○ Projectie K</span><span>+ Nulpunt G54 · X → · Y ↑</span></figcaption>
        </figure>
        {#if end}
          <figure>
            <svg viewBox={end.viewBox} role="img" aria-label={setup.label+' · kopdetail in bovenaanzicht'}>
              <g transform="scale(1 -1)">
                <polygon class="outline" points={loop(end.plan)}/>
                <polyline class="cut-end" points={loop(end.edge)}/>
                {#each end.edge as p}<circle cx={p.x} cy={p.y} r=".55" class="end-point"/>{/each}
              </g>
            </svg>
            <figcaption><span><i class="end-key"></i>Kopdetail van boven · geprogrammeerd kopvlak</span></figcaption>
          </figure>
        {/if}
        </div>
        <dl class="specs">
          <dt>Programma</dt><dd>{setup.fileStem}.ngc</dd>
          <dt>Referentiekruis K</dt><dd>Markeer K vóór de eerste bewerking op de zichtzijde, op {mm(job.datum.length)} mm vanaf het rechter plankuiteinde bij oplopen en {mm(job.datum.height)} mm vanaf de voet van de ruwe plank.</dd>
          <dt>G54</dt><dd>X0 Y0 op de laagste X- en Y-projectie van de ruwe plank in deze opspanning. Z0 ligt op de hoogste projectie van die plank.</dd>
          <dt>K in deze opspanning</dt><dd>X {mm(setup.datum.x)} · Y {mm(setup.datum.y)} · Z {mm(setup.datum.z)} mm</dd>
          <dt>Opspannen</dt><dd>Klem op de brede plankvlakken in het midden. Draag het bord in de mal en stel de aanslag af vanaf K en de zichtzijde. Houd de baan en de freesuitloop vrij.</dd>
          <dt>Plank in deze stand (X × Y × Z)</dt><dd>{stockText([setup.width,setup.height,heightOnMachine(job.stock,setup.boardAxes.zAxis)])} mm, exclusief mal en gereedschap</dd>
          {#if setup.side && Number.isFinite(setup.angleDeg)}<dt>Spilrichting vanaf haakse kop</dt><dd>{mm(setup.angleDeg)}° vanaf de richting naar de {setup.boardAxes.zAxis.y>0?'linkerkop':'rechterkop'} bij oplopen. Positief draait naar de achterzijde van de plank.</dd>{/if}
          {#if end}<dt>Eindpunten kopvlak</dt><dd>{end.edge.map(p=>mm(p.x)+' / '+mm(p.y)).join(' en ')} mm (lengte / dikte), gemeten vanaf het rechter ruwe uiteinde bij oplopen en de zichtzijde.</dd>{/if}
          <dt>Richting machineassen</dt><dd>X ({vector(setup.boardAxes.xAxis)}) · Y ({vector(setup.boardAxes.yAxis)}) · Z ({vector(setup.boardAxes.zAxis)}). Componenten in de plankrichting zichtzijde naar achterzijde / rechts naar links bij oplopen / voet naar kop.</dd>
          <dt>Snijgegevens</dt><dd>{mm(cam.stepDown)} mm per gang · baanstap {mm(cam.stepoverPercent)}% van Ø · snijvoeding {mm(cam.cutFeed)} mm/min · insteekvoeding {mm(cam.plungeFeed)} mm/min · vrijloop Z +{mm(cam.safeZ)} mm</dd>
        </dl>
        {#if i===0 && result.fit.connections.length}
          <h3>Passing met de ontvangende onderdelen</h3>
          <table><thead><tr><th>Onderdeel</th><th>Groef (mm)</th><th>Lip (mm)</th><th>Vrije ruimte op de bodem (mm)</th></tr></thead><tbody>
          {#each result.fit.connections as joint}<tr><td>{joint.hostId}</td><td>{mm(joint.grooveDepth)}</td><td>{mm(joint.tongueDepth)}</td><td>{mm(joint.endClearance)}</td></tr>{/each}
          </tbody></table>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .board-cam{margin:10px auto;max-width:1160px;color:#25373d}
  .cam-tools{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 8px;padding:8px 14px;background:var(--oa-panel);color:var(--oa-text)}
  details{flex:1;min-width:0}summary{cursor:pointer;padding:4px 0}.parameters{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:6px 12px;margin:7px 0}
  .tool-select{width:fit-content;margin:6px 0}
  label{display:grid;gap:3px;color:var(--oa-text-secondary);font-size:10px}input,select{min-width:0;border:1px solid var(--oa-border);background:var(--oa-field);color:var(--oa-text);padding:4px 6px}
  .board-setup,.problem,.stock-only{background:#fff;padding:14px 16px;margin:0 0 10px;line-height:1.4}
  @media screen{.board-setup.inactive{display:none}}
  .problem{border-left:3px solid #9d4a28}.problem p{margin-bottom:0}
  .identity,.setup-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .identity{border-bottom:2px solid #3d5359;padding-bottom:5px}.identity>div:last-child{text-align:right}
  .identity p{font-size:11px;color:#425860}.identity b{font-size:13px}
  h2{font:650 21px var(--oa-font-heading);margin:3px 0}h3{font:600 15px var(--oa-font-heading);margin:7px 0 4px}p{margin:4px 0}
  .metrics{display:flex;flex-wrap:wrap;gap:6px 30px;margin:6px 0 10px}.metrics dt{color:#506267;font-size:10px}.metrics dd{margin:2px 0 0;font-weight:650}
  figure{margin:8px 0;border:1px solid #c5d0d1;background:#fff}svg{display:block;width:100%;height:180px}
  .diagram-grid{display:grid;gap:8px}.diagram-grid.paired{grid-template-columns:minmax(0,1.6fr) minmax(160px,1fr)}
  .cut-end{stroke:#a74d21;stroke-width:2.5;fill:none;vector-effect:non-scaling-stroke}.end-point{fill:#a74d21}.end-key{border-top:3px solid #a74d21}
  .outline,.lip,.cut,.origin,.datum{vector-effect:non-scaling-stroke}.outline{fill:#efdfc5;stroke:#766348}.lip{fill:#add0bf;stroke:#366b54}.cut{stroke:#24638a;stroke-width:.8;fill:none}.origin,.datum{stroke:#244752;stroke-width:1.6;fill:none}
  figcaption{display:flex;justify-content:center;gap:8px 16px;flex-wrap:wrap;margin:4px 0 5px;color:#465a61;font-size:10px}figcaption i{display:inline-block;width:14px;margin:0 4px 3px 0;vertical-align:middle}
  .wood-key{border-top:5px solid #d7be98}.lip-key{border-top:5px solid #77a68c}.cut-key{border-top:2px solid #24638a}
  .specs{display:grid;grid-template-columns:max-content 1fr;gap:3px 12px;font-size:11px;margin:9px 0}.specs dt{font-weight:600}.specs dd{margin:0;overflow-wrap:anywhere}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;text-align:left;font-size:11px}td,th{padding:3px 6px;border-bottom:1px solid #c5d0d1}th{background:#eef1ef}
  @media print{
    .board-cam{max-width:none;margin:0}.board-setup{margin:0;padding:0;print-color-adjust:exact}
    .board-setup+.board-setup{break-before:page}
    .cam-tools,.action-btn{display:none}.identity{padding-bottom:1.5mm}
    h2{font-size:15pt}h3{font-size:11pt}.identity p{font-size:8pt}
    svg{height:44mm}p,.specs,th,td{font-size:8.5pt}.metrics{margin:2mm 0}.specs{margin:2.5mm 0}.board-setup th,.board-setup td{padding:.65mm 1.2mm}
  }
</style>
