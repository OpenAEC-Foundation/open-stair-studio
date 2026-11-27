import { buildStairViews } from './stair-views.js';
import { goingBandWidth } from './going-band.js';
import { buildWinderSchedule } from './winder-parts.js';
import { housedRisers, legacyFrontLip, riserPlaneOffset } from './timber-riser.js';
import { signedMeshVolume } from './components/solids.js';
import { dimensionedRoute, usesOuterDimensions } from './dimensioned-winder.js';
import { quarterAngleError } from './two-quarter-settings.js';
import { finishNewels, trimAtNewels } from './quarter-newels.js';

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
export const isWinder = type => ['quarter_winder', 'half_winder', 'two_quarter_winder'].includes(type);
const fittedCuts = new WeakMap();

function edgeClearance(a, b, c, d) {
  const u=sub(b,a), v=sub(d,c), w=sub(c,a), determinant=cross(u,v);
  if (Math.abs(determinant)>epsilon) {
    const s=cross(w,v)/determinant, t=cross(w,u)/determinant;
    if (s>=0 && s<=1 && t>=0 && t<=1) return 0;
  }
  const distance=(point,start,axis)=>mag(sub(point,add(start,axis,clamp(dot(sub(point,start),axis)/dot(axis,axis),0,1))));
  return Math.min(distance(a,c,v),distance(b,c,v),distance(c,a,u),distance(d,a,u));
}

