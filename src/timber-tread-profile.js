import earcut from 'earcut';

const epsilon = 1e-7;
const orient = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const key = p => Math.round(p.x*1e6)+','+Math.round(p.y*1e6);

// Finished upper arris. Depth is positive below the top, inset points away
// from the leading edge. Maximum chord deviation is under 0.014 mm at R25.
export function noseSection(kind,sizeMm) {
  if(kind==='bevel') return [{inset:0,depth:sizeMm},{inset:sizeMm,depth:0}];
  if(kind!=='round') return [{inset:0,depth:0}];
  return Array.from({length:25},(_,i)=>{
    const angle=i*Math.PI/48;
    return {inset:i===24?sizeMm:sizeMm*(1-Math.cos(angle)),depth:i===24?0:sizeMm*(1-Math.sin(angle))};
  });
}

// Sutherland–Hodgman on one convex cell. Adjacent cells use the same iso-lines.
function clip(points,cut,sign) {
  const out=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    const da=sign*(a.d-cut),db=sign*(b.d-cut);
    if(da>=-epsilon) out.push(a);
    if((da>epsilon&&db< -epsilon)||(da< -epsilon&&db>epsilon)) {
      const t=da/(da-db);
      out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,d:cut});
    }
  }
  return out;
}

// Earcut may omit collinear vertices. Restore the original roots on each
// affected edge so the clipped top and the full-height tongue share a seam.
function cells(polygon) {
  const indices=earcut(polygon.flatMap(p=>[p.x,p.y])),cells=[];
  for(let i=0;i<indices.length;i+=3) {
    const triangle=indices.slice(i,i+3).map(j=>polygon[j]),ring=[];
    if(orient(...triangle)<0) triangle.reverse();
    for(let j=0;j<3;j++) {
      const a=triangle[j],b=triangle[(j+1)%3],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      ring.push(a);
      const between=polygon.map(p=>({p,t:((p.x-a.x)*dx+(p.y-a.y)*dy)/len}))
        .filter(({p,t})=>t>epsilon&&t<len-epsilon&&Math.abs(orient(a,b,p))<epsilon*len);
      ring.push(...between.sort((p,q)=>p.t-q.t).map(item=>item.p));
    }
    cells.push(ring);
  }
  return cells;
}

// Integrate the true profile across a winder. Between consecutive side
// vertices the total width of material parallel to the nosing is linear.
function removedVolume(body,kind,size,along) {
  const cuts=[...new Set([0,size,...body.map(p=>p.d).filter(d=>d>0&&d<size)])].sort((a,b)=>a-b);
  function width(d) {
    const hits=[];
    body.forEach((a,i)=>{
      const b=body[(i+1)%body.length];
      if((a.d>d)===(b.d>d)) return;
      const t=(d-a.d)/(b.d-a.d);
      hits.push(along(a)+(along(b)-along(a))*t);
    });
    hits.sort((a,b)=>a-b);
    return hits.reduce((s,x,i)=>s+(i%2?x:-x),0);
  }
  // Five-point Gauss integration in polar angle removes the square-root
  // singularity at the nose of a roundover. For a bevel the integrand is quadratic.
  const nodes=[0,-.5384693101056831,.5384693101056831,-.906179845938664,.906179845938664];
  const weights=[.5688888888888889,.4786286704993665,.4786286704993665,.2369268850561891,.2369268850561891];
  let volume=0;
  for(let i=1;i<cuts.length;i++) {
    const bounds=cuts.slice(i-1,i+1).map(d=>kind==='round'?Math.acos(1-d/size):d);
    const half=(bounds[1]-bounds[0])/4;
    for(const mid of [bounds[0]+half,bounds[1]-half]) nodes.forEach((n,j)=>{
      const t=mid+half*n,d=kind==='round'?size*(1-Math.cos(t)):t;
      const integral=kind==='round'?size**2*(1-Math.sin(t))*Math.sin(t):size-d;
      volume+=half*weights[j]*width(d)*integral;
    });
  }
  return volume;
}

