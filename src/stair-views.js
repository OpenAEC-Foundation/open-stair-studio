export function buildStairViews({ treads, landings, stringers }, width, { projectIsometric = true } = {}) {
  const allPlanPoints = [...treads.flatMap(tread => tread.points), ...landings.flatMap(landing => landing.points), ...stringers.flatMap(stringer => stringer.points)];
  if (!allPlanPoints.length) {
    return { planBox: { x: -100, y: -100, width: 200, height: 200 }, footprint: { x: 0, y: 0, width: 0, depth: 0 }, isoFaces: [] };
  }
  const minX = Math.min(...allPlanPoints.map(point => point.x));
  const minY = Math.min(...allPlanPoints.map(point => point.y));
  const maxX = Math.max(...allPlanPoints.map(point => point.x));
  const maxY = Math.max(...allPlanPoints.map(point => point.y));
  const pad = Math.max(180, width * 0.22);
  const planBox = { x: minX - pad, y: minY - pad, width: Math.max(1, maxX - minX + 2 * pad), height: Math.max(1, maxY - minY + 2 * pad) };
  const footprint = { x: minX, y: minY, width: maxX - minX, depth: maxY - minY };

  return { planBox, footprint, isoFaces: projectIsometric ? projectStair({ treads, landings, stringers }) : [] };
}

export function projectStair({ treads, landings, stringers }, quarterTurns = 0) {
  if (!treads.length && !landings.length && !stringers.length) return [];
  const rawFaces = [];
  const cos = [1, 0, -1, 0][quarterTurns], sin = [0, 1, 0, -1][quarterTurns];
  // Camera at (+X, -Y, +Z), world +Z up, SVG +Y down.
  const project = point => ({
    x: (point.x + point.y) * Math.sqrt(3) / 2,
    y: (point.x - point.y) / 2 - point.z
  });
  function addFace(vertices, type) {
    const camera = vertices.map(p => ({ x: p.x*cos - p.y*sin, y: p.x*sin + p.y*cos, z: p.z }));
    const points = camera.map(project);
    // Vertices wind outwards. Use projected winding to select visible faces
    // regardless of which direction the stair flight runs.
    const winding = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (winding >= 0) return;
    const sort = camera.reduce((sum, p) => sum + p.x - p.y + p.z, 0) / camera.length;
    rawFaces.push({ type, points, sort });
  }
  function addPrism(top, bottom, topType, sideTypes) {
    addFace(top, topType);
    addFace([...bottom].reverse(), topType);
    for (let i = 0; i < top.length; i++) {
      const next = (i + 1) % top.length;
      addFace([bottom[i], bottom[next], top[next], top[i]], sideTypes[i % 2]);
    }
  }
  function addBoard(board, type) {
    const top = board.points.map(point => ({ ...point, z: board.elevation }));
    const bottom = top.map(point => ({ ...point, z: point.z - board.thickness }));
    addPrism(top, bottom, type, ['front', 'side']);
  }
  treads.forEach(tread => addBoard(tread, 'top'));
  landings.forEach(landing => addBoard(landing, 'landing'));
  for (const stringer of stringers) {
    if (stringer.meshFaces) {
      for (const face of stringer.meshFaces) addFace(face, 'stringer');
      continue;
    }
    const { origin, axis, sideAxis, down } = stringer.frame;
    const corner = (along, side, depth) => ({
      x: origin.x + axis.x * along + sideAxis.x * side + down.x * depth,
      y: origin.y + axis.y * along + sideAxis.y * side + down.y * depth,
      z: origin.z + axis.z * along + down.z * depth
    });
    const corners = depth => {
      const half = stringer.thickness / 2;
      return [corner(0, -half, depth), corner(stringer.length, -half, depth),
        corner(stringer.length, half, depth), corner(0, half, depth)];
    };
    addPrism(corners(-stringer.width / 2), corners(stringer.width / 2), 'stringer', ['stringer', 'stringer']);
  }
  const projected = rawFaces.flatMap(face => face.points);
  const projMinX = Math.min(...projected.map(point => point.x));
  const projMinY = Math.min(...projected.map(point => point.y));
  const projMaxX = Math.max(...projected.map(point => point.x));
  const projMaxY = Math.max(...projected.map(point => point.y));
  const factor = Math.min(630 / Math.max(1, projMaxX - projMinX), 360 / Math.max(1, projMaxY - projMinY));
  const offsetX = 410 - ((projMinX + projMaxX) / 2) * factor;
  const offsetY = 265 - ((projMinY + projMaxY) / 2) * factor;
  return rawFaces.sort((a, b) => a.sort - b.sort).map(face => ({
    type: face.type,
    points: face.points.map(point => `${(point.x * factor + offsetX).toFixed(1)},${(point.y * factor + offsetY).toFixed(1)}`).join(' ')
  }));
}
