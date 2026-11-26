import { prism, tube } from './components/solids.js';
import { treadClearanceIssue } from './stair-validity.js';
import { nosingStrip, riserStock } from './timber-riser.js';
import { buildTimberBalustrade } from './timber-balustrade.js';

export const detailDefaults = { railSide:'none', railHeight:950, riserBoards:'none', riserThickness:18,
  riserPosition:'auto', riserTopInset:0, riserBottomInset:18 };
export const newDesignDetails = { ...detailDefaults, railSide:'both', riserBoards:'closed' };
const point = (x,y,z) => ({x,y,z});
const mix = (a,b,t) => point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
const midpoint = (a,b) => mix(a,b,.5);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const cross = (a,b) => point(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const unit = (a,b) => {const n=distance(a,b); return point((b.x-a.x)/n,(b.y-a.y)/n,(b.z-a.z)/n);};
const cleanPath = points => points.filter((p,i)=>!i || distance(p,points[i-1])>1e-6);

// Keep a closed, continuous handrail across mitres. Adjacent rings share
// vertices; triangles between them remain planar at changes of pitch.
function sweptHandrail(path, radius) {
  const rings=path.map((p,i)=>{
    const prev=unit(path[Math.max(0,i-1)],path[Math.max(1,i)]);
    const next=unit(path[Math.min(i,path.length-2)],path[Math.min(i+1,path.length-1)]);
    const tangent=unit(point(0,0,0),point(prev.x+next.x,prev.y+next.y,prev.z+next.z));
    const horizontal=Math.hypot(tangent.x,tangent.y);
    const u=point(-tangent.y/horizontal,tangent.x/horizontal,0),v=cross(tangent,u);
    return Array.from({length:12},(_,j)=>{
      const t=j*Math.PI/6, a=radius*Math.cos(t), b=radius*Math.sin(t);
      return point(p.x+a*u.x+b*v.x,p.y+a*u.y+b*v.y,p.z+a*u.z+b*v.z);
    });
  });
  const faces=[[...rings[0]].reverse(),rings.at(-1)];
  for(let i=1;i<rings.length;i++) for(let j=0;j<12;j++) {
    const k=(j+1)%12, a=rings[i-1], b=rings[i];
    faces.push([a[j],a[k],b[k]],[a[j],b[k],b[j]]);
  }
  return faces;
}

function topEdge(stringer) {
  if (stringer.topEdge) return stringer.topEdge;
  if (stringer.vertices) {
    const [a,b,c,d]=stringer.vertices;
    return [midpoint(a,d),midpoint(b,c)];
  }
  const {origin,down,axis}=stringer.frame, half=stringer.width/2;
  const a=point(origin.x-down.x*half,origin.y-down.y*half,origin.z-down.z*half);
  return [a, point(a.x+axis.x*stringer.length,a.y+axis.y*stringer.length,a.z+axis.z*stringer.length)];
}

// Landing guards follow outside edges. The right side is the outside side
// for the existing left-turn landing families; a straight landing has two
// parallel, unobstructed strips.
function crossing(stair,landing,side,a,b) {
  const z=landing.elevation;
  const maxX=Math.max(...landing.points.map(v=>v.x))-stair.stringerThickness/2;
  const horizontal=(x,y)=>point(x,y,z);
  let corners=[];
  if (stair.type==='quarter_turn') corners = side>0 ? [horizontal(a.x,b.y)] : [horizontal(b.x,a.y)];
  if (stair.type==='half_turn') {
    const reach=side<0 ? maxX : a.x+Math.min(150,stair.landingLength/2);
    corners=[horizontal(reach,a.y),horizontal(reach,b.y)];
  }
  const plan=cleanPath([horizontal(a.x,a.y),...corners,horizontal(b.x,b.y)]);
  const segments=plan.slice(1).map((p,i)=>distance(p,plan[i]));
  const total=segments.reduce((s,n)=>s+n,0);
  if (!total) return [];
  let length=0;
  return plan.slice(1,-1).map((p,i)=>{
    length+=segments[i];
    return {...p,z:a.z+(b.z-a.z)*length/total};
  });
}

function railParts(stair,geometry,side) {
  const parts=[], stations=[], tops=[];
  const detailed=['classic','modern'].includes(stair.timberDetail);
  const segments=[];
  const id=stair.mark+'-LN-'+(side>0?'L':'R'), label=side>0?'links':'rechts';
  const h=stair.railHeight;
  const grouped=geometry.flights.map(f=>geometry.stringers.filter(b=>b.flightIndex===f.index&&b.side===side));
  const railingEdge=beam=>{
    const [a,b]=topEdge(beam);
    if(!beam.vertices&&beam.flightIndex>0){
      const direction=geometry.flights[beam.flightIndex].direction;
      return [{x:a.x+direction.x*stair.going,y:a.y+direction.y*stair.going,z:a.z+geometry.dimensions.rise},b];
    }
    return [a,b];
  };
  function addSegment(a,b,bottomAt,landing) {
    const horizontal=Math.hypot(b.x-a.x,b.y-a.y);
    if (horizontal<1e-6) return;
    if (detailed) {
      segments.push({a,b,landingZ:landing?bottomAt(a).z:null});
      return;
    }
    const count=Math.max(1,Math.ceil(horizontal/920));
    const grade=landing ? 0 : (b.z-a.z)/(horizontal*horizontal);
    function postFaces(bottom,top,radius,sides) {
      // Scribe the bottom of the vertical post to the sloping top face.
      return tube(bottom,top,radius,sides).map(face=>face.map(v=>Math.abs(v.z-bottom.z)>1e-7 ? v :
        {...v,z:v.z+grade*((v.x-bottom.x)*(b.x-a.x)+(v.y-bottom.y)*(b.y-a.y))}));
    }
    // Place supports away from the flat end cuts of the stringer and from
    // the joints of the adjoining landing.
    const endMargin=Math.min(55,horizontal/3);
    const postT=horizontal<150 ? (landing?[]:[.5]) :
      Array.from({length:count+1},(_,i)=>(endMargin+(horizontal-2*endMargin)*i/count)/horizontal);
    for(const t of postT) {
      const p=mix(a,b,t);
      if (stations.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<42&&Math.abs(q.z-p.z)<100)) continue;
      stations.push(p);
      const bottom=bottomAt(p),top={...p,z:p.z+h};
      const radius=Math.min(13,stair.stringerThickness*.45);
      parts.push({id:`${id}-ST-${stations.length}`,label:'Leuningstijl '+label,kind:'member',material:'galvanized',diameterMm:2*radius,lengthMm:distance(bottom,top),faces:postFaces(bottom,top,radius,10)});
    }
    const n=Math.ceil(horizontal/115);
    for(let i=1;i<n;i++) {
      const p=mix(a,b,i/n);
      if (postT.some(t=>Math.abs(t-i/n)*horizontal<34)) continue;
      const bottom=bottomAt(p);
      const top={...p,z:p.z+h};
      parts.push({id:`${id}-SP-${parts.length+1}`,label:'Balusterspijl '+label,kind:'member',material:'galvanized',
        diameterMm:12,lengthMm:distance(bottom,top),faces:postFaces(bottom,top,6,8)});
    }
    tops.push({...a,z:a.z+h},{...b,z:b.z+h});
  }
  let end;
  for(let i=0;i<grouped.length;i++) {
    const beams=grouped[i];
    if (!beams.length) continue;
    const start=railingEdge(beams[0])[0];
    if (end&&geometry.landings[i-1]) {
      const l=geometry.landings[i-1];
      // Across the short inside corner a single diagonal avoids an S-turn
      // with two fittings closer together than the width of the rail.
      const corners=detailed&&stair.type==='quarter_turn'&&side>0?[]:crossing(stair,l,side,end,start);
      const route=cleanPath([end,...corners,start]);
      for(let k=1;k<route.length;k++) addSegment(route[k-1],route[k],p=>({...p,z:l.elevation}),true);
    }
    for(const beam of beams) {
      const [a,b]=railingEdge(beam);
      addSegment(a,b,p=>p,false);
      end=b;
    }
  }
  if(detailed) return buildTimberBalustrade(stair,segments,side);
  const path=cleanPath(tops);
  if(path.length>1) parts.unshift({id,label:'Doorlopende handgreep '+label,kind:'railing',material:'timber',diameterMm:44,
    axisPath:path,lengthMm:path.slice(1).reduce((s,p,i)=>s+distance(p,path[i]),0),faces:sweptHandrail(path,22)});
  return parts;
}

