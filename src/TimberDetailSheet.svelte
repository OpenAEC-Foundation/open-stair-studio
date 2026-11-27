<script>
  import { tick } from 'svelte';
  import TimberProfileDrawing from './TimberProfileDrawing.svelte';
  import RiserGrooveSheet from './RiserGrooveSheet.svelte';
  import { riserFaceResults } from './riser-face-cam.js';
  import { groupNames, mm, stockText, timberSheetParts, timberViews, timberDetailDxf } from './timber-sheet.js';
  export let model, geometry, details, downloadFile;

  let requestedType = 'tread', requestedId = '', selectedStation = null, printList = false;
  $: rows = timberSheetParts(geometry, details);
  $: types = Object.keys(groupNames).filter(type => rows.some(r => r.type === type));
  $: type = types.includes(requestedType) ? requestedType : types[0];
  $: candidates = rows.filter(r => r.type === type);
  $: row = candidates.find(r => r.id === requestedId) ?? candidates[0];
  $: part = row?.part;
  $: grooveResults = row?.type==='tread'?riserFaceResults(part,model,geometry.riserJoinery?.issues):[];
  $: stations = part?.profileStations ?? [];
  $: currentStation = Math.min(selectedStation??Math.floor(stations.length/2), Math.max(0, stations.length - 1));
  $: views = row ? timberViews(row, currentStation) : [];
  $: housingIssue = row?.type === 'tread' ? geometry.housings?.issues?.[0] : null;
  $: pageCount = Math.ceil(rows.length/16);
  $: schedulePages = Array.from({length:pageCount}, (_,i) =>
    rows.slice(Math.floor(i*rows.length/pageCount), Math.floor((i+1)*rows.length/pageCount)));

  function chunks(list, size) {
    return Array.from({length:Math.ceil(list.length/size)}, (_,i) => list.slice(i*size, (i+1)*size));
  }
  function choose(type, id = '') { requestedType=type; requestedId=id; selectedStation=null; }
  async function print(all) { printList=all; await tick(); window.print(); }
  const stationForm = s => s.section === 'rond' ? 'Ø ' + mm(s.widthMm) : stockText([s.widthMm,s.depthMm]);
