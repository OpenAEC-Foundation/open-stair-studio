import earcut from 'earcut';

const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
const minus = (a,b) => ({x:a.x-b.x, y:a.y-b.y, z:a.z-b.z});
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x});

// On a profiled tread the horizontal top stops at the tangent to the nose.
// Recover that boundary from the finished mesh, cancelling internal edges.
export function boardFaceOutline(faces, height) {
  const boundary = new Map();
  const key = p => Math.round(p.x*1e6)+','+Math.round(p.y*1e6);
  for (const face of faces.filter(f => f.every(p => Math.abs(p.z-height)<1e-6))) {
    for (let i=0; i<face.length; i++) {
      const a=face[i], b=face[(i+1)%face.length], start=key(a), end=key(b);
      if (!boundary.delete(end+'|'+start)) boundary.set(start+'|'+end,[a,b]);
    }
  }
  const next = new Map([...boundary.values()].map(([a,b])=>[key(a),b]));
  const start = boundary.values().next().value?.[0];
  if (!start) return [];
  const points=[];
  let p=start;
  while (p && next.has(key(p))) {
    const k=key(p);
    points.push(p);
    p=next.get(k);
    next.delete(k);
  }
  return points;
}

// All pockets passed together start on the same planar stock face.
// Replace that entire face, including coplanar cells of a profiled tread.
export function pocketedFace(faces, outline, pockets, inward) {
  const origin = outline[0];
  const outward = {x:-inward.x, y:-inward.y, z:-inward.z};
  const parallel = [inward.x,inward.y,inward.z].map(Math.abs);
  const drop = parallel.indexOf(Math.max(...parallel));
  const flatten = p => drop===0 ? [p.y,p.z] : drop===1 ? [p.x,p.z] : [p.x,p.y];
  const result = faces.filter(face => !face.every(p => Math.abs(dot(minus(p,origin),inward)) < 1e-6));
  const vertices = [...outline];
  const holes = [];
  for (const pocket of pockets) {
    const mouth = pocket.worldContour.slice();
    if (dot(cross(minus(mouth[1],mouth[0]),minus(mouth[2],mouth[0])),outward)<0) mouth.reverse();
    holes.push(vertices.length);
    vertices.push(...mouth);
    const bed = mouth.map(p => ({x:p.x+pocket.depth*inward.x,
      y:p.y+pocket.depth*inward.y, z:p.z+pocket.depth*inward.z}));
    result.push(bed);
    mouth.forEach((a,i) => {
      const j = (i+1)%mouth.length;
      result.push([a,mouth[j],bed[j],bed[i]]);
    });
  }
  const indices = earcut(vertices.flatMap(flatten),holes);
  for (let i=0; i<indices.length; i+=3) {
    const triangle = indices.slice(i,i+3).map(index => vertices[index]);
    if (dot(cross(minus(triangle[1],triangle[0]),minus(triangle[2],triangle[0])),outward)<0) triangle.reverse();
    result.push(triangle);
  }
  return result;
}
