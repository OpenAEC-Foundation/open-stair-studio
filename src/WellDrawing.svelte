<script>
  import { faceNormal } from './viewport-mesh.js';
  import { heightOn, elevationOf, levelsFor } from './stairwell.js';
  export let assemblies;
  export let well;
  export let storey;
  export let side = 'plan';
  export let allLevels = false;
  export let showContext = true;
  const inks = {glass:'#abdbdf',ceramic:'#626b70',interlayer:'#90c0c6',aluminium:'#cfdbdf',concrete:'#ddd9cf',steel:'#aab8bd',galvanized:'#c7d0d3',rubber:'#484f52',timber:'#dbc199'};
  const fmt = n => n.toLocaleString('nl-NL', {maximumFractionDigits:0});
  function drawing(assemblies, well, side, storey, context, levels) {
    const plan = side === 'plan', datum = elevationOf(well,storey), height=heightOn(well,storey);
    const project = p => [p.x, plan ? -p.y : datum-p.z];
    let x0=context ? 0 : Infinity, x1=context ? well.length : -Infinity;
    let y0=context ? (plan ? -well.width : Math.min(...levels.map(n=>datum-elevationOf(well,n)))) : Infinity, y1=context ? 0 : -Infinity;
    const polygons=[];
    for (const a of assemblies) for (const part of a.parts) {
      const edges = new Map(), faceEdges = new Map();
      const key = p => [p.x,p.y,p.z].map(v=>Math.round(v*10000)).join(',');
      for (const face of part.faces) {
        const normal=faceNormal(face);
        if (!normal) continue;
        const keys=face.map(key), list=[];
        for (let i=0;i<face.length;i++) {
          const j=(i+1)%face.length, id=keys[i]<keys[j]?keys[i]+'|'+keys[j]:keys[j]+'|'+keys[i];
          let edge=edges.get(id);
          if (edge) {
            const dot=edge.normal.reduce((v,n,k)=>v+n*normal[k],0), axis=plan?2:1;
            edge.visible=dot<.90 || (normal[axis]*edge.normal[axis]<=0 && Math.abs(normal[axis]-edge.normal[axis])>.01);
          } else {edge={normal,visible:true};edges.set(id,edge);}
          list.push(edge);
        }
        faceEdges.set(face,list);
      }
      for (const face of part.faces) {
      const uv=face.map(project);
      for (const [x,y] of uv) {x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
      let area=0;
      for(let i=0;i<uv.length;i++){const j=(i+1)%uv.length;area+=uv[i][0]*uv[j][1]-uv[j][0]*uv[i][1];}
      if(area>=-.01) continue;
      const coords=uv.map(([x,y])=>x.toFixed(2)+','+y.toFixed(2));
      const lines=faceEdges.get(face)?.map((e,i)=>e.visible?'M'+coords[i]+'L'+coords[(i+1)%coords.length]:'').join('') ?? '';
      polygons.push({points:coords.join(' '),lines,
        depth:face.reduce((v,p)=>v+(plan?p.z:-p.y),0)/face.length,fill:inks[part.material]??'#c7c7c7'});
      }
    }
    polygons.sort((a,b)=>a.depth-b.depth);
    if (!Number.isFinite(x0)) {x0=0;x1=well.length;y0=plan?-well.width:-height;y1=0;}
    const w=Math.max(1,x1-x0),h=Math.max(1,y1-y0);
    let left=x0,right=x1,top=y0,bottom=y1;
    const guides=plan?assemblies.flatMap(a=>a.guides.map(g=>{
      const points=g.points.map(project);
      for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      return {label:g.label,points:points.map(p=>p.join(',')).join(' ')};
    })):[];
    const font=Math.max((right-left)/40,(bottom-top)/25,35), pad=font*2;
    if (!plan && context) right=Math.max(right,well.length+font*6);
    return {polygons,guides,x0,x1,y0,y1,w,h,font,pad,viewBox:[left-pad*2.1,top-pad,right-left+pad*3.5,bottom-top+pad*3.3].join(' ')};
  }
  $: levels=allLevels?levelsFor(assemblies.map(a=>a.instance)):[storey,storey+1];
  $: d=drawing(assemblies,well,side,storey,showContext,levels);
</script>
<figure>
  <figcaption>{side==='plan' ? 'Bovenaanzicht' : 'Vooraanzicht X–Z'} <span>{allLevels?'Alle bouwlagen':'Vertrekbouwlaag '+storey} · mm</span></figcaption>
  <svg viewBox={d.viewBox} role="img" aria-label={side==='plan' ? 'Plattegrond trappenhuis' : 'Vooraanzicht trappenhuis'}>
    {#if showContext && side==='plan'}
      <rect x="0" y={-well.width} width={well.length} height={well.width} fill="none" stroke="#648494" stroke-width="1.1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
    {:else if showContext}
      {#each levels as n}{@const levelHeight=elevationOf(well,n)}{@const z=elevationOf(well,storey)-levelHeight}
        <path d={'M 0 '+ z +' H '+well.length} stroke="#668493" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
        <text x={well.length+d.font*.3} y={z+d.font*.25} font-size={d.font*.77} fill="#385560">L{n} +{fmt(levelHeight)}</text>
      {/each}
    {/if}
    {#each d.polygons as p}<polygon points={p.points} fill={p.fill} stroke={p.fill} stroke-width=".35" vector-effect="non-scaling-stroke"/>{#if p.lines}<path d={p.lines} fill="none" stroke="#485359" stroke-width=".65" vector-effect="non-scaling-stroke"/>{/if}{/each}
    {#if side==='plan'}{#each d.guides as g}<polyline points={g.points} fill="none" stroke="#226b85" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"><title>{g.label}</title></polyline>{/each}{/if}
    <g stroke="#496775" fill="none" stroke-width=".8" vector-effect="non-scaling-stroke">
      <path d={'M '+d.x0+' '+(d.y1+d.pad*.55)+' v '+d.pad*.55+' M '+d.x1+' '+(d.y1+d.pad*.55)+' v '+d.pad*.55+' M '+d.x0+' '+(d.y1+d.pad*.85)+' H '+d.x1} vector-effect="non-scaling-stroke"/>
      <path d={'M '+(d.x0-d.pad*.55)+' '+d.y0+' h '+(-d.pad*.55)+' M '+(d.x0-d.pad*.55)+' '+d.y1+' h '+(-d.pad*.55)+' M '+(d.x0-d.pad*.85)+' '+d.y0+' V '+d.y1} vector-effect="non-scaling-stroke"/>
    </g>
    <g text-anchor="middle" fill="#385560" font-size={d.font}>
      <text x={(d.x0+d.x1)/2} y={d.y1+d.pad*1.63}>{fmt(d.w)}</text>
      <text transform={'translate('+(d.x0-d.pad*1.12)+' '+((d.y0+d.y1)/2)+') rotate(-90)'}>{fmt(d.h)}</text>
    </g>
  </svg>
  {#if d.guides.length}<small class="guide-names">Streeplijn · {Array.from(new Set(d.guides.map(g=>g.label))).join(' / ')}</small>{/if}
</figure>
<style>
  figure{margin:0;display:flex;flex-direction:column;min-height:0;height:100%;background:#fff;color:#233139;border:1px solid var(--oa-border);}
  figcaption{padding:8px 10px;font:600 12px var(--oa-font-heading);display:flex;justify-content:space-between;gap:6px;}
  figcaption span{color:#586770;font:10px var(--oa-font-body);}
  svg{min-height:0;flex:1;width:100%;font-family:var(--oa-font-mono);}
  .guide-names{color:#426878;font-size:10px;padding:2px 10px 6px;}
  @media print{figure{height:78mm;break-inside:avoid;}figcaption{font-size:9pt;}}
</style>
