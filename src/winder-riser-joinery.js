import { pocketedFace } from './viewport-pockets.js';

const EPS = 1e-6;
const up = {x:0,y:0,z:1};
const dot = (a,b) => a.x*b.x+a.y*b.y+(a.z??0)*(b.z??0);
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:(a.z??0)-(b.z??0)});
const step = (p,v,s) => ({x:p.x+s*v.x,y:p.y+s*v.y,z:p.z+s*v.z});
const extent = (points,axis) => {
  const values=points.map(p=>dot(p,axis));
  return [Math.min(...values),Math.max(...values)];
};
const rectangle = (x0,y0,x1,y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const travel = (depth,clearance) => depth-Math.min(clearance/2,depth/4);
const faceArea = ring => Math.hypot(...['x','y','z'].map((k,i,keys)=>{
  const other=keys[(i+1)%3];
  return ring.reduce((sum,p,j)=>{const q=ring[(j+1)%ring.length];return sum+p[k]*q[other]-q[k]*p[other];},0)/2;
}));

// Intersect a thin band across the board with both actual rails. A miter
// inside the band can set its narrowest width between the two band edges.
function commonWidth(loop,x0,x1) {
  const stations=[x0,x1,...loop.map(p=>p.x).filter(x=>x>x0 && x<x1)];
  let low=-Infinity, high=Infinity;
  for(const x of stations){
    const hits=[];
    loop.forEach((a,i)=>{
      const b=loop[(i+1)%loop.length],dx=b.x-a.x;
      if(Math.abs(a.x-x)<EPS) hits.push(a.y);
      if(Math.abs(dx)>EPS && (x-a.x)*(x-b.x)<=0) hits.push(a.y+(b.y-a.y)*(x-a.x)/dx);
    });
    if(hits.length<2) return null;
    low=Math.max(low,Math.min(...hits)); high=Math.min(high,Math.max(...hits));
  }
  return [low,high];
}

// Convex feasibility polygon for the slot centre in horizontal rail
// distance u and world height z, constrained by every plane of this single
// sawn beam (including its two mitres) over the entire milling depth.
function clip(polygon,plane) {
  const result=[];
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length];
    const da=plane(a),db=plane(b);
    if(da>=-EPS) result.push(a);
    if((da>EPS && db< -EPS)||(da< -EPS && db>EPS)){
      const t=da/(da-db);
      result.push({u:a.u+(b.u-a.u)*t,z:a.z+(b.z-a.z)*t});
    }
  });
  return result;
}

function sideSlot(a,b,index,job,part,frame,base,top,depth,clearance) {
  const normal=job.frame.zAxis;
  if(Math.abs(dot(subtract(a,job.frame.origin),normal))>EPS ||
      Math.abs(dot(subtract(b,job.frame.origin),normal))>EPS) return null;
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<EPS) return null;
  const along={x:(b.x-a.x)/length,y:(b.y-a.y)/length,z:0};
  // CCW riser outline: the inside face of the stringer faces the board.
  if(-along.y*normal.x+along.x*normal.y<1-EPS) return null;
  const dx=dot(along,frame.xAxis),inward={x:-normal.x,y:-normal.y,z:0};
  if(Math.abs(dx)<EPS) return null;
  const tongueDepth=travel(depth,clearance),shift=dot(inward,frame.xAxis)*tongueDepth;
  const xAtA=dot(subtract(a,frame.origin),frame.xAxis),t=part.thicknessMm;
  // The tongue leaves and enters at the same angle as the machine axis.
  // Both its shoulder and its tip must fit inside the original board stock.
  const xMin=1-Math.min(0,shift),xMax=t-1-Math.max(0,shift);
  const ux=[(xMin-xAtA)/dx,(xMax-xAtA)/dx].sort((u,v)=>u-v);
  const left=Math.max(1,ux[0]),right=Math.min(length-1,ux[1]);
  const desired=Math.min(t/2/Math.abs(dx),right-left);
  const minimum=Math.min(t/2,Math.max(4,6.05-clearance));
  const widths=[...new Set([desired,Math.min(desired,Math.max(6.2,t/3)),Math.min(desired,minimum)])];
  const at=(u,z)=>({x:a.x+along.x*u,y:a.y+along.y*u,z});
  const relief=3+clearance/2;
  let best;
  for(const width of widths){
    if(width<minimum-EPS) continue;
    const half=(width+clearance)/2,umin=left+width/2,umax=right-width/2;
    const zmin=base+8,zmax=top-8;
    if(umin>umax+EPS || zmax-zmin<=2*relief) continue;
    const planes=job.stockPlanes.filter(p=>Math.abs(p.c)<1-EPS).map(p=>{
      const x=job.frame.xAxis,y=job.frame.yAxis,v=subtract(at(0,0),job.frame.origin);
      const su=p.a*dot(along,x)+p.b*dot(along,y),sz=p.a*x.z+p.b*y.z;
      const d=p.d-p.a*dot(v,x)-p.b*dot(v,y)-half*Math.abs(su)-Math.max(0,-p.c*depth)-1;
      return {su,sz,d};
    });
    let polygon=rectangle(umin,zmin,umax,zmax).map(([u,z])=>({u,z}));
    for(const {su,sz,d} of planes) polygon=clip(polygon,p=>d-su*p.u-sz*p.z);
    // Between consecutive polygon vertices the available height is affine.
    // Testing these breakpoints therefore finds its maximum without sampling.
    const middle=(umin+umax)/2;
    for(const u of [middle,...polygon.map(p=>p.u)]){
      let lo=zmin,hi=zmax;
      for(const {su,sz,d} of planes){
        const available=d-su*u;
        if(Math.abs(sz)<EPS) {if(available< -EPS) {hi=-Infinity;break;}}
        else if(sz>0) hi=Math.min(hi,available/sz);
        else lo=Math.max(lo,available/sz);
      }
      const height=hi-lo-2*relief;
      if(height<=3) continue;
      const score=width*height;
      if(best && (best.score>score+EPS || Math.abs(best.score-score)<EPS && best.offset<=Math.abs(u-middle))) continue;
      const loop=(halfWidth,min,max)=>rectangle(u-halfWidth,min,u+halfWidth,max).map(([s,z])=>at(s,z));
      best={job,index,inward,depth,score,offset:Math.abs(u-middle),
        groove:loop(half,lo,hi),tongue:loop(width/2,lo+relief,hi-relief)};
    }
  }
  return best;
}