export function deriveWinder(stair, family) {
  const risers = clamp(Math.round(Number(stair.risers) || 2), 2, 80);
  const treadCount = risers - 1;
  const going = Number(stair.going);
  const rise = Number(stair.floorHeight) / risers;
  const dimensioned = usesOuterDimensions(stair);
  const perQuarter = dimensioned ? (stair.firstQuarterAngles?.length ?? 0) : (stair.windersPerQuarter ?? 4);
  const upperCount = dimensioned ? (stair.secondQuarterAngles?.length ?? 0) : perQuarter;
  const quarters = stair.type === 'quarter_winder' ? 1 : 2;
  const middleSteps = stair.type === 'two_quarter_winder' ? (stair.middleSteps ?? 5) : 0;
  const turnSteps = perQuarter + (quarters === 2 ? upperCount : 0);
  const remaining = treadCount - turnSteps - middleSteps;
  const entrySteps = (stair.entrySteps ?? -1) === -1 ? Math.floor(remaining / 2) : stair.entrySteps;
  const radius = perQuarter * going / quarter;
  const clearWidth = stair.width - 2 * stair.stringerThickness;
  // The outside chord of a faceted winding lane is closest to the circular
  // walking line at its midpoint. A square outside corner never cuts inward.
  const facetCosine = Math.cos(quarter / (2 * perQuarter));
  const walklineClearance = middleSteps
    ? radius - (radius - clearWidth / 2) / facetCosine
    : stair.outerShape === 'faceted'
    ? (radius + clearWidth / 2) * facetCosine - radius
    : clearWidth / 2;
  const flight = { index: 0, firstRiser: 0, label: 'Doorlopende vlucht', risers, treadCount,
    origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
  const dimensions = { family, risers, treadCount, flightCount: 1, flightRisers: [risers], flightHeights: [Number(stair.floorHeight)],
    rise, totalRun: treadCount * going, pitch: Math.atan2(rise, going) * 180 / Math.PI, flights: [flight],
    landingTravel: 0, perQuarter, turnSteps, middleSteps, entrySteps, exitSteps: remaining - entrySteps, radius,
    clearWidth, walklineClearance, angle: quarters * quarter };
  if (!dimensioned) return dimensions;
  Object.assign(dimensions,{dimensioned:true,upperCount,radius:null,walklineClearance:0,walklineStations:[]});
  if (basicIssues(stair,dimensions).length) return dimensions;
  const cuts=makeCuts(stair,dimensions);
  fittedCuts.set(dimensions,cuts);
  if (!cuts?.fronts) return dimensions;
  const stations=[0];
  let clearance=Infinity;
  for (let i=1; i<cuts.fronts.length; i++) {
    const a=cuts.fronts[i-1].at, b=cuts.fronts[i].at;
    stations.push(stations.at(-1)+mag(sub(b,a)));
    for (const rail of cuts.sides) for (let j=1; j<rail.length; j++)
      clearance=Math.min(clearance,edgeClearance(a,b,rail[j-1],rail[j]));
  }
  dimensions.walklineClearance=clearance;
  dimensions.walklineStations=stations;
  dimensions.totalRun=stations.at(-1);
  dimensions.pitch=Math.atan2(rise*treadCount,dimensions.totalRun)*180/Math.PI;
  return dimensions;
}

// Station measures distance along the walking line. At each side rail the
// radius changes by its offset; all three straight runs keep their length.
function routePoint(s, offset, route) {
  const straight = clamp(s - route.firstEnd, 0, route.middleRun);
  const a = clamp((s - route.start - straight) / route.radius, 0, route.angle);
  const tangent = { x: Math.cos(a), y: Math.sin(a) };
  const bend = { x: route.start + (route.radius - offset) * tangent.y,
    y: route.radius + straight - (route.radius - offset) * tangent.x };
  return add(bend, tangent, s < route.start ? s - route.start : Math.max(0, s - route.end));
}

function makeRoute(stair, d) {
  const going = Number(stair.going);
  const start = d.entrySteps * going;
  const firstEnd = start + d.perQuarter * going;
  const middleRun = d.middleSteps * going;
  const end = start + d.turnSteps * going + middleRun;
  const route = { radius: d.radius, angle: d.angle, start, firstEnd, middleRun, end };
  // One physical facet per station in the bend. These are also the edges in
  // the part drawing and the IFC profile. No independent arc approximation.
  const extension = d.clearWidth + going + Math.abs(Number(stair.nosing)||0) +
    (housedRisers(stair) ? Number(stair.riserThickness) + (Number(stair.wellatWidth)||0) : 0);
  // For a separated pair use tangents to each quarter circle: the terminal
  // facet of the first quarter continues collinearly into the middle run.
  // Intersections of successive tangents lie on the half-angle bisectors.
  const bendStations = middleRun
    ? Array.from({ length: d.turnSteps }, (_, i) => start + (i + .5) * going + (i >= d.perQuarter ? middleRun : 0))
    : Array.from({ length: d.turnSteps + 1 }, (_, i) => start + i * going);
  const stations = [-extension, ...bendStations, d.totalRun + extension];
  const square = (stair.outerShape ?? 'square') === 'square';
  const corners = square ? Array.from({ length: Math.round(d.angle/quarter) }, (_, i) => start + (i + .5) * quarter * d.radius + (i ? middleRun : 0)) : [];
  if (square && middleRun) corners.splice(1, 0, firstEnd, firstEnd + middleRun);
  const outerStations = square ? [-extension, start, ...corners, end, d.totalRun + extension] : stations;
  const facetPoint = (s, offset) => {
    if (middleRun && s > start && s < end) {
      offset = d.radius - (d.radius - offset) / Math.cos(quarter / (2 * d.perQuarter));
    }
    return routePoint(s, offset, route);
  };
  const inner = stations.map(s => facetPoint(s, d.clearWidth / 2));
  const outer = outerStations.map(s => {
    if (!square) return facetPoint(s, -d.clearWidth / 2);
    if (s <= start || s >= end) return routePoint(s, -d.clearWidth / 2, route);
    const straight = clamp(s - firstEnd, 0, middleRun);
    const angle = (s - start - straight) / d.radius;
    const factor = (d.radius + d.clearWidth/2) / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle)));
    return { x: start + factor * Math.sin(angle), y: d.radius + straight - factor * Math.cos(angle) };
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
    if (middleRun) {
      // Lay out the nosing directions on the design stations. A signed tread
      // shift moves each section while preserving the parallel middle flight.
      const shift = Number(stair.nosing || 0);
      const station = s + shift;
      const straight = clamp(station - firstEnd, 0, middleRun);
      const radial = clamp((station - start - straight) / d.radius, 0, d.angle);
      // Ease the rotation at both tangencies, symmetrically in each quarter.
      const angle = radial - Math.min(quarter / (8 * d.perQuarter), maxSkew / 4) * Math.sin(4 * radial);
      const forward = { x: Math.cos(angle), y: Math.sin(angle) };
      return { s, at: add(routePoint(station, 0, route), forward, -shift), forward, angle };
    }
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
  const layout = d.dimensioned ? dimensionedRoute(stair,d) : makeRoute(stair,d);
  if (layout.issue) return {issue:layout.issue};
  if (layout.invalid) return {issue:'Er is te weinig ruimte voor de kwarten tussen de rechte vluchten. Vergroot de buitenmaat of verklein de vluchtbreedte of het rechte tussenstuk.'};
  const { route, stations, sides, section } = layout;
  const housed = housedRisers(stair);
  const boards = housed || ((d.dimensioned || stair.wel!=null) && stair.riserBoards==='closed');
  const thickness = boards ? Number(stair.riserThickness) : 0;
  const offset = riserPlaneOffset(stair), lip = legacyFrontLip(stair);
  if (!(lip>=0 && offset>=0) || (boards && !(thickness>0))) return null;
  const fronts = [], noses = [], faces = [], boardBacks = [], seatEnds = [];
  function intersect(cut, offset) {
    // Offset the same section plane along its local normal. Advancing the
    // station around the bend would rotate the back of a vertical board.
    const plane = { ...cut, at:add(cut.at,cut.forward,offset) };
    plane.hits = sides.map((rail,j) => cutRail(rail, stations[j], plane));
    return plane;
  }
  for (let i = 0; i <= d.treadCount; i++) {
    const front = intersect(section(i * stair.going - Number(stair.nosing||0)), 0);
    if (d.dimensioned && front.hits.every(Boolean)) {
      front.at = add(front.hits[0].point,sub(front.hits[1].point,front.hits[0].point),.5);
    }
    fronts.push(front);
    noses.push(lip && i < d.treadCount ? intersect(front,-lip) : front);
    const face = offset ? intersect(front,offset) : front;
    const back = thickness ? intersect(front,offset+thickness) : face;
    faces.push(face);
    boardBacks.push(back);
    seatEnds.push(housed ? back : face);
  }
  for (let i = 0; i <= d.treadCount; i++) for (let side = 0; side < 2; side++) {
    const nose = noses[i].hits[side], face = faces[i].hits[side], back = boardBacks[i].hits[side];
    if (!nose || !fronts[i].hits[side] || !face || !back || nose.index > face.index + epsilon || back.index < face.index - epsilon) return null;
    // At a post the cheek, not the scaffold inside its stock, is the
    // physical tread boundary. The virtual stations can be very close.
    const atPost=side===0 && route.posts?.some(post=>{
      const low=Math.min(nose.point.y,back.point.y), high=Math.max(nose.point.y,back.point.y);
      return low<=post.yMax+epsilon && high>=post.yMin-epsilon;
    });
    const noseInside=side===0 && i && route.posts?.some(post=>
      [nose.point,noses[i-1].hits[side].point].every(p=>p.x>=post.xMin-epsilon && p.x<=post.xMax+epsilon &&
        p.y>=post.yMin-epsilon && p.y<=post.yMax+epsilon));
    if (i && ((!noseInside && nose.index<=noses[i-1].hits[side].index+epsilon) ||
        (!atPost && face.index<=boardBacks[i-1].hits[side].index+epsilon))) return null;
    if (!d.dimensioned && stair.wel==null && i && nose.index<=seatEnds[i-1].hits[side].index+epsilon) return null;
  }
  const cuts = { route, sides, fronts, noses, faces, boardBacks, seatEnds, boards };
  cuts.rails = sides.map((rail,sideIndex) => railStock(rail,sideIndex,cuts,stair.stringerThickness));
  if (cuts.rails.some(rail => !rail)) return { issue:'De eindzaagsnede kruist het verstek van een wangsegment. Verplaats de tredepositie of voeg een rechte aan- of uitloop toe.' };
  if (d.dimensioned) {
    const inside = p => p.x >= route.minX-epsilon && p.x <= route.minX+stair.outerDepth+epsilon &&
      p.y >= -epsilon && p.y <= stair.outerLength+epsilon;
    const cutFits = plane => plane.hits.every(hit => inside(hit.point));
    if (![...noses,...faces,...boardBacks].every(cutFits) || cuts.rails.some(rail=>!rail.outside.every(inside)))
      return {issue:'Een trede, stootbord of wang steekt bij de opgegeven draaihoeken buiten de ingestelde buitenmaat. Vergroot de buitenmaat of wijzig de verdrijving.'};
  }
  return cuts;
}

