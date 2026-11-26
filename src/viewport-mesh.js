import earcut from 'earcut';

// Vertex and unit layout from Open BIM Suite's src/viewport/render.rs.
const stride = 32;
const timber = [205, 164, 110, 255];
const treadColors = {
  timber, glass: [91, 190, 197, 110], grating: [133, 147, 159, 255],
  clt: [225, 187, 139, 255], custom: [186, 179, 161, 255]
};
const stringerColor = [152, 127, 95, 255];
const outline = [73, 78, 80, 255];
const componentColors = {
  timber, glass:[89,185,199,120], ceramic:[82,94,96,255], interlayer:[154,211,215,98], aluminium:[180,191,198,255], steel:[98,119,132,255], galvanized:[162,175,182,255], concrete:[191,187,177,255],
  rubber:[68,74,76,255], rebar:[167,84,50,255], context:[181,196,204,85]
};

export function faceNormal(points) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  const length = Math.hypot(x, y, z);
  return length > 0 && Number.isFinite(length) ? [x / length, y / length, z / length] : null;
}

function stringerEnds({ frame: { origin, axis, sideAxis, down }, thickness, width, length }) {
  function end(depth) {
    return [[0, -1], [length, -1], [length, 1], [0, 1]].map(([along, sign]) => ({
      x: origin.x + axis.x * along + sideAxis.x * sign * thickness / 2 + down.x * depth,
      y: origin.y + axis.y * along + sideAxis.y * sign * thickness / 2 + down.y * depth,
      z: origin.z + axis.z * along + down.z * depth
    }));
  }
  return [end(-width / 2), end(width / 2)];
}

export function buildViewportMesh(geometry, system = 'timber') {
  const surfaces = [], edges = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];

  function face(points, color, seams) {
    const normal = faceNormal(points);
    if (!normal) return;
    // Drop the dominant normal component to handle vertical, inclined and concave faces.
    const dominant = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const polygon = points.flatMap(p => dominant === 0 ? [p.y, p.z] : dominant === 1 ? [p.x, p.z] : [p.x, p.y]);
    const indices = earcut(polygon);
    for (const i of indices) surfaces.push({ p: points[i], normal, color });
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (seams) {
        const keyOf = p => [p.x,p.y,p.z].map(v => Math.round(v*10000)).join(',');
        const ka = keyOf(a), kb = keyOf(b), key = ka < kb ? ka+'|'+kb : kb+'|'+ka;
        const first = seams.get(key);
        if (first) {
          const dot = first.normal.reduce((sum, n, axis) => sum + n*normal[axis], 0);
          first.visible = dot < Math.cos(Math.PI/7);
        } else seams.set(key,{a,b,normal,visible:true});
      } else edges.push({ p: a, normal, color: outline }, { p: b, normal, color: outline });
      [a.x, a.y, a.z].forEach((value, axis) => {
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      });
    }
  }

  function prism(top, bottom, color) {
    face(top, color);
    face([...bottom].reverse(), color);
    for (let i = 0; i < top.length; i++) {
      const next = (i + 1) % top.length;
      face([bottom[i], bottom[next], top[next], top[i]], color);
    }
  }

  function mesh(faces,color,edgeInk=outline) {
    const seams = new Map();
    for (const polygon of faces) face(polygon,color,seams);
    for (const edge of seams.values()) if (edge.visible) {
      edges.push({p:edge.a,normal:edge.normal,color:edgeInk},{p:edge.b,normal:edge.normal,color:edgeInk});
    }
  }
  for (const part of geometry.componentParts ?? []) {
    const materialColor=part.targetId && part.kind==='rebar'?[111,79,154,255]:componentColors[part.material]??timber;
    mesh(part.faces,materialColor,part.role==='gratingTread'||part.role==='platformDeck'?[119,132,138,255]:outline);
  }
  for (const board of [...(geometry.treads ?? []), ...(geometry.landings ?? [])]) {
    const color = geometry.landings.includes(board) ? timber : treadColors[system] ?? timber;
    if(board.meshFaces&&system==='timber') {
      mesh(board.meshFaces,color);
      continue;
    }
    const top = board.points.map(p => ({ ...p, z: board.elevation }));
    const bottom = top.map(p => ({ ...p, z: p.z - board.thickness }));
    prism(top, bottom, color);
  }
  for (const stringer of geometry.stringers ?? []) {
    if (stringer.meshFaces) {
      for (const polygon of stringer.meshFaces) face(polygon, stringerColor);
    } else {
      const [top, bottom] = stringerEnds(stringer);
      prism(top, bottom, stringerColor);
    }
  }

  const vertices = [...surfaces, ...edges];
  const bytes = new Uint8Array(vertices.length * stride);
  const floats = new Float32Array(bytes.buffer);
  vertices.forEach(({ p, normal, color }, i) => {
    const index = i * stride / 4;
    floats.set([p.x / 1000, p.y / 1000, p.z / 1000, ...normal], index);
    bytes.set(color, i * stride + 24);
  });
  const bounds = vertices.length ? [...min, ...max].map(v => v / 1000) : [0, 0, 0, 0, 0, 0];
  const direction = geometry.viewDirection ?? geometry.treads?.[0]?.direction ?? { x: 1, y: 0 };
  return { bytes, triangles: surfaces.length, bounds, direction };
}
