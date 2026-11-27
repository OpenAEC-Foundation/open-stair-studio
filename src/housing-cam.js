import Drawing from 'dxf-writer';

export const defaultCam = {
  toolDiameter: 6, fluteLength: 22, stepDown: 3, stepoverPercent: 45,
  cutFeed: 900, plungeFeed: 180, spindleSpeed: 14000, safeZ: 15, cornerMode: 'dogbone'
};

export const camRanges = {
  toolDiameter: [1, 40], fluteLength: [1, 150], stepDown: [0.1, 25],
  stepoverPercent: [10, 80], cutFeed: [10, 30000], plungeFeed: [5, 10000],
  spindleSpeed: [100, 60000], safeZ: [1, 150]
};

const names = {
  toolDiameter: 'Freesdiameter', fluteLength: 'Snijlengte', stepDown: 'Diepte per gang',
  stepoverPercent: 'Baanstap', cutFeed: 'Voeding', plungeFeed: 'Insteekvoeding',
  spindleSpeed: 'Toerental', safeZ: 'Vrijloophoogte'
};
export function validateCamField(key, value) {
  if (key === 'cornerMode') {
    if (!['rounded', 'dogbone'].includes(value)) throw new Error('Kies een geldige hoekafwerking.');
    return value;
  }
  if (!Object.hasOwn(camRanges, key)) throw new Error('Onbekende CAM-parameter.');
  const [min, max] = camRanges[key];
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${names[key]} moet tussen ${min} en ${max} liggen.`);
  }
  return value;
}

const EPS = 1e-7;
const offsetPoint = (a, v, factor) => ({ x: a.x + v.x * factor, y: a.y + v.y * factor });
const delta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x*b.x + a.y*b.y;
const cross = (a, b) => a.x*b.y - a.y*b.x;
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const area = points => points.reduce((acc, p, i) => acc + cross(p, points[(i+1) % points.length]), 0)/2;

function convexLoop(source, label) {
  if (!source?.length || source.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error(`${label}: ongeldige contour.`);
  }
  const points = [];
  for (const p of source) {
    if (!points.length || dist(points.at(-1), p) > EPS) points.push({ x:p.x, y:p.y });
  }
  if (points.length > 1 && dist(points[0], points.at(-1)) < EPS) points.pop();
  if (Math.abs(area(points)) < 0.001) throw new Error(`${label}: contour heeft geen bruikbaar oppervlak.`);
  if (area(points) < 0) points.reverse();
  // Intersecting contours fail the half-plane check, including star polygons.
  let i = points.length;
  while (i-- && points.length > 3) {
    const prev = points[(i+points.length-1)%points.length], cur = points[i], next = points[(i+1)%points.length];
    if (Math.abs(cross(delta(cur,prev), delta(next,cur))) < EPS && dot(delta(cur,prev),delta(next,cur)) > 0) points.splice(i, 1);
  }
  const planes = points.map((p, j) => {
    const q = points[(j+1)%points.length], length = dist(p,q);
    const normal = { x: (p.y-q.y)/length, y: (q.x-p.x)/length };
    if (points.some(pt => dot(delta(pt,p),normal) < -EPS)) throw new Error(`${label}: het CNC-profiel vereist een convexe contour.`);
    return { p, normal };
  });
  return { points, planes };
}

const clearance = (planes, point) => Math.min(...planes.map(({p,normal}) => dot(delta(point,p),normal)));

function pointToSegment(point, a, b) {
  const edge = delta(b,a);
  const t = Math.min(1, Math.max(0, dot(delta(point,a),edge)/(dot(edge,edge) || 1)));
  return dist(point,offsetPoint(a,edge,t));
}

function pointToLoop(point, loop) {
  if (clearance(loop.planes, point) >= 0) return 0;
  return Math.min(...loop.points.map((a,i) => pointToSegment(point,a,loop.points[(i+1)%loop.points.length])));
}

function segmentGap(a, b, c, d) {
  const ab = delta(b,a), cd = delta(d,c), determinant = cross(ab,cd);
  if (Math.abs(determinant) > EPS) {
    const t = cross(delta(c,a),cd)/determinant, u = cross(delta(c,a),ab)/determinant;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointToSegment(a,c,d),pointToSegment(b,c,d),pointToSegment(c,a,b),pointToSegment(d,a,b));
}

// A tapered tread (including the roots of its stringer tongues) can be
// concave. A groove must survive cutting that final outline from the blank.
function insideFinishedContour(mouth, contour) {
  const p=mouth[0];
  let inside=false;
  for (let i=0;i<contour.length;i++) {
    const a=contour[i], b=contour[(i+1)%contour.length];
    if ((a.y>p.y)!==(b.y>p.y) && p.x<a.x+(p.y-a.y)*(b.x-a.x)/(b.y-a.y)) inside=!inside;
    if (mouth.some((c,j)=>segmentGap(a,b,c,mouth[(j+1)%mouth.length])<=EPS)) return false;
  }
  return inside;
}

// Offset each edge by one tool radius. Each adjacent pair meets at the
// corresponding cutter-centre corner, an exact construction for convex loops.
function insetCorners(loop, radius, id) {
  const inset = loop.planes.map(({ p, normal }, i) => {
    const prev = loop.planes[(i + loop.planes.length - 1) % loop.planes.length].normal;
    const denominator = 1 + dot(prev,normal);
    if (denominator < EPS) throw new Error(`${id}: te scherpe hoek voor deze frees.`);
    return offsetPoint(p,{x:prev.x+normal.x,y:prev.y+normal.y},radius/denominator);
  });
  if (area(inset) < .001 || inset.some(p => clearance(loop.planes,p) < radius - EPS)) {
    throw new Error(`${id}: de frees past niet in dit huis. Kies een kleinere diameter.`);
  }
  return inset;
}

function rasterRows(ring, count) {
  const y0 = Math.min(...ring.map(p=>p.y)), y1 = Math.max(...ring.map(p=>p.y));
  const rows = [];
  for (let n = 0; n < count; n++) {
    const y = y0 + (n+.5)*(y1-y0)/count;
    const xs = [];
    ring.forEach((a,i) => {
      const b = ring[(i+1)%ring.length];
      if ((a.y<=y && y<b.y) || (b.y<=y && y<a.y)) xs.push(a.x + (b.x-a.x)*(y-a.y)/(b.y-a.y));
    });
    if (xs.length !== 2) throw new Error('De baan doorsnijdt de kamercontour niet eenduidig.');
    xs.sort((a,b)=>n%2 ? b-a : a-b);
    rows.push(...xs.map(x=>({x,y})));
  }
  return rows;
}

function planPocket(pocket, face, stock, cam) {
  const depth = pocket.depth;
  if (!Number.isFinite(depth) || depth <= 0 || depth >= stock.thickness || depth > cam.fluteLength) {
    throw new Error(`${pocket.id}: infreesdiepte moet binnen de snijlengte en de wangdikte vallen.`);
  }
  if (pocket.openEdge) throw new Error(`${pocket.id}: een randopen huis vereist een aparte opspanning en bewerking.`);
  const loop = convexLoop(pocket.contour,pocket.id);
  if (loop.points.some(p => clearance(face.planes,p) < -EPS)) throw new Error(`${pocket.id}: het huis valt buiten het binnenvlak.`);
  if (pocket.riserId && stock.partContour && !insideFinishedContour(loop.points,stock.partContour))
    throw new Error(`${pocket.id}: de groef doorsnijdt de afgewerkte buitencontour.`);
  // Tolerance compensates the final coordinate rounding to 4 decimal places.
  const radius = cam.toolDiameter/2;
  const ring = insetCorners(loop,radius+.0001,pocket.id);
  // Riser grooves have end clearance for a square tongue and round cutter.
  // Every tongue corner must lie in the rounded region actually cleared.
  if (pocket.riserId) {
    const local = point => {
      const v = {x:point.x-stock.frame.origin.x,y:point.y-stock.frame.origin.y,z:point.z-stock.frame.origin.z};
      const project = axis => dot(v,axis)+v.z*axis.z;
      return {x:project(stock.frame.xAxis),y:project(stock.frame.yAxis),z:project(stock.frame.zAxis)};
    };
    const swept = convexLoop(ring.map(p=>({x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4))})),pocket.id);
    const corners = pocket.tongueWorldContour?.map(local);
    if (corners?.length!==4 || !Number.isFinite(pocket.tongueDepth) || pocket.tongueDepth<=0 ||
        pocket.tongueDepth>depth+.0001 || corners.some(p=>![p.x,p.y,p.z].every(Number.isFinite) ||
          Math.abs(p.z)>.001 || pointToLoop(p,swept)>radius+.0001)) {
      throw new Error(`${pocket.id}: de stootbordlip past niet in de gefreesde groef. Controleer de freesdiameter, diepte en passpeling.`);
    }
  }
  const relief = cam.cornerMode !== 'dogbone' || pocket.riserId ? [] : ring.map((center,i) => {
    const corner = loop.points[i], d = dist(corner,center);
    const end = offsetPoint(corner,delta(center,corner),(radius-.001)/d);
    if (clearance(face.planes,end) < radius+.0001) {
      throw new Error(`${pocket.id}: hoekontlasting zou buiten het wangvlak frezen. Kies een kleinere frees of ronde binnenhoeken.`);
    }
    return end;
  });
  // Linear interpolation and convex stock planes let us bound the whole cutter
  // sweep by the endpoints of the tool-centre ring and each relief excursion.
  // Include the cutter radius and the full depth, also at a slanted mitre.
  if (!stock.stockPlanes?.length) throw new Error(`${stock.id}: de vlakgegevens voor de freesdiepte ontbreken.`);
  for (const { a,b,c,d } of stock.stockPlanes) {
    if (![a,b,c,d].every(Number.isFinite)) throw new Error(`${stock.id}: ongeldige begrenzing van het wangdeel.`);
    const reach = Math.max(0,-c*depth) + Math.hypot(a,b)*(radius+.0001);
    if ([...ring,...relief].some(p => a*p.x + b*p.y + reach > d + EPS)) {
      throw new Error(`${pocket.id}: de frees zou op diepte een wangrand of verstek doorsnijden. Vergroot de schoudermaat of verklein de frees.`);
    }
  }
  const passes = Math.ceil(depth/cam.stepDown);
  const ys = ring.map(p => p.y);
  const step = cam.toolDiameter*cam.stepoverPercent/100;
  const rows = Math.max(1, Math.ceil((Math.max(...ys) - Math.min(...ys)) / step));
  return { id:pocket.id, treadId:pocket.treadId, ...(pocket.riserId?{riserId:pocket.riserId}:{}), loop, ring, relief, depth, passes, rows };
}

function checkNeighbours(operations, radius) {
  for (let i=0; i<operations.length; i++) for (let j=i+1; j<operations.length; j++) {
    const a=operations[i], b=operations[j];
    // Disjoint convex polygons have a separating edge normal belonging to either polygon.
    const separated = [ [a,b], [b,a] ].some(([first, second]) =>
      first.loop.planes.some(({p,normal}) => second.loop.points.every(q=>dot(delta(q,p),normal) < -EPS)));
    const nearNominal = (from,to) => from.relief.some((end,k) =>
      pointToLoop(end,to.loop) <= radius+.001 ||
      to.loop.points.some((p,n)=>segmentGap(from.ring[k],end,p,to.loop.points[(n+1)%to.loop.points.length]) <= radius+.001));
    const cornersClash = !separated || nearNominal(a,b) || nearNominal(b,a) ||
      a.relief.some((p,k)=>b.relief.some((q,n)=>segmentGap(a.ring[k],p,b.ring[n],q) <= 2*radius+.001));
    if (cornersClash) throw new Error(`${a.id} en ${b.id}: freesgebieden raken elkaar. Controleer maatvoering en hoekontlasting.`);
  }
}

export function compileHousingJob(stock, parameters = defaultCam, metadata = {}, onlyPocketId = '') {
  if (!stock) throw new Error('Selecteer een wang met infrezingen.');
  const issues = stock.issues?.filter(issue=>issue.level === 'error') ?? [];
  if (issues.length) throw new Error(issues.map(issue=>issue.message).join(' '));
  if (!stock.pockets?.length) throw new Error('Op dit wangdeel zijn geen infrezingen aanwezig.');
  if (!Number.isFinite(stock.thickness) || stock.thickness <= 0) throw new Error('Ongeldige wangdikte.');
  const cam = {};
  for (const key of Object.keys(defaultCam)) cam[key] = validateCamField(key, parameters[key] ?? defaultCam[key]);
  if (cam.stepDown > cam.fluteLength) throw new Error('De ingestelde dieptestap is groter dan de snijlengte.');
  if (cam.plungeFeed > cam.cutFeed) throw new Error('De insteekvoeding is groter dan de snijvoeding.');
  const face = convexLoop(stock.outline, 'Binnenvlak');
  const whole = stock.pockets.map(p => planPocket(p,face,stock,cam));
  checkNeighbours(whole, cam.toolDiameter/2);
  const plans = onlyPocketId ? whole.filter(op => op.id === onlyPocketId) : whole;
  if (onlyPocketId && plans.length !== 1) throw new Error('Selecteer een uniek tredehuis op deze wang.');
  // Count actual NC blocks before allocating raster, depth, SVG or export data.
  const xyBlocks = op => 2*op.rows + op.ring.length*(op.relief.length ? 3 : 1);
  const expandedBlocks = plans.reduce((total,op) => total + 1 + op.passes*(3 + xyBlocks(op)), 11);
  const subroutines = expandedBlocks > 100000;
  const blocks = subroutines ? plans.reduce((total,op) => total + 3 + xyBlocks(op) + 4*op.passes, 11) : expandedBlocks;
  if (!(blocks <= 100000)) {
    const advice = onlyPocketId ? 'Controleer de baanstap en diepte per gang binnen de gereedschapsgegevens.' : 'Kies Alleen geselecteerd huis voor een afzonderlijk programma.';
    throw new Error(`Dit programma vraagt met baanherhaling ${blocks.toLocaleString('nl-NL')} bestandsregels. De grens is 100.000. ${advice}`);
  }
  const operations = plans.map(op => ({
    ...op, raster:rasterRows(op.ring,op.rows),
    levels:Array.from({length:op.passes},(_,i)=>-(i+1)*op.depth/op.passes)
  }));
  return { stock, cam, operations, metadata, blocks, expandedBlocks, subroutines, onlyPocketId };
}

// Keep the distinguishing suffix of long part marks. Hash rewritten input so
// normalization and clipping do not silently equate separate projects/parts.
export function cncIdentifier(value, max = 72, file = false) {
  const original = String(value ?? '');
  const cleaned = original.normalize('NFKD').replace(/[^a-zA-Z0-9_ .-]/g,'_').trim();
  const plain = file ? cleaned.replaceAll(' ','-') : cleaned;
  if (plain === original && plain.length <= max) return plain;
  let hash = 2166136261;
  for (let i=0; i<original.length; i++) hash = Math.imul(hash ^ original.charCodeAt(i),16777619);
  const tag = (hash >>> 0).toString(16).padStart(8,'0');
  if (plain.length+9 <= max) return plain+'-'+tag;
  const leading = Math.floor((max-10)/2);
  return plain.slice(0,leading)+'-'+tag+'-'+plain.slice(-(max-leading-10));
}
const f = n => Number(n.toFixed(4)).toString();
const xy = p => 'X'+f(p.x)+' Y'+f(p.y);

export function housingFileStem(stock, metadata = {}, onlyPocketId = '') {
  const pieces = [cncIdentifier(metadata.number,32,true), metadata.revision && 'rev-'+cncIdentifier(metadata.revision,16,true),
    cncIdentifier(metadata.stairMark,32,true), cncIdentifier(stock.id,48,true),
    stock.face==='underside'?'ondervlak-groeven':stock.face==='top'?'bovenvlak-groeven':'binnenvlak'];
  if (onlyPocketId) pieces.push('alleen-'+cncIdentifier(onlyPocketId,48,true));
  return pieces.filter(Boolean).join('_');
}

export function writeLinuxCnc(job) {
  const { cam, stock, operations, metadata } = job;
  const lines = [
    '(Open Stair Studio - LinuxCNC 3-axis - housing pockets)',
    '(File '+housingFileStem(stock,metadata,job.onlyPocketId)+')',
    stock.face==='underside'||stock.face==='top' ?
      '(G54 X0 Y0 lower left of rectangular blank. '+(stock.face==='underside'?'UNDERSIDE UP. Flip around X from top view.':'TOP FACE UP.')+' Z0 at machining face. Before profiling.)' :
      '(G54 X0 Y0 lower-left blank envelope. X+ uphill from low to high stair end. Z0 inside face. Z+ towards spindle.)',
    '(Single mounted centre-cut end mill D'+f(cam.toolDiameter)+' mm. Tool length offset OFF. No active G52/G92.)',
    '(Depth per pass max '+f(cam.stepDown)+' mm. Corner mode '+cam.cornerMode+'. Scope '+(job.onlyPocketId ? 'selected pocket' : 'whole beam')+'.)'
  ];
  function addCut(op) {
    const points = [...op.raster.slice(1), op.ring[0]];
    for (let i=0; i<op.ring.length; i++) {
      if (op.relief.length) points.push(op.relief[i], op.ring[i]);
      points.push(op.ring[(i+1)%op.ring.length]);
    }
    points.forEach((p,i)=>lines.push('G1 '+xy(p)+(i === 0 ? ' F'+f(cam.cutFeed) : '')));
  }
  if (job.subroutines) {
    for (const [index,op] of operations.entries()) {
      const label = 'o'+(1000+index);
      lines.push(label+' sub');
      addCut(op);
      lines.push(label+' endsub');
    }
  }
  lines.push('G21 G17 G90 G94 G97 G40 G49 G80 G61 G54','G0 Z'+f(cam.safeZ),'M3 S'+f(cam.spindleSpeed));
  for (const [index,op] of operations.entries()) {
    const label = 'o'+(1000+index);
    lines.push('(Pocket '+cncIdentifier(op.id)+' / '+cncIdentifier(op.treadId)+')');
    for (const z of op.levels) {
      lines.push('G0 Z'+f(cam.safeZ),'G0 '+xy(op.raster[0]),'G1 Z'+f(z)+' F'+f(cam.plungeFeed));
      if (job.subroutines) lines.push(label+' call');
      else addCut(op);
    }
  }
  lines.push('G0 Z'+f(cam.safeZ),'M5','M2');
  return lines.join('\n')+'\n';
}

export function writeHousingDxf(stock, metadata = {}) {
  if (!stock || !stock.pockets?.length) throw new Error('Selecteer een wangdeel met infrezingen voor de DXF.');
  const issue = stock.issues?.find(item => item.level === 'error');
  if (issue) throw new Error(issue.message);
  if (!Number.isFinite(stock.thickness) || stock.thickness <= 0) throw new Error('Ongeldige wangdikte.');
  convexLoop(stock.outline,'Binnenvlak');
  for (const pocket of stock.pockets) {
    convexLoop(pocket.contour,pocket.id);
    if (!Number.isFinite(pocket.depth) || pocket.depth <= 0 || pocket.depth >= stock.thickness) {
      throw new Error(`${pocket.id}: ongeldige infreesdiepte voor de wang-DXF.`);
    }
  }
  const drawing = new Drawing();
  drawing.setUnits('Millimeters');
  const layers = new Set();
  const select = (name,color) => {
    if (!layers.has(name)) {
      drawing.addLayer(name,color,'CONTINUOUS');
      layers.add(name);
    }
    drawing.setActiveLayer(name);
  };
  const poly = points => drawing.drawPolyline(points.map(p=>[p.x,p.y]),true);
  select('OSS-FACE',7);
  poly(stock.outline);
  if(stock.partContour) {
    select('OSS-PART-REFERENCE',7);
    poly(stock.partContour);
  }
  select('OSS-SETUP',7);
  drawing.drawText(0,-10,4,0,housingFileStem(stock,metadata));
  for (const pocket of stock.pockets) {
    select((pocket.riserId?'OSS-STOOTBORD-D':'OSS-POCKET-D')+pocket.depth.toFixed(3).replace('.','p'),3);
    poly(pocket.contour);
    select('OSS-MARK',7);
    const center = pocket.contour.reduce((s,p)=>({ x:s.x+p.x/pocket.contour.length,y:s.y+p.y/pocket.contour.length }),{x:0,y:0});
    drawing.drawText(center.x,center.y,4,0,cncIdentifier(pocket.treadId),'center','middle');
  }
  return drawing.toDxfString();
}
