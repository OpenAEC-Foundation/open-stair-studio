import { cncIdentifier } from './housing-cam.js';
import earcut from 'earcut';
import { checkShoulderReach } from './riser-board-reach.js';
import { defaultRiserCam, defaultRiserDetailCam, validateRiserCamField } from './riser-board-settings.js';

const EPS = 1e-7;
const pt = (x,y,z=0) => ({x,y,z});
const plus = (a,b,s=1) => pt(a.x+s*b.x,a.y+s*b.y,a.z+s*b.z);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const difference = (a,b) => plus(a,b,-1);
const cross = (a,b) => pt(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const box = (x0,x1,y0,y1) => ({x0,x1,y0,y1});
const rect = b => [pt(b.x0,b.y0),pt(b.x1,b.y0),pt(b.x1,b.y1),pt(b.x0,b.y1)];
const range = (points,key) => [Math.min(...points.map(p=>p[key])),Math.max(...points.map(p=>p[key]))];
const coord = (f,p) => {
  const v=difference(p,f.origin);
  return pt(dot(f.xAxis,v),dot(f.yAxis,v),dot(f.zAxis,v));
};
const world = (f,p) => plus(plus(plus(f.origin,f.xAxis,p.x),f.yAxis,p.y),f.zAxis,p.z);
const unique = values => [...values].sort((a,b)=>a-b).filter((v,i,arr)=>i===0 || v-arr[i-1]>EPS);
const format = n=>String(Number(n.toFixed(5)));
const vertical=pt(0,0,1);
const crosses = (a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points) {
  const sorted=[...points].sort((a,b)=>a.x-b.x || a.y-b.y);
  const half = row => {
    const result=[];
    for(const p of row){
      while(result.length>1 && crosses(result.at(-2),result.at(-1),p)<=EPS) result.pop();
      result.push(p);
    }
    return result.slice(0,-1);
  };
  return [...half(sorted),...half(sorted.reverse())];
}

function readStock(part) {
  if(!part || part.role!=='riser' || !part.riserFrame || !part.faces?.length)
    throw new Error('Deze opspanningen vragen een verticaal stootbord met vastgelegde plankassen.');
  const f=part.riserFrame,t=part.thicknessMm,h=part.heightMm;
  const localPlan=part.planPoints?.map(p=>coord(f,{...p,z:f.origin.z})) ??
    rect(box(0,t,0,part.lengthMm));
  const prisms=[{plan:localPlan,z0:0,z1:h}];
  for(const feature of part.joineryFeatures??[]){
    const vertices=feature.tongueWorldContour.flatMap(p=>[p,plus(p,feature.inward,feature.tongueDepth)]).map(p=>coord(f,p));
    const [z0,z1]=range(vertices,'z');
    const plan=hull(vertices);
    if(plan.length!==4 || !(z1>z0) || !vertices.every(p=>Number.isFinite(p.x+p.y+p.z)))
      throw new Error('Onvolledige CNC-geometrie van de lip in '+feature.hostId+'.');
    prisms.push({plan,z0,z1,feature});
  }
  const vertices=part.faces.flat().map(p=>coord(f,p));
  const [x0,x1]=range(vertices,'x'),[y0,y1]=range(vertices,'y'),[z0,z1]=range(vertices,'z');
  if([x0,x1,y0,y1,z0,z1].some(v=>!Number.isFinite(v)) || Math.abs(x1-x0-t)>.001 ||
      Math.abs(y1-y0-part.stockLengthMm)>.001 || Math.abs(z1-z0-part.stockWidthMm)>.001)
    throw new Error('De ruwplank komt niet overeen met de afgewerkte stootbordgeometrie.');
  const blank={plan:rect(box(x0,x1,y0,y1)),z0,z1};
  const corners=[z0,z1].flatMap(z=>blank.plan.map(p=>world(f,{...p,z})));
  // A split facet can be coplanar with the cutter floor while only the
  // adjoining facet rises above it. Project the positive-volume pieces,
  // never the coplanar shoulder itself or a hull spanning separated pieces.
  const indices=earcut(localPlan.flatMap(p=>[p.x,p.y])),sections=[];
  for(let k=0;k<indices.length;k+=3) sections.push({...prisms[0],plan:indices.slice(k,k+3).map(j=>localPlan[j])});
  sections.push(...prisms.slice(1));
  return {prisms,sections,blank,stock:{length:y1-y0,height:z1-z0,thickness:x1-x0,corners},
    datum:world(f,pt(x0,(y0+y1)/2,(z0+z1)/2))};
}

// Horizontal end machining. Every piece is a vertical extrusion. Above
// the current cutter floor its exact orthographic shadow is a rectangle:
// the projection of a connected plan section times its true height band.
function endShadow(prism,frame,depth,toolFloor) {
  const plan=prism.plan.map(p=>coord(frame,{...p,z:prism.z0}));
  const high=Math.max(...plan.map(p=>p.z));
  if(high<=depth+(toolFloor?EPS:-EPS)) return null;
  const xs=[];
  for(let i=0;i<plan.length;i++){
    const a=plan[i],b=plan[(i+1)%plan.length];
    if(a.z>=depth-EPS) xs.push(a.x);
    if((a.z-depth)*(b.z-depth)<0) xs.push(a.x+(b.x-a.x)*(depth-a.z)/(b.z-a.z));
  }
  if(!xs.length) return null;
  return box(Math.min(...xs),Math.max(...xs),prism.z0-frame.origin.z,prism.z1-frame.origin.z);
}

function clipPlan(plan,measure) {
  const out=[];
  plan.forEach((a,i)=>{
    const b=plan[(i+1)%plan.length],da=measure(a),db=measure(b);
    if(da>=-EPS) out.push(a);
    if(da*db<0) out.push(plus(a,difference(b,a),da/(da-db)));
  });
  return out;
}

// All maximal empty rectangles of the orthogonal stock shadow. Sweeps
// overlap between rectangles, so a convex outside tenon corner stays sharp.
function emptyRectangles(stock,obstacles) {
  const xs=unique([stock.x0,stock.x1,...obstacles.flatMap(b=>[b.x0,b.x1])
    .filter(x=>x>stock.x0 && x<stock.x1)]);
  const results=[];
  for(let i=0;i<xs.length-1;i++){
    for(let j=i+1;j<xs.length;j++){
      const blocked=obstacles.filter(b=>b.x1>xs[i]+EPS && b.x0<xs[j]-EPS).sort((a,b)=>a.y0-b.y0);
      let start=stock.y0;
      function add(end) {
        if(end>start+EPS) results.push(box(xs[i],xs[j],start,Math.min(end,stock.y1)));
      }
      for(const b of blocked){
        if(b.y0>=stock.y1) break;
        add(b.y0);
        start=Math.max(start,b.y1);
      }
      add(stock.y1);
    }
  }
  return results.filter((b,i)=>b.y1>b.y0+EPS && !results.some((a,j)=>i!==j &&
    a.x0<=b.x0+EPS && a.x1>=b.x1-EPS && a.y0<=b.y0+EPS && a.y1>=b.y1-EPS));
}

function clearLayer(paths,z,stock,keep,cam,budget) {
  if(!stock || stock.x1-stock.x0<EPS || stock.y1-stock.y0<EPS) return;
  const r=cam.toolDiameter/2+.00002;
  // Allow centre lines beyond a stock edge; the jig must leave this apron free.
  const apron=box(stock.x0-2*r,stock.x1+2*r,stock.y0-2*r,stock.y1+2*r);
  for(const region of emptyRectangles(apron,keep)) {
    if(region.x1<stock.x0 || region.x0>stock.x1 || region.y1<stock.y0 || region.y0>stock.y1) continue;
    const x0=Math.max(region.x0+r,stock.x0-r), x1=Math.min(region.x1-r,stock.x1+r);
    const y0=Math.max(region.y0+r,stock.y0-r), y1=Math.min(region.y1-r,stock.y1+r);
    if(x1<x0-EPS || y1<y0-EPS) continue;
    const acrossX=x1-x0<y1-y0;
    const span=acrossX?x1-x0:y1-y0;
    const count=Math.max(1,Math.ceil(span/(cam.toolDiameter*cam.stepoverPercent/100)));
    budget.remaining-=2*(count+1)+9;
    if (budget.remaining<0)
      throw new Error('Meer dan 100.000 NC-regels voor dit stootbord. Controleer freesdiameter, baanstap en dieptestap.');
    const points=[];
    for(let i=0;i<=count;i++){
      const q=span*i/count;
      const ends=acrossX?[pt(x0+q,y0),pt(x0+q,y1)]:[pt(x0,y0+q),pt(x1,y0+q)];
      points.push(...(i%2?ends.reverse():ends));
    }
    // A raster's end caps only touch the shoulder at isolated points.
    // Finish all four edges with a continuous tangent pass.
    points.push(pt(x0,y0),pt(x1,y0),pt(x1,y1),pt(x0,y1),pt(x0,y0));
    paths.push({z,points});
  }
}

function makeSetup(part,geometry,cam,metadata,spec,budget) {
  const {prisms,blank,stock,datum}=geometry;
  const {axis,side,root,id,label}=spec;
  const verticalSetup=Math.abs(axis.z)>.5;
  const xAxis=verticalSetup?pt(0,1):pt(-axis.y,axis.x);
  const yAxis=cross(axis,xAxis);
  const unitFrame={origin:pt(0,0),xAxis,yAxis,zAxis:axis};
  const localCorners=stock.corners.map(p=>coord(part.riserFrame,p));
  const projected=localCorners.map(p=>coord(unitFrame,p));
  const [minX,maxX]=range(projected,'x'),[minY,maxY]=range(projected,'y');
  const [,maxZ]=range(projected,'z');
  const localFrame={...unitFrame,origin:world(unitFrame,pt(minX,minY,maxZ))};
  const projection=p=>coord(localFrame,p);
  const floor=dot(axis,root)-maxZ;
  let start=0, localBlank=blank;
  if(spec.flank) {
    // Only sweep the outside of this shoulder. In a tangent setup the
    // other end of the plank may project far above this small cutter bay.
    // Bound stock engagement in the bay; rapid Z stays above the whole blank.
    const plan=clipPlan(blank.plan,p=>dot(spec.normal,difference(p,root))+2*cam.toolDiameter);
    if(plan.length<3) return null;
    localBlank={...blank,plan};
    start=Math.max(...plan.map(p=>dot(p,axis)))-maxZ;
  }
  const depth=start-floor;
  if(depth<EPS) return null;
  if(depth>cam.fluteLength+EPS) throw new Error(label+' vraagt een snijlengte van ten minste '+Math.ceil(depth*10)/10+' mm.');
  const paths=[];
  const islands=[];
  const toBoardWorldVector=p=>difference(world(part.riserFrame,p),part.riserFrame.origin);
  const frame={origin:world(part.riserFrame,localFrame.origin),xAxis:toBoardWorldVector(xAxis),
    yAxis:toBoardWorldVector(yAxis),zAxis:toBoardWorldVector(axis)};
  const outline=rect(box(0,maxX-minX,0,maxY-minY));
  const levels=[start,floor];
  for(const prism of prisms.slice(1)){
    const feature=prism.feature;
    if(dot(feature.inward,frame.zAxis)<1-EPS) continue;
    const tipPlane=dot(axis,coord(part.riserFrame,plus(feature.tongueWorldContour[0],feature.inward,feature.tongueDepth)))-maxZ;
    if(tipPlane>floor+EPS && tipPlane<start-EPS) levels.push(tipPlane);
    islands.push(hull(feature.tongueWorldContour.map(p=>coord(frame,p))));
  }
  const uniqueLevels=unique(levels).reverse();
  for(let j=1;j<uniqueLevels.length;j++){
    const from=uniqueLevels[j-1],to=uniqueLevels[j],n=Math.ceil((from-to)/cam.stepDown);
    for(let i=1;i<=n;i++){
      const z=from+(to-from)*i/n;
      if(verticalSetup){
        // On the top and foot only the corresponding longitudinal tongue
        // projects above the body; it is rectangular in this machine plane.
        const keep=prisms.slice(1).filter(p=>axis.z>0?p.z1>maxZ+z+EPS:-p.z0>maxZ+z+EPS).map(p=>{
          const pts=p.plan.map(q=>projection({...q,z:p.z0}));
          return box(...range(pts,'x'),...range(pts,'y'));
        });
        clearLayer(paths,z,box(0,maxX-minX,0,maxY-minY),keep,cam,budget);
      } else {
        const stockShadow=endShadow(localBlank,localFrame,z,false);
        const keep=geometry.sections.map(p=>endShadow(p,localFrame,z,true)).filter(Boolean);
        if(spec.flank && stockShadow){
          const shoulder=projection(root).x,toward=dot(xAxis,spec.normal);
          if(toward>0) stockShadow.x0=Math.max(stockShadow.x0,shoulder);
          else stockShadow.x1=Math.min(stockShadow.x1,shoulder);
        }
        clearLayer(paths,z,stockShadow,keep,cam,budget);
      }
    }
  }
  if(!paths.length) return null;
  return {id,label,width:maxX-minX,height:maxY-minY,depth,frame,boardAxes:{xAxis,yAxis,zAxis:axis},
    parameters:cam,toolRole:spec.detail?'detail':'primary',
    datum:coord(frame,datum),angleDeg:verticalSetup?0:Math.atan2(axis.x,Math.abs(axis.y))*180/Math.PI,
    endEdge:spec.endEdge,description:verticalSetup?'Plank op kant. Klem op beide brede vlakken.':
      spec.flank?'Spil evenwijdig aan het kopvlak. De freesflank werkt de knik af vanaf de brede plankzijde.':'Kopvlak naar de spil. Indexeer de mal op de opgegeven wanghoek.',
    side,outline,islands,paths,fileStem:[metadata.number,metadata.revision,part.id,
      metadata.turnDirection,Number.isFinite(metadata.nosing)?'neus-'+format(metadata.nosing):'',id,'D'+format(cam.toolDiameter)].filter(Boolean)
      .map(s=>cncIdentifier(s,40,true)).join('_')};
}

function toolsFor(settings,defaults) {
  const cam=Object.fromEntries(Object.keys(defaults).map(k=>[k,validateRiserCamField(k,settings[k]??defaults[k])]));
  if(cam.stepDown>cam.fluteLength || cam.plungeFeed>cam.cutFeed) throw new Error('Controleer snijlengte, dieptestap en insteekvoeding.');
  return cam;
}

export function compileRiserBoardJob(part,parameters=defaultRiserCam,metadata={},issues=[],detailParameters=defaultRiserDetailCam) {
  const error=issues.find(i=>i.level==='error' && (!i.riserId || i.riserId===part?.id));
  if(error || part?.fabricationIssue) throw new Error(error?.message??part.fabricationIssue);
  const cam=toolsFor(parameters,defaultRiserCam);
  const geometry=readStock(part),body=geometry.prisms[0],h=part.heightMm;
  const specs=[{id:'bovenkant',label:'Bovenkant',axis:vertical,root:pt(0,0,h)},
    {id:'voet',label:'Voet',axis:pt(0,0,-1),root:pt(0,0)}];
  const plan=body.plan;
  const area=plan.reduce((s,a,i)=>s+a.x*plan[(i+1)%plan.length].y-a.y*plan[(i+1)%plan.length].x,0);
  const counts={links:0,rechts:0};
  const detailSides=new Set();
  for(let i=0;i<plan.length;i++){
    const a=plan[i],b=plan[(i+1)%plan.length],dx=b.x-a.x,dy=b.y-a.y;
    const len=Math.hypot(dx,dy);
    if(len<EPS || Math.abs(dx)/len<EPS) continue; // Thickness is planed before machining.
    const axis=pt(Math.sign(area)*dy/len,-Math.sign(area)*dx/len);
    const side=axis.y>0?'links':'rechts', number=++counts[side];
    const endEdge=[a,b].map(({x,y})=>({x,y}));
    specs.push({id:side+'-'+number,label:'Kop '+side+' · vlak '+number,side,axis,root:a,endEdge});
    for(const [corner,other,index] of [[a,b,i],[b,a,(i+1)%plan.length]]){
      const turn=Math.sign(area)*crosses(plan[(index+plan.length-1)%plan.length],corner,plan[(index+1)%plan.length]);
      if(turn< -EPS) {
        const tangent=pt((other.x-corner.x)/len,(other.y-corner.y)/len);
        // The room between a protected tenon cheek and the adjacent rising
        // facet is measured in this shoulder plane, not across the stock.
        const lip=geometry.prisms.slice(1).find(({feature})=>{
          const n=feature.inward;
          return dot(n,part.riserFrame.xAxis)*axis.x+dot(n,part.riserFrame.yAxis)*axis.y>1-EPS;
        });
        if(lip){
          const gap=Math.min(...lip.feature.tongueWorldContour.map(p=>dot(tangent,difference(coord(part.riserFrame,p),corner))));
          if(gap<cam.toolDiameter+.001) detailSides.add(side);
          // The normal-facing pass can reach this entire land with the
          // appropriate diameter. Its own tenon blocks a tangent approach.
          continue;
        }
        if(geometry.prisms.some(({feature})=>feature && Math.sign(dot(feature.inward,part.riserFrame.yAxis))===Math.sign(axis.y)))
          specs.push({id:side+'-flank-'+number+'-'+(index+1),label:'Kop '+side+' · flank '+number+' bij knik '+(index+1),
            side,axis:tangent,normal:axis,root:corner,endEdge,flank:true});
      }
    }
  }
  const budget={remaining:100000-specs.length*20};
  const detail=detailSides.size?toolsFor(detailParameters,defaultRiserDetailCam):cam;
  const setups=specs.map(spec=>{
    spec.detail=detailSides.has(spec.side) && detail.toolDiameter<cam.toolDiameter;
    return makeSetup(part,geometry,spec.detail?detail:cam,metadata,spec,budget);
  }).filter(Boolean);
  const job={partId:part.id,stock:geometry.stock,datum:{name:'K',length:geometry.stock.length/2,height:geometry.stock.height/2},
    parameters:cam,setups};
  checkShoulderReach(part,geometry,job);
  return job;
}

export function writeRiserBoardLinuxCnc(job,setup) {
  if(!job.setups.includes(setup)) throw new Error('Selecteer de opspanning van dit stootbord.');
  const cam=setup.parameters,xyz=p=>'X'+format(p.x)+' Y'+format(p.y)+' Z'+format(p.z);
  const lines=['(Open Stair Studio - LinuxCNC indexed 3-axis riser)','(File '+setup.fileStem+')',
    '(One file per fixture orientation. Probe datum K at G54 '+xyz(setup.datum)+'.)',
    '(Exact rectangular stock. Clamp wide faces clear of cutter and holder. Centre-cut end mill D'+format(cam.toolDiameter)+' mm.)',
    ...['xAxis','yAxis','zAxis'].map(k=>'('+k+' in board thickness / length / height: '+xyz(setup.boardAxes[k])+')'),
    'G21 G17 G90 G94 G97 G40 G49 G80 G61 G54','G0 Z'+format(cam.safeZ),'M3 S'+format(cam.spindleSpeed)];
  for(const path of setup.paths){
    const xy=p=>'X'+format(p.x)+' Y'+format(p.y);
    lines.push('G0 Z'+format(cam.safeZ),'G0 '+xy(path.points[0]),'G1 Z'+format(path.z)+' F'+format(cam.plungeFeed));
    path.points.slice(1).forEach((p,i)=>lines.push('G1 '+xy(p)+(i?'':' F'+format(cam.cutFeed))));
  }
  lines.push('G0 Z'+format(cam.safeZ),'M5','M2');
  return lines.join('\n')+'\n';
}