function basicIssues(stair, d) {
  if (![stair.width, stair.floorHeight, stair.going, stair.treadThickness, stair.stringerDepth, stair.stringerThickness].every(x => Number.isFinite(x) && x > 0)
    || !Number.isFinite(stair.nosing) || stair.nosing < -60 || stair.nosing > 100 || !Number.isInteger(stair.risers) || stair.risers < 2 || stair.risers > 80) return ['Vul geldige trap- en houtmaten en een geldige neuspositie in.'];
  if (stair.turnDirection && !['left','right'].includes(stair.turnDirection)) return ['Kies linksom of rechtsom.'];
  if (stair.outerShape && !['square','faceted'].includes(stair.outerShape)) return ['Kies een haakse of een gefacetteerde buitenzijde.'];
  if (d.dimensioned) {
    if (![stair.outerLength,stair.outerDepth].every(x=>Number.isFinite(x)&&x>0))
      return ['Vul twee positieve buitenmaten in.'];
    const error = quarterAngleError(stair.firstQuarterAngles) || quarterAngleError(stair.secondQuarterAngles);
    if (error) return [error];
  }
  if (!Number.isInteger(d.perQuarter) || d.perQuarter < 2 || d.perQuarter > 8) return ['Kies twee tot acht boogtreden per kwartslag.'];
  if (stair.type === 'two_quarter_winder' && (!Number.isInteger(d.middleSteps) || d.middleSteps < 1)) return ['Kies minstens één hele rechte trede tussen de beide kwartslagen.'];
  const occupiedSteps = d.turnSteps + d.middleSteps;
  if (occupiedSteps > d.treadCount) return [`Voor deze trapvorm zijn minstens ${occupiedSteps + 1} optredes nodig.`];
  if (!Number.isInteger(d.entrySteps) || d.entrySteps < 0 || d.exitSteps < 0) return [`Kies nul tot ${d.treadCount - occupiedSteps} treden vóór de eerste bocht, of kies automatische verdeling.`];
  if (d.dimensioned) return d.clearWidth>0 ? [] : ['De wangdiktes laten geen vrije tredebreedte over.'];
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
  const cuts = d.dimensioned ? fittedCuts.get(d) : makeCuts(stair,d);
  if (cuts?.issue) return [cuts.issue];
  if (cuts) return [];
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
    return add(p,mitre,side*thickness / (1+dot(before,after)));
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
  const bottom = top.map(p=>({ ...p,z:Math.max(0, p.z-stair.stringerDepth) }));
  const vertices = [...top,...bottom];
  // The underside follows two planes when mitred ends twist the top. Preserve
  // their common diagonal when cutting the entire solid at the finished floor.
  const startsBelow = a.z < stair.stringerDepth - epsilon;
  const crossesFloor = startsBelow && b.z > stair.stringerDepth + epsilon;
  let faces, housingOutline;
  if (crossesFloor) {
    const fraction = (stair.stringerDepth - a.z) / dz;
    const floorPoint = (start, end) => ({...add(start, sub(end, start), fraction), z:0});
    vertices.push(floorPoint(a,b), floorPoint(outerA,outerB), floorPoint(a,outerB));
    // 8 and 9 are the inner and outer knees; 10 is on the original mesh diagonal.
    faces = [[0,1,2],[0,2,3], [6,5,8,10],[9,6,10], [10,8,4],[7,9,10,4],
      [4,8,5,1,0],[5,6,2,1],[6,9,7,3,2],[7,4,0,3]];
    housingOutline = [0,1,5,8,4];
  } else {
    faces = [[0,1,2],[0,2,3],[6,5,4],[7,6,4],[4,5,1,0],[5,6,2,1],[6,7,3,2],[7,4,0,3]];
    housingOutline = [0,1,5,4];
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
    flightIndex:0, side, length, width, thickness, vertices, faces, meshFaces, housingOutline,
    grainDirection:axis, stockDepthDirection:down, stockThicknessDirection:sideAxis,
    volume:signedMeshVolume(vertices,faces)/1e9, blankVolume:length*width*thickness/1e9,
    points, svgPoints:svgPoints(points) };
}

