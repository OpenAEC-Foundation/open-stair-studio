import { geometryErrors } from './stair-validity.js';
import { emptyWell } from './stairwell.js';
import { detailDefaults } from './stair-details.js';
import { timberDefaults } from './timber-settings.js';
import { buildStairViews } from './stair-views.js';
import { buildLandingFrame } from './landing-frame.js';
import { makeCutStringer } from './cut-stringer.js';
import { defaultCam } from './housing-cam.js';
import { defaultTreadCam } from './tread-cam.js';
import { defaultEngineering } from './engineering.js';
import { defaultHousingSettings } from './housings.js';
import { deriveWinder, generateWinderGeometry, isWinder } from './winder.js';

export const stairFamilies = [
  { id: 'straight', label: 'Steektrap', icon: '↗', flights: 1 },
  { id: 'quarter_turn', label: 'Kwartslag met bordes', icon: '↱', flights: 2 },
  { id: 'landing', label: 'Bordestrap', icon: '⌞', flights: 2 },
  { id: 'half_turn', label: 'Halfslag met bordes', icon: '↶', flights: 2 },
  { id: 'quarter_winder', label: 'Kwartslag met verdreven treden', icon: '◴', flights: 1, winder: true },
  { id: 'half_winder', label: 'Halfslag met verdreven treden', icon: '◑', flights: 1, winder: true }
];

export const ruleProfiles = [
  { id: 'NL_NEW_HOME', label: 'Nederland · nieuwbouw · woonfunctie', article: 'Bbl art. 4.24–4.28, tabel 4.26', source: 'https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/',
    minWidth: 800, minGoing: 220, minTreadDepth: 230, maxRise: 188, minHeadroom: 2300, maxFlightHeight: 4000 },
  { id: 'NL_NEW_GENERAL', label: 'Nederland · nieuwbouw · overige gebruiksfunctie', article: 'Bbl art. 4.24–4.28, tabel 4.26', source: 'https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/',
    minWidth: 800, minGoing: 185, minTreadDepth: 230, maxRise: 210, minHeadroom: 2100, maxFlightHeight: 4000 },
  { id: 'NL_NEW_EGRESS', label: 'Nederland · nieuwbouw · uitsluitend ontvluchten', article: 'Bbl art. 4.24–4.28, tabel 4.26', source: 'https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/',
    minWidth: 800, minGoing: 185, minTreadDepth: 230, maxRise: 210, minHeadroom: 2100, maxFlightHeight: 4000 },
  { id: 'UNSET', label: 'Geen regelprofiel', article: 'Niet van toepassing', source: '', minWidth: null, minGoing: null, minTreadDepth: null, maxRise: null, minHeadroom: null, maxFlightHeight: null }
];

