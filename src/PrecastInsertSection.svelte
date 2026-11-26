<script>
  import { formatMeasure as fmt } from './precast-sheets.js';
  export let sheet,assembly,side;
  // Cut the actual steel faces through the insert axis. Translate the cut plane
  // by 0.001 mm to avoid coincident facet edges in faceted cylinders and nuts.
  function drawing(sheet,assembly,side) {
    const lifting=side==='lift';
    const items=sheet.inserts.filter(i=>lifting?i.part.role==='liftAnchor':i.part.role!=='liftAnchor');
    const first=items[0];
    if(!first) return null;
    const chosen=lifting?[first]:items.filter(i=>Math.abs(i.part.start.x-first.part.start.x)<.01);
    const d=sheet.cast.detail, ref=lifting?first.part.start:d.anchorPoints[0];
    const a=assembly.instance, angle=a.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const zOrigin=Math.min(...sheet.cast.faces.flat().map(p=>p.z))-Math.min(...d.profile.map(p=>p[1]));
    const dir=ref.y>d.width/2?-1:1;
    function coordinates(p) {
      const x=c*(p.x-a.x)+s*(p.y-a.y)-d.axes.origin.x,y=-s*(p.x-a.x)+c*(p.y-a.y)-d.axes.origin.y;
      const u=x*d.axes.x.x+y*d.axes.x.y-ref.x, v=x*d.axes.y.x+y*d.axes.y.y-ref.y,z=p.z-zOrigin-ref.z;
      return lifting?[u,z,v-.001]:[v*dir,z,u-.001];
    }
    let lines=[];
    for(const {part} of chosen) for (const face of part.faces) {
      const loop=face.map(coordinates),hits=[];
      for(let j=0;j<loop.length;j++) {
        const p=loop[j],q=loop[(j+1)%loop.length];
        if((p[2]>0)===(q[2]>0)) continue;
        const ratio=p[2]/(p[2]-q[2]);
        hits.push([p[0]+ratio*(q[0]-p[0]),p[1]+ratio*(q[1]-p[1])]);
      }
      if(hits.length===2) lines.push(hits);
    }
    if(!lines.length) return null;
    const pts=lines.flat(),lo=Math.min(...pts.map(p=>p[0])),hi=Math.max(...pts.map(p=>p[0])),bottom=Math.min(...pts.map(p=>p[1])),top=Math.max(...pts.map(p=>p[1]));
    const scale=Math.min(280/Math.max(hi-lo,1),80/Math.max(top-bottom,1));
    const map=([x,y])=>[160+(x-(lo+hi)/2)*scale,53-(y-(bottom+top)/2)*scale];
    const zero=map([0,0]),paths=lines.map(pair=>pair.map(map));
    const part=chosen.find(i=>i.part.role==='anchorBolt')?.part??first.part;
    return {zero,paths,codes:chosen.map(i=>i.code).join(' / '),label:lifting?'Inbouw '+fmt(part.lengthMm)+' mm':'Inbedding '+fmt(part.embedMm)+' mm'};
  }
  $: view=drawing(sheet,assembly,side);
</script>
{#if view}<figure><figcaption>{side==='lift'?'Doorsnede hijshuls':'Doorsnede zijverbinding'} · {view.codes}</figcaption>
  <svg role="img" aria-label={side==='lift'?'Detail hijshuls in beton':'Detail kopbout, moer en aansluitplaat'} viewBox="0 0 320 106">
    {#if side==='lift'}<rect x="0" y={view.zero[1]} width="320" height={106-view.zero[1]} fill="#ecebe6"/><path d={'M0 '+view.zero[1]+'h320'} stroke="#858b89"/>
    {:else}<rect x={view.zero[0]} y="0" width={320-view.zero[0]} height="106" fill="#ecebe6"/><path d={'M'+view.zero[0]+' 0v106'} stroke="#858b89"/>{/if}
    {#each view.paths as [a,b]}<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#253b52" stroke-width="1.5"/>{/each}
    <text x="6" y="101" fill="#2f4351" font-size="9">{view.label}</text>
  </svg></figure>{/if}
<style>
  figure{margin:0;border:1px solid #c5cbcd;}figcaption{padding:4px 8px;font-weight:650;font-size:11px;}svg{display:block;width:100%;height:90px;}
  @media print{svg{height:24mm;}}
</style>
