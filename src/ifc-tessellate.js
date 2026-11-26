import earcut from 'earcut';

export function tessellate(part, toLocal) {
  const coordinates = [], triangles = [], indices = new Map();
  const vertex = p => {
    const xyz = toLocal(p).map(v => Math.round(v*1e6)/1e6);
    if (!xyz.every(Number.isFinite)) throw new Error('Niet-eindige coördinaat in '+part.label+'.');
    const k = xyz.join(',');
    if (!indices.has(k)) {coordinates.push(xyz); indices.set(k,coordinates.length);}
    return indices.get(k);
  };
  for (const face of part.faces) {
    const loop = face.map(vertex);
    if (loop.length < 3 || new Set(loop).size !== loop.length) throw new Error('Ongeldige contour in '+part.label+'.');
    if (loop.length === 3) { triangles.push(loop); continue; }
    const points = loop.map(i => coordinates[i-1]);
    const normal = [0,0,0];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i+1)%points.length];
      for (let j = 0; j < 3; j++) normal[j] += (a[(j+1)%3]-b[(j+1)%3])*(a[(j+2)%3]+b[(j+2)%3]);
    }
    const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    if (Math.abs(normal[axis]) < 1e-9) throw new Error('Vlak zonder oppervlakte in '+part.label+'.');
    const uv = points.flatMap(p => [p[(axis+1)%3],p[(axis+2)%3]]);
    const tris = earcut(uv);
    if (!tris.length) throw new Error('Vlak kon niet worden getrianguleerd in '+part.label+'.');
    for (let j = 0; j < tris.length; j+=3) {
      const a = loop[tris[j]], b = loop[tris[j+1]], c = loop[tris[j+2]];
      triangles.push(normal[axis] > 0 ? [a,b,c] : [a,c,b]);
    }
  }
  // An apparently closed boundary can have a self-intersection within one
  // concave profile. Never mark the IFC tessellation closed if the resulting
  // triangles leave a gap, share inconsistent winding or carry no volume.
  const edges = new Map();
  let signedVolume = 0;
  for (const t of triangles) {
    const [a,b,c] = t.map(j=>coordinates[j-1]);
    const u=b.map((v,k)=>v-a[k]), v=c.map((w,k)=>w-a[k]);
    const cross=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    if (Math.hypot(...cross)<1e-9) throw new Error('Driehoek zonder oppervlakte in '+part.label+'.');
    signedVolume += a[0]*cross[0] + a[1]*cross[1] + a[2]*cross[2];
    for (let j=0;j<3;j++) {
      const x=t[j], y=t[(j+1)%3], key=Math.min(x,y)+','+Math.max(x,y);
      const used=edges.get(key) ?? [0,0];
      used[x<y?0:1]++;
      edges.set(key,used);
    }
  }
  if (!(signedVolume>0) || [...edges.values()].some(([a,b])=>a!==1 || b!==1)) {
    throw new Error('De triangulatie vormt geen gesloten volume voor '+part.label+'. Controleer de onderdeelgeometrie.');
  }
  return {coordinates,triangles};
}