function railStock(rail, sideIndex, cuts, thickness) {
  // The inside rail starts at the nose and ends at the finished-floor riser.
  // Offset the sawn rail once, checking that each mitre still has material on
  // both sides when a moved end plane falls very close to a bend.
  const fitted = cuts.route.dimensioned;
  const hits = cuts.fronts.map((front,i) =>
    (fitted || i===cuts.fronts.length-1 ? cuts.faces[i] : front).hits[sideIndex]);
  const endCut = i => {
    const a=rail[i], b=rail[i+1];
    const fraction=(cuts.route.minX-a.x)/(b.x-a.x);
    return {point:add(a,sub(b,a),fraction), index:i+fraction};
  };
  const first = fitted ? endCut(0) : hits[0];
  const last = fitted ? endCut(rail.length-2) : hits.at(-1);
  const joints = [first];
  for (let j=Math.ceil(first.index+epsilon); j<last.index-epsilon; j++) joints.push({point:rail[j],index:j});
  joints.push(last);
  const points = joints.map(j=>j.point);
  const outside = offsetJoints(points,sideIndex===0 ? 1 : -1,thickness);
  for (let j=1; j<joints.length; j++) {
    // These portions of the construction rail are wholly replaced by the
    // solid corner post. No stringer or mitre is sawn there.
    if (sideIndex===0 && cuts.route.posts?.some(p=>
      [points[j],points[j-1]].every(q=>q.y>=p.yMin-epsilon && q.y<=p.yMax+epsilon))) continue;
    if (!(dot(sub(points[j],points[j-1]),sub(outside[j],outside[j-1])) > epsilon)) return null;
  }
  if (!fitted) return {rail,hits,joints,outside};
  // A compact inside quarter rises several steps over a few centimetres.
  // Follow the changing pitch at each riser instead of spanning those
  // levels with a single chord. Keep both faces of every mitre coincident.
  const sawnJoints=[joints[0]], sawnOutside=[outside[0]];
  for (let i=1; i<joints.length; i++) {
    const a=joints[i-1], b=joints[i];
    for (const hit of hits) {
      if (hit.index<=a.index+epsilon || hit.index>=b.index-epsilon) continue;
      const t=mag(sub(hit.point,a.point))/mag(sub(b.point,a.point));
      sawnJoints.push(hit);
      sawnOutside.push(add(outside[i-1],sub(outside[i],outside[i-1]),t));
    }
    sawnJoints.push(b);
    sawnOutside.push(outside[i]);
  }
  return {rail,hits,joints:sawnJoints,outside:sawnOutside};
}

