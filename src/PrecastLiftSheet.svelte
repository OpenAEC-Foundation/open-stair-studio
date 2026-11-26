<script>
  import { formatMeasure as fmt } from './precast-sheets.js';
  export let sheet,assembly,project;
  $: cast=sheet.cast;
  $: result=sheet.calculation;
  $: plan=result?.liftPlan??cast.detail.liftPlan??assembly.instance.params;
  $: stations=result?.liftStations??[];
  $: xs=cast.detail.profile.map(p=>p[0]);
  $: xmin=Math.min(...xs);
  $: len=Math.max(...xs)-xmin;
  $: scale=Math.min(450/len,185/cast.detail.width);
  $: px=x=>32+(450-len*scale)/2+(x-xmin)*scale;
  $: py=y=>20+(185-cast.detail.width*scale)/2+(cast.detail.width-y)*scale;
  $: cg=cast.detail.centroid;
  const name=id=>sheet.inserts.find(i=>i.part.id===id)?.code??id;
</script>
<section class="lift-drawing" aria-label="Hijsplan op tekening">
  <header><div><small>{project.number} · {project.name} · revisie {project.revision}</small><h2>{assembly.instance.mark} / {cast.id} · Elementhijsplan</h2></div><strong>{cast.label}</strong></header>
  <div class="pair"><figure><figcaption>Hijsstations in bovenaanzicht · lokale X en Y</figcaption>
    <svg viewBox="0 0 510 228" role="img" aria-label="Hijsposities en zwaartepunt">
      <rect x={px(xmin)} y={py(cast.detail.width)} width={len*scale} height={cast.detail.width*scale} fill="#f4f3ed" stroke="#536572"/>
      {#each stations as s}<circle cx={px(s.point.x)} cy={py(s.point.y)} r="4" fill="#245b76" stroke="white"/>
        <text x={px(s.point.x)+6} y={py(s.point.y)-5}>{name(s.id)}</text>{/each}
      <path d={'M'+(px(cg.x)-7)+' '+py(cg.y)+'h14M'+px(cg.x)+' '+(py(cg.y)-7)+'v14'} stroke="#98491f" stroke-width="2"/>
      <text x={px(cg.x)+8} y={py(cg.y)+12}>ZP</text>
    </svg></figure>
    <div><h3>Last en aanslagwijze</h3>
      <p>Gewapend betonelement {fmt(cast.massKg)} kg. Zwaartepunt X / Y / Z {fmt(cg.x)} / {fmt(cg.y)} / {fmt(cg.z)} mm.</p>
      <p>{plan.rigging==='equalised'?'Vier strengen met vereffening':'Twee effectief dragende strengen'} · maximale hoek {fmt(plan.slingAngle)}° uit de verticaal · dynamische factor {fmt(plan.hoistFactor,2)}.</p>
      <p>WLL per hijspunt {plan.liftingWLL>0?fmt(plan.liftingWLL)+' kN':'open'}. Hijssterkte {plan.liftingStrength>0?fmt(plan.liftingStrength)+' MPa':'open'}.</p>
      <p>Product · {plan.liftingReference||'Nog te specificeren'}<br/>Hijsplan · {plan.riggingReference||'Nog te specificeren'}</p>
      <p>{plan.liftLayout==='fixed'?'Vaste stations in lokale coördinaten.':'Automatische plaatsing tussen de wapeningsstaven.'}</p>
    </div></div>
  <table><thead><tr><th>Hijspositie</th><th>X mm</th><th>Y mm</th><th>Z mm</th><th>Gewichtsaandeel</th><th>Vrij hijsen kN</th><th>Ontkisten kN</th></tr></thead>
    <tbody>{#each stations as s}<tr><td>{name(s.id)}</td><td>{fmt(s.point.x)}</td><td>{fmt(s.point.y)}</td><td>{fmt(s.point.z)}</td><td>{Number.isFinite(s.share)?fmt(s.share*100)+'%':'—'}</td><td>{fmt(s.freeKN,3)}</td><td>{fmt(s.stripKN,3)}</td></tr>{/each}</tbody></table>
  {#if !stations.length}<p>Geen passende hijsposities. Controleer de elementmaten en de inpassing.</p>{/if}
  <p>{plan.rigging==='two'?'Bij twee effectief dragende strengen geldt per rij de ongunstigste kracht per huls. De rijmaxima kunnen uit verschillende aanslagsituaties komen.':'Voor deze verdeling is vereffening van beide richtingen vereist.'} Een streep geeft een ontbrekende of niet toepasbare rekenwaarde aan.</p>
</section>
<style>
  .lift-drawing{padding:14px 16px;margin:8px auto;background:white;color:#263a45;line-height:1.4;max-width:1240px;}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:2px solid #354f5b;padding-bottom:6px;}h2{font:600 18px var(--oa-font-heading);margin:3px 0;}header small{font-size:11px;}h3{margin:7px 0;}
  .pair{display:grid;grid-template-columns:1.15fr 1fr;gap:14px;margin:12px 0;}figure{margin:0;border:1px solid #c5cbcd;}figcaption{padding:5px 8px;font-weight:650;}
  svg{width:100%;display:block;}svg text{font:11px var(--oa-font-mono);fill:#294452;}table{width:100%;border-collapse:collapse;}td,th{text-align:left;border-bottom:1px solid #cfd8db;padding:4px;}th{background:#edf1f2;}
  @media print{.lift-drawing{break-before:page;padding:0;margin:0;font-size:9pt;print-color-adjust:exact;}.lift-drawing h2{font-size:15pt;}}
</style>
