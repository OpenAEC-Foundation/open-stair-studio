import { compileHousingJob } from './housing-cam.js';

// The posts write XY and Z to 0.0001 mm. This tolerance only absorbs NC rounding.
const ncTolerance = 0.001;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const edges = points => points.map((p, i) => [p, points[(i + 1) % points.length]]);
const nc = n => Number(n.toFixed(4));
const asWritten = p => ({ x: nc(p.x), y: nc(p.y) });

function segmentDistance(p, a, b) {
  const ab = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return Math.hypot(p.x - a.x - t * ab.x, p.y - a.y - t * ab.y);
}

function segmentGap(a, b, c, d) {
  const ab = sub(b, a), cd = sub(d, c), determinant = cross(ab, cd);
  if (Math.abs(determinant) > 1e-10) {
    const t = cross(sub(c, a), cd) / determinant;
    const u = cross(sub(c, a), ab) / determinant;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d),
    segmentDistance(c, a, b), segmentDistance(d, a, b));
}

function polygonClearance(point, ccwLoop) {
  return Math.min(...edges(ccwLoop).map(([a, b]) => cross(sub(b, a), sub(point, a)) / distance(a, b)));
}

function insideRoundedPocket(p, ring, radius) {
  return polygonClearance(p, ring) >= 0 ||
    edges(ring).some(([a, b]) => segmentDistance(p, a, b) <= radius + ncTolerance);
}

function clearedCorners(operation, radius) {
  // For these rectangular mortises the only uncut areas around the radius-offset
  // ring lie in four corner rectangles. A relief cutter disk which covers all
  // four corners of one rectangle covers the entire rectangle by convexity.
  const { points } = operation.loop;
  if (points.length !== 4 || operation.relief.length !== 4) return false;
  return points.every((vertex, i) => {
    const near = asWritten(operation.ring[i]);
    const feet = [points[(i + 3) % 4], points[(i + 1) % 4]].map(other => {
      const side = sub(other, vertex);
      const t = dot(sub(near, vertex), side) / dot(side, side);
      return { x: vertex.x + t * side.x, y: vertex.y + t * side.y };
    });
    const center = asWritten(operation.relief[i]);
    return [vertex, near, ...feet].every(p => distance(p, center) <= radius + ncTolerance);
  });
}

function inBeamFrame(board, p, z, beam) {
  const world = {
    x: board.origin.x + board.xAxis.x * p.x + board.yAxis.x * p.y,
    y: board.origin.y + board.xAxis.y * p.x + board.yAxis.y * p.y,
    z: board.origin.z + z
  };
  const delta = { ...sub(world, beam.origin), z: world.z - beam.origin.z };
  const projection = axis => dot(delta, axis) + delta.z * axis.z;
  return { x: projection(beam.xAxis), y: projection(beam.yAxis), z: projection(beam.zAxis) };
}