function makeBeams(cuts, stair, rise, reflect) {
  const beams = [];
  for (const [sideIndex, {rail,hits,joints,outside}] of cuts.rails.entries()) {
    // Match the pitch at every physical joint by interpolating its station
    // between the actual tread lines that meet this face.
    const distances = [0];
    for (let j = 1; j < rail.length; j++) distances.push(distances[j-1] + mag(sub(rail[j], rail[j-1])));
    const chainage = index => {
      const leg = Math.min(Math.floor(index), rail.length - 2);
      return distances[leg] + (index - leg) * (distances[leg + 1] - distances[leg]);
    };
    const treadStations = hits.map(hit => chainage(hit.index));
    const nodes = joints.map(joint => {
      const s = chainage(joint.index);
      let i = 0;
      while (i < hits.length - 2 && treadStations[i + 1] < s) i++;
      let fraction = (s - treadStations[i]) / (treadStations[i+1] - treadStations[i]);
      if (cuts.route.dimensioned) fraction = clamp(fraction,0,1);
      return { ...reflect(joint.point), z: (i + 1 + fraction) * rise };
    });
    const side = (sideIndex === 0 ? 1 : -1) * (stair.turnDirection === 'right' ? -1 : 1);
    const offset = outside.map((p,i)=>{
      const face=joints[i].point;
      // The pitch changes inside a compact quarter. On the straight
      // bearing rail each transverse joint is square in plan; a mitre
      // extrapolated from the virtual taper would skew the divided ends.
      const square=sideIndex===0 && cuts.route.posts?.some(post=>
        Math.abs(post.innerX-face.x)<epsilon && Math.abs(face.x-p.x-stair.stringerThickness)<epsilon &&
        Math.abs(face.y-(post.yMin+post.yMax)/2)<post.length+stair.going);
      return {...reflect(square?{x:p.x,y:face.y}:p),z:nodes[i].z};
    });
    let from=0, number=0;
    for (let j=1; j<nodes.length; j++) {
      if (cuts.route.dimensioned && j+1<nodes.length) {
        const a=nodes[from], b=nodes[j], c=nodes[j+1], u=sub(b,a), v=sub(c,b);
        const collinear=Math.abs(cross(u,v))<epsilon*mag(u)*mag(v) && dot(u,v)>0;
        const pitchChange=Math.abs((b.z-a.z)*mag(v)-(c.z-b.z)*mag(u));
        if (collinear && pitchChange < .0001*(mag(u)+mag(v))) continue;
      }
      let span=[nodes[from],nodes[j],offset[from],offset[j]];
      if (sideIndex===0 && cuts.route.posts?.length) span=spanToPost(span,cuts.route,reflect);
      if (span) beams.push(beamBetween(...span,side,stair,++number));
      from=j;
    }
  }
  return beams;
}

