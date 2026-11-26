<script>
  import {formatMeasure as fmt,checkNames,detailNames} from './precast-sheets.js';
  import PrecastDrawing from './PrecastDrawing.svelte';
  import PrecastInsertSection from './PrecastInsertSection.svelte';
  import PrecastLocalSheet from './PrecastLocalSheet.svelte';
  import PrecastLiftSheet from './PrecastLiftSheet.svelte';
  export let sheet, assembly, project, panel;
  $: cast=sheet.cast;
  $: mark=assembly.instance.mark;
  $: result=sheet.calculation;
  $: p={...assembly.instance.params,...result?.liftPlan};
  $: hasLocal=assembly.instance.params.localReinforcement==='detailed';
  $: hasPlan=hasLocal||Boolean(result?.liftPlanOverrides?.length);
  const xyz=p=>p?[p.x,p.y,p.z].map(v=>fmt(v)).join(' / '):'—';
  const numeric=v=>typeof v==='number'?fmt(v,3):v??'—';
  const statusName=status=>checkNames[status]??'Aanvullen';
  const handling=c=>['liftFree','demould','hoistStrength'].includes(c.id)||c.id.startsWith('handling-');
</script>
{#snippet checksTable(items)}
  <table class="checks"><thead><tr><th>Toets</th><th>Vraag</th><th>Weerstand / grens</th><th>Eenheid</th><th>Uitkomst en uitgangspunt</th></tr></thead><tbody>
    {#each items as check}<tr><td>{check.label}</td><td>{numeric(check.demand)}</td><td>{numeric(check.capacity)}</td><td>{check.unit??''}</td><td><b class:failed={check.status==='fail'}>{statusName(check.status)}</b><br/>{check.note??''}</td></tr>{/each}
  </tbody></table>
{/snippet}
    <div class="paper" class:screen-hidden={panel!=='Werkplaatsblad'}>
      <header><div><small>{project.number} · {project.name} · revisie {project.revision}</small><h2>{mark} / {cast.id} · Werkplaatsblad</h2></div>
        <div class="identity">{cast.label}<br/>Bouwlaag {assembly.instance.storey}</div></header>
      <div class="status"><strong>{result?.status==='fail'?'Deeltoets overschreden':'Concept voor fabrieksengineering'}</strong> · Constructieve en hijstechnische vrijgave open</div>
      <div class="views"><PrecastDrawing {sheet} side="plan"/><PrecastDrawing {sheet} side="elevation"/></div>
      <p class="key"><b class="low">━━ Ondernet</b> · <b class="up">┄ Bovennet</b>{#if hasLocal} · <b class="bent">━━ Bijlegstaaf</b>{/if} · ○ Hijsanker · ■ Zijverbinding · ⊕ Zwaartepunt beton</p>
      {#each cast.detail.geometryIssues??[] as issue}<p class="failed"><b>Inpassing</b> · {issue}</p>{/each}
      <div class="dimensions"><div><small>Betonmassa</small><b>{fmt(cast.massKg)} kg</b></div><div><small>Betonvolume</small><b>{fmt(cast.volumeM3,4)} m³</b></div>
        <div><small>Elementbreedte</small><b>{fmt(cast.detail.width)} mm</b></div><div><small>Nominale plaatdikte</small><b>{fmt(cast.detail.thickness)} mm</b></div></div>
      <p>Lokale X volgt de vlucht of loopt vanaf de bordessponning het bordes in. Y loopt over de breedte en Z omhoog. Nulpunt in het component (X / Y / Z) {xyz(cast.detail.axes?.origin)} mm. Zwaartepunt beton vanaf dit nulpunt {xyz(cast.detail.centroid)} mm.</p>
      <h3>Staafstaat</h3>
      <table><thead><tr><th>Pos.</th><th>Staaf</th><th>Net</th><th>Aantal</th><th>Ø mm</th><th>H.o.h. mm</th><th>Aslengte mm</th><th>Begin eerste staaf X / Y / Z (mm)</th></tr></thead><tbody>
        {#each sheet.groups as g}<tr><td>{g.code}</td><td>{detailNames[g.part.role]}</td><td>{g.part.layer==='top'?'Boven':'Onder'}</td><td>{g.count}</td><td>{fmt(g.part.diameterMm)}</td><td>{fmt(g.pitch)}</td><td>{fmt(g.part.lengthMm)}</td><td>{xyz(g.part.start)}</td></tr>{/each}
      </tbody></table>
      <p>Dekking {fmt(p.cover)} mm · fck {fmt(p.concreteStrength)} MPa · fyk {fmt(p.barYield)} MPa. De CSV bevat de begin- en eindcoördinaten van iedere staaf.</p>
      <div class="insert-page"><header class="repeat"><div><small>{project.number} · revisie {project.revision}</small><h2>{mark} / {cast.id} · Instortdetails</h2></div><div class="identity">{cast.label}</div></header>
      <div class="detailpair"><PrecastDrawing {sheet} side="cross"/>
        <div><h3>Hijsvoorzieningen en zijverbindingen</h3><p>De hijshulzen liggen in het loopvlak. De zijverbindingen liggen bij {p.anchorSide==='lowY'?'Y = 0':'Y = elementbreedte'}.</p>
        {#each sheet.inserts.filter(i=>i.part.role==='connectionPlate').slice(0,1) as i}<p>Aansluitplaat {fmt(i.part.widthMm)} × {fmt(i.part.heightMm)} × {fmt(i.part.thicknessMm)} mm met gat Ø {fmt(i.part.boreMm)} mm. Inbedding kopbout {fmt(p.anchorEmbed)} mm.</p>{/each}
        <p>Referentie hijsvoorziening · {p.liftingReference||'Nog te specificeren'}<br/>Hijsplan · {p.riggingReference||'Nog te specificeren'}<br/>Oplegging en zijverbinding · {p.connectionReference||'Nog te specificeren'}</p></div></div>
      <div class="views insertviews"><PrecastInsertSection {sheet} {assembly} side="lift"/><PrecastInsertSection {sheet} {assembly} side="connection"/></div>
      <table><thead><tr><th>Pos.</th><th>Omschrijving</th><th>X mm</th><th>Y mm</th><th>Z mm</th><th>Ø mm</th><th>Lengte mm</th></tr></thead><tbody>
        {#each sheet.inserts as i}{@const a=i.part.start}<tr><td>{i.code}</td><td>{i.part.label}</td><td>{fmt(a?.x)}</td><td>{fmt(a?.y)}</td><td>{fmt(a?.z)}</td><td>{fmt(i.part.diameterMm)}</td><td>{fmt(i.part.lengthMm)}</td></tr>{/each}
      </tbody></table></div>
    </div>
    <div class="paper calc" class:screen-hidden={panel!=='Berekening'}>
      <header><div><small>{project.number} · {project.name} · revisie {project.revision}</small><h2>{mark} / {cast.id} · Berekening</h2></div><div class="identity">{cast.label}<br/>Bouwlaag {assembly.instance.storey}</div></header>
      {#if result}<div class="status"><strong>{result.status==='fail'?'Deeltoets overschreden':'Constructieve vrijgave open'}</strong> · Sluit de open punten af met de constructeur en leverancier.</div>
        <h3>Deeltoetsen doorsnede, oplegging en verankering</h3>
        {@render checksTable(result.checks.filter(c=>!handling(c)&&!c.id.startsWith('local-')))}
        <h3>Rekengegevens element</h3><dl>{#each result.metrics as m}<div><dt>{m.label}</dt><dd>{numeric(m.value)} {m.unit??''}</dd></div>{/each}</dl>
        <p>Afwerking {fmt(p.finishLoad)} kN/m² · gebruik {fmt(p.useLoad)} kN/m² of puntlast {fmt(p.pointLoad)} kN · γG {fmt(p.permanentFactor,2)} en γQ {fmt(p.variableFactor,2)}. Hijshoek {fmt(p.slingAngle)}° uit de verticaal · dynamische factor {fmt(p.hoistFactor,2)}.</p>
        <div class="lift-page"><header class="repeat"><div><small>{project.number} · revisie {project.revision}</small><h2>{mark} / {cast.id} · Hijsberekening</h2></div><div class="identity">{cast.label}<br/>Bouwlaag {assembly.instance.storey}</div></header>
          <h3>Ontkisten en hijsen</h3>
          <p>Hijstoestand · {p.liftingAssembly==='bare'?'Kaal prefab, bulkdichtheid inclusief instortstaal':p.liftingAssembly==='assembled'?'Met aangebouwde delen':'Opbouw en massa te bevestigen'}.
            Productblad · {p.liftingReference||'Ontbreekt'}. Hijsplan · {p.riggingReference||'Ontbreekt'}.</p>
          <p>{p.rigging==='equalised'?'Vierpuntenhijs met vereffening':'Twee effectief dragende strengen'} · {p.stationResultants==='vertical'?'verticale resultante per hijsstation':p.stationResultants==='inclined'?'schuine stationkrachten, projectanalyse vereist':'richting stationkrachten te bevestigen'} · {fmt(p.slingAngle)}° uit de verticaal.</p>
          {@render checksTable(result.checks.filter(handling))}
          {#each assembly.precast.notes??[] as note}<p>{note}</p>{/each}
        </div>
      {:else}<p>Vul de ontbrekende geometrie en rekengegevens aan.</p>{/if}
    </div>
    {#if hasPlan||panel==='Elementhijsplan'}<div class:extra-hidden={panel!=='Elementhijsplan'}><PrecastLiftSheet {sheet} {assembly} {project}/></div>{/if}
    {#if hasLocal}<div class:extra-hidden={panel!=='Bijlegwapening'}><PrecastLocalSheet {sheet} {assembly} {project}/></div>{/if}
<style>
  .paper{max-width:1240px;padding:14px 16px;margin:8px auto;background:white;color:#25343c;line-height:1.35;}
  .screen-hidden{display:none;}header,.dimensions{display:flex;justify-content:space-between;gap:12px;}
  header{border-bottom:2px solid #354f5b;padding-bottom:7px;}h2{font:600 19px var(--oa-font-heading);margin:3px 0;}
  header small,.identity,.dimensions small{font-size:11px;color:#465a65;}.identity{text-align:right;}
  h3{font-weight:650;font-size:14px;margin:14px 0 5px;}.status{padding:6px 0;color:#73551c;}
  .views{display:grid;grid-template-columns:1fr 1fr;gap:7px;}.key{margin:5px 0 9px;}.low,.failed{color:#9e3f18;}.up{color:#047687;}
  .detailpair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0;}.repeat{display:none;}.identity,td,p{overflow-wrap:anywhere;}
  .extra-hidden{display:none;}.bent{color:#67458e;}
  .dimensions{border-block:1px solid #c5cbcd;padding:6px 0;flex-wrap:wrap;}.dimensions small,.dimensions b{display:block;}
  table{width:100%;border-collapse:collapse;font-size:11px;}td,th{text-align:left;border-bottom:1px solid #d4dbde;padding:3px 5px;vertical-align:top;}
  th{background:#edf1f2;color:#344d59;}.checks td:first-child{width:19%;}.checks td:last-child{width:46%;}
  dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px 12px;}
  dt{font-size:10px;color:#465a65;}dd{margin:0;font-weight:600;}p{margin:6px 0;}
  @media print{.screen-hidden,.extra-hidden{display:block;}
    .insert-page,.lift-page{break-before:page;}.repeat{display:flex;}
    .paper{padding:0;margin:0;font-size:8pt;}.paper h2{font-size:15pt;}.paper h3{font-size:10pt;break-after:avoid;}
    .calc{break-before:page;}.paper th,.paper td{font-size:7.6pt;padding:1mm 1.3mm;}tr,dl>div{break-inside:avoid;}thead{display:table-header-group;}
    .views,.dimensions,header{break-inside:avoid;}.paper{print-color-adjust:exact;}}
</style>
