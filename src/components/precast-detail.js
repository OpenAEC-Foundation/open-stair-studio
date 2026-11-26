import { tube } from './solids.js';
import { addLocalBars,localBarFields } from './precast-local-bars.js';

const group = 'Wapenings- en instortdetails';
const mm = (key,label,value,min,max) => ({key,label,type:'number',default:value,min,max,step:1,unit:'mm',group});
export const precastDetailFields = [
  {key:'detailing',label:'Prefab engineering',type:'select',default:'none',options:[
    ['none','Alleen betonelement en oplegging'],['engineered','Wapening, hijsankers en verbindingen']]},
  mm('cover','Nominale betondekking op de matten',30,15,80),
  mm('mainDiameter','Diameter hoofdwapening',12,6,32),
  mm('mainPitch','Maximale afstand hoofdwapening h.o.h.',150,60,400),
  mm('crossDiameter','Diameter verdeelwapening',8,6,25),
  mm('crossPitch','Maximale afstand verdeelwapening h.o.h.',180,60,400),
  mm('liftDiameter','Buitendiameter hijshuls',24,12,48),
  mm('liftEmbed','Inbouwdiepte hijshuls met voet',100,45,300),
  mm('liftInset','Gewenste zijrandafstand hijspunten',240,80,600),
  mm('anchorDiameter','Diameter kopbout zijverbinding',16,10,32),
  mm('anchorEmbed','Inbedding kopbout vanaf zijvlak',120,55,350),
  {key:'anchorSide',label:'Zijverbinding aan elementzijde',type:'select',default:'lowY',group,
    options:[['lowY','Y = 0'],['highY','Y = elementbreedte']]},
  ...localBarFields
];
const pt=(x,y,z)=>({x,y,z});
const sub=(a,b)=>pt(a.x-b.x,a.y-b.y,a.z-b.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const along=(p,v,t)=>pt(p.x+v.x*t,p.y+v.y*t,p.z+v.z*t);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const two=i=>String(i).padStart(2,'0');
const linspace=(a,b,n)=>Array.from({length:n},(_,i)=>a+i*(b-a)/(n-1));
const spaced=(a,b,maximum)=>linspace(a,b,Math.max(2,1+Math.ceil((b-a)/maximum)));

function centroid(profile,width) {
  let area2=0,mx=0,mz=0;
  for(let i=0;i<profile.length;i++) {
    const [x,z]=profile[i], [xx,zz]=profile[(i+1)%profile.length], a=x*zz-xx*z;
    area2+=a;mx+=(x+xx)*a;mz+=(z+zz)*a;
  }
  return pt(mx/(3*area2),width/2,mz/(3*area2));
}

// Closest separation on two finite 3D segments, including parallel axes.
function segmentDistance(a,b,c,d) {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),uv=dot(u,v),uw=dot(u,w),vw=dot(v,w);
  const uu=dot(u,u),vv=dot(v,v),den=uu*vv-uv*uv;
  let s=den>1e-9?clamp((uv*vw-vv*uw)/den,0,1):0;
  const t=clamp((uv*s+vw)/vv,0,1);
  s=clamp((uv*t-uw)/uu,0,1);
  return distance(along(a,u,s),along(c,v,t));
}

// Revolved closed surface. The ordered radius/height profile also describes
// a central blind socket or a through-bore without overlapping cylinders.
function revolve(profile,map,sides=12) {
  const loops=profile.map(([r,z])=>Array.from({length:r?sides:1},(_,i)=>{
    const a=2*Math.PI*i/sides;
    return map(pt(r*Math.cos(a),r*Math.sin(a),z));
  }));
  const faces=[];
  for(let k=0;k<loops.length;k++) {
    const a=loops[k],b=loops[(k+1)%loops.length];
    if(a.length===1&&b.length===1) continue;
    for(let i=0;i<sides;i++) {
      const j=(i+1)%sides;
      faces.push(a.length===1?[a[0],b[j],b[i]]:b.length===1?[a[i],a[j],b[0]]:[a[i],a[j],b[j],b[i]]);
    }
  }
  return faces;
}