// Trim both timber faces with the vertical cheek. The end is square in
// plan, including where the virtual rail tapered inside the post.
function spanToPost([a,b,c,d],route,reflect) {
  const lower=route.posts.find(p=>p.corner==='lower'), upper=route.posts.find(p=>p.corner==='upper');
  const A=reflect(a),B=reflect(b), horizontal=Math.abs(A.y-B.y)<epsilon;
  let axis='y',low=lower?.yMax??-Infinity,high=upper?.yMin??Infinity;
  if (horizontal) {
    const end=route.posts.find(p=>Math.abs(A.y-(p.corner==='lower'?p.yMin:p.yMax))<epsilon);
    if (end) {
      if (!(end.corner==='lower'?route.entrySteps:route.exitSteps)) return null;
      axis='x';low=-Infinity;high=end.xMin;
    }
  }
  const trim=(start,finish)=>{
    const first=reflect(start)[axis], last=reflect(finish)[axis], delta=last-first;
    const point=t=>({...add(start,sub(finish,start),t),z:start.z+(finish.z-start.z)*t});
    if (Math.abs(delta)<epsilon) return first<low-epsilon || first>high+epsilon ? null : [start,finish];
    const near=(low-first)/delta, far=(high-first)/delta;
    const t0=Math.max(0,Math.min(near,far)),t1=Math.min(1,Math.max(near,far));
    return t1-t0<=epsilon ? null : [point(t0),point(t1)];
  };
  const inner=trim(a,b),outer=trim(c,d);
  if (!inner || !outer) return null;
  // Pitch is established on the inner bearing face of the member.
  return [...inner,{...outer[0],z:inner[0].z},{...outer[1],z:inner[1].z}];
}

