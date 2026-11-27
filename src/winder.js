import { buildStairViews } from './stair-views.js';
import { goingBandWidth } from './going-band.js';
import { buildWinderSchedule } from './winder-parts.js';
import { housedRisers } from './timber-riser.js';

const quarter = Math.PI / 2;
const epsilon = 1e-7;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const mag = a => Math.hypot(a.x, a.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const clamp = (v, low, high) => Math.min(high, Math.max(low, v));
const svgPoints = points => points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const polygonArea = points => points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0) / 2;
export const isWinder = type => type === 'quarter_winder' || type === 'half_winder';

export function deriveWinder(stair, family) {
  const risers = clamp(Math.round(Number(stair.risers) || 2), 2, 80);
  const treadCount = risers - 1;
  const going = Number(stair.going);
  const rise = Number(stair.floorHeight) / risers;
  const perQuarter = stair.windersPerQuarter ?? 4;
  const quarters = stair.type === 'half_winder' ? 2 : 1;
  const turnSteps = quarters * perQuarter;
  const remaining = treadCount - turnSteps;
  const entrySteps = (stair.entrySteps ?? -1) === -1 ? Math.floor(remaining / 2) : stair.entrySteps;
  const radius = perQuarter * going / quarter;
  const clearWidth = stair.width - 2 * stair.stringerThickness;
  // The outside chord of a faceted winding lane is closest to the circular
  // walking line at its midpoint. A square outside corner never cuts inward.
  const walklineClearance = stair.outerShape === 'faceted'
    ? (radius + clearWidth / 2) * Math.cos(quarter / (2 * perQuarter)) - radius
    : clearWidth / 2;
  const flight = { index: 0, firstRiser: 0, label: 'Doorlopende vlucht', risers, treadCount,
    origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
  return { family, risers, treadCount, flightCount: 1, flightRisers: [risers], flightHeights: [Number(stair.floorHeight)],
    rise, totalRun: treadCount * going, pitch: Math.atan2(rise, going) * 180 / Math.PI, flights: [flight],
    landingTravel: 0, perQuarter, turnSteps, entrySteps, exitSteps: remaining - entrySteps, radius,
    clearWidth, walklineClearance, angle: quarters * quarter };
}

// Using station along the walking line also parameterises each offset rail:
// both have straight tangents before and after the circular bend.
function routePoint(s, offset, route) {
  const a = clamp((s - route.start) / route.radius, 0, route.angle);
  const tangent = { x: Math.cos(a), y: Math.sin(a) };
  const bend = { x: route.start + (route.radius - offset) * tangent.y,
    y: route.radius - (route.radius - offset) * tangent.x };
  return add(bend, tangent, s < route.start ? s - route.start : Math.max(0, s - route.end));
}

function makeRoute(stair, d) {
  const going = Number(stair.going);
  const start = d.entrySteps * going;
  const end = start + d.turnSteps * going;
  const route = { radius: d.radius, angle: d.angle, start, end };
  // One physical facet per station in the bend. These are also the edges in
  // the part drawing and the IFC profile. No independent arc approximation.
  const extension = d.clearWidth + going + Math.abs(Number(stair.nosing)||0) +
    (housedRisers(stair) ? Number(stair.riserThickness) + (Number(stair.wellatWidth)||0) : 0);
  const stations = [-extension, ...Array.from({ length: d.turnSteps + 1 }, (_, i) => start + i * going), d.totalRun + extension];
  const square = (stair.outerShape ?? 'square') === 'square';
  const corners = square ? Array.from({ length: Math.round(d.angle/quarter) }, (_, i) => start + (i + .5) * quarter * d.radius) : [];
  const outerStations = square ? [-extension, start, ...corners, end, d.totalRun + extension] : stations;
  const inner = stations.map(s => routePoint(s, d.clearWidth / 2, route));
  const outer = outerStations.map(s => {
    if (!square || s <= start || s >= end) return routePoint(s, -d.clearWidth / 2, route);
    const angle = (s - start) / d.radius;
    const factor = (d.radius + d.clearWidth/2) / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle)));
    return { x: start + factor * Math.sin(angle), y: d.radius - factor * Math.cos(angle) };
  });
  const sides = [inner, outer];
  const maxSkew = Math.asin(clamp((d.radius - d.clearWidth/2) / d.radius, 0, 1));
  const blend = Math.min(2.5 * going, 0.5 * (end - start), 2.4 * d.radius * maxSkew);
  const positive = x => Math.max(0, x);
  // Average the track's tangent angle over a neighbourhood. The integral of
  // a clipped linear ramp is a difference of squared positive parts. This
  // distributes the change of nosing direction into the adjoining runs.
  const integral = s => (positive(s - start) ** 2 - positive(s - end) ** 2) / (2 * d.radius);
  const section = s => {
    const radial = clamp((s - start) / d.radius, 0, d.angle);
    const smooth = (integral(s + blend) - integral(s - blend)) / (2 * blend);
    const endpointWeight = clamp(Math.min(s, d.totalRun - s) / going, 0, 1);
    const angle = radial + (smooth - radial) * endpointWeight;
    return { s, at: routePoint(s, 0, route), forward: { x: Math.cos(angle), y: Math.sin(angle) }, angle };
  };
  return { route, stations: [stations, outerStations], sides, section };
}

