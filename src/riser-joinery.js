const EPS = 1e-6;
const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const rect = (x0,y0,x1,y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const dimensions = box => [box[1]-box[0],box[3]-box[2],box[5]-box[4]];
const volume = box => dimensions(box).reduce((v,n)=>v*n,1);
const bounds = points => ['x','y','z'].flatMap(k=>[
  Math.min(...points.map(p=>p[k])),Math.max(...points.map(p=>p[k]))
]);
const overlap = (a,b,i) => Math.min(a[i+1],b[i+1])-Math.max(a[i],b[i]);
const local = (frame,p) => {
  const delta=sub(p,frame.origin);
  return {x:dot(delta,frame.xAxis), y:dot(delta,frame.yAxis), z:dot(delta,frame.zAxis)};
};

// Orthogonal millimetre cells share their boundaries. Emit only external
// faces, including split edges where a shoulder joins a tongue.
function boardMesh(boxes,world) {
  const cuts=[0,1,2].map(axis=>[...new Set(boxes.flatMap(b=>b.slice(2*axis,2*axis+2)))].sort((a,b)=>a-b));
  const cells=new Set();
  const key=(a,b,c)=>[a,b,c].join(',');
  const [x,y,z]=cuts;
  for(let i=0;i<x.length-1;i++) for(let j=0;j<y.length-1;j++) for(let k=0;k<z.length-1;k++){
    if(boxes.some(b=>x[i]>=b[0] && x[i+1]<=b[1] && y[j]>=b[2] && y[j+1]<=b[3] && z[k]>=b[4] && z[k+1]<=b[5]))
      cells.add(key(i,j,k));
  }
  const faces=[];
  for(const index of cells) {
    const [i,j,k]=index.split(',').map(Number);
    const floor=rect(x[i],y[j],x[i+1],y[j+1]).map(([a,b])=>world(a,b,z[k]));
    const roof=floor.map(p=>({...p,z:p.z+z[k+1]-z[k]}));
    if(!cells.has(key(i,j,k-1))) faces.push([...floor].reverse());
    if(!cells.has(key(i,j,k+1))) faces.push(roof);
    const neighbours=[[i,j-1,k],[i+1,j,k],[i,j+1,k],[i-1,j,k]];
    neighbours.forEach((n,a)=>{
      const b=(a+1)%4;
      if(!cells.has(key(...n))) faces.push([floor[a],floor[b],roof[b],roof[a]]);
    });
  }
  return faces;
}

function insideBoard(loop,polygon) {
  const area=polygon.reduce((sum,a,i)=>{
    const b=polygon[(i+1)%polygon.length];
    return sum+a.x*b.y-b.x*a.y;
  },0);
  const sign=Math.sign(area);
  return sign!==0 && polygon.every((a,i)=>{
    const b=polygon[(i+1)%polygon.length], dx=b.x-a.x, dy=b.y-a.y;
    return loop.every(p=>sign*(dx*(p.y-a.y)-dy*(p.x-a.x))>EPS*Math.hypot(dx,dy));
  });
}

// Upper tread: the underside groove and its vertical tongue start behind the
// nose arris. Its remaining roof is checked even with a bevelled or round nose.
function roofAt(tread,stair,p) {
  const x=(p.x-tread.frontEdge[0].x)*tread.direction.x+(p.y-tread.frontEdge[0].y)*tread.direction.y;
  const r=Number(stair.noseSize);
  if(x<0 || !r || x>=r) return tread.thickness;
  if(stair.noseProfile==='bevel') return tread.thickness-r+x;
  if(stair.noseProfile==='round') return tread.thickness-r+Math.sqrt(Math.max(0,2*r*x-x*x));
  return tread.thickness;
}

// Conservative interval along world Z through the beam at both slot edges
// and at full milling depth. All beam planes have unit normals in setup XYZ.
function beamInterval(job,world,x0,x1,y,depth,lo,hi) {
  const f=job.frame;
  for(const x of [x0,x1]){
    const p=local(f,world(x,y,0));
    if(Math.abs(p.z)>EPS) return null;
    for(const {a,b,c,d} of job.stockPlanes){
      if(Math.abs(c)>1-EPS) continue;
      const slope=a*f.xAxis.z+b*f.yAxis.z;
      const room=d-(a*p.x+b*p.y+Math.max(0,-c*depth))-1;
      if(Math.abs(slope)<EPS) {if(room<0)return null;}
      else if(slope>0) hi=Math.min(hi,room/slope);
      else lo=Math.max(lo,room/slope);
    }
  }
  return [lo,hi];
}

export function buildRiserJoinery(geometry,stair,housings,detailParts) {
  const pockets=[],issues=[],result={parts:detailParts,pockets,issues};
  if(stair.riserBoards!=='closed'||stair.riserJoint!=='housed'||!geometry.treads.length) return result;
  const error=(code,message,riserId,hostId)=>issues.push({level:'error',code,message,riserId,hostId});
  if(geometry.dimensions.family.winder||stair.riserPosition==='manual'){
    error('riser-profile','Stootbordgroeven vragen verticale stootborden op rechte vluchten. Voor verdreven treden en het handmatige stootbordprofiel is dit detail nog niet uitgewerkt.');
    return result;
  }
  const grooveDepth=Number(stair.riserGrooveDepth??8),clearance=housings?.settings.clearance??0.4;
  const endRelief=3+clearance/2;
  if(!(grooveDepth>0) || !Number.isFinite(grooveDepth) || !Number.isFinite(clearance) || clearance<0){
    error('riser-settings','Controleer groefdiepte en passpeling van de stootbordverbinding.');
    return result;
  }
  const support=new Map();
  for(const flight of geometry.flights){
    const treads=geometry.treads.filter(t=>t.flightIndex===flight.index);
    const entry=geometry.landings.find(l=>l.level===flight.firstRiser);
    for(const [i,t] of treads.entries()) support.set(t.id+'-SB',{flight,upper:t,lower:i?treads[i-1]:entry});
    const exit=geometry.landings.find(l=>l.level===flight.firstRiser+flight.risers);
    support.set(stair.mark+'-V'+(flight.index+1)+'-UIT-SB',{flight,upper:exit,lower:treads.at(-1),terminal:true});
  }
  result.parts=detailParts.map(part=>{
    const spec=support.get(part.id);
    if(part.role!=='riser'||!spec) return part;
    const {flight,upper,lower,terminal}=spec,d=flight.direction,n={x:-d.y,y:d.x};
    const vertices=part.faces.flat(),project=(p,a)=>p.x*a.x+p.y*a.y;
    const minU=Math.min(...vertices.map(p=>project(p,d))), minV=Math.min(...vertices.map(p=>project(p,n)));
    const base=Math.min(...vertices.map(p=>p.z)),h=part.heightMm;
    const width=Math.max(...vertices.map(p=>project(p,n)))-minV, t=part.thicknessMm;
    const world=(x,y,z)=>({x:d.x*(minU+x)+n.x*(minV+y),y:d.y*(minU+x)+n.y*(minV+y),z:base+z});
    const riserFrame={origin:world(0,0,0),xAxis:{...d,z:0},yAxis:{...n,z:0},zAxis:{x:0,y:0,z:1}};
    const body=[0,t,0,width,0,h],boxes=[body],features=[],notes=[];
    const shoulder=t/4, tx0=shoulder,tx1=t-shoulder;
    const x0=tx0-clearance/2,x1=tx1+clearance/2;
    const noteError=(code,msg,hostId)=>error(code,part.id+' · '+msg,part.id,hostId);
    if(x0<=EPS){
      noteError('riser-shoulder','De passpeling verbruikt de schouder van dit stootbord.');
      return part;
    }
    // All straight-flight boards and the perimeter members have axes
    // parallel to building X/Y. Here their AABB is their actual solid.
    if(terminal && upper && stair.landingFrame==='perimeter' &&
          !geometry.landingFrame?.some(beam=>beam.landingId===upper.id)){
      noteError('riser-landing-frame-size','Er is achter het stootbord te weinig ruimte voor het gekozen bordesraam. Vergroot het bordes of verklein de randliggerbreedte.',upper.id);
    }
    if(terminal && upper && geometry.landingFrame?.length) {
      const board=bounds(vertices);
      for(const beam of geometry.landingFrame.filter(item=>item.landingId===upper.id)){
        const member=bounds(beam.faces.flat());
        if([0,2,4].every(i=>overlap(board,member,i)>EPS))
          noteError('riser-landing-rim','Het stootbord doorsnijdt randligger '+beam.id+
            '. Pas het bordesraam of de aansluiting bij de bovenste optrede aan.',beam.id);
      }
    }
    function register(host,kind,face,depth,groove,tongue,box,inward,area,job) {
      const id=host.id+'__'+part.id+'__'+face;
      const tongueDepth=depth-Math.min(clearance/2,depth/4);
      const pocket={id,hostId:host.id,hostKind:kind,riserId:part.id,treadId:part.id,face,
        depth,inward,worldContour:groove,tongueWorldContour:tongue,tongueDepth,openEdge:false,volumeM3:area*depth/1e9};
      if(job){
        pocket.beamId=host.id;
        pocket.contour=groove.map(p=>local(job.frame,p)).map(({x,y})=>({x,y}));
      }
      boxes.push(box);
      pockets.push(pocket);
      features.push({...pocket,pocketId:id,localTongueBox:box});
    }
    function horizontal(host,isTopBoard) {
      if(!host) return;
      const kind=host.frontEdge?'tread':'landing',face=isTopBoard?'underside':'top';
      const z=isTopBoard?h:0,depth=grooveDepth,travel=depth-Math.min(clearance/2,depth/4);
      const rootMargin=12, end=rootMargin+endRelief;
      const loop=(a,b,c,e)=>rect(a,b,c,e).map(([x,y])=>world(x,y,z));
      const groove=loop(x0,rootMargin,x1,width-rootMargin);
      const tongue=loop(tx0,end,tx1,width-end);
      const minRoof=kind==='tread'?Math.min(...groove.map(p=>roofAt(host,stair,p))):host.thickness;
      if(width<=2*end || depth>=minRoof-EPS || !insideBoard(groove,host.points)){
        noteError('riser-groove-stock','De stootbordgroef valt buiten het hout of door het oppervlak van '+host.id+'.',host.id);
        return;
      }
      if(kind==='landing') {
        const cut=bounds(groove);
        for(const other of pockets.filter(p=>p.hostId===host.id && p.face!==face)) {
          const previous=bounds(other.worldContour);
          if(depth+other.depth>=host.thickness-EPS &&
              [0,2].every(i=>overlap(cut,previous,i)>=-EPS)){
            noteError('riser-landing-web','Boven- en ondergroef in '+host.id+
              ' raken elkaar. Verklein de groefdiepte of vergroot de bordesdikte.',host.id);
            return;
          }
        }
      }
      const inward={x:0,y:0,z:isTopBoard?1:-1};
      const box=[tx0,tx1,end,width-end,isTopBoard?h:-travel,isTopBoard?h+travel:0];
      register(host,kind,face,depth,groove,tongue,box,inward,(x1-x0)*(width-2*rootMargin));
    }
    horizontal(upper,true);
    horizontal(lower,false);
    if(terminal){
      notes.push('De wang eindigt vóór het stootbord. Beide zijden sluiten hier koud aan.');
      if(!upper) notes.push('De bovenvloer is een bouwkundige aansluiting.');
    }else{
      for(const job of housings?.beams??[]) {
        if(job.flightIndex!==flight.index || job.profile==='cut') continue;
        const isLeft=job.side==='left', y=isLeft?width:0,depth=housings.settings.depth;
        const range=beamInterval(job,world,x0,x1,y,depth,8,h-8);
        if(!range || range[1]-range[0]<=2*endRelief+3 || !(depth>0&&depth<job.thickness)){
          noteError('riser-side-stock','Er is onvoldoende wanghout voor de stootbordlip in '+job.id+'.',job.id);
          continue;
        }
        const [lo,hi]=range;
        const loop=(a,b,c,e)=>rect(a,b,c,e).map(([x,z])=>world(x,y,z));
        const groove=loop(x0,lo,x1,hi), tongue=loop(tx0,lo+endRelief,tx1,hi-endRelief);
        const travel=depth-Math.min(clearance/2,depth/4);
        const box=[tx0,tx1,isLeft?width:-travel,isLeft?width+travel:0,lo+endRelief,hi-endRelief];
        const inward={x:(isLeft?1:-1)*n.x,y:(isLeft?1:-1)*n.y,z:0};
        register(job,'stringer','inside',depth,groove,tongue,box,inward,(x1-x0)*(hi-lo),job);
      }
    }
    if(!features.length) return {...part,riserFrame,joineryFeatures:features,jointNotes:notes};
    const stockLength=Math.max(...boxes.map(b=>b[3]))-Math.min(...boxes.map(b=>b[2]));
    const stockHeight=Math.max(...boxes.map(b=>b[5]))-Math.min(...boxes.map(b=>b[4]));
    return {...part,faces:boardMesh(boxes,world),volumeM3:boxes.reduce((v,b)=>v+volume(b),0)/1e9,
      stockLengthMm:stockLength,stockWidthMm:stockHeight,stockVolumeM3:stockLength*stockHeight*t/1e9,
      riserFrame,joineryFeatures:features,jointNotes:notes};
  });
  return result;
}