export const starterProject = {
  schema: 'https://openaec.foundation/schemas/open-stair-studio/project-0.13.json',
  app: 'Open Stair Studio',
  version: '0.13.16',
  stairEnabled: true,
  stairwell: structuredClone(emptyWell),
  treadCam: { ...defaultTreadCam },
  engineering: { ...defaultEngineering },
  joinery: { type: 'housed', ...defaultHousingSettings },
  cam: { ...defaultCam },
  project: { name: 'Woonhuis De Linde', number: 'OSS-2026-001', revision: 'A', client: '', location: '' },
  bim: { originX: 0, originY: 0, originZ: 0, originRotationDeg: 0, originAgreed: false },
  regulatory: { profile: 'NL_NEW_HOME', construction: 'new', occupancy: 'residential', egressOnly: false, headroom: null },
  building: { openingWidth: 1200, openingLength: 4600, upperLandingWidth: 900, upperLandingDepth: 900 },
  estimate: { timberPricePerM3: 2400, laborHours: 14, laborRate: 62, wasteFactor: 1.18, overheadPercent: 12, marginPercent: 20, treadStock: 'board', fastenerUnitPrice: 0 },
  stair: {
    ...detailDefaults,
    ...timberDefaults,
    mark: 'TR-01', name: 'Hoofdtrap', type: 'straight', material: 'Eiken · massief',
    materialName:'', materialFeature:'', materialApplication:'', nlsfbCode:'', nlsfbLandingCode:'', nlsfbRailingCode:'',
    floorHeight: 2880, width: 900, going: 250, risers: 18, nosing: 25,
    landingLength: 1000, landingRiser: 0, landingThickness: 40,
    landingFrame: 'none', landingFrameWidth: 70, landingFrameDepth: 160,
    landingScrewsPerJoint: 2, landingScrewDiameter: 8, landingScrewLength: 120, landingScrewShearRd: 0,
    landingTimberE: 0, landingTimberFmRd: 0, landingDeflectionRatio: 300,
    laneGap: 100, treadThickness: 40,
    windersPerQuarter: 4, turnDirection: 'left', entrySteps: -1, outerShape: 'square',
    stringerDepth: 280, stringerThickness: 50,
    stringerLeft: 'housed', stringerRight: 'housed', stringerOverhang: 20,
    stringer: 'Prismatische boom · concept', finish: 'Natuur geolied'
  },
  status: 'concept', units: 'mm'
};

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));
const familyFor = type => stairFamilies.find(family => family.id === type) ?? stairFamilies[0];
const profileFor = id => ruleProfiles.find(profile => profile.id === id) ?? ruleProfiles.at(-1);
const splitCounts = (total, count) => {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
};
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, amount) => ({ x: a.x * amount, y: a.y * amount });
const rectPoints = (minX, minY, maxX, maxY) => [
  { x: minX, y: minY }, { x: maxX, y: minY },
  { x: maxX, y: maxY }, { x: minX, y: maxY }
];
const pointString = points => points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

function makeFlights(stair, risers) {
  const family = familyFor(stair.type);
  const counts = family.flights === 2 && stair.landingRiser > 1 && stair.landingRiser < risers-1
    ? [stair.landingRiser, risers-stair.landingRiser] : splitCounts(risers, family.flights);
  const width = Number(stair.width) || 0;
  const going = Number(stair.going) || 0;
  const landing = Math.max(width, Number(stair.landingLength) || width);
  const gap = Math.max(0, Number(stair.laneGap) || 0);
  const turnX = Math.max(0, counts[0] - 1) * going;
  const flight = (index, firstRiser, count, origin, direction) => ({
    index, label: `Vlucht ${index + 1}`, firstRiser, risers: count,
    treadCount: count - 1, origin, direction
  });
  if (family.flights === 1) return [flight(0, 0, counts[0], { x: 0, y: 0 }, { x: 1, y: 0 })];
  const mirror=stair.turnDirection==='right' ? -1 : 1;
  if (stair.type === 'quarter_turn') return [
    flight(0, 0, counts[0], { x: 0, y: 0 }, { x: 1, y: 0 }),
    flight(1, counts[0], counts[1], { x: turnX + width / 2, y: mirror*(landing - width / 2) }, { x: 0, y: mirror })
  ];
  if (stair.type === 'landing') return [
    flight(0, 0, counts[0], { x: 0, y: 0 }, { x: 1, y: 0 }),
    flight(1, counts[0], counts[1], { x: turnX + landing, y: 0 }, { x: 1, y: 0 })
  ];
  return [
    flight(0, 0, counts[0], { x: 0, y: 0 }, { x: 1, y: 0 }),
    flight(1, counts[0], counts[1], { x: turnX, y: mirror*(width + gap) }, { x: -1, y: 0 })
  ];
}