// Intersect an entire tread edge with the two faceted rails. On a return
// stair a line can also meet the other arm, so select its local chainage.
function cutRail(rail, stations, cut) {
  let best;
  let error = Infinity;
  for (let i = 0; i + 1 < rail.length; i++) {
    const edge = sub(rail[i + 1], rail[i]);
    const denominator = dot(cut.forward, edge);
    if (denominator <= epsilon) continue;
    const t = dot(cut.forward, sub(cut.at, rail[i])) / denominator;
    if (t < -epsilon || t > 1 + epsilon) continue;
    const fraction = clamp(t, 0, 1);
    const delta = Math.abs(stations[i] + (stations[i + 1] - stations[i]) * fraction - cut.s);
    if (delta >= error) continue;
    best = { point: add(rail[i], edge, fraction), index: i + fraction };
    error = delta;
  }
  return best;
}

function interval(rail, first, last) {
  const points = [first.point];
  for (let i = Math.ceil(first.index + epsilon); i < last.index - epsilon; i++) points.push(rail[i]);
  points.push(last.point);
  return points.filter((p,i) => {
    if (i === 0 || i === points.length - 1) return true;
    const u = sub(p, points[i - 1]), v = sub(points[i + 1], p);
    return Math.abs(cross(u,v)) > epsilon * mag(u) * mag(v) || dot(u,v) < 0;
  });
}

function makeCuts(stair, d) {
  const { route, stations, sides, section } = makeRoute(stair, d);
  const housed = housedRisers(stair);
  const seatDepth = housed ? Number(stair.riserThickness) : 0;
  const lip = housed && stair.wellatType === 'chamfered' ? Number(stair.wellatWidth) : 0;
  if (!(seatDepth >= 0 && lip >= 0) || (housed && seatDepth === 0)) return null;
  const fronts = [], noses = [], seatEnds = [];
  function intersect(cut, offset) {
    // Offset the same section plane along its local normal. Advancing the
    // station around the bend would rotate the back of a vertical board.
    const plane = { ...cut, at:add(cut.at,cut.forward,offset) };
    plane.hits = sides.map((rail,j) => cutRail(rail, stations[j], plane));
    return plane;
  }
  for (let i = 0; i <= d.treadCount; i++) {
    const front = intersect(section(i * stair.going - Number(stair.nosing||0)), 0);
    fronts.push(front);
    noses.push(lip && i < d.treadCount ? intersect(front,-lip) : front);
    seatEnds.push(seatDepth ? intersect(front,seatDepth) : front);
  }
  for (let i = 0; i <= d.treadCount; i++) for (let side = 0; side < 2; side++) {
    const nose = noses[i].hits[side], face = fronts[i].hits[side], end = seatEnds[i].hits[side];
    if (!nose || !face || !end || nose.index > face.index + epsilon || end.index < face.index - epsilon) return null;
    if (i && nose.index <= seatEnds[i-1].hits[side].index + epsilon) return null;
  }
  return { route, sides, fronts, noses, seatEnds, housed };
}