export function generateWinderGeometry(stair, family, options) {
  const dimensions = deriveWinder(stair, family);
  const { rise, treadCount } = dimensions;
  const candidate = dimensions.dimensioned ? fittedCuts.get(dimensions) :
    basicIssues(stair, dimensions).length ? null : makeCuts(stair, dimensions);
  const cuts = candidate?.issue ? null : candidate;
  const reflect = ({ x, y }) => ({ x, y: stair.turnDirection === 'right' ? -y : y });
  const treads = [], landings = [], walkline = [];
  const posts=cuts?.route.posts??[];
  if (cuts) {
    for (let i = 0; i < treadCount; i++) {
      const front = cuts.fronts[i], next = cuts.fronts[i + 1], nose = cuts.noses[i];
      const between = (a,b) => cuts.sides.map((side,j) => interval(side, a.hits[j], b.hits[j]));
      const [inner, outer] = between(nose,cuts.seatEnds[i+1]);
      const polygon = (innerSide, outerSide) => [...outerSide, ...innerSide.toReversed()];
      const physical = trimAtNewels(polygon(inner, outer),posts,nose,cuts.seatEnds[i+1],true);
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
      const center = reflect(dimensions.dimensioned ? add(front.at,sub(next.at,front.at),.5) :
        routePoint((i + .5) * stair.going - Number(stair.nosing||0), 0, cuts.route));
      const widths = points.map(p => p.x), heights = points.map(p => p.y);
      const isWinder = Math.abs(front.angle - next.angle) > epsilon || (!dimensions.middleSteps && points.length > 4);
      const goingContour = polygon(...between(front,next));
      const visible = between(nose,cuts.faces[i+1]);
      const seat = index => {
        const start = cuts.faces[index], end = cuts.boardBacks[index];
        const points = trimAtNewels(polygon(...between(start,end)),posts,start,end,false).map(reflect);
        if (polygonArea(points)<0) points.reverse();
        return {points,direction:reflect(start.forward)};
      };
      const onNose = physical.filter(p=>Math.abs(dot(sub(p,nose.at),nose.forward))<1e-5);
      const toStart=p=>mag(sub(p,nose.hits[0].point));
      onNose.sort((a,b)=>toStart(a)-toStart(b));
      const frontEdge=posts.length && onNose.length>=2 ? [onNose[0],onNose.at(-1)].map(reflect) : nose.hits.map(hit=>reflect(hit.point));
      const eligibleAt170Mm = goingBandWidth(front.hits.map(hit => hit.point), front.forward, goingContour, 170);
      treads.push({ id: `${stair.mark}-TD-${String(i + 1).padStart(2,'0')}`, flightIndex: 0, step: i + 1,
        level: i + 1, elevation: (i + 1) * rise, thickness: stair.treadThickness, length: Math.max(...widths) - Math.min(...widths),
        width: Math.max(...heights) - Math.min(...heights), center, direction: reflect(front.forward),
        points, svgPoints: svgPoints(points), area, volume: area * stair.treadThickness / 1e9,
        frontEdge, isWinder, eligibleAt170Mm, goingAtWalkline: normalDepth(goingContour,front),
        depthAtWalkline: normalDepth(polygon(...visible),nose), narrowDepth: Math.min(...visible.map(edgeLength)),
        ...(cuts.boards ? {riserSeat:seat(i), ...(i===treadCount-1 ? {exitRiserSeat:seat(i+1)} : {})} : {}) });
    }
    if (dimensions.dimensioned) {
      for (const front of cuts.fronts) walkline.push(reflect(front.at));
    } else {
      for (let i = 0; i <= treadCount * 8; i++) walkline.push(reflect(routePoint(i * stair.going / 8, 0, cuts.route)));
    }
  }
  const stringers = cuts ? makeBeams(cuts, stair, rise, reflect) : [];
  const newels=finishNewels(posts,treads,reflect);
  const layout = { treads, stringers, landings, newels };
  return { ...layout, flights: dimensions.flights, dimensions, walkline,
    ...buildStairViews(layout, stair.width, options), ...buildWinderSchedule(treads, stringers, newels) };
}
