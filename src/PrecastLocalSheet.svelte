<script>
  import {formatMeasure as fmt,checkNames} from './precast-sheets.js';
  import PrecastZoneDetail from './PrecastZoneDetail.svelte';
  export let sheet,assembly,project;
  const headings={bearing:'Oplegnokken en sponningen',lifting:'Hijshulzen',anchorage:'Zijankers'};
  const fields={bearing:'bearingBarReference',lifting:'liftBarReference',anchorage:'anchorBarReference'};
  const checkLabels={area:'As',tail:'Staart',loadPath:'Krachtinleiding'};
  let shownTargets={};
  $: zones=sheet.cast.detail.localZones??[];
  $: results=sheet.calculation?.localDetails??[];
  $: p={...assembly.instance.params,...sheet.calculation?.liftPlan};
  const xyz=p=>[p.x,p.y,p.z].map(v=>fmt(v)).join(' / ');
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const diff=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  function view(part){
    const points=part.path,first=points[0],delta=diff(points[1],first),l=Math.sqrt(dot(delta,delta));
    const x={x:delta.x/l,y:delta.y/l,z:delta.z/l};
    const n=part.bendSchedule.find(s=>s.type==='arc')?.normal;
    if(!n) return '';
    const y={x:n.y*x.z-n.z*x.y,y:n.z*x.x-n.x*x.z,z:n.x*x.y-n.y*x.x};
    const data=points.map(t=>[dot(diff(t,first),x),dot(diff(t,first),y)]);
    const xx=data.map(t=>t[0]),yy=data.map(t=>t[1]),lo=Math.min(...xx),hi=Math.max(...xx),b=Math.min(...yy),t=Math.max(...yy);
    const s=Math.min(230/Math.max(hi-lo,1),73/Math.max(t-b,1));
    return data.map(([u,v])=>[(250-(hi-lo)*s)/2+(u-lo)*s,(91-(t-b)*s)/2+(t-v)*s].join(',')).join(' ');
  }
  function pages(zones,bars){
    const pages=[];
    for(const [kind,title] of Object.entries(headings)){
      const local=zones.filter(z=>z.kind===kind);
      if(!local.length) continue;
      const items=bars.filter(b=>local.some(z=>z.targetId===b.part.targetId));
      for(let from=0;from<Math.max(items.length,1);from+=6){
        const selected=items.slice(from,from+6);
        const targets=local.filter(z=>selected.some(b=>b.part.targetId===z.targetId)||(!from&&!items.some(b=>b.part.targetId===z.targetId)));
        const shapes=new Map();
        for(const {part,code} of selected){
          const key=JSON.stringify(part.bendSchedule.map(s=>[s.type,Math.round(s.lengthMm*100),s.angleDeg?.toFixed(1)]));
          if(!shapes.has(key)) shapes.set(key,{part,codes:[]});
          shapes.get(key).codes.push(code);
        }
        pages.push({kind,title,targets,items:selected,shapes:[...shapes.values()]});
      }
    }
    return pages;
  }
  $: sheets=pages(zones,sheet.bent);