export function deriveStair(stair) {
  if (isWinder(stair.type)) return deriveWinder(stair, familyFor(stair.type));
  const risers = clampInt(stair.risers, 2, 80);
  const height = Number(stair.floorHeight) || 0;
  const going = Number(stair.going) || 0;
  const width = Number(stair.width) || 0;
  const family = familyFor(stair.type);
  const flights = makeFlights(stair, risers);
  const treadCount = flights.reduce((sum, flight) => sum + flight.treadCount, 0);
  const landingLength = family.flights > 1 ? Math.max(width, Number(stair.landingLength) || width) : 0;
  // Follow the midline between flights using right-angle turns at the landing.
  // A return landing includes the traverse between the two flight centrelines.
  const traverse = stair.type === 'half_turn' ? width + Math.max(0, Number(stair.laneGap) || 0) : 0;
  const landingTravel = landingLength + traverse;
  const totalRun = treadCount * going + landingTravel;
  const rise = risers ? height / risers : 0;
  const flightHeights = flights.map(flight => flight.risers * rise);
  return {
    family, risers, treadCount, flightCount: flights.length,
    flightRisers: flights.map(flight => flight.risers), flightHeights,
    rise, totalRun, landingTravel, clearWidth:width-2*Number(stair.stringerThickness),
    pitch: Math.atan2(rise, going) * 180 / Math.PI, flights
  };
}

