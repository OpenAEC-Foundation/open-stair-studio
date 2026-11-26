// All calculations use model millimetres. The machining Z axis points from
// the inside face towards the stair. Negative local Z cuts into the stringer.
const EPS = 1e-7;
const add = (a, b, scale = 1) => ({ x: a.x + scale * b.x, y: a.y + scale * b.y, z: a.z + scale * b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a, b) => ({ x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x });
const mul = (a, s) => ({ x: a.x*s, y: a.y*s, z: a.z*s });
const unit = a => mul(a, 1 / Math.hypot(a.x, a.y, a.z));
const xy = ({x, y}) => ({x, y});
const area = p => p.reduce((v,a,i) => { const b=p[(i+1)%p.length]; return v+a.x*b.y-a.y*b.x; },0)/2;
const ccw = p => area(p) < 0 ? p.toReversed() : p;
const same = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) < EPS;
const compact = p => p.filter((a,i) => !same(a,p[(i+p.length-1)%p.length]));
export const defaultHousingSettings = { depth: 12, clearance: 0.4, endMargin: 12 };

export function pointOnHousingFrame(frame, point, z = 0) {
  return add(add(add(frame.origin, frame.xAxis, point.x), frame.yAxis, point.y), frame.zAxis, z);
}
function flatten(frame,p) {
  const v = sub(p,frame.origin);
  return { x: dot(v,frame.xAxis), y: dot(v,frame.yAxis) };
}