function drilledPlate(half,thick,bore,map) {
  const sides=16;
  const loop=(inside,z)=>Array.from({length:sides},(_,i)=>{
    const a=2*Math.PI*i/sides, c=Math.cos(a),s=Math.sin(a);
    const r=inside?bore:half/Math.max(Math.abs(c),Math.abs(s));
    return map(pt(c*r,s*r,z));
  });
  const faces=[], skins=[loop(true,0),loop(false,0),loop(false,thick),loop(true,thick)];
  for(let k=0;k<4;k++) for(let i=0;i<sides;i++) {
    const a=skins[k],b=skins[(k+1)%4],j=(i+1)%sides;
    faces.push([a[i],a[j],b[j],b[i]]);
  }
  return faces;
}

function gridData(p,host) {
  const {profile,place,width,run,rise,count,seat}=host, flight=host.cast.kind==='flight';
  const rawX=profile.map(([x])=>x),xmin=Math.min(...rawX),xmax=Math.max(...rawX);
  const thickness=flight?p.waist:p.landingThickness;
  const supportX=flight?[-(p.tongue+p.joint)/2,seat+(p.tongue+p.joint)/2]:[];
  const origin=place(pt(0,0,0));
  return {width,length:xmax-xmin,thickness,run:flight?run:xmax-xmin,rise:flight?rise:0,count,
    span:flight?supportX[1]-supportX[0]:width,supportX,centroid:centroid(profile,width),
    mainCount:0,mainDiameter:p.mainDiameter,mainPitch:0,d:thickness-p.cover-p.mainDiameter/2,
    axes:{origin,x:sub(place(pt(1,0,0)),origin),y:sub(place(pt(0,1,0)),origin)},profile,
    liftPoints:[],anchorPoints:[],geometryIssues:[]};
}