function basicIssues(stair, d) {
  if (![stair.width, stair.floorHeight, stair.going, stair.treadThickness, stair.stringerDepth, stair.stringerThickness].every(x => Number.isFinite(x) && x > 0)
    || !Number.isFinite(stair.nosing) || stair.nosing < -60 || stair.nosing > 100 || !Number.isInteger(stair.risers) || stair.risers < 2 || stair.risers > 80) return ['Vul geldige trap- en houtmaten en een geldige neuspositie in.'];
  if (stair.turnDirection && !['left','right'].includes(stair.turnDirection)) return ['Kies linksom of rechtsom.'];
  if (stair.outerShape && !['square','faceted'].includes(stair.outerShape)) return ['Kies een haakse of een gefacetteerde buitenzijde.'];
  if (!Number.isInteger(d.perQuarter) || d.perQuarter < 2 || d.perQuarter > 8) return ['Kies twee tot acht boogtreden per kwartslag.'];
  if (d.turnSteps > d.treadCount) return [`Voor deze bocht zijn minstens ${d.turnSteps + 1} optredes nodig.`];
  if (!Number.isInteger(d.entrySteps) || d.entrySteps < 0 || d.exitSteps < 0) return [`Kies nul tot ${d.treadCount - d.turnSteps} treden vóór de boog, of kies automatische verdeling.`];
  if (d.clearWidth <= 0 || d.radius <= stair.width / 2 + epsilon) return ['De binnenstraal moet positief zijn. Kies meer boogtreden, een grotere aantrede of een smallere trap.'];
  const innerFacetDistance = (d.radius - d.clearWidth/2) * Math.cos(quarter/(2*d.perQuarter));
  if (innerFacetDistance <= stair.stringerThickness + epsilon) return ['De binnenwang heeft te weinig ruimte voor de verstekken. Vergroot de binnenstraal of verklein de wangdikte.'];
  if (d.walklineClearance <= epsilon) return ['De klimlijn valt buiten de beschikbare tredebreedte. Kies een haakse buitencontour of vergroot de ruimte tussen de wangen.'];
  return [];
}

export function winderIssues(stair) {
  const d = deriveWinder(stair);
  const issues = basicIssues(stair, d);
  if (issues.length) return issues;
  if (makeCuts(stair,d)) return [];
  return [housedRisers(stair)
    ? 'De trede, wellat of stootbordoplegging past niet tussen de opeenvolgende snijlijnen aan de wang. Controleer binnenstraal, neuspositie, wellatbreedte en stootborddikte.'
    : 'De tredegrenzen snijden de wang in deze bocht niet in oplopende volgorde. Vergroot de bochtstraal of verklein het neusoverstek.'];
}

// Offsetting consecutive rail facets by the actual board thickness gives a
// shared vertical mitre at every joint. The offset is built once for each
// station so both adjacent boards use identical coordinates and levels.
function offsetJoints(nodes, side, thickness) {
  const normals = nodes.slice(1).map((p,i) => {
    const along = sub(p,nodes[i]);
    const run = mag(along);
    return { x: -along.y / run, y: along.x / run };
  });
  return nodes.map((p,i) => {
    const before = normals[Math.max(0,i-1)];
    const after = normals[Math.min(normals.length-1,i)];
    const mitre = add(before,after);
    return { ...add(p,mitre,side*thickness / (1+dot(before,after))), z:p.z };
  });
}