export function profileTimberTread(tread,stair) {
  const kind=stair.noseProfile,size=stair.noseSize;
  if(!['round','bevel'].includes(kind)||!Number.isFinite(size)||size<=0||size>=tread.thickness) return tread;
  const [a,b]=tread.frontEdge,dx=b.x-a.x,dy=b.y-a.y,frontLengthMm=Math.hypot(dx,dy);
  if(frontLengthMm<epsilon) return tread;
  const sign=dx*tread.direction.y-dy*tread.direction.x<0?-1:1;
  const locate=p=>({...p,d:sign*orient(a,b,p)/frontLengthMm});
  const along=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/frontLengthMm;
  const tongues=tread.tongues??[];
  const tips=new Set(tongues.flatMap(t=>t.points.slice(1,3).map(key)));
  const body=tread.points.filter(p=>!tips.has(key(p))).map(locate);
  const section=noseSection(kind,size),top=tread.elevation,bottom=top-tread.thickness;
  const regions=[{cells:cells(body),profiled:true},...tongues.map(t=>({cells:cells(t.points.map(locate)),profiled:false}))];
  const meshFaces=[],edges=new Map(),columns=new Map();
  function corner(p,z) {
    const id=key(p);
    if(!columns.has(id)) columns.set(id,{x:p.x,y:p.y,heights:new Map()});
    const column=columns.get(id),height=Math.round(z*1e6);
    if(!column.heights.has(height)) column.heights.set(height,{x:column.x,y:column.y,z});
    return column.heights.get(height);
  }
  function patch(points,depth) {
    if(points.length<3) return;
    const area=points.slice(2).reduce((v,p,i)=>v+orient(points[0],points[i+1],p),0);
    if(area<=1e-16) return;
    const roof=points.map(p=>corner(p,top-depth(p.d))),floor=points.map(p=>corner(p,bottom));
    meshFaces.push(roof,floor.reverse());
    roof.forEach((a,i)=>{
      const b=roof[(i+1)%roof.length],ka=key(a),kb=key(b);
      const edgeKey=ka<kb?ka+'|'+kb:kb+'|'+ka;
      if(!edges.has(edgeKey)) edges.set(edgeKey,[]);
      edges.get(edgeKey).push({a,b});
    });
  }
  for(const {cells,profiled} of regions) {
    for(const triangle of cells) {
      const min=Math.min(...triangle.map(p=>p.d)),max=Math.max(...triangle.map(p=>p.d));
      if(min<size-epsilon) {
        if(min< -epsilon) patch(clip(triangle,0,-1),()=>profiled?size:0);
        for(let i=1;i<section.length;i++){
          const l=section[i-1],r=section[i];
          if(max<=l.inset+epsilon||min>=r.inset-epsilon) continue;
          const band=clip(clip(triangle,l.inset,1),r.inset,-1);
          patch(band,d=>profiled?l.depth+(r.depth-l.depth)*(d-l.inset)/(r.inset-l.inset):0);
        }
      }
      if(max>size+epsilon) patch(min>=size-epsilon?triangle:clip(triangle,size,1),()=>0);
    }
  }
  // The only internal vertical faces occur where a full-height tongue meets
  // a profiled shoulder. Split vertical edges at every adjoining vertex there.
  function between(p,lo,hi) {
    return [...columns.get(key(p)).heights.values()].filter(v=>v.z>lo+epsilon&&v.z<hi-epsilon).sort((a,b)=>a.z-b.z);
  }
  for(const pair of edges.values()) {
    let [high,low]=pair;
    if(low&&high.a.z+high.b.z<low.a.z+low.b.z) [high,low]=[low,high];
    const {a,b}=high,la=low?.b??corner(a,bottom),lb=low?.a??corner(b,bottom);
    if(Math.max(a.z-la.z,b.z-lb.z)<epsilon) continue;
    const side=[la,lb,...between(b,lb.z,b.z),b,a,...between(a,la.z,a.z).reverse()];
    meshFaces.push(side.filter((p,i)=>p!==side[(i+side.length-1)%side.length]));
  }
  const removedMm3=removedVolume(body,kind,size,along);
  const operation=kind==='round'?'Bovenste voorrand afronden R':'Bovenste voorrand afschuinen 45° ×';
  return {...tread,meshFaces,volume:(tread.area*tread.thickness-removedMm3)/1e9,
    noseDetail:{kind,sizeMm:size,thicknessMm:tread.thickness,section,frontLengthMm,removedMm3,
      operation:operation+' '+size+' mm. Afzonderlijke profielbewerking na het contourfrezen.'}};
}