// Clip the board to the actual two side edges on a winding tread. Simply
// shifting the endpoints of the nosing would send timber through a stringer.
function strip(polygon,front,direction,from,to) {
  const station=p=>(p.x-front.x)*direction.x+(p.y-front.y)*direction.y;
  function clip(points,limit,sign) {
    const next=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      const da=sign*(station(a)-limit), db=sign*(station(b)-limit);
      if(da>=-1e-8) next.push(a);
      if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)) {
        const t=da/(da-db);
        next.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      }
    }
    return next;
  }
  return clip(clip(polygon,from,1),to,-1);
}

function riserParts(stair,geometry) {
  const parts=[], rise=geometry.dimensions.rise;
  const add=(id,points,bottom,top,direction)=>{
    if(points.length<3 || top<=bottom) return;
    const planArea=Math.abs(points.reduce((s,p,i)=>{
      const q=points[(i+1)%points.length];
      return s+p.x*q.y-q.x*p.y;
    },0))/2;
    parts.push({id,label:'Houten stootbord',kind:'plate',material:'timber',heightMm:top-bottom,...riserStock(points,direction,top-bottom,stair.riserThickness),
      thicknessMm:stair.riserThickness,volumeM3:planArea*(top-bottom)/1e9,faces:prism(points,bottom,top)});
  };
  // Standard boards stand vertically against the lower tread back and below
  // the next tread. The optional manual profile remains an explicit sloped detail.
  const addStraight=(t,flight)=>{
    const height=rise-t.thickness,thickness=stair.riserThickness;
    if(height<=0) return;
    const nose=Number(stair.nosing)||0;
    const d=t.direction,normal={x:-d.y,y:d.x};
    const frontRun=(t.step-1)*Number(stair.going)-nose,halfClear=Number(stair.width)/2-Number(stair.stringerThickness);
    const centre={x:flight.origin.x+d.x*frontRun,y:flight.origin.y+d.y*frontRun};
    const a={x:centre.x-normal.x*halfClear,y:centre.y-normal.y*halfClear};
    const b={x:centre.x+normal.x*halfClear,y:centre.y+normal.y*halfClear};
    const at=(side,x,z)=>({x:(side?b.x:a.x)+d.x*x,y:(side?b.y:a.y)+d.y*x,z});
    const bottom=t.elevation-rise,top=t.elevation-t.thickness;
    if(stair.riserPosition!=='manual'){
      const points=[at(0,0,0),at(0,thickness,0),at(1,thickness,0),at(1,0,0)];
      const profileContour=[{x:0,y:0},{x:thickness,y:0},{x:thickness,y:height},{x:0,y:height}];
      const width=Math.hypot(b.x-a.x,b.y-a.y);
      parts.push({id:t.id+'-SB',label:'Houten stootbord',kind:'plate',role:'riser',material:'timber',
        heightMm:height,developedHeightMm:height,topInsetMm:0,bottomInsetMm:thickness,
        profileContour,...riserStock(points,d,height,thickness),thicknessMm:thickness,
        volumeM3:width*height*thickness/1e9,faces:prism(points,bottom,top)});
      return;
    }
    const topInset=Number(stair.riserTopInset),bottomInset=Number(stair.riserBottomInset);
    const topX=topInset,bottomX=-bottomInset;
    const horizontalThickness=thickness*Math.hypot(1,(topX-bottomX)/height);
    const vertices=[at(0,bottomX,bottom),at(0,bottomX+horizontalThickness,bottom),at(0,topX+horizontalThickness,top),at(0,topX,top),
      at(1,bottomX,bottom),at(1,bottomX+horizontalThickness,bottom),at(1,topX+horizontalThickness,top),at(1,topX,top)];
    const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
      .map(indices=>indices.reverse().map(i=>vertices[i]));
    const width=Math.hypot(b.x-a.x,b.y-a.y),developed=Math.hypot(height,topX-bottomX);
    const stockHeight=developed+Math.abs(topX-bottomX)*horizontalThickness/developed;
    const minX=Math.min(topX,bottomX);
    const profileContour=[{x:bottomX-minX,y:0},{x:bottomX+horizontalThickness-minX,y:0},
      {x:topX+horizontalThickness-minX,y:height},{x:topX-minX,y:height}];
    const points=[at(0,topX,0),at(0,topX+horizontalThickness,0),at(1,topX+horizontalThickness,0),at(1,topX,0)];
    parts.push({id:t.id+'-SB',label:'Houten stootbord',kind:'plate',role:'riser',material:'timber',
      heightMm:height,developedHeightMm:developed,topInsetMm:topInset,bottomInsetMm:bottomInset,
      profileContour,
      ...riserStock(points,d,stockHeight,thickness),thicknessMm:thickness,
      volumeM3:width*developed*thickness/1e9,faces});
  };
  for(const flight of geometry.flights) {
    const treads=geometry.treads.filter(t=>t.flightIndex===flight.index);
    for(const t of treads) {
      const offset=Math.max(0,stair.nosing-stair.riserThickness);
      if(geometry.dimensions.family.winder){
        const footprint=strip(t.points,t.frontEdge[0],t.direction,0,stair.riserThickness);
        add(t.id+'-SB',footprint,t.elevation-rise,t.elevation-t.thickness,t.direction);
      } else addStraight(t,flight);
      if(stair.wellatType==='chamfered') {
        const trim=nosingStrip(t,stair,strip,offset);
        if(trim) parts.push(trim);
      }
    }
    const last=treads.at(-1);
    if (!last) continue;
    const landing=geometry.landings.find(item=>item.level===last.level+1);
    const endZ=landing?landing.elevation-landing.thickness:last.elevation+rise;
    let ref,direction=last.direction;
    if(geometry.dimensions.family.winder) {
      const terminals=[1,-1].map(side=>geometry.stringers.filter(b=>b.side===side).at(-1)?.vertices?.[1]);
      if (terminals.some(p=>!p)) continue;
      const [a,b]=terminals, length=Math.hypot(a.x-b.x,a.y-b.y);
      direction={x:(b.y-a.y)/length,y:(a.x-b.x)/length};
      if(direction.x*last.direction.x+direction.y*last.direction.y<0) direction={x:-direction.x,y:-direction.y};
      ref=a;
    } else {
      const end=stair.going*flight.treadCount-(Number(stair.nosing)||0);
      ref={x:flight.origin.x+flight.direction.x*end,
        y:flight.origin.y+flight.direction.y*end};
    }
    let footprint;
    if(geometry.dimensions.family.winder) footprint=strip(last.points,ref,direction,-stair.riserThickness,0);
    else {
      const normal={x:-direction.y,y:direction.x};
      const half=Number(stair.width)/2-Number(stair.stringerThickness),thickness=Number(stair.riserThickness);
      const point=(side,along)=>({x:ref.x+normal.x*side*half+direction.x*along,
        y:ref.y+normal.y*side*half+direction.y*along});
      footprint=[point(-1,0),point(-1,thickness),point(1,thickness),point(1,0)];
    }
    add(`${stair.mark}-V${flight.index+1}-UIT-SB`,footprint,last.elevation,endZ,direction);
  }
  return parts;
}

export function buildStairDetails(input,geometry) {
  if(!geometry.treads.length) return [];
  const stair={...detailDefaults,...input};
  const invalid=treadClearanceIssue(stair,geometry.dimensions);
  if(invalid) throw new Error(invalid.detail);
  const parts=stair.riserBoards==='closed' ? riserParts(stair,geometry) : [];
  if(['left','both'].includes(stair.railSide)) parts.push(...railParts(stair,geometry,1));
  if(['right','both'].includes(stair.railSide)) parts.push(...railParts(stair,geometry,-1));
  return parts;
}