// local drawings and CNC schedules keep bar/anchor axes in the host datum;
// surface faces use component coordinates like every other stairwell part.
export function addPrecastDetails(p,host,parts) {
  const {cast,place,width,run,rise,seat,count}=host, flight=cast.kind==='flight';
  const data=gridData(p,host);cast.detail=data;
  const before=parts.length;
  const fail=msg=>data.geometryIssues.push(msg);
  const mr=p.mainDiameter/2,cr=p.crossDiameter/2,cover=p.cover;
  const slope=flight?rise/p.going:0,sec=Math.hypot(1,slope),lip=p.tongue+p.joint;
  const xmin=flight?0:p.joint, xmax=flight?seat:lip+p.landingDepth;
  const soffit=x=>flight?slope*(x-p.nosing)-p.waist*sec:-p.landingThickness;
  const valley=x=>flight?slope*(x-p.nosing):0;
  const m1=cover+mr,m2=cover+p.mainDiameter+cr,th=data.thickness;
  if(th<2*(cover+p.mainDiameter+p.crossDiameter)+1 ||
    (xmax-xmin)<2*(cover+Math.max(mr,cr))+1 || width<2*(cover+Math.max(mr,cr))+1 ||
    (!flight && (p.landingThickness-p.nib-p.pad<2*cover+p.mainDiameter+p.crossDiameter))) {
    fail('De twee wapeningsnetten of de onderwapening bij de bordessponning passen niet met deze dekking en diameters.');
    return;
  }
  const id=(tag,n)=>cast.id+'-'+tag+'-'+two(n);
  const obstacles=[];
  function bar(role,layer,tag,n,start,end,dia) {
    const lengthMm=distance(start,end),prefix=layer==='bottom'?'Onder':'Boven';
    parts.push({id:id(tag,n),parentId:cast.id,role,layer,position:tag+'-'+two(n),kind:'rebar',material:'rebar',
      label:prefix+'net · '+(role==='mainBar'?'hoofdstaaf':'verdeelstaaf'),start,end,diameterMm:dia,lengthMm,
      faces:tube(place(start),place(end),dia/2,10)});
    obstacles.push({start,end,r:dia/2});
  }
  for(const layer of ['bottom','top']) {
    const bottom=layer==='bottom', tag=bottom?'O':'B';
    const z=(x,depth)=>bottom?soffit(x)+depth*sec:valley(x)-depth*sec;
    const gridMin=!flight&&!bottom?lip:xmin;
    if(flight) {
      const ys=spaced(m1,width-m1,p.mainPitch),a=gridMin+m1,b=xmax-m1;
      if(bottom){data.mainCount=ys.length;data.mainPitch=ys[1]-ys[0];}
      ys.forEach((y,i)=>bar('mainBar',layer,tag+'H',i+1,pt(a,y,z(a,m1)),pt(b,y,z(b,m1)),p.mainDiameter));
      // Spacing of cross bars is specified along the actual sloping mat.
      spaced(gridMin+m2,xmax-m2,p.crossPitch/sec).forEach((x,i)=>
        bar('crossBar',layer,tag+'V',i+1,pt(x,cover,z(x,m2)),pt(x,width-cover,z(x,m2)),p.crossDiameter));
    } else {
      const xs=spaced(gridMin+m1,xmax-m1,p.mainPitch);
      if(bottom){data.mainCount=xs.length;data.mainPitch=xs[1]-xs[0];}
      xs.forEach((x,i)=>bar('mainBar',layer,tag+'H',i+1,pt(x,cover,z(x,m1)),pt(x,width-cover,z(x,m1)),p.mainDiameter));
      const a=gridMin+cover,b=xmax-cover;
      spaced(m2,width-m2,p.crossPitch).forEach((y,i)=>
        bar('crossBar',layer,tag+'V',i+1,pt(a,y,z(a,m2)),pt(b,y,z(b,m2)),p.crossDiameter));
    }
  }
  const clear=(a,b,r)=>obstacles.every(v=>segmentDistance(a,b,v.start,v.end)>=r+v.r+2);
  const byTarget=(values,target)=>[...values].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
  const lr=p.liftDiameter/2,footR=1.7*lr,embed=p.liftEmbed;
  const safeEnd=cover+footR;
  const fixed=p.liftLayout==='fixed';
  let xs=[];
  if(flight) {
    const left=Math.max(fixed&&p.finish!=='inlay'?p.bevel+lr+2:p.bevel+52+lr+2,footR+cover);
    const right=p.going-(p.nosing+footR+cover);
    if(right>=left) for(let i=0;i<count-1;i++){
      const from=i*p.going+left,to=i*p.going+right;
      xs.push(...(fixed?[p.liftStationAX,p.liftStationBX].filter(x=>x>=from&&x<=to):linspace(from,to,7)));
    }
  } else if(xmax-safeEnd>lip+safeEnd) xs=fixed?[p.liftStationAX,p.liftStationBX].filter(x=>x>=lip+safeEnd&&x<=xmax-safeEnd):linspace(lip+safeEnd,xmax-safeEnd,39);
  const cg=data.centroid.x,spread=(xmax-xmin)*.24;
  const xMargin=fixed?0:footR*2;
  const xRows=[byTarget(xs.filter(x=>x<cg-xMargin && (!fixed||x===p.liftStationAX)),cg-spread),
    byTarget(xs.filter(x=>x>cg+xMargin && (!fixed||x===p.liftStationBX)),cg+spread)];
  // The head of a flight insert is on a horizontal tread, behind its inlay.
  const topAt=x=>flight?(Math.floor(x/p.going)+1)*rise:0;
  const ys=width/2-safeEnd>safeEnd?(fixed?[p.liftStationY].filter(y=>y>=safeEnd&&y<=width/2-safeEnd):
    byTarget(linspace(safeEnd,width/2-safeEnd,25),Math.min(p.liftInset,width*.28))):[];
  let layout;
  for(const y of ys) {
    const rows=xRows.map(row=>row.find(x=>{
      const z=topAt(x);
      if(z-embed < soffit(x)+(cover+footR*Math.abs(slope)/sec)*sec) return false;
      return [y,width-y].every(v=>clear(pt(x,v,z-embed),pt(x,v,z),footR));
    }));
    if(rows.every(Number.isFinite)&&rows[1]-rows[0]>=2*footR+2) {layout={rows,y};break;}
  }
  if(!layout) fail(fixed?'De ingevoerde hijsstations passen niet bij de dekking, wapeningsnetten, inbouwdiepte, het zwaartepunt of het vlakke loopvlak. Controleer beide X-maten en de Y-randafstand.':
    'Vier hijshulzen passen niet vrij tussen de netten met deze inbouwdiepte, randafstand en tredegeometrie.');
  else {
    let n=0;
    for(const x of layout.rows) for(const y of [layout.y,width-layout.y]) {
      const z=topAt(x),start=pt(x,y,z),end=pt(x,y,z-embed);
      const map=a=>place(pt(x+a.x,y+a.y,z+a.z));
      const footT=Math.min(10,embed*.12),mouth=lr*.57;
      const profile=[[0,-embed],[footR,-embed],[footR,-embed+footT],[lr,-embed+footT],[lr,0],[mouth,0],[mouth,-embed*.4],[0,-embed*.4]];
      n++;data.liftPoints.push(start);obstacles.push({start,end,r:footR});
      parts.push({id:id('H',n),position:'H-'+two(n),parentId:cast.id,role:'liftAnchor',kind:'fastener',material:'steel',
        label:'Hijshuls met ankervoet',start,end,diameterMm:p.liftDiameter,lengthMm:embed,faces:revolve(profile,map)});
    }
  }
  const side=p.anchorSide==='lowY'?0:width,sign=side===0?1:-1;
  const ar=p.anchorDiameter/2,headR=1.6*ar,half=Math.max(30,3.1*ar),thick=Math.max(6,ar);
  const nutH=ar*1.4,exposed=thick+nutH+4;
  const candidates=flight?Array.from({length:count-1},(_,i)=>linspace((i+.28)*p.going,(i+.74)*p.going,7)).flat():
    linspace(lip+cover+half,xmax-cover-half,39);
  function locateAnchor(target,after) {
    const xs=byTarget(candidates.filter(x=>after?x>cg+half:x<cg-half),target);
    for(const x of xs) {
      const lo=soffit(x)+half*sec+4,hi=topAt(x)-half-4;
      if(lo>=hi || x-half<=xmin || x+half>=xmax || (!flight&&x-half<=lip)) continue;
      // Keep the whole contact plate below the horizontal surface on the
      // lower neighbouring step, including its chamfer and nosing.
      const topLeft=flight?topAt(x-half-p.bevel):0;
      const cap=Math.min(hi,topLeft-half-4);
      if(cap<lo) continue;
      for(const z of byTarget(linspace(lo,cap,13),(lo+cap)/2)) {
        const a=pt(x,side,z), b=pt(x,side+sign*p.anchorEmbed,z);
        if(p.anchorEmbed+cover>=width || !clear(a,b,headR)) continue;
        return a;
      }
    }
  }
  const anchors=[locateAnchor(cg-spread,false),locateAnchor(cg+spread,true)];
  if(!anchors.every(Boolean)) fail('De twee verankeringsplaten met kopbouten passen niet vrij in de zijkant. Controleer plaatruimte, inbedding en wapening.');
  else anchors.forEach((start,i)=>{
    const n=i+1,{x,y,z}=start,at=h=>pt(x,y+sign*h,z);
    // Local revolution Z points inward from the selected side face.
    const map=a=>place(pt(x+a.x,y+sign*a.z,z-sign*a.y));
    const metadata=(tag,role,label,kind,a,b)=>({id:id(tag,n),position:tag+'-'+two(n),parentId:cast.id,role,label,kind,material:'steel',start:at(a),end:at(b),lengthMm:Math.abs(b-a)});
    const bore=ar+1.5;
    data.anchorPoints.push(start);
    parts.push({...metadata('P','connectionPlate','Aansluitplaat met boutgat','plate',-thick,0),
      widthMm:half*2,heightMm:half*2,thicknessMm:thick,boreMm:bore*2,
      faces:drilledPlate(half,thick,bore,a=>map(pt(a.x,a.y,a.z-thick)))});
    parts.push({...metadata('A','anchorBolt','Ingestorte kopbout','fastener',-exposed,p.anchorEmbed),
      diameterMm:p.anchorDiameter,embedMm:p.anchorEmbed,faces:revolve([[0,-exposed],[ar,-exposed],[ar,p.anchorEmbed-ar],
        [headR,p.anchorEmbed-ar],[headR,p.anchorEmbed],[0,p.anchorEmbed]],map)});
    // Hexagonal nut with a through-bore. Across-flats rather than circumscribed diameter.
    const acrossFlats=3.2*ar,nutR=acrossFlats/Math.sqrt(3);
    parts.push({...metadata('M','anchorNut','Zeskantmoer zijverbinding','fastener',-thick-nutH,-thick),
      diameterMm:p.anchorDiameter,faces:revolve([[ar/Math.cos(Math.PI/6),-thick-nutH],[nutR,-thick-nutH],[nutR,-thick],[ar/Math.cos(Math.PI/6),-thick]],map,6)});
  });
  if(p.localReinforcement==='detailed') addLocalBars(p,host,parts);
  data.partCount=parts.length-before;
}
