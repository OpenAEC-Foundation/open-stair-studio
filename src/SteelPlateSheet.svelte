<script>
  import {createSteelPlateDxf,steelPlatePattern} from './steel-plate-dxf.js';
  export let assembly,project,downloadFile,printSheet;
  let selectedId='';
  $: plates=assembly.parts.filter(part=>part.platePattern);
  $: selected=plates.find(part=>part.id===selectedId)??plates[0];
  $: profile=selected?steelPlatePattern(selected):null;
  const points=loop=>loop.map(([x,z])=>`${x},${z}`).join(' ');
  const mm=n=>Number(n).toLocaleString('nl-NL',{maximumFractionDigits:1});
  function exportDxf(){
    downloadFile(`${assembly.instance.mark}-${selected.id}-plaatwang.dxf`,
      createSteelPlateDxf(selected),'application/dxf');
  }
</script>
{#if profile}
  <article class="steel-plate-sheet" aria-label={'Plaatwangblad '+selected.id}>
    <header><div><small>OPEN STAIR STUDIO · PLAATWANGBLAD</small><h2>{assembly.instance.mark} · {selected.label}</h2></div>
      <div class="stamp"><strong>{selected.id}</strong><span>{project.number} · rev. {project.revision}</span></div></header>
    <div class="tools"><label>Wang <select value={selected.id} onchange={e=>selectedId=e.currentTarget.value}>
      {#each plates as plate}<option value={plate.id}>{plate.id} · {plate.label}</option>{/each}
    </select></label><button class="action-btn" onclick={exportDxf}>Nominale plaat-DXF</button>
      <button class="action-btn" onclick={printSheet}>Blad afdrukken / PDF</button></div>
    <p>Lokale plaatprojectie: X langs de vlucht, Z vanaf onderkant voetregel. Dit is geen buitenaanzicht; de getoonde opleghoeken zitten aan de binnenzijde van de gekozen wang. De witte opening is een echte uitsparing.</p>
    <figure><svg viewBox={[-45,-45,profile.stockLength+90,profile.stockHeight+90].join(' ')}
        role="img" aria-label={'Buitencontour en opening van '+selected.id}>
      <g transform={'translate(0 '+profile.stockHeight+') scale(1 -1)'}>
        <rect x="0" y="0" width={profile.stockLength} height={profile.stockHeight} class="blank"/>
        <polygon points={points(profile.outer)} class="plate"/>
        <polygon points={points(profile.hole)} class="hole"/>
        {#each profile.cleatReferences as ref}<line x1={ref.x0} y1={ref.z} x2={ref.x1} y2={ref.z} class="cleat"><title>Trede {ref.tread} · opleghoekreferentie</title></line>{/each}
      </g>
    </svg><figcaption>Buitencontour en opening · mm · lokaal zijprofiel</figcaption></figure>
    <dl><div><dt>Bruto plaatmaat</dt><dd>{mm(profile.stockLength)} × {mm(profile.stockHeight)} × {mm(profile.thickness)} mm</dd></div>
      <div><dt>Bruto plaatmassa zonder zaagtoeslag</dt><dd>{mm(profile.stockMassKg)} kg</dd></div>
      <div><dt>Netto massa met uitsparing</dt><dd>{mm(profile.netMassKg)} kg</dd></div>
      <div><dt>Tredeopleggingen</dt><dd>{profile.cleatReferences.length} referentielijnen</dd></div></dl>
    <table><thead><tr><th>Trede</th><th>Opleghoek X van–tot</th><th>Referentiehoogte Z</th></tr></thead>
      <tbody>{#each profile.cleatReferences as ref}<tr><td>{ref.tread}</td><td>{mm(ref.x0)}–{mm(ref.x1)} mm</td><td>{mm(ref.z)} mm</td></tr>{/each}</tbody></table>
    <p class="note">De DXF bevat nominale snijcontouren en opleghoekreferenties op afzonderlijke lagen. Tredebouten en boorgaten zijn niet ontworpen. Leg lasnaad, snijtoeslag, maatolerantie, voetverbinding en profielsterkte projectmatig vast vóór productie.</p>
  </article>
{/if}
<style>
  .steel-plate-sheet{background:#fff;color:#20323b;margin:12px auto;padding:clamp(12px,2.5vw,28px);max-width:1000px;border:1px solid #bac6cb;font:12px/1.45 var(--oa-font-body)}
  header,.tools{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}header{border-bottom:2px solid #375664;padding-bottom:8px}.stamp{display:grid;text-align:right}.stamp strong,small{font:600 10px var(--oa-font-mono)}h2{font:600 20px var(--oa-font-heading);margin:4px 0}.tools{justify-content:flex-start;margin:12px 0}
  figure{margin:8px 0;border:1px solid #c7d0d3}svg{display:block;width:100%;max-height:430px}.blank{fill:#f3f6f7;stroke:#b0c0c6;stroke-width:1.5}.plate{fill:#afbbc0;stroke:#263b45;stroke-width:2}.hole{fill:#fff;stroke:#263b45;stroke-width:2}.cleat{stroke:#ad572b;stroke-width:2;stroke-dasharray:8 5}figcaption{padding:4px 8px;background:#edf2f3;font-size:11px}
  dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}dt{font-size:10px;color:#526772}dd{margin:2px 0;font:600 12px var(--oa-font-mono)}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #d7e0e3;padding:5px;text-align:left}.note{border-left:3px solid #ad572b;padding-left:9px}
  @media print{.steel-plate-sheet{border:0;margin:0;padding:0;max-width:none;break-after:page}.tools{display:none}svg{max-height:170mm}figure,table,dl{break-inside:avoid}}
</style>