</script>
<svelte:window onafterprint={() => printList=false}/>
<section class="timber-shop" aria-label="Houtwerkplaats">
  {#if row}
    <div class="toolstrip">
      <label>Onderdeelgroep<select value={type} onchange={e => choose(e.currentTarget.value)}>
        {#each types as t}<option value={t}>{groupNames[t]}</option>{/each}</select></label>
      <label>Onderdeelmerk<select value={row.id} onchange={e => choose(type,e.currentTarget.value)}>
        {#each candidates as r}<option value={r.id}>{r.id} · {r.name}</option>{/each}</select></label>
      {#if stations.length}
        <label>Profielstation<select value={currentStation} onchange={e => selectedStation=Number(e.currentTarget.value)}>
          {#each stations as s,i}<option value={i}>{mm(s.atMm)} mm · {s.section}</option>{/each}</select></label>
      {/if}
      <div class="commands">
        <button class="action-btn" disabled={!!housingIssue||!!part.fabricationIssue} onclick={() => downloadFile(row.id+'-houtdetail.dxf',timberDetailDxf(row,views),'application/dxf')}>Detail-DXF</button>
        <button class="action-btn" onclick={() => print(false)}>Detailblad PDF</button>
        <button class="action-btn" onclick={() => print(true)}>Maatstaat PDF</button>
      </div>
    </div>
    <article class="paper" class:skip-print={printList}>
      <header class="sheet-title">
        <div><p>{model.project.number} · {model.project.name} · revisie {model.project.revision}</p><h2>{row.id}</h2></div>
        <div><h3>{row.name}</h3><p>{model.stair.material} · {row.profile}</p></div>
      </header>
      <dl class="metrics">
        <div><dt>Ruw L × B × D</dt><dd>{stockText(row.stock)} mm</dd></div>
        {#if row.type==='tread'}<div><dt>Lengte voorrand</dt><dd>{mm(Math.hypot(part.nose[1].x-part.nose[0].x,part.nose[1].y-part.nose[0].y))} mm</dd></div>
        {:else if Number.isFinite(row.length)}<div><dt>Lengte op de as</dt><dd>{mm(row.length)} mm</dd></div>{/if}
        <div><dt>Netto houtvolume</dt><dd>{mm(row.netVolume*1000)} dm³</dd></div>
        {#if row.type==='tread'}<div><dt>Bovenkant trede</dt><dd>+{mm(part.elevation)} mm</dd></div>{/if}
        {#if Number.isFinite(part.radiusMm)}<div><dt>Hartlijnradius</dt><dd>{mm(part.radiusMm)} mm</dd></div>{/if}
        {#if Number.isFinite(part.bendAngleDeg)}<div><dt>Booghoek</dt><dd>{mm(part.bendAngleDeg)}°</dd></div>{/if}
      </dl>
      <div class="drawings">{#each views as view,i}<TimberProfileDrawing {view}
        roundDiameter={i===1 && stations[currentStation]?.section==='rond' ? stations[currentStation].widthMm : null}/>{/each}</div>
      <RiserGrooveSheet results={grooveResults} {model} {downloadFile}/>
      {#if part.joineryFeatures?.length}
        <h3>Insteeklippen stootbord</h3>
        {#if part.planPoints}
          <p>De tabel geeft de uiterste lipmaten. Meet de breedte vanaf het meest rechtse punt van het bordlichaam naar links bij oplopen, de hoogte vanaf de voet en de dikte vanaf de zichtzijde. Het bovenaanzicht toont de schuine kopvlakken.</p>
          <p><b>Hoekpunten bordlichaam (breedte / dikte in mm)</b><br/>{views[0].paths[0].points.map(q=>mm(q.x)+' / '+mm(q.y)).join(' · ')}</p>
        {:else}
          <p>Maten vanaf de rechte schouder van het stootbord. Meet in de breedte naar links bij oplopen, in de hoogte vanaf de voet en in de dikte vanaf de zichtzijde.</p>
        {/if}
        <table><thead><tr><th>Ontvangend onderdeel</th><th>Insteek (mm)</th><th>Breedte van – tot (mm)</th><th>Hoogte van – tot (mm)</th><th>Dikte van – tot (mm)</th></tr></thead>
        <tbody>{#each part.joineryFeatures as f}
          {@const b=f.localTongueBox}
          <tr><td>{f.hostId}</td><td>{mm(f.tongueDepth)}</td><td>{mm(b[2])} – {mm(b[3])}</td><td>{mm(b[4])} – {mm(b[5])}</td><td>{mm(b[0])} – {mm(b[1])}</td></tr>
        {/each}</tbody></table>
      {/if}
      {#each part.jointNotes??[] as note}<p>{note}</p>{/each}
      {#if housingIssue}<p class="finding"><b>Tredeverbinding controleren.</b> {housingIssue.message}</p>{/if}
      {#if part.fabricationIssue}<p class="finding"><b>Aansluiting controleren.</b> {part.fabricationIssue}</p>{/if}
      {#if part.noseDetail}<p><b>Neusbewerking.</b> {part.noseDetail.operation}</p>{/if}
      {#if part.endCuts?.length}<p><b>Kopvlakken.</b> {part.endCuts.map(c=>c.position+' · verstek '+mm(c.miterDeg)+'° · afschuining '+mm(c.bevelDeg)+'°').join(' / ')}. Hoeken vanaf haaks op de lokale as.</p>{/if}
      {#if Number.isFinite(part.bottomCutDeg)||Number.isFinite(part.topCutDeg)}<p><b>Afschrijving.</b> Voet {mm(part.bottomCutDeg)}° · kop {mm(part.topCutDeg)}°.</p>{/if}
      {#each chunks(stations,27) as batch,idx}
        <section class:continuation={idx>0}>
          {#if idx>0}<h3>{model.project.number} · {row.id} · revisie {model.project.revision}</h3>{/if}
          <h3>Profielstations vanaf de voet</h3>
          <div class="stations">{#each chunks(batch,9) as group}
            <table><thead><tr><th>As mm</th><th>B × D / Ø mm</th><th>Vorm</th></tr></thead><tbody>
              {#each group as s}<tr class:highlight={s===stations[currentStation]}><td>{mm(s.atMm)}</td><td>{stationForm(s)}</td><td>{s.section}</td></tr>{/each}
            </tbody></table>
          {/each}</div>
        </section>
      {/each}
      <div class="calibration"><span class="gauge"></span><span>Controlemaat 50 mm bij afdruk op 100%</span></div>
    </article>
    {#if printList}
      <div class="schedule">{#each schedulePages as page,i}
        <article class="paper schedule-page">
          <header class="sheet-title"><div><p>{model.project.number} · {model.project.name} · revisie {model.project.revision}</p><h2>Maatstaat houtdetails</h2></div><div><b>{model.stair.mark} · {model.stair.material}</b><p>Blad {i+1} van {pageCount}</p></div></header>
          <table><thead><tr><th>Merk</th><th>Onderdeel</th><th>Profiel</th><th>Stuks</th><th>Ruw L × B × D mm</th><th>Aslengte mm</th><th>Netto dm³</th></tr></thead>
            <tbody>{#each page as r}<tr><td>{r.id}</td><td>{r.name}</td><td>{r.profile}</td><td>1</td><td>{stockText(r.stock)}</td><td>{mm(r.length)}</td><td>{mm(1000*r.netVolume)}</td></tr>{/each}</tbody>
          </table>
        </article>
      {/each}</div>
    {/if}
  {:else}<p class="empty">Er zijn nog geen houten onderdelen voor een detailblad.</p>{/if}
</section>
<style>
  .timber-shop{min-width:0;overflow:auto;flex:1;background:var(--oa-workspace);color:var(--oa-text);font:12px var(--oa-font-body);}
  .toolstrip,.commands{display:flex;align-items:flex-end;gap:7px;flex-wrap:wrap;}.toolstrip{padding:8px 12px;background:var(--oa-panel);border-bottom:1px solid var(--oa-border);}
  label{display:grid;gap:3px;min-width:0;font-size:10px;color:var(--oa-text-secondary);}select{max-width:100%;height:28px;padding:2px 5px;border:1px solid var(--oa-border);background:var(--oa-field);color:var(--oa-text);font:11px var(--oa-font-body);}
  .commands button{white-space:nowrap;}.paper{margin:10px auto;max-width:1160px;background:white;color:#25373d;padding:14px 16px;line-height:1.35;}
  .sheet-title{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;border-bottom:2px solid #3d5359;padding-bottom:5px;}
  .sheet-title>div:last-child{text-align:right;}h2{font:650 21px var(--oa-font-heading);margin:3px 0;}h3{font-size:13px;margin:7px 0 4px;}p{margin:5px 0;}header p{font-size:11px;color:#43565c;}
  .metrics{margin:8px 0;display:flex;gap:8px 20px;flex-wrap:wrap;}.metrics dt{font-size:10px;color:#53676d;}.metrics dd{margin:2px 0;font-weight:650;font-variant-numeric:tabular-nums;}
  .drawings{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(255px,100%),1fr));gap:8px;}.stations{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(175px,100%),1fr));gap:10px;align-items:start;}
  table{width:100%;border-collapse:collapse;text-align:left;font-size:11px;font-variant-numeric:tabular-nums;}td,th{padding:3px 5px;border-bottom:1px solid #cdd4d5;}th{background:#edf0ef;}
  .highlight{background:#e8f1ef;}.finding{color:#873f23;}.empty{padding:14px;}.calibration{display:none;}.schedule{display:none;}
  @media print {
    :global(html:has(.timber-shop)),:global(body:has(.timber-shop)),:global(#app:has(.timber-shop)),
    :global(.app-shell:has(.timber-shop)),:global(.workspace:has(.timber-shop)),:global(.editor-area:has(.timber-shop)){background:white!important;}
    :global(.editor-area:has(.timber-shop) > .print-heading), .toolstrip, .skip-print{display:none;}
    .timber-shop{display:block;overflow:visible;background:white;}.paper{padding:0;margin:0;max-width:none;font-size:8.5pt;print-color-adjust:exact;}
    .sheet-title{padding-bottom:1.5mm;}h2{font-size:15pt;}h3{font-size:10pt;}header p,.metrics dt{font-size:8pt;}
    .drawings{grid-template-columns:1fr 1fr;gap:3mm;}.metrics{margin:2mm 0 3mm;}p{margin:1.4mm 0;}
    .stations{grid-template-columns:repeat(3,1fr);gap:3mm;}td,th{padding:.6mm 1.1mm;font-size:8pt;}
    .calibration{display:flex;align-items:baseline;gap:2mm;font-size:7.5pt;color:#425860;margin-top:2mm;}
    .gauge{display:inline-block;width:50mm;height:2mm;border:solid #34484e;border-width:0 .2mm .2mm;box-sizing:border-box;}
    .schedule{display:block;}.schedule-page table{margin-top:3mm;}.schedule-page tr{break-inside:avoid;}
    .schedule-page th,.schedule-page td{padding:1.15mm 1.2mm;font-size:8.5pt;}
    .schedule-page+.schedule-page,.continuation{break-before:page;}
  }
</style>