function beamBetween(a, b, outerA, outerB, side, stair, number) {
  const delta = sub(b,a);
  const run = mag(delta), dz = b.z-a.z;
  const axisLength = Math.hypot(run,dz);
  const tangent = { x:delta.x/run, y:delta.y/run };
  const axis = { x:delta.x/axisLength, y:delta.y/axisLength, z:dz/axisLength };
  const down = { x:tangent.x*axis.z, y:tangent.y*axis.z, z:-run/axisLength };
  const sideAxis = { x:-tangent.y, y:tangent.x, z:0 };
  const top = [a,b,outerB,outerA];
  const bottom = top.map(p=>({ ...p,z:p.z-stair.stringerDepth }));
  const vertices = [...top,...bottom];
  // Vertical drop is constant. Triangulate the top and bottom along matching
  // diagonals because a board between two different mitres can have a twisted top.
  const faces = [[0,1,2],[0,2,3],[6,5,4],[7,6,4]];
  for (let i=0; i<4; i++) {
    const j=(i+1)%4;
    faces.push([i+4,j+4,j,i]);
  }
  if (side<0) for (const face of faces) face.reverse();
  const meshFaces = faces.map(face=>face.map(i=>vertices[i]));
  const points = top.map(({x,y})=>({x,y}));
  if (side<0) points.reverse();

  // A gross blank has grain parallel to the uphill rail edge. Project every
  // corner onto that orthonormal stock frame, including the mitre allowances.
  const extent = direction => {
    const coords=vertices.map(p=>dot(p,direction)+p.z*direction.z);
    return Math.max(...coords) - Math.min(...coords);
  };
  const length = extent(axis), width = extent(down), thickness = stair.stringerThickness;
  const label = side>0 ? 'L' : 'R';
  return { id:`${stair.mark}-WG-${label}${number}`, name:`Wangsegment ${label}${number} · verstek`,
    flightIndex:0, side, length, width, thickness, vertices, faces, meshFaces,
    grainDirection:axis, stockDepthDirection:down, stockThicknessDirection:sideAxis,
    volume:polygonArea(points)*stair.stringerDepth/1e9, blankVolume:length*width*thickness/1e9,
    points, svgPoints:svgPoints(points) };
}

function makeBeams(cuts, stair, rise, reflect) {
  const beams = [];
  for (const [sideIndex, rail] of cuts.sides.entries()) {
    // One stock length per rail facet, split at changes in plan direction and
    // the bend tangencies. Match the tread pitch at these joints by linearly
    // interpolating its station on the rail. Do not cut a second, tiny piece
    // merely because a tread line passes just beside the joint.
    const hits = cuts.fronts.map(front => front.hits[sideIndex]);
    const distances = [0];
    for (let j = 1; j < rail.length; j++) distances.push(distances[j-1] + mag(sub(rail[j], rail[j-1])));
    const chainage = index => {
      const leg = Math.min(Math.floor(index), rail.length - 2);
      return distances[leg] + (index - leg) * (distances[leg + 1] - distances[leg]);
    };
    const treadStations = hits.map(hit => chainage(hit.index));
    const first = hits[0], last = hits.at(-1);
    const joints = [first];
    for (let j = Math.ceil(first.index + epsilon); j < last.index - epsilon; j++) joints.push({ point: rail[j], index: j });
    joints.push(last);
    const nodes = joints.map(joint => {
      const s = chainage(joint.index);
      let i = 0;
      while (i < hits.length - 2 && treadStations[i + 1] < s) i++;
      const fraction = (s - treadStations[i]) / (treadStations[i+1] - treadStations[i]);
      return { ...reflect(joint.point), z: (i + 1 + fraction) * rise };
    });
    const side = (sideIndex === 0 ? 1 : -1) * (stair.turnDirection === 'right' ? -1 : 1);
    const offset = offsetJoints(nodes,side,stair.stringerThickness);
    for (let j = 1; j < nodes.length; j++) beams.push(beamBetween(nodes[j-1], nodes[j], offset[j-1],offset[j],side,stair,j));
  }
  return beams;
}