export function generateStairGeometry(stair, options) {
  if (isWinder(stair.type)) return generateWinderGeometry(stair, familyFor(stair.type), options);
  const dimensions = deriveStair(stair);
  const width = Math.max(0, Number(stair.width) || 0);
  const going = Math.max(0, Number(stair.going) || 0);
  const landingLength = Math.max(width, Number(stair.landingLength) || width);
  const laneGap = Math.max(0, Number(stair.laneGap) || 0);
  const thickness = Math.max(10, Number(stair.treadThickness) || 40);
  const stringerThickness = Math.max(20, Number(stair.stringerThickness) || 50);
  const cutLeft=stair.stringerLeft==='cut', cutRight=stair.stringerRight==='cut';
  const overhang=Number(stair.stringerOverhang)||0;
  const leftEdge=cutLeft?width/2+overhang:width/2-stringerThickness;
  const rightEdge=cutRight?-width/2-overhang:-width/2+stringerThickness;
  const treadWidth=Math.max(1,leftEdge-rightEdge);
  const treadOffset=(leftEdge+rightEdge)/2;
  const treads = [];
  const stringers = [];
  const landings = [];

  for (const flight of dimensions.flights) {
    const normal = { x: -flight.direction.y, y: flight.direction.x };
    for (let step = 0; step < flight.treadCount; step++) {
      const nose = Number(stair.nosing) || 0;
      const physicalRun = going;
      const center = add(add(flight.origin, scale(flight.direction, (step + 0.5) * going - nose)),scale(normal,treadOffset));
      const halfRun = scale(flight.direction, physicalRun / 2);
      const halfWidth = scale(normal, treadWidth / 2);
      const level = flight.firstRiser + step + 1;
      const corners = [
        add(add(center, scale(halfRun, -1)), scale(halfWidth, -1)),
        add(add(center, halfRun), scale(halfWidth, -1)),
        add(add(center, halfRun), halfWidth),
        add(add(center, scale(halfRun, -1)), halfWidth)
      ];
      treads.push({ id: `${stair.mark}-TD-${String(treads.length + 1).padStart(2, '0')}`,
        flightIndex: flight.index, step: step + 1, level, elevation: level * dimensions.rise,
        frontEdge: [corners[0], corners[3]], area: physicalRun * treadWidth,
        goingAtWalkline: going, depthAtWalkline: physicalRun, narrowDepth: physicalRun,
        length: physicalRun, width: treadWidth, thickness,
        volume: (physicalRun * treadWidth * thickness) / 1e9,
        points: corners, svgPoints: pointString(corners), center, direction: flight.direction });
    }
    const entry = flight.index > 0 ? 1 : 0;
    const run = (flight.treadCount+entry) * going;
    const beamRise = (flight.treadCount+entry) * dimensions.rise;
    const length = Math.hypot(run, beamRise);
    const depth = Number(stair.stringerDepth) || 280;
    // The visible ends are plumb cuts at the tread/landing interfaces. A
    // square cut normal to the pitch leaves a projecting tip at either end.
    const axis = length > 0
      ? { x: flight.direction.x * run / length, y: flight.direction.y * run / length, z: beamRise / length }
      : { ...flight.direction, z: 0 };
    const down = { x: flight.direction.x * axis.z, y: flight.direction.y * axis.z, z: -Math.hypot(axis.x, axis.y) };
    for (const side of [-1, 1]) {
      if ((side>0?cutLeft:cutRight)) {
        stringers.push(makeCutStringer(stair,flight,side,normal,dimensions.rise));
        continue;
      }
      const beamStart = add(add(flight.origin,scale(flight.direction,-entry*going)), scale(normal, side * (width / 2 - stringerThickness / 2)));
      const origin = { ...add(beamStart, scale(down, depth / 2)), z: (flight.firstRiser + 1-entry) * dimensions.rise + down.z * depth / 2 };
      const frame = { origin, axis, sideAxis: { ...normal, z: 0 }, down };
      const startStation = -entry * going - (Number(stair.nosing) || 0);
      const endStation = flight.treadCount * going - (Number(stair.nosing) || 0);
      const topStart = (flight.firstRiser + 1 - entry) * dimensions.rise;
      const topEnd = (flight.firstRiser + flight.risers) * dimensions.rise;
      const verticalDepth = depth * length / run;
      const support = entry ? flight.firstRiser * dimensions.rise - (Number(stair.landingThickness) || thickness) : 0;
      const bottomStart = Math.max(topStart - verticalDepth, support);
      const bottomEnd = Math.max(topEnd - verticalDepth, support);
      const pitch = (topEnd - topStart) / (endStation - startStation);
      const knee = Math.max(startStation, Math.min(endStation,
        startStation + (support - topStart + verticalDepth) / pitch));
      const hasFoot = knee > startStation + 1e-7 && knee < endStation - 1e-7;
      const center = add(add(flight.origin, scale(flight.direction, (startStation + endStation) / 2)),
        scale(normal, side * (width / 2 - stringerThickness / 2)));
      const halfRun = scale(flight.direction, (endStation - startStation) / 2);
      const halfWidth = scale(normal, stringerThickness / 2);
      const points = [
        add(add(center, scale(halfRun, -1)), scale(halfWidth, -1)),
        add(add(center, halfRun), scale(halfWidth, -1)),
        add(add(center, halfRun), halfWidth),
        add(add(center, scale(halfRun, -1)), halfWidth)
      ];
      const world = (station, lateral, z) => ({
        ...add(add(flight.origin, scale(flight.direction, station)), scale(normal, lateral)), z
      });
      const inner = side * (width / 2 - stringerThickness);
      const outer = side * width / 2;
      const vertices = hasFoot ? [
        world(startStation, inner, topStart), world(endStation, inner, topEnd),
        world(endStation, outer, topEnd), world(startStation, outer, topStart),
        world(startStation, inner, bottomStart), world(knee, inner, support),
        world(endStation, inner, bottomEnd), world(endStation, outer, bottomEnd),
        world(knee, outer, support), world(startStation, outer, bottomStart)
      ] : [
        world(startStation, inner, topStart), world(endStation, inner, topEnd),
        world(endStation, outer, topEnd), world(startStation, outer, topStart),
        world(startStation, inner, bottomStart), world(endStation, inner, bottomEnd),
        world(endStation, outer, bottomEnd), world(startStation, outer, bottomStart)
      ];
      const contour = hasFoot ?
        [[0,1,2,3],[9,8,5,4],[8,7,6,5],[4,5,6,1,0],
          [6,7,2,1],[7,8,9,3,2],[9,4,0,3]] :
        [[0,1,2,3],[7,6,5,4],[4,5,1,0],[5,6,2,1],
          [6,7,3,2],[7,4,0,3]];
      const faces = contour.map(face => side > 0 ? face : face.toReversed());
      const meshFaces = faces.map(face => face.map(index => vertices[index]));
      const stockCoords=vertices.map(p=>{
        const station=(p.x-flight.origin.x)*flight.direction.x+(p.y-flight.origin.y)*flight.direction.y-startStation;
        const height=p.z-topStart;
        return {u:(station*run+height*beamRise)/length,
          v:(height*run-station*beamRise)/length};
      });
      const extent=key=>Math.max(...stockCoords.map(p=>p[key]))-Math.min(...stockCoords.map(p=>p[key]));
      const stockLength=extent('u'),stockWidth=extent('v');
      const kneeTop = topStart + (knee - startStation) * pitch;
      const sectionArea = hasFoot ?
        (knee - startStation) * ((topStart - bottomStart) + (kneeTop - support)) / 2 +
          (endStation - knee) * verticalDepth :
        (endStation - startStation) * ((topStart - bottomStart) + (topEnd - bottomEnd)) / 2;
      stringers.push({ id: `${stair.mark}-WG${flight.index + 1}-${side > 0 ? 'L' : 'R'}`,
        flightIndex: flight.index, side, frame, length, vertices, faces, meshFaces,
        housingOutline: hasFoot ? [0,1,6,5,4] : [0,1,5,4],
        width: depth, thickness: stringerThickness, volume: sectionArea * stringerThickness / 1e9,
        stockLength,stockWidth,blankVolume: stockLength * stockWidth * stringerThickness / 1e9,
        points, svgPoints: pointString(points) });
    }
  }

  const addLanding = (id, points, level) => {
    const length = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
    const boardWidth = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    const actual=stair.turnDirection==='right'&&stair.type!=='landing'?points.map(point=>({x:point.x,y:-point.y})):points;
    const landingThickness = Number(stair.landingThickness) || thickness;
    landings.push({ id, level, elevation: level * dimensions.rise, length, width: boardWidth, thickness: landingThickness,
      volume: length * boardWidth * landingThickness / 1e9, points:actual, svgPoints: pointString(actual) });
  };
  const firstFlight = dimensions.flights[0];
  const firstEnd = Math.max(0, firstFlight.risers - 1) * going;
  const nose = Number(stair.nosing) || 0;
  const landingEntry = Math.min(firstEnd, firstEnd - nose);
  const outgoingAllowance = Math.max(0,(Number(stair.riserThickness) || 0)-nose);
  if (stair.type === 'quarter_turn') {
    addLanding(`${stair.mark}-LB-01`, rectPoints(landingEntry, -width / 2, firstEnd + width, landingLength - width / 2 + outgoingAllowance), firstFlight.risers);
  } else if (stair.type === 'landing') {
    addLanding(`${stair.mark}-LB-01`, rectPoints(landingEntry, -width / 2, firstEnd + landingLength + outgoingAllowance, width / 2), firstFlight.risers);
  } else if (stair.type === 'half_turn') {
    addLanding(`${stair.mark}-LB-01`, rectPoints(Math.min(landingEntry,firstEnd+nose-(Number(stair.riserThickness)||0)), -width / 2, firstEnd + landingLength, width + laneGap + width / 2), firstFlight.risers);
  }
  const frameAssemblies=landings.map(landing=>buildLandingFrame(landing,stair));
  const landingFrame=frameAssemblies.flatMap(frame=>frame.members);
  const landingJoints=frameAssemblies.flatMap(frame=>frame.joints);
  const landingFasteners=frameAssemblies.flatMap(frame=>frame.fasteners);

  const { planBox, footprint, isoFaces } = buildStairViews({ treads, landings, stringers }, width, options);

  const parts = [
    { id: `${stair.mark}-TD`, name: 'Trede · rechthoekig', quantity: treads.length,
      length: going, width: treadWidth, thickness,
      volume: treads.reduce((sum, tread) => sum + tread.volume, 0) },
    ...landings.map(landing => ({ id: landing.id, name: 'Bordesplaat · referentiemaat', quantity: 1,
      length: landing.length, width: landing.width, thickness: landing.thickness, volume: landing.volume })),
    ...landingFrame.map(member => ({id:member.id,name:member.name,kind:member.kind,quantity:1,
      length:member.length,width:member.width,thickness:member.thickness,volume:member.volume})),
    ...stringers.map(beam => ({
      id: beam.id, name: beam.name??`Ingekroosde boom ${beam.side > 0 ? 'links' : 'rechts'} · ${dimensions.flights[beam.flightIndex].label}`,
      quantity: 1, length: beam.stockLength??beam.length, width: beam.stockWidth??beam.width,
      thickness: beam.thickness, volume: beam.volume
    }))
  ];
  const volume = parts.reduce((sum, part) => sum + part.volume, 0);
  const blankVolume = volume + stringers.reduce((sum, beam) => sum +
    Math.max(0, (beam.blankVolume ?? beam.volume) - beam.volume), 0);
  return { dimensions, flights: dimensions.flights, treads, stringers, landings,
    landingFrame, landingJoints, landingFasteners, planBox, footprint, isoFaces, parts, volume, blankVolume };
}