// Common indexing: top/bottom and inner/outer faces of one closed part.
// Winder segments may have a twisted top, represented by two triangles.
const faces = [[0,1,2],[0,2,3],[4,5,6],[4,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
function verticesOf(beam) {
  if (beam.vertices) return beam.vertices;
  const { origin, axis, sideAxis, down } = beam.frame;
  const corner = (along, across, deep) =>
    add(add(add(origin,axis,along*beam.length),sideAxis,across*beam.side*beam.thickness/2),down,deep*beam.width/2);
  return [-1,1].flatMap(deep => [[0,-1],[1,-1],[1,1],[0,1]].map(([along,across]) => corner(along,across,deep)));
}
function setupBeam(beam) {
  const v = verticesOf(beam);
  const start = v[0];
  const delta = sub(v[1],start);
  const along = unit({...delta,z:0});
  const xAxis = unit(delta);
  const zAxis = { x: beam.side*along.y, y: -beam.side*along.x, z: 0 };
  const yAxis = cross(zAxis,xAxis);
  // Use the extents of all eight vertices, including the opposite mitre.
  // This datum can lie outside the sawn face, but always lies on its plane.
  const min = axis => Math.min(...v.map(p => dot(sub(p,start),axis)));
  const origin = add(add(start,xAxis,min(xAxis)),yAxis,min(yAxis));
  const frame = {origin,xAxis,yAxis,zAxis};
  const outline = ccw([v[0],v[1],v[5],v[4]].map(p => flatten(frame,p)));
  const center = mul(v.reduce((a,p) => add(a,p),{x:0,y:0,z:0}),1/v.length);
  // Intersect the half-spaces of both triangles on top and bottom. On a
  // twisted mitre this conservatively keeps the entire pocket below both.
  const stockPlanes = faces.map(face => {
    const [p,q,r] = face.map(i => v[i]);
    let n = unit(cross(sub(q,p),sub(r,p)));
    if (dot(n,sub(center,p))>0) n=mul(n,-1);
    return {n,p};
  });
  const planes = stockPlanes.filter(({n}) => Math.abs(dot(n,zAxis)) < 1-EPS);
  // In setup XYZ, a tool sweep fits in this conservative solid iff for
  // every plane, a*x + b*y + c*z <= d throughout the swept volume.
  const localPlanes = stockPlanes.map(({n,p}) => ({
    a:dot(n,xAxis), b:dot(n,yAxis), c:dot(n,zAxis), d:dot(n,sub(p,origin))
  }));
  return {
    job: {id:beam.id,side:beam.side>0?'left':'right',face:'inside',flightIndex:beam.flightIndex,
      length:beam.length,width:beam.width,thickness:beam.thickness,outline,frame,stockPlanes:localPlanes,pockets:[],issues:[]},
    along,start,planes
  };
}
const at = (base, along, u, z) => ({x:base.x+u*along.x,y:base.y+u*along.y,z});
function pocketForEdge(edgeA,edgeB,setup,tread,settings) {
  const { start,along,planes,job } = setup;
  const { zAxis } = job.frame;
  const { depth,clearance,endMargin } = settings;
  const position = p => (p.x-start.x)*along.x + (p.y-start.y)*along.y;
  // The visible contour must actually run along this stringer, with wood
  // outside the CCW polygon. This excludes a coincident nosing or return arm.
  const edge = {x:edgeB.x-edgeA.x,y:edgeB.y-edgeA.y};
  const edgeLength = Math.hypot(edge.x,edge.y);
  if (edgeLength<EPS || (-edge.y*zAxis.x + edge.x*zAxis.y) / edgeLength < 1-EPS) return null;
  const coplanar = p => Math.abs((p.x-start.x)*zAxis.x+(p.y-start.y)*zAxis.y) < 1e-5;
  if (!coplanar(edgeA) || !coplanar(edgeB)) return null;
  const a=position(edgeA), b=position(edgeB), half=clearance/2;
  // low/high describe the POCKET, which is clearance wider/taller than
  // the tongue. End shoulders (at the tread) refer to the tongue itself.
  let low=Math.min(a,b)+endMargin-half, high=Math.max(a,b)-endMargin+half;
  const bottom=tread.elevation-tread.thickness-half, top=tread.elevation+half;
  for (const {n,p} of planes) {
    const slope=dot(n,along);
    // Worst combination over the complete depth and height. Preserve the
    // requested web at the stock edge (as measured on the machining face).
    const point=add(at(start,along,0,n.z>=0?top:bottom),zAxis,dot(n,zAxis)<0?-depth:0);
    const margin=endMargin*Math.sqrt(Math.max(0,1-dot(n,zAxis)**2));
    const separation=dot(n,sub(point,p))+margin;
    if (Math.abs(slope)<EPS) {
      if (separation>EPS) return null;
    } else if (slope>0) high=Math.min(high,-separation/slope);
    else low=Math.max(low,-separation/slope);
  }
  // A remnant at a mitre can be much narrower than either end shoulder.
  // Only create a tongue if its bearing length reaches that shoulder size.
  if (high-low-clearance < Math.max(endMargin,EPS)) return null;
  const world = [[low,bottom],[high,bottom],[high,top],[low,top]].map(([u,z])=>at(start,along,u,z));
  const contour=ccw(world.map(p=>flatten(job.frame,p)));
  const id=job.id+'__'+tread.id;
  const openEdge=planes.some(({n,p}) => world.some(w =>
    Math.max(dot(n,sub(w,p)),dot(n,sub(add(w,zAxis,-depth),p))) >= -EPS));
  const pocket={id,treadId:tread.id,beamId:job.id,depth,contour,
    worldContour:contour.map(p=>pointOnHousingFrame(job.frame,p)),openEdge};
  const ordered=a<b?[low+half,high-half]:[high-half,low+half];
  const [first,last]=ordered.map(u=>at(start,along,u,tread.elevation));
  const tongue={pocketId:id,beamId:job.id,side:job.side,depth,
    points:[first,add(first,zAxis,-depth),add(last,zAxis,-depth),last].map(xy)};
  return {pocket,tongue,distance:Math.hypot(first.x-edgeA.x,first.y-edgeA.y)};
}

function intersects(a,b,c,d) {
  const orient = (p,q,r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const on = (p,q,r) => Math.abs(orient(p,q,r))<EPS && r.x>=Math.min(p.x,q.x)-EPS &&
    r.x<=Math.max(p.x,q.x)+EPS && r.y>=Math.min(p.y,q.y)-EPS && r.y<=Math.max(p.y,q.y)+EPS;
  return orient(a,b,c)*orient(a,b,d)<0 && orient(c,d,a)*orient(c,d,b)<0 ||
    on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function simple(points) {
  for (let i=0;i<points.length;i++) for (let j=i+2;j<points.length;j++) {
    if (i===0 && j===points.length-1) continue;
    if (intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length])) return false;
  }
  return true;
}
function pocketConflict(one,two,along) {
  // All pockets on a single side face share the same horizontal and vertical
  // world directions. Compare their two physical intervals in millimetres.
  const range = (points,axis) => points.map(p=>dot(p,axis));
  for (const axis of [{x:0,y:0,z:1},along]) {
    const a=range(one.worldContour,axis), b=range(two.worldContour,axis);
    if (Math.min(...a)>Math.max(...b)+EPS || Math.min(...b)>Math.max(...a)+EPS) return false;
  }
  return true;
}

export function buildHousings(geometry, input = {}) {
  const settings={...defaultHousingSettings,...input};
  const validBeam=beam => [beam.length,beam.width,beam.thickness].every(value=>Number.isFinite(value)&&value>EPS);
  const setups=geometry.stringers.filter(validBeam).map(setupBeam);
  const beams=setups.map(s=>s.job);
  const issues=[];
  const issue=(message,code,jobs,treadId) => {
    const entry={level:'error',code,message,...(treadId?{treadId}:{}),...(jobs.length===1?{beamId:jobs[0].id}:{})};
    issues.push(entry);
    jobs.forEach(job=>job.issues.push(entry));
  };
  const treads=[];
  if (!beams.length || !geometry.treads.length || setups.length!==geometry.stringers.length) {
    issue('Het model bevat een ontbrekend of onbewerkt wangdeel zonder bruikbare lengte. Controleer de trapgeometrie.','empty-stock',beams);
    return {settings,beams,treads,issues};
  }
  if (![settings.depth,settings.clearance,settings.endMargin].every(Number.isFinite) ||
      settings.depth<=0 || settings.clearance<0 || settings.endMargin<0) {
    issue('Diepte moet positief zijn. Speling en schoudermaat moeten geldige, niet-negatieve millimetermaten zijn.','settings',beams);
    return {settings,beams,treads,issues};
  }
  for (const job of beams) if (settings.depth >= job.thickness-EPS) {
    issue('De ingestelde diepte laat geen hout achter het huis in '+job.id+'.','through', [job]);
  }
  for (const tread of geometry.treads) {
    const points=[],tongues=[];
    const relevant=setups.filter(s=>s.job.flightIndex===tread.flightIndex);
    for (let i=0;i<tread.points.length;i++) {
      const a=tread.points[i], b=tread.points[(i+1)%tread.points.length];
      points.push(a);
      const joins=[];
      for (const setup of relevant) {
        if (settings.depth>=setup.job.thickness-EPS) continue;
        const join=pocketForEdge(a,b,setup,tread,settings);
        if (join) {
          joins.push(join);
          setup.job.pockets.push(join.pocket);
        }
      }
      for (const {tongue} of joins.sort((a,b)=>a.distance-b.distance)) {
        tongues.push(tongue);
        points.push(...tongue.points);
      }
    }
    const profile=compact(points);
    if (new Set(tongues.map(t=>t.side)).size!==2) {
      issue('Onvoldoende ruimte voor een insteeklip aan beide zijden van '+tread.id+'. Pas de trap- of verbindingsmaten aan.','missing-support',relevant.map(s=>s.job),tread.id);
    }
    if (!simple(profile)) issue('Insteeklippen kruisen elkaar op '+tread.id+'.','crossed-tongues',relevant.map(s=>s.job),tread.id);
    const boardArea=area(profile);
    treads.push({...tread,points:profile,svgPoints:profile.map(p=>p.x+','+p.y).join(' '),
      tongues,frontEdge:tread.frontEdge??[tread.points[0],tread.points[3]],area:boardArea,volume:boardArea*tread.thickness/1e9});
  }
  for (const {job,along} of setups) {
    for (const p of job.pockets) if (p.openEdge) issue('Het huis van '+p.treadId+' raakt de rand van '+job.id+'. Vergroot de schoudermaat.','open-edge',[job]);
    for (let i=0;i<job.pockets.length;i++) for (const p of job.pockets.slice(i+1)) {
      if (pocketConflict(job.pockets[i],p,along)) issue('De huizen van '+job.pockets[i].treadId+' en '+p.treadId+' raken elkaar op '+job.id+'.','overlap',[job]);
    }
  }
  return {settings,beams,treads,issues};
}