function overlap(a,b) {
  return [a,b].every(ring=>ring.every((p,i)=>{
    const q=ring[(i+1)%ring.length],axis={x:p.y-q.y,y:q.x-p.x};
    const [a0,a1]=extent(a,axis),[b0,b1]=extent(b,axis);
    return Math.min(a1,b1)>=Math.max(a0,b0)-EPS;
  }));
}

export function buildWinderRiserJoinery(geometry,stair,housings,parts,grooveDepth,clearance) {
  const pockets=[],issues=[],treads=geometry.treads;
  const supports=new Map(treads.map((t,i)=>[t.id+'-SB',{upper:t,lower:treads[i-1]}]));
  supports.set(stair.mark+'-V1-UIT-SB',{lower:treads.at(-1)});
  const prepared=parts.map(part=>{
    if(part.role!=='riser') return part;
    const plan=part.planPoints,features=[],notes=[];
    const error=(code,message,hostId)=>issues.push({level:'error',code,message:part.id+' · '+message,riserId:part.id,hostId});
    const spec=supports.get(part.id);
    if(!spec || !plan?.length) {
      error('riser-seat','De zitlijn van het verdreven stootbord ontbreekt.');
      return part;
    }
    const {upper,lower}=spec,d={...part.direction,z:0},n={x:-d.y,y:d.x,z:0};
    const [minX]=extent(plan,d),[minY]=extent(plan,n),[base,top]=extent(part.faces.flat(),up);
    const world=(x,y,z)=>({x:d.x*(minX+x)+n.x*(minY+y),y:d.y*(minX+x)+n.y*(minY+y),z:base+z});
    const frame={origin:world(0,0,0),xAxis:d,yAxis:n,zAxis:up};
    const local=p=>({x:dot(p,d)-minX,y:dot(p,n)-minY,z:p.z-base});
    const t=part.thicknessMm,h=top-base,relief=3+clearance/2;
    function register(host,face,depth,inward,groove,tongue,index,job){
      const id=host.id+'__'+part.id+'__'+face,tongueDepth=travel(depth,clearance);
      const pocket={id,hostId:host.id,hostKind:job?'stringer':'tread',face,riserId:part.id,treadId:part.id,
        depth,inward,worldContour:groove,tongueWorldContour:tongue,tongueDepth,openEdge:false,volumeM3:faceArea(groove)*depth/1e9};
      if(job){
        pocket.beamId=host.id;
        pocket.contour=groove.map(p=>{const v=subtract(p,job.frame.origin);return {x:dot(v,job.frame.xAxis),y:dot(v,job.frame.yAxis)};});
      }
      pockets.push(pocket);
      const corners=[...tongue,...tongue.map(p=>step(p,inward,tongueDepth))].map(local);
      const localTongueBox=['x','y','z'].flatMap(k=>[Math.min(...corners.map(p=>p[k])),Math.max(...corners.map(p=>p[k]))]);
      features.push({...pocket,pocketId:id,localTongueBox,bodyFaceIndex:index});
    }
    function horizontal(host,above){
      if(!host) return;
      const x0=t/4-clearance/2,x1=t-t/4+clearance/2;
      const span=commonWidth(plan.map(local),x0,x1),stock=commonWidth(host.points.map(local),x0,x1);
      const lo=span&&stock?Math.max(span[0],stock[0])+12:Infinity;
      const hi=span&&stock?Math.min(span[1],stock[1])-12:-Infinity;
      const z=above?h:0,rect=(a,b,c,e)=>rectangle(a,b,c,e).map(([x,y])=>world(x,y,z));
      const groove=rect(x0,lo,x1,hi),tongue=rect(t/4,lo+relief,3*t/4,hi-relief);
      const fromFront=extent(groove.map(p=>subtract(p,host.frontEdge[0])),host.direction)[0];
      let roof=host.thickness;
      const nose=Number(stair.noseSize);
      if(nose>0 && fromFront<nose && ['bevel','round'].includes(stair.noseProfile)){
        if(!above) roof=0; // A top-facing pocket requires the flat tread surface.
        else if(stair.noseProfile==='bevel') roof-=nose-fromFront;
        else roof+=Math.sqrt(Math.max(0,2*nose*fromFront-fromFront**2))-nose;
      }
      if(x0<=EPS || hi-lo<=2*relief || grooveDepth>=roof-EPS) {
        error('riser-groove-stock','Onvoldoende hout of schouder voor de stootbordgroef in '+host.id+'.',host.id);
        return;
      }
      if(pockets.some(p=>p.hostId===host.id && p.depth+grooveDepth>=host.thickness-EPS && overlap(p.worldContour,groove))){
        error('riser-tread-web','De boven- en ondergroef raken elkaar in '+host.id+'.',host.id);
        return;
      }
      register(host,above?'underside':'top',grooveDepth,{x:0,y:0,z:above?1:-1},groove,tongue,above?1:0);
    }
    horizontal(upper,true);
    horizontal(lower,false);
    if(!upper) notes.push('Beide zijden sluiten koud aan bij de wangkop. Boven sluit het bord aan op de bouwkundige vloer.');
    else for(const side of ['left','right']){
      const jobs=(housings?.beams??[]).filter(job=>job.side===side && job.profile!=='cut');
      let best;
      const depth=housings.settings.depth;
      // A riser can straddle a mitre. Prefer the full requested depth; if
      // neither piece contains that cut, shorten the lip and its matching
      // pocket together. The part sheet reports the actual local depth.
      const minDepth=Math.min(depth,4);
      const depths=[depth,...Array.from({length:8},(_,i)=>
        Math.max(minDepth,Math.floor((depth-(depth-minDepth)*(i+1)/8)*10)/10))];
      for(const cutDepth of new Set(depths)){
        for(const job of jobs){
          if(!(depth>0 && depth<job.thickness)) continue;
          for(let i=0;i<plan.length;i++){
            const slot=sideSlot(plan[i],plan[(i+1)%plan.length],2+i,job,part,frame,base,top,cutDepth,clearance);
            if(slot && (!best || slot.score>best.score+EPS)) best=slot;
          }
        }
        if(best) break;
      }
      if(best) {
        register(best.job,'inside',best.depth,best.inward,best.groove,best.tongue,best.index,best.job);
        if(best.depth<depth) notes.push('Wegens het wangverstek is de lokale groefdiepte in '+best.job.id+' '+Number(best.depth.toFixed(2))+' mm.');
      }
      else if(jobs.length) error('riser-side-stock','Onvoldoende hout voor de stootbordlip in de '+(side==='left'?'linker':'rechter')+'wang.');
    }
    const faces=part.faces.flatMap((face,index)=>{
      const f=features.find(item=>item.bodyFaceIndex===index);
      if(!f) return [face];
      const intoBoard={x:-f.inward.x,y:-f.inward.y,z:-f.inward.z};
      return pocketedFace([face],face,[{worldContour:f.tongueWorldContour,depth:-f.tongueDepth}],intoBoard);
    });
    const corners=faces.flat().map(local);
    const size=k=>Math.max(...corners.map(p=>p[k]))-Math.min(...corners.map(p=>p[k]));
    const length=size('y'),width=size('z');
    return {...part,faces,riserFrame:frame,joineryFeatures:features,jointNotes:notes,
      stockLengthMm:length,stockWidthMm:width,stockVolumeM3:length*width*t/1e9,
      volumeM3:features.reduce((sum,f)=>sum+faceArea(f.tongueWorldContour)*f.tongueDepth/1e9,part.volumeM3)};
  });
  return {parts:prepared,pockets,issues};
}