export function calculateEstimate(geometry, estimate = starterProject.estimate, cncAllowance = 0) {
  const blankVolume = (geometry.blankVolume ?? geometry.volume) + (estimate.treadStock === 'cnc' ? cncAllowance : 0);
  const materialVolume = blankVolume * Math.max(1, Number(estimate.wasteFactor) || 1);
  const materials = materialVolume * Math.max(0, Number(estimate.timberPricePerM3) || 0);
  const labor = Math.max(0, Number(estimate.laborHours) || 0) * Math.max(0, Number(estimate.laborRate) || 0);
  const hardware = (geometry.landingFasteners?.length??0)*Math.max(0,Number(estimate.fastenerUnitPrice)||0);
  const costPrice = materials + labor + hardware;
  const overhead = costPrice * Math.max(0, Number(estimate.overheadPercent) || 0) / 100;
  const salesBase = costPrice + overhead;
  const marginPercent = Math.min(99, Math.max(0, Number(estimate.marginPercent) || 0));
  const margin = salesBase * marginPercent / Math.max(1, 100 - marginPercent);
  return { volume: geometry.volume, blankVolume, materialVolume, materials, labor, hardware, overhead, margin, costPrice: salesBase, indicativePrice: salesBase + margin };
}

export function inspectStair(model, geometry) {
  const stair = model.stair ?? model;
  const regulatory = model.regulatory ?? { profile: 'UNSET' };
  const d = deriveStair(stair);
  const p = profileFor(regulatory.profile);
  const findings = geometryErrors(stair, d, model.engineering?.structureType);
  const addFinding = (level, title, detail, reference = p.article) => findings.push({ level, title, detail, reference });
  if (findings.some(item => item.level === 'error')) return findings;
  if (d.rise > 0) addFinding('ok', 'Optrede gelijk verdeeld', `${d.risers} gelijke optredes van ${d.rise.toFixed(1)} mm, verdeeld over ${d.flightCount} vlucht${d.flightCount === 1 ? '' : 'en'}.`, 'Geometrische berekening');
  if (p.id !== 'UNSET') {
    if (stair.width < p.minWidth) addFinding('error', 'Trapbreedte kleiner dan profielminimum', `${stair.width} mm is minder dan ${p.minWidth} mm. De Bbl-maat betreft de volle trapbreedte inclusief trapbomen.`, p.article);
    else addFinding('ok', 'Trapbreedte voldoet aan profielgrens', `${stair.width} mm ≥ ${p.minWidth} mm.`, p.article);
    if (isWinder(stair.type)) {
      const { treads } = geometry ?? generateStairGeometry(stair);
      const compare = (field, label, limit) => {
        if (!treads.length || treads.some(t => !Number.isFinite(t[field]))) {
          addFinding('info', label, 'De maat is niet op iedere trede bepaald.', p.article);
          return;
        }
        const worst = treads.reduce((a, b) => a[field] < b[field] ? a : b);
        const fits = worst[field] + 1e-7 >= limit;
        addFinding(fits ? 'ok' : 'error', label, `${worst.id} heeft de kleinste maat: ${worst[field].toFixed(1)} mm, loodrecht op de voorrand. Profielminimum ${limit} mm.`, p.article);
      };
      compare('goingAtWalkline', 'Aantrede bij de klimlijn', p.minGoing);
      compare('depthAtWalkline', 'Tredevlak bij de klimlijn', p.minTreadDepth);
      addFinding(d.walklineClearance + 1e-7 >= 300 ? 'ok' : 'error', 'Afstand van de klimlijn tot de trederand',
        `Kleinste afstand tot de zijkant van het gemodelleerde tredevlak: ${d.walklineClearance.toFixed(1)} mm. Profielminimum 300 mm.`, p.article);
      addFinding('info', 'Smalle einde beoordelen', 'Controleer de minimale tredevlakmaat van 50 mm loodrecht op de voorrand. Het tredeblad geeft de lengte langs de wang.', p.article);
    } else {
      const compare = (label, value, limit) => addFinding(value < limit ? 'error' : 'ok',
        label, `${value} mm ter plaatse van de klimlijn. Profielminimum ${limit} mm.`, p.article);
      compare('Aantrede', Number(stair.going), p.minGoing);
      compare('Tredevlak', Number(stair.going), p.minTreadDepth);
    }
    if (d.rise > p.maxRise) addFinding('error', 'Optrede groter dan profielmaximum', `${d.rise.toFixed(1)} mm is meer dan ${p.maxRise} mm.`, p.article);
    else addFinding('ok', 'Optrede voldoet aan profielgrens', `${d.rise.toFixed(1)} mm ≤ ${p.maxRise} mm.`, p.article);
    if (d.flightHeights.some(height => height > p.maxFlightHeight)) addFinding('error', 'Hoogteverschil trap groter dan profielmaximum', `Een vlucht overbrugt meer dan ${p.maxFlightHeight} mm.`, p.article);
    else addFinding('ok', 'Hoogteverschil blijft binnen profielmaximum', `Geen vlucht overbrugt meer dan ${p.maxFlightHeight} mm.`, p.article);
    if (regulatory.headroom !== null && regulatory.headroom !== undefined && regulatory.headroom !== '' && Number.isFinite(Number(regulatory.headroom))) {
      if (Number(regulatory.headroom) < p.minHeadroom) addFinding('error', 'Vrije hoogte kleiner dan profielminimum', `${regulatory.headroom} mm is minder dan ${p.minHeadroom} mm.`, p.article);
      else addFinding('ok', 'Vrije hoogte voldoet aan profielgrens', `${regulatory.headroom} mm ≥ ${p.minHeadroom} mm.`, p.article);
    } else addFinding('info', 'Vrije hoogte niet getoetst', `Voer vrije hoogte in of koppel gebouwcontext; profielgrens is ${p.minHeadroom} mm.`, p.article);
    if (d.flightCount > 1) {
      const landingWidth = stair.type === 'half_turn' ? 2 * Number(stair.width) + Number(stair.laneGap ?? 0) : Number(stair.width);
      const landingFits = landingWidth >= 800 && Number(stair.landingLength) >= 800;
      addFinding(landingFits ? 'ok' : 'error', 'Tussenbordes', landingFits ? 'Het gemodelleerde tussenbordes biedt ruimte voor 800 × 800 mm.' : 'De gemodelleerde bordesplaat biedt onvoldoende ruimte voor 800 × 800 mm.', 'Bbl art. 4.27');
    }
    const { upperLandingWidth, upperLandingDepth } = model.building ?? {};
    const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    const tooSmall = [upperLandingWidth, upperLandingDepth].some(value => known(value) && Number(value) < 800);
    if (tooSmall || [upperLandingWidth, upperLandingDepth].every(known)) {
      addFinding(tooSmall ? 'error' : 'ok', 'Bovenbordes volgens projectinvoer', tooSmall ? 'Een opgegeven zijde is kleiner dan 800 mm.' : `Opgegeven bovenbordes ${upperLandingWidth} × ${upperLandingDepth} mm. De profielgrens is 800 × 800 mm.`, 'Bbl art. 4.27');
    } else {
      addFinding('info', 'Bovenbordes onvolledig ingemeten', 'Vul de breedte en diepte van de vrije ruimte op de bovenliggende vloer in.', 'Bbl art. 4.27');
    }
    addFinding('info', 'Trapgatfit niet volledig beoordeeld', 'De sparingspositie, constructiedikte en vrije-hoogtecontour moeten in gebouwcontext worden gecontroleerd.', 'Gebouwcontext ontbreekt');
    addFinding('info', 'Toepassingsbereik controleren', `Actief profiel: ${p.label}. Controleer gebruiksfunctie, nieuwbouw/verbouw, vluchtroute, projectafwijkingen en eventuele maatwerkregels.`, p.article);
  } else addFinding('info', 'Geen normprofiel gekozen', 'Er worden alleen geometrische invoercontroles uitgevoerd; er is geen normatieve toetsstatus.', 'Profielinstelling');
  if (model.engineering && (model.engineering.use === 'escape-only') !== (p.id === 'NL_NEW_EGRESS')) {
    addFinding('error', 'Gebruiksdoel en maatprofiel verschillen', 'Stem het gebruik in Engineering af op het Bbl-maatprofiel voor uitsluitend ontvluchten. De getoonde maatvergelijkingen gebruiken het gekozen profiel.', 'Gebruiksdoel en profiel');
  }
  addFinding('info', 'Constructieve verificatie open', 'Controleer sterkte, doorbuiging, verbindingen, materiaalgegevens en belastingscombinaties. Engineering toont de lastwerking voor de ingevoerde oplegging.', 'Eurocodes / projectberekening');
  if (model.engineering && model.engineering.structureType !== 'timber') {
    addFinding('info', 'Engineering van tredesysteem', 'De contouren beschrijven de reserveringsruimte van de trap. Leg de productopbouw, opleggingen en projectspecifieke verificaties vast in Engineering.', 'Engineeringdossier');
  } else addFinding('info', 'Werkplaatsstatus: concept', model.joinery?.type === 'housed'
    ? 'Bekijk per wang het freesvlak, de passing en de CNC-opspanning. Materiaalkeuze, machinebereik en opspanning vereisen beoordeling in de werkplaats.'
    : 'Dit project bevat de zichtcontour van de treden. Activeer de tredeverbinding onder Wangbladen om de insteeklippen uit te werken.', 'Werkvoorbereiding');
  return findings;
}

export function elevationPath(stair, width = 820, height = 520) {
  const d = deriveStair(stair);
  const pad = { left: 105, right: 132, top: 105, bottom: 110 };
  const sx = (width - pad.left - pad.right) / Math.max(d.totalRun, 1);
  const sy = (height - pad.top - pad.bottom) / Math.max(Number(stair.floorHeight), 1);
  const ox = pad.left;
  const oy = height - pad.bottom;
  const pts = [`M ${ox} ${oy}`];
  let riseIndex = 0;
  let station = 0;
  for (const flight of d.flights) {
    for (let i = 0; i < flight.risers; i++) {
      const x = ox + (station + i * Number(stair.going)) * sx;
      const y = oy - (riseIndex + 1) * d.rise * sy;
      pts.push(`L ${x} ${y}`);
      if (i < flight.treadCount) pts.push(`L ${x + Number(stair.going) * sx} ${y}`);
      riseIndex++;
    }
    station += flight.treadCount * Number(stair.going);
    if (flight.index < d.flightCount - 1) {
      station += d.landingTravel;
      const y = oy - riseIndex * d.rise * sy;
      pts.push(`L ${ox + station * sx} ${y}`);
    }
  }
  return pts.join(' ');
}
