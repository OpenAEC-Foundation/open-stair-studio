<script>
  import {connectionDrawing,connectionStatus,formatValue,statusNames} from './connection-drawing.js';
  export let assembly, well, project, connection;
  $: drawing=connectionDrawing(assembly,well,connection);
  $: checks=connection.checkIds.map(id=>assembly.structural.checks.find(c=>c.id===id)).filter(Boolean);
  $: status=connectionStatus(checks);
</script>

{#if drawing}
<article class="connection-sheet" aria-label={'Werkplaatsblad '+connection.id}>
  <header><div><small>OPEN STAIR STUDIO · WERKPLAATSTEKENING</small><h2>{connection.label}</h2></div>
    <div class="stamp"><strong>{assembly.instance.mark} / {connection.id}</strong><span>{project.number} · rev. {project.revision} · bouwlaag {assembly.instance.storey}</span></div></header>
  <p class="basis">{project.name} · {connection.note || 'Aansluitdetail uit het trapmodel.'}</p>
  {#if connection.ground}<p class="basis">Ondergrond {connection.ground.type} · {connection.ground.grade||'klasse open'} · randafstand {formatValue(connection.ground.edgeMm)} mm · h.o.h. {formatValue(connection.ground.spacingMm)} mm · N,Rd {formatValue(connection.ground.tensionRd)} kN · V,Rd {formatValue(connection.ground.shearRd)} kN · {connection.ground.reference||'productrapport open'}</p>
  {:else if connection.checkIds.some(id=>id.endsWith('-ondergrond'))}<p class="basis">Ondergrond en ankerweerstand per groep open.</p>{/if}
  <div class="drawings">{#each drawing.views as view}
    {@const hx=view.horizontal}{@const vz=view.vertical}
    <figure><figcaption>{view.label} · {view.a.toUpperCase()}{view.b.toUpperCase()}</figcaption>
      <svg viewBox="0 0 340 212" role="img" aria-label={view.label+' '+connection.label}>
        <svg aria-hidden="true" x="12" y="12" width="310" height="173" viewBox="12 12 310 173" overflow="hidden">
          {#each view.lines as line}<path d={line.path} class:accent={line.focus} class:anchor={line.anchor}/>{/each}
          {#each view.marks as m}<g class="mark"><path d={'M'+(m.x-4)+' '+m.y+'h8M'+m.x+' '+(m.y-4)+'v8'}/><text x={m.x+5} y={m.y-5}>{m.number}</text></g>{/each}
        </svg>
        <g class="dim"><path d={'M'+hx.start+' 188H'+hx.end+'M'+hx.start+' 184v8M'+hx.end+' 184v8'}/>
          <text x={(hx.start+hx.end)/2} y="204" text-anchor="middle">{hx.label}</text>
          <path d={'M326 '+vz.start+'V'+vz.end+'M322 '+vz.start+'h8M322 '+vz.end+'h8'}/>
          <text transform={'translate(337 '+(vz.start+vz.end)/2+') rotate(-90)'} text-anchor="middle">{vz.label}</text>
        </g>
      </svg></figure>
  {/each}</div>
  <p class="caption">Maten in mm · traplokale assen · peil Z = 0 op vertrekbouwlaag. Maatlijnen geven de buitenmaat van het detail of de aangegeven hartafstand.</p>
  <div class="sheet-data"><div>
  {#if drawing.anchors.length}
    <table aria-label="Ankerharten"><thead><tr><th>Hart</th><th>Ankermerk</th><th>Asrichting</th><th>Hartlijncoördinaten in mm</th></tr></thead>
      <tbody>{#each drawing.anchors as anchor}<tr><td>{anchor.number}</td><td>{anchor.id}</td><td>{anchor.axis.toUpperCase()}</td><td>{['x','y','z'].filter(a=>a!==anchor.axis).map(a=>a.toUpperCase()+' '+formatValue(anchor.center[a])).join(' · ')}</td></tr>{/each}</tbody>
    </table>
    <p class="basis">{[...new Set(drawing.anchors.map(a=>'Ø'+formatValue(a.diameterMm)+' mm · schacht '+formatValue(a.lengthMm)+' mm · inbedding '+formatValue(a.embedMm)+' mm'))].join(' / ')}</p>
  {/if}
  <h3>Onderdelen</h3>
  <div class="register">{#each drawing.parts as p}<div><strong>{p.id}</strong> · {p.label}</div>{/each}</div>
  </div><div>
  <h3>Verbindingstoetsen <span class:failed={status==='fail'}>{statusNames[status]}</span></h3>
  <table aria-label="Verbindingstoetsen"><thead><tr><th>Deeltoets</th><th>Rekenwaarde</th><th>Grenswaarde</th><th>Status</th></tr></thead>
    <tbody>{#each checks as c}<tr><td>{c.label}</td><td>{formatValue(c.demand)} {c.unit??''}</td><td>{formatValue(c.capacity)} {c.unit??''}</td><td class:failed={c.status==='fail'}>{statusNames[c.status]}</td></tr>{/each}</tbody></table>
  </div></div>
</article>
{/if}
<style>
  .connection-sheet{background:white;color:#1f2f38;margin:12px auto;padding:clamp(12px,2.6vw,30px);max-width:1020px;font:12px/1.45 var(--oa-font-body);border:1px solid #bac6cb;}
  header{display:flex;justify-content:space-between;align-items:baseline;gap:14px;border-bottom:2px solid #375664;padding-bottom:8px;}small{font:600 10px var(--oa-font-mono);letter-spacing:.05em;color:#476472}
  h2{margin:3px 0 0;font:600 21px var(--oa-font-heading)}.stamp{display:grid;text-align:right}.stamp strong,.register strong{font-family:var(--oa-font-mono);font-size:11px}
  .basis,.caption{margin:7px 0;font-size:11px}.caption{color:#455b65}.drawings{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  figure{margin:0;border:1px solid #bbc9d1;min-width:0}figcaption{padding:4px 8px;background:#edf2f3;font-weight:600}svg{display:block;width:100%}svg svg{width:310px}
  path{fill:none;stroke:#8799a1;stroke-width:.65}.accent{stroke:#1b303a;stroke-width:.95}.anchor,.mark path{stroke:#176f80;stroke-width:1.05}.dim path{stroke:#263e4e;stroke-width:.7}
  svg text{fill:#183d4c;font:10px var(--oa-font-mono);paint-order:stroke;stroke:#fff;stroke-width:1.4px}.mark text{font-weight:bold}
  h3{font-size:13px;margin:10px 0 4px}h3 span{float:right;font-size:11px}.failed{color:#982d23;font-weight:650}
  table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;border-bottom:1px solid #d8dfe2;padding:3px 5px;overflow-wrap:anywhere}th{background:#eef2f3}
  .register{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 10px;font-size:11px;overflow-wrap:anywhere}
  @media print{.sheet-data{display:grid;grid-template-columns:1.1fr 1fr;gap:5mm}.sheet-data>div{min-width:0}.sheet-data h3{margin-top:1mm}.sheet-data .register{font-size:7pt;line-height:1.2}.sheet-data h3 span{float:none;margin-left:2mm}.sheet-data th,.sheet-data td{font-size:7pt}}
  @media print{.connection-sheet{margin:0;padding:0;border:0;max-width:none;font-size:8pt;break-after:page}.connection-sheet:last-child{break-after:auto}h2{font-size:15pt}.drawings{gap:4mm}figure svg{max-height:43mm}.basis,.caption,.register,table,.register strong,.stamp strong{font-size:7pt}h3,figcaption{break-after:avoid}tr,.register div,figure,header{break-inside:avoid}td,th{padding:.35mm 1.2mm}}
</style>
