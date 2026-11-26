<script>
  export let assembly, sheet, zone;
  export let zones=[],onselect=()=>{};
  $: selected=zone;
  $: pictures=geometry(assembly,sheet,selected);

  function geometry(assembly,sheet,zone) {
    if (!zone) return [];
    const target=assembly.parts.find(p=>p.id===zone.targetId);
    if (!target) return [];
    const {axes,profile,width}=sheet.cast.detail;
    const {x,y,rotation}=assembly.instance,theta=rotation*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
    const z0=Math.min(...sheet.cast.faces.flat().map(v=>v.z))-Math.min(...profile.map(v=>v[1]));
    function local(p) {
      const u=(p.x-x)*c+(p.y-y)*s-axes.origin.x,v=(p.y-y)*c-(p.x-x)*s-axes.origin.y;
      return {x:u*axes.x.x+v*axes.x.y,y:u*axes.y.x+v*axes.y.y,z:p.z-z0};
    }
    const hardware=[target];
    if(zone.kind==='anchorage') {
      const suffix=target.position.slice(2);
      hardware.push(...sheet.parts.filter(p=>['anchorNut','connectionPlate'].includes(p.role)&&p.position.slice(2)===suffix));
    }
    // A middle landing can receive strips owned by two different flights.
    // Always convert steel/rubber solids from their placed world coordinates.
    const faces=hardware.flatMap(part=>part.faces.map(face=>face.map(local)));
    const yy=faces.flat().map(p=>p.y);
    const rangeY='Y '+Math.round(Math.min(...yy))+'…'+Math.round(Math.max(...yy))+' mm';
    const bars=sheet.parts.filter(p=>p.targetId===zone.targetId&&p.path);
    const xs=profile.map(v=>v[0]),xmin=Math.min(...xs),xmax=Math.max(...xs);
    const plan=[[xmin,0],[xmax,0],[xmax,width],[xmin,width]],bearing=zone.kind==='bearing';
    const cutX=target.start?.x;
    const heights=[];
    if(Number.isFinite(cutX)) for(let i=0;i<profile.length;i++) {
      const [x0,z0]=profile[i],[x1,z1]=profile[(i+1)%profile.length];
      if ((x0<=cutX&&cutX<x1)||(x1<=cutX&&cutX<x0)) heights.push(z0+(cutX-x0)*(z1-z0)/(x1-x0));
    }
    const cut=heights.length>=2&&zone.kind==='anchorage';
    const zmin=Math.min(...heights),zmax=Math.max(...heights);
    const definitions=[
      {label:bearing?'Boven · Y–X · '+rangeY:'Boven · X–Y',project:bearing?p=>[p.y,p.x]:p=>[p.x,p.y],contour:bearing?plan.map(([a,b])=>[b,a]):plan},
      cut?{label:'Dwars · Y–Z',project:p=>[p.y,p.z],contour:[[0,zmin],[width,zmin],[width,zmax],[0,zmax]]}:
        {label:'Langs · X–Z',project:p=>[p.x,p.z],contour:profile}
    ];
    return definitions.map(({label,project,contour})=>{
      const pts=[...faces.flat(),...bars.flatMap(b=>b.path)].map(project);
      const xx=pts.map(a=>a[0]),yy=pts.map(a=>a[1]),lo=Math.min(...xx),hi=Math.max(...xx),b=Math.min(...yy),t=Math.max(...yy);
      const scale=Math.min(208/Math.max(hi-lo+40,100),89/Math.max(t-b+40,100));
      const point=([a,h])=>[(114+(a-(lo+hi)/2)*scale).toFixed(2),(53-(h-(t+b)/2)*scale).toFixed(2)].join(',');
      return {label,shell:contour.map(point).join(' '),hardware:faces.map(f=>f.map(p=>point(project(p))).join(' ')),
        bars:bars.map(bar=>({id:bar.position,width:Math.max(.9,bar.diameterMm*scale),points:bar.path.map(p=>point(project(p))).join(' ')}))};
    });
  }
</script>
{#if selected && pictures.length}
  <figure class="zone-detail">
    <figcaption>Ligging bijlegwapening · {selected.targetId}</figcaption>
    {#if zones.length>1}<select aria-label="Afgebeelde voorziening" value={selected.targetId} onchange={e=>onselect(e.currentTarget.value)}>
      {#each zones as z}<option value={z.targetId}>{z.label} · {z.targetId}</option>{/each}
    </select>{/if}
    <div class="panels">
      {#each pictures as p}<div class="panel"><span>{p.label}</span>
        <svg viewBox="0 0 228 106" role="img" aria-label={p.label+' bijlegwapening bij '+selected.targetId}>
          <polygon points={p.shell} fill="#eeede7" stroke="#74848a" stroke-width="1"/>
          {#each p.hardware as f}<polygon points={f} fill="#566a7a" stroke="#566a7a" stroke-width=".16"/>{/each}
          {#each p.bars as b}<polyline points={b.points} fill="none" stroke="#754399" stroke-width={b.width} stroke-linejoin="round" stroke-linecap="round"><title>{b.id}</title></polyline>{/each}
        </svg>
      </div>{/each}
    </div>
    <small>Projectie · <i class="concrete"></i> beton <i class="insert"></i> voorziening <i class="bars"></i> bijlegstaal</small>
  </figure>
{/if}
<style>
  .zone-detail{min-width:0;max-width:550px;margin:0;border:1px solid #c5cbcd;background:white;color:#293b43;padding:4px 6px;}
  figcaption{font:600 11px var(--oa-font-body);line-height:1.3;overflow-wrap:anywhere;}
  select{max-width:100%;margin:3px 0;font-size:10px;}
  .panels{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:3px 0;}
  .panel{position:relative;border:1px solid #d9dfe0;overflow:hidden;}
  .panel span{position:absolute;top:1px;left:2px;font-size:9px;line-height:1.15;background:rgba(255,255,255,.88);}
  .panel svg{display:block;width:100%;height:80px;overflow:hidden;}
  small{display:block;font-size:9px;color:#485962;}
  i{display:inline-block;vertical-align:baseline;width:10px;height:6px;border:1px solid #849197;margin:0 1px 0 4px;}
  .concrete{background:#eeede7;}.insert{background:#566a7a;}.bars{background:#754399;}
  @media print{.zone-detail{max-width:119mm;break-inside:avoid;padding:1mm 1.4mm;print-color-adjust:exact;}
    figcaption{font-size:8pt;}.panel svg{height:22mm;}small,.panel span{font-size:6.7pt;}select{display:none;}}
</style>