export function generateWinderGeometry(stair, family, options) {
  const dimensions = deriveWinder(stair, family);
  const { rise, treadCount } = dimensions;
  const cuts = basicIssues(stair, dimensions).length ? null : makeCuts(stair, dimensions);
  const reflect = ({ x, y }) => ({ x, y: stair.turnDirection === 'right' ? -y : y });
  const treads = [], landings = [], walkline = [];
  if (cuts) {
    for (let i = 0; i < treadCount; i++) {
      const front = cuts.fronts[i], next = cuts.fronts[i + 1], nose = cuts.noses[i];
      const between = (a,b) => cuts.sides.map((side,j) => interval(side, a.hits[j], b.hits[j]));
      const [inner, outer] = between(nose,cuts.seatEnds[i+1]);
      const polygon = (innerSide, outerSide) => [...outerSide, ...innerSide.toReversed()];
      const physical = polygon(inner, outer);
      const points = physical.map(reflect);
      if (polygonArea(points) < 0) points.reverse();
      const area = polygonArea(points);
      const edgeLength = chain => chain.slice(1).reduce((length,p,j) => length + mag(sub(p,chain[j])), 0);
      // Ray starts on the leading (nosing) edge, at the exact walking line.
      // Take the first exit from the finite polygon, including a possible
      // exit through a side wall on an unusually tight bend.
      const normalDepth = (contour,startPlane) => {
        let distance = Infinity;
        for (let j = 0; j < contour.length; j++) {
          const start = contour[j], end = contour[(j+1) % contour.length];
          const edge = sub(end,start);
          const divisor = cross(front.forward,edge);
          if (Math.abs(divisor) < epsilon) continue;
          const along = cross(sub(start, startPlane.at),edge)/divisor;
          const fraction = cross(sub(start,startPlane.at),front.forward)/divisor;
          if (along > epsilon && fraction >= -epsilon && fraction <= 1+epsilon) distance = Math.min(distance, along);
        }
        return distance;
      };
      const center = reflect(routePoint((i + .5) * stair.going - Number(stair.nosing||0), 0, cuts.route));
      const widths = points.map(p => p.x), heights = points.map(p => p.y);
      const isWinder = Math.abs(front.angle - next.angle) > epsilon || points.length > 4;
      const goingContour = polygon(...between(front,next));
      const visible = between(nose,next);
      const seat = index => {
        const start = cuts.fronts[index], end = cuts.seatEnds[index];
        const points = polygon(...between(start,end)).map(reflect);
        if (polygonArea(points)<0) points.reverse();
        return {points,direction:reflect(start.forward)};
      };
      const eligibleAt170Mm = goingBandWidth(front.hits.map(hit => hit.point), front.forward, goingContour, 170);
      treads.push({ id: `${stair.mark}-TD-${String(i + 1).padStart(2,'0')}`, flightIndex: 0, step: i + 1,
        level: i + 1, elevation: (i + 1) * rise, thickness: stair.treadThickness, length: Math.max(...widths) - Math.min(...widths),
        width: Math.max(...heights) - Math.min(...heights), center, direction: reflect(front.forward),
        points, svgPoints: svgPoints(points), area, volume: area * stair.treadThickness / 1e9,
        frontEdge: nose.hits.map(hit => reflect(hit.point)), isWinder, eligibleAt170Mm, goingAtWalkline: normalDepth(goingContour,front),
        depthAtWalkline: normalDepth(polygon(...visible),nose), narrowDepth: Math.min(...visible.map(edgeLength)),
        ...(cuts.housed ? {riserSeat:seat(i), ...(i===treadCount-1 ? {exitRiserSeat:seat(i+1)} : {})} : {}) });
    }
    for (let i = 0; i <= treadCount * 8; i++) walkline.push(reflect(routePoint(i * stair.going / 8, 0, cuts.route)));
  }
  const stringers = cuts ? makeBeams(cuts, stair, rise, reflect) : [];
  const layout = { treads, stringers, landings };
  return { ...layout, flights: dimensions.flights, dimensions, walkline,
    ...buildStairViews(layout, stair.width, options), ...buildWinderSchedule(treads, stringers) };
}
