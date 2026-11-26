import {buildViewportMesh} from './viewport-mesh.js';

const TOL=0.1;
const key=p=>`${Math.round(p[0]/TOL)},${Math.round(p[1]/TOL)}`;

// Intersect a triangulated solid with one horizontal floor plane. Coordinates
// are millimetres. Coplanar faces are ignored; callers choose an interior Z.
export function sectionSegments(triangles,z) {
  const segments=[];
  for(const triangle of triangles) {
    const hits=[];
    for(let i=0;i<3;i++) {
      const a=triangle[i],b=triangle[(i+1)%3];
      const da=a[2]-z,db=b[2]-z;
      if(Math.abs(da)<1e-7&&Math.abs(db)<1e-7) continue;
      if((da<=0&&db>=0)||(da>=0&&db<=0)) {
        const t=da/(da-db);
        if(Number.isFinite(t)) hits.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
      }
    }
    const unique=[...new Map(hits.map(p=>[key(p),p])).values()];
    if(unique.length===2&&key(unique[0])!==key(unique[1])) segments.push(unique);
  }
  return segments;
}

export function sectionLoops(triangles,z) {
  const segments=sectionSegments(triangles,z);
  const ends=new Map();
  segments.forEach((edge,index)=>edge.forEach((p,side)=>{
    const k=key(p);
    if(!ends.has(k))ends.set(k,[]);
    ends.get(k).push({index,side});
  }));
  const used=new Set(),loops=[];
  for(let seed=0;seed<segments.length;seed++) {
    if(used.has(seed))continue;
    const first=segments[seed][0],loop=[first],start=key(first);
    let index=seed,side=0,closed=false;
    while(!used.has(index)) {
      used.add(index);
      const next=segments[index][1-side];
      if(key(next)===start){closed=true;break;}
      loop.push(next);
      const candidate=(ends.get(key(next))??[]).find(entry=>!used.has(entry.index));
      if(!candidate)break;
      index=candidate.index;side=candidate.side;
    }
    if(closed&&loop.length>=3)loops.push(loop);
  }
  return loops;
}

export function pointInLoops(point,loops) {
  let inside=false;
  for(const loop of loops) {
    for(let i=0,j=loop.length-1;i<loop.length;j=i++) {
      const a=loop[j],b=loop[i];
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const cross=(point[0]-a[0])*dy-(point[1]-a[1])*dx;
      const along=(point[0]-a[0])*dx+(point[1]-a[1])*dy;
      if(Math.abs(cross)<=TOL*Math.hypot(dx,dy)&&along>=-TOL&&along<=dx*dx+dy*dy+TOL) return true;
      if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
  }
  return inside;
}

export function viewportTriangles(geometry) {
  const mesh=buildViewportMesh(geometry);
  const floats=new Float32Array(mesh.bytes.buffer,mesh.bytes.byteOffset,mesh.bytes.byteLength/4);
  const triangles=[];
  for(let i=0;i+2<mesh.triangles;i+=3){
    const triangle=[];
    for(let j=0;j<3;j++) {
      const offset=(i+j)*8;
      triangle.push([floats[offset]*1000,floats[offset+1]*1000,floats[offset+2]*1000]);
    }
    triangles.push(triangle);
  }
  return triangles;
}

