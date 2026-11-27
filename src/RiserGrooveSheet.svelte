<script>
  import { mm } from './timber-sheet.js';
  import { housingFileStem,writeHousingDxf,writeLinuxCnc } from './housing-cam.js';
  export let results=[],downloadFile,model;
  const points=loop=>loop.map(p=>p.x+','+p.y).join(' ');
  const range=(loop,axis)=>[Math.min(...loop.map(p=>p[axis])),Math.max(...loop.map(p=>p[axis]))].map(mm).join(' – ');
  const oblique = loop => loop.some((a,i) => {
    const b=loop[(i+1)%loop.length];
    return Math.abs(a.x-b.x)>.001 && Math.abs(a.y-b.y)>.001;
  });
  function save({setup,job},extension) {
    if(!job) return;
    const stem=housingFileStem(setup,job.metadata);
    if(extension==='dxf') downloadFile(stem+'.dxf',writeHousingDxf(setup,job.metadata),'application/dxf');
    else downloadFile(stem+'.ngc',writeLinuxCnc(job),'text/plain');
  }
</script>

{#each results as result,index}
  {#if result.setup}
    {@const s=result.setup}
    <section class="groove">
      <header><div><h3>{s.id} · stootbordgroef</h3><p>Opspanning {index+1}/{results.length} · {s.face==='underside'?'Onderzijde boven · kantelen om de X-as':'Bovenzijde boven'} · G54</p></div>
        <div class="commands">
          <button class="action-btn" disabled={!result.job} onclick={()=>save(result,'dxf')}>Groef-DXF</button>
          <button class="action-btn" disabled={!result.job} onclick={()=>save(result,'ngc')}>Groef frezen (.ngc)</button>
        </div></header>
      <svg viewBox={[-15,-15,s.length+30,s.width+30].join(' ')} role="img" aria-label={'Groeven op '+s.id+' · '+(s.face==='underside'?'onderzijde':'bovenzijde')}>
        <g transform={'translate(0 '+s.width+') scale(1 -1)'}>
          <polygon class="blank" points={points(s.outline)}/>
          <polygon class="wood" points={points(s.partContour)}/>
          {#each s.pockets as p}<polygon class="slot" points={points(p.contour)}><title>{p.riserId} · {mm(p.depth)} mm diep</title></polygon>{/each}
          {#if s.nose}<polyline class="nose" points={points(s.nose)}/>{/if}
          <circle cx="0" cy="0" r="3"/>
        </g>
      </svg>
      <table><thead><tr><th>Stootbord</th><th>X van – tot (mm)</th><th>Y van – tot (mm)</th><th>Z bodem (mm)</th></tr></thead>
        <tbody>{#each s.pockets as p}<tr><td>{p.riserId}</td><td>{range(p.contour,'x')}</td><td>{range(p.contour,'y')}</td><td>{mm(-p.depth)}</td></tr>{/each}</tbody></table>
      {#each s.pockets.filter(p=>oblique(p.contour)) as p}
        <p><b>{p.riserId} · hoekpunten G54 (X / Y in mm)</b><br/>{p.contour.map(q=>mm(q.x)+' / '+mm(q.y)).join(' · ')}</p>
      {/each}
      <p>Frees de groeven vóór de buitencontour. Leg het aangegeven vlak boven. Stel X0 Y0 in op de linkeronderhoek van de rechthoekige plank van {mm(s.length)} × {mm(s.width)} mm en Z0 op het houtoppervlak.
        {s.nose?'De blauwe lijn geeft de neus aan.':'X volgt de X-as van het trapmodel.'}
        Frees Ø {mm(model.cam.toolDiameter)} mm · ronde groefeinden.</p>
      {#if result.problem}<p class="issue" role="status">{result.problem}</p>{/if}
    </section>
  {:else}<p class="issue" role="status">{result.problem}</p>{/if}
{/each}
<style>
  .groove{margin:12px 0;padding:10px 12px;border:1px solid var(--oa-border);break-inside:avoid}
  header,.commands{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  h3{font:600 14px var(--oa-font-heading);margin:0}p{font-size:11px;margin:5px 0}
  svg{width:100%;height:125px;display:block;margin:7px auto}
  .blank,.wood,.slot,.nose{vector-effect:non-scaling-stroke}
  .blank{fill:none;stroke:#73818b;stroke-dasharray:4 3}.wood{fill:#efdfc0;stroke:#6b563c}.slot{fill:#96cbbd;stroke:#286d60}.nose{fill:none;stroke:#315b86}
  table{width:100%;border-collapse:collapse;font-size:11px;text-align:left}th,td{padding:4px;border-bottom:1px solid #cbd2d3}
  .issue{color:#873f23}
  @media print {
    .commands{display:none}
    .groove{padding:2mm 3mm;margin:2mm 0;print-color-adjust:exact}
    svg{height:34mm;margin:1.5mm auto}
    p{margin:1mm 0}
  }
</style>
