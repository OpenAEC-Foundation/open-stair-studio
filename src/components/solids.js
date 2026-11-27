// Closed boundary faces in local millimetres, with normals pointing outwards.
export function signedMeshVolume(vertices, faces) {
  let sixVolume = 0;
  for (const face of faces) {
    const a = vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const b = vertices[face[i]], c = vertices[face[i + 1]];
      sixVolume += a.x * (b.y*c.z - b.z*c.y) + a.y * (b.z*c.x - b.x*c.z) + a.z * (b.x*c.y - b.y*c.x);
    }
  }
  return sixVolume / 6;
}

function joined(bottom, top) {
  return [[...bottom].reverse(), top, ...bottom.map((p, i) => {
    const j = (i + 1) % bottom.length;
    return [p, bottom[j], top[j], top[i]];
  })];
}

export function prism(points, bottomZ, topZ) {
  const signed = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const loop = signed < 0 ? [...points].reverse() : points;
  return joined(loop.map(p => ({ ...p, z: bottomZ })), loop.map(p => ({ ...p, z: topZ })));
}

export function box(x0, y0, z0, x1, y1, z1) {
  return prism([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], z0, z1);
}

function along(start, end, section) {
  const x = end.x-start.x, y = end.y-start.y, z = end.z-start.z;
  const l = Math.hypot(x,y,z), h = Math.hypot(x,y);
  if (!(l > 0)) return [];
  const u = h > 1e-9 ? [-y/h,x/h,0] : [1,0,0];
  const v = [-z*u[1]/l,z*u[0]/l,(x*u[1]-y*u[0])/l];
  const loop = p => section.map(([a,b]) => ({
    x:p.x+a*u[0]+b*v[0], y:p.y+a*u[1]+b*v[1], z:p.z+a*u[2]+b*v[2]
  }));
  return joined(loop(start),loop(end));
}

// Width is horizontal across a sloping member, depth perpendicular to its axis.
export function beam(start, end, width, depth) {
  const a = width/2, b = depth/2;
  return along(start,end,[[-a,-b],[a,-b],[a,b],[-a,b]]);
}

export function tube(start, end, radius, sides = 16) {
  const ring = Array.from({length:sides}, (_,i) => {
    const theta = i*2*Math.PI/sides;
    return [radius*Math.cos(theta),radius*Math.sin(theta)];
  });
  return along(start,end,ring);
}

export function boundsOf(parts) {
  let xmin=Infinity, ymin=Infinity, zmin=Infinity, xmax=-Infinity, ymax=-Infinity, zmax=-Infinity;
  for (const part of parts) for (const face of part.faces) for (const p of face) {
    xmin=Math.min(xmin,p.x); ymin=Math.min(ymin,p.y); zmin=Math.min(zmin,p.z);
    xmax=Math.max(xmax,p.x); ymax=Math.max(ymax,p.y); zmax=Math.max(zmax,p.z);
  }
  return Number.isFinite(xmin) ? {xmin,ymin,zmin,xmax,ymax,zmax} : null;
}