function checkConnection(part, tongue, beam, housingCam, job, cutterPath) {
  if (!beam) throw new Error('De gekoppelde wang ontbreekt.');
  const housingJob = compileHousingJob(beam, housingCam, {}, tongue.pocketId);
  const op = housingJob.operations[0];
  if (op.treadId !== part.id) throw new Error('Het wanghuis is gekoppeld aan een andere trede.');
  const cutTongue = job.tongues.find(t => t.pocketId === tongue.pocketId);
  if (!cutTongue || tongue.points.length !== 4 || cutTongue.points.length !== 4) throw new Error('De insteeklip ontbreekt in de freesopstelling.');
  if (cutTongue.points.some((p, i) => distance(sub(p, job.offset), tongue.points[i]) > ncTolerance)) {
    throw new Error('De positie van de lip wijkt af van het tredeblad.');
  }
  const lipEdges = edges(cutTongue.points);
  const radius = job.parameters.toolDiameter / 2;
  if (cutterPath.some(([a, b]) => lipEdges.some(([c, d]) => segmentGap(a, b, c, d) < radius - ncTolerance))) {
    throw new Error('De freesbaan snijdt in de insteeklip.');
  }
  // Check both roots. A simple external profile offset leaves a radius of
  // material here, preventing the shoulder from seating against the inside face.
  for (const root of [cutTongue.points[0], cutTongue.points[3]]) {
    if (!cutterPath.some(([a, b]) => segmentDistance(root, a, b) <= radius + ncTolerance)) {
      throw new Error('Resthout aan de lipschouder verhindert dat de trede tegen de wang aansluit.');
    }
  }
  const face = tongue.points.map(p => inBeamFrame(part.boardFrame, p, 0, beam.frame));
  if ([face[0], face[3]].some(p => Math.abs(p.z) > ncTolerance) ||
      [face[1], face[2]].some(p => Math.abs(p.z + tongue.depth) > ncTolerance)) {
    throw new Error('De lip en het binnenvlak hebben een afwijkend aanslagvlak of insteekrichting.');
  }
  const vertices = [0, -part.thickness].flatMap(z => tongue.points.map(p => inBeamFrame(part.boardFrame, p, z, beam.frame)));
  const depthClearance = -nc(op.levels.at(-1)) + Math.min(...vertices.map(v => v.z));
  if (depthClearance < -ncTolerance) throw new Error('De lip raakt de bodem voordat de schouder aanligt.');
  const edgeClearance = Math.min(...vertices.map(p => polygonClearance(p, op.loop.points)));
  if (edgeClearance < -ncTolerance) throw new Error('De lengte of dikte van de lip overschrijdt de nominale wangopening.');
  const ring = op.ring.map(asWritten);
  const housingRadius = housingJob.cam.toolDiameter / 2;
  if (!vertices.every(p => insideRoundedPocket(p, ring, housingRadius)) && !clearedCorners(op, housingRadius)) {
    throw new Error('De ronde binnenhoek van het gefreesde wanghuis raakt de lip. Kies hoekontlasting, een kleinere wangfrees of meer passpeling.');
  }
  return { edgeClearance: Math.max(0, edgeClearance), depthClearance: Math.max(0, depthClearance) };
}

export function verifyTreadFit(part, workshop, housingCam, job) {
  const connections = [];
  const beamIds = new Set(part.tongues.map(tongue => tongue.beamId));
  const issues = (workshop.housings?.issues ?? [])
    .filter(issue => issue.level === 'error' && (issue.treadId ? issue.treadId === part.id : !issue.beamId || beamIds.has(issue.beamId)))
    .map(issue => issue.message);
  if (!job || job.partId !== part.id || -nc(job.levels.at(-1)) < part.thickness) {
    issues.push('Een geldige doorgaande freesbaan voor deze trede ontbreekt.');
  } else if (workshop.housings && (part.tongues.length < 2 || !part.boardFrame)) {
    issues.push('De trede heeft onvoldoende gekoppelde insteeklippen of mist het planknulpunt.');
  } else {
    const path = job.path.map(asWritten);
    const cutterPath = path.slice(1).map((p, i) => [path[i], p]);
    for (const tongue of part.tongues) {
      const link = { pocketId: tongue.pocketId, beamId: tongue.beamId };
      const beam = workshop.housings?.beams.find(b => b.id === link.beamId);
      try {
        const measured = checkConnection(part, tongue, beam, housingCam, job, cutterPath);
        connections.push({ ...link, ...measured, status: 'pass', message: 'Lip en schouder passen in de gefreesde wang.' });
      } catch (error) {
        connections.push({ ...link, status: 'blocked', message: error.message });
        issues.push(link.beamId + ' · ' + error.message);
      }
    }
  }
  const status = issues.length ? 'blocked' : connections.length ? 'pass' : 'unconnected';
  const message = issues[0] ?? (connections.length ? 'Alle lippen passen volgens de berekende freesbanen.' : 'Losse trede zonder gekoppelde wanghuizen.');
  return { status, connections, message, issues };
}