</script>
  {#each sheets as page}
    {@const groupKey=sheet.cast.id+' / '+page.kind+' / '+(page.items[0]?.code??'')}
    {@const shown=page.targets.find(z=>z.targetId===shownTargets[groupKey])??page.targets[0]}
  <article class="local-sheet">
    <header><div><small>{project.number} · {project.name} · revisie {project.revision}</small><h2>{assembly.instance.mark} / {sheet.cast.id} · Bijlegwapening</h2></div><b>{page.title}</b></header>
    <p>Lokale X / Y / Z in mm · {sheet.cast.label} · dekking {fmt(p.cover)} mm · ingestelde vrije modelafstand {fmt(p.localClearance)} mm · detail {p[fields[page.kind]]||'nog te specificeren'}</p>
    <table><thead><tr><th>Voorziening</th><th>Lokale kracht kN</th><th>As nodig / getekend mm²</th><th>Staart nodig / getekend mm</th><th>Deeltoets</th></tr></thead><tbody>
      {#each page.targets as z}{@const r=results.find(v=>v.targetId===z.targetId)}
        <tr><td>{z.label}<br/>{z.targetId}</td><td>{fmt(r?.forceKN,2)}</td><td>{fmt(r?.requiredAreaMm2||null)} / {fmt(z.providedAreaMm2)}</td><td>{fmt(r?.requiredTailMm||null)} / {fmt(z.anchorageMm)}</td><td><b>{checkNames[r?.status]??'Aanvullen'}</b>{z.issue?' · '+z.issue:''}
          {#if r}<small class="subchecks">{r.checks.map(c=>(checkLabels[c.id]??c.label)+' '+(c.status==='pass'?'voldoet':c.status==='fail'?'overschreden':'open')).join(' · ')}</small>{/if}</td></tr>
      {/each}</tbody></table>
    <div class="illustrations" class:side-by-side={page.shapes.length>0&&page.shapes.length<=2}>
    {#if shown}<div class="detail-pair"><PrecastZoneDetail {assembly} {sheet} zone={shown} zones={page.targets} onselect={targetId=>shownTargets={...shownTargets,[groupKey]:targetId}}/>
      <div><h3>Krachtinleiding en verankering</h3><p>{results.find(v=>v.targetId===shown.targetId)?.note??''}</p>
      {#if page.kind==='bearing'}{#each page.targets as z}{@const r=results.find(v=>v.targetId===z.targetId)}
        <small>{z.label} · steunreactie {fmt(r?.reactionKN,2)} kN · gekozen hefboom {fmt(r?.leverMm||null)} mm · geometrische bovengrens {fmt(r?.maxLeverMm)} mm.</small><br/>
      {/each}{/if}</div></div>{/if}
    {#if page.items.length}<div class="shape-block">
      <h3>Staafvormen · hartlijn</h3>
      <div class="shapes">{#each page.shapes as shape}<figure><figcaption>{shape.codes.join(' / ')} · Ø {fmt(shape.part.diameterMm)} mm</figcaption>
        <svg role="img" aria-label={'Staafvorm '+shape.codes[0]} viewBox="0 0 250 91"><polyline points={view(shape.part)} fill="none" stroke="#64418a" stroke-width="3" stroke-linecap="round"/></svg>
        <small>Projectie · doorn Ø {fmt(shape.part.mandrelMm)} · hartlijn R {fmt(shape.part.bendRadiusMm)} mm</small>
        <p>{shape.part.bendSchedule.map(s=>s.type==='arc'?'boog '+fmt(s.angleDeg)+'°':'recht '+fmt(s.lengthMm)+' mm').join(' → ')}</p></figure>{/each}</div></div>{/if}
    </div>
    {#if page.items.length}
      <h3>Plaatsing en buigstaat</h3>
      <table><thead><tr><th>Positie</th><th>Voorziening</th><th>Begin X / Y / Z</th><th>Einde X / Y / Z</th><th>Aslengte mm</th></tr></thead><tbody>
        {#each page.items as {part,code}}<tr><td>{code}</td><td>{part.targetId}</td><td>{xyz(part.start)}</td><td>{xyz(part.end)}</td><td>{fmt(part.lengthMm,2)}</td></tr>{/each}
      </tbody></table>
    {/if}
  </article>
{/each}
<style>
  .local-sheet{padding:14px 16px;background:white;color:#263a45;line-height:1.4;margin:8px auto;max-width:1240px;}
  header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #354f5b;padding-bottom:6px;}h2{font:600 18px var(--oa-font-heading);margin:4px 0;}h3{margin:9px 0 3px;}p{margin:6px 0;}
  .shapes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}figure{margin:0;padding:6px 8px;border:1px solid #c5cbcd;}figcaption{font-weight:650;}svg{display:block;width:100%;height:64px;}
  table{font-size:11px;border-collapse:collapse;width:100%;}td,th{border-bottom:1px solid #ced7db;padding:3px 4px;text-align:left;vertical-align:top;}th{background:#edf1f2;}td,figure{overflow-wrap:anywhere;}
  .subchecks{display:block;max-width:190px;color:#4b5a61;}
  .detail-pair{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:12px;margin:7px 0;}
  @media print{
    .local-sheet{break-before:page;padding:0;margin:0;font-size:8pt;line-height:1.25;print-color-adjust:exact;}
    h2{font-size:15pt;}h3{margin:1.5mm 0 .6mm;}p{margin:1mm 0;}td,th{font-size:7.7pt;padding:.7mm 1mm;}
    .subchecks{max-width:none;}.illustrations{margin:2mm 0;}.side-by-side{display:grid;grid-template-columns:1.05fr 1fr;gap:4mm;align-items:start;}
    .detail-pair{margin:0;gap:2mm;}.side-by-side .detail-pair{display:block;}.shape-block h3{margin-top:0;}
    .shapes{grid-template-columns:repeat(auto-fit,minmax(35mm,1fr));gap:1.5mm;}figure{padding:1mm 1.5mm;}svg{height:16mm;}
  }
</style>
