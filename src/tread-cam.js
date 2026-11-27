import { camRanges, cncIdentifier, defaultCam, validateCamField } from './housing-cam.js';

export const defaultTreadCam = {
  toolDiameter: defaultCam.toolDiameter, fluteLength: 50, stepDown: defaultCam.stepDown,
  cutFeed: defaultCam.cutFeed, plungeFeed: defaultCam.plungeFeed, spindleSpeed: defaultCam.spindleSpeed,
  safeZ: defaultCam.safeZ, stockMargin: 12, breakthrough: 0.3
};
export const treadCamRanges = Object.fromEntries(Object.keys(defaultTreadCam).map(key => [
  key, key === 'stockMargin' ? [0, 250] : key === 'breakthrough' ? [0.01, 5] : camRanges[key]
]));

export function validateTreadCamField(key, value) {
  if (!Object.hasOwn(defaultTreadCam, key)) throw new Error('Onbekende freesinstelling voor de trede.');
  if (key !== 'stockMargin' && key !== 'breakthrough') return validateCamField(key, value);
  const [min, max] = treadCamRanges[key];
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key === 'stockMargin' ? 'Opspanovermaat per zijde' : 'Doorsteek'} moet tussen ${min} en ${max} mm liggen.`);
  }
  return value;
}

const EPS = 1e-7;
const delta = (a, b) => ({ x: a.x-b.x, y: a.y-b.y });
const shift = (a, unit, d) => ({ x: a.x+unit.x*d, y: a.y+unit.y*d });
const dot = (a, b) => a.x*b.x+a.y*b.y;
const cross = (a, b) => a.x*b.y-a.y*b.x;
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const unit = v => { const n = Math.hypot(v.x,v.y); return { x:v.x/n, y:v.y/n }; };
const right = v => ({ x: v.y, y: -v.x });
const area = points => points.reduce((sum,p,i) => sum + cross(p, points[(i+1)%points.length]), 0)/2;
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);

function pointToEdge(p, a, b) {
  const ab = delta(b,a);
  const t = Math.max(0, Math.min(1, dot(delta(p,a),ab)/(dot(ab,ab) || 1)));
  return dist(p,shift(a,ab,t));
}

function edgeGap(a, b, c, d) {
  const ab = delta(b,a), cd = delta(d,c), ac = delta(c,a);
  const determinant = cross(ab,cd);
  if (Math.abs(determinant) > EPS) {
    const t = cross(ac,cd)/determinant, u = cross(ac,ab)/determinant;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointToEdge(a,c,d),pointToEdge(b,c,d),pointToEdge(c,a,b),pointToEdge(d,a,b));
}

function contourOf(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(finite)) throw new Error('Ongeldige tredecontour.');
  const loop = points.filter((p,i) => i === 0 || dist(p,points[i-1]) > EPS);
  if (loop.length > 1 && dist(loop[0],loop.at(-1)) < EPS) loop.pop();
  if (loop.length < 3 || Math.abs(area(loop)) < EPS) throw new Error('De tredecontour heeft geen oppervlak.');
  for (let i=0; i<loop.length; i++) {
    for (let j=i+2; j<loop.length; j++) {
      if (i === 0 && j === loop.length-1) continue;
      if (edgeGap(loop[i],loop[(i+1)%loop.length],loop[j],loop[(j+1)%loop.length]) < EPS) {
        throw new Error('De tredecontour snijdt of raakt zichzelf.');
      }
    }
  }
  return area(loop) < 0 ? loop.reverse() : loop;
}

// Intersections of successive tangents circumscribe the corner arc. Each leg
// stays at least one cutter radius from the tip, including very acute winders.
function convexJoin(p, before, after, turn, radius) {
  const start = Math.atan2(before.y,before.x);
  const count = Math.ceil(turn/(Math.PI/4));
  const angle = turn/count;
  const points = [shift(p,before,radius)];
  for (let i=0; i<count; i++) {
    const mid = start+(i+.5)*angle;
    points.push(shift(p,{ x: Math.cos(mid), y: Math.sin(mid) },radius/Math.cos(angle/2)));
  }
  points.push(shift(p,after,radius));
  return points;
}

function tongueFlank(corner, prev, next, tongues) {
  for (const tongue of tongues) {
    for (const [root,tip] of [[0,1],[3,2]]) {
      if (dist(corner,tongue.points[root]) > EPS) continue;
      if (dist(prev,tongue.points[tip]) < EPS) return { pocketId:tongue.pocketId, incoming:true };
      if (dist(next,tongue.points[tip]) < EPS) return { pocketId:tongue.pocketId, incoming:false };
      throw new Error('De flank van een insteeklip ontbreekt in de tredecontour.');
    }
  }
  return null;
}

function overlapsInWood(a, b, radius, contour) {
  if (dist(a,b) >= 2*radius-EPS) return false;
  // The common lens may sit entirely in waste. It enters the wood only if
  // an edge crosses its interior or the lens itself is inside the contour.
  const mid = shift(a,delta(b,a),.5);
  let inside = false;
  for (let i=0; i<contour.length; i++) {
    const p = contour[i], q = contour[(i+1)%contour.length];
    if ((p.y > mid.y) !== (q.y > mid.y) && mid.x < p.x+(q.x-p.x)*(mid.y-p.y)/(q.y-p.y)) inside = !inside;
    const edge = delta(q,p), length = dist(p,q), direction = unit(edge);
    let low = 0, high = length;
    for (const center of [a,b]) {
      const toCenter = delta(center,p);
      const perpendicular = Math.abs(cross(toCenter,direction));
      if (perpendicular >= radius-EPS) { high = low; break; }
      const along = dot(toCenter,direction), span = Math.sqrt(radius**2-perpendicular**2);
      low = Math.max(low,along-span);
      high = Math.min(high,along+span);
    }
    if (high-low > EPS) return true;
  }
  return inside;
}

// Intersect the actual G1 relief sweep (a line segment swept by the mill)
// with the shoulder line. Project the circular ends and the two tangent sides.
function cutInterval(root, axis, relief) {
  const local = point => {
    const v = delta({x:Number(point.x.toFixed(4)), y:Number(point.y.toFixed(4))},root);
    return {x:dot(v,axis), y:cross(axis,v)};
  };
  const a=local(relief.entry), b=local(relief.center), r=relief.radius;
  if (Math.min(a.y,b.y) >= r-EPS || Math.max(a.y,b.y) <= -r+EPS) return null;
  const xs = [];
  for (const end of [a,b]) {
    if (Math.abs(end.y) <= r) {
      const span=Math.sqrt(r*r-end.y*end.y);
      xs.push(end.x-span,end.x+span);
    }
  }
  if (Math.abs(b.y-a.y) > EPS) {
    const direction = unit(delta(b,a));
    for (const side of [-r,r]) {
      const t = -(a.y + side*direction.x)/(b.y-a.y);
      if (t >= 0 && t <= 1) xs.push(a.x-side*direction.y+t*(b.x-a.x));
    }
  }
  return xs.length ? [Math.min(...xs),Math.max(...xs)] : null;
}

function checkShoulder(contour, index, walk, reliefs) {
  const n=contour.length, root=contour[index];
  const next=i => (i+walk+n)%n;
  let end=next(index);
  const axis=unit(delta(contour[end],root));
  // A redundant collinear point is not the end of the bearing surface.
  while (end !== index) {
    const onward=delta(contour[next(end)],contour[end]);
    if (Math.abs(cross(axis,onward)) > EPS || dot(axis,onward) <= 0) break;
    end=next(end);
  }
  const length=dist(root,contour[end]);
  const cuts=reliefs.map(r => cutInterval(root,axis,r)).filter(c => c && c[1] > 0 && c[0] < length)
    .sort(([a],[b]) => a-b);
  let cursor=0, bearing=0;
  for (const [from,to] of cuts) {
    bearing=Math.max(bearing,from-cursor);
    cursor=Math.max(cursor,to);
  }
  bearing=Math.max(bearing,length-cursor);
  // Two rounded endpoint positions can each move by one NC coordinate unit.
  // This only distinguishes positive face contact from point/line contact.
  if (bearing <= .0002) throw new Error('Er blijft geen vlakke schouder naast de insteeklip over. Vergroot de schoudermaat of kies een kleinere frees.');
  return bearing;
}

function planOutline(contour, tongues, radius) {
  const reliefs = [];
  const joins = contour.map((corner,i) => {
    const prev = contour[(i+contour.length-1)%contour.length], next = contour[(i+1)%contour.length];
    const incoming = unit(delta(corner,prev)), outgoing = unit(delta(next,corner));
    const before = right(incoming), after = right(outgoing);
    const turn = Math.atan2(cross(incoming,outgoing),dot(incoming,outgoing));
    if (Math.abs(turn) < EPS) return { points:[shift(corner,before,radius)] };
    if (Math.PI-Math.abs(turn) < EPS) throw new Error('De tredecontour bevat een teruglopende kant.');
    if (turn > 0) return { points:convexJoin(corner,before,after,turn,radius) };

    // Normal offsets intersect in the exterior wedge. At a tongue root,
    // continue tangent to the tongue flank: the extra cut is in the tread
    // body and the complete bearing tongue survives. At an ordinary reflex
    // corner use the bisector for the smallest symmetric corner relief.
    const bisector = unit({ x:before.x+after.x, y:before.y+after.y });
    const entry = shift(corner,bisector,radius/dot(before,bisector));
    const flank = tongueFlank(corner,prev,next,tongues);
    const reliefAxis = flank ? (flank.incoming ? before : after) : bisector;
    const center = shift(corner,reliefAxis,radius);
    const relief = { corner,entry,center,radius,pocketId:flank?.pocketId ?? null };
    reliefs.push(relief);
    return { points:[entry,center,entry], relief, shoulderWalk:flank ? (flank.incoming ? 1 : -1) : 0 };
  });

  for (const [index,join] of joins.entries()) {
    if (join.shoulderWalk) join.relief.remainingShoulderLength=checkShoulder(contour,index,join.shoulderWalk,reliefs);
  }

  const segments = [];
  const segment = (a,b,reliefIndex=-1) => {
    if (dist(a,b) > EPS) segments.push({a,b,reliefIndex});
  };
  for (const [i,join] of joins.entries()) {
    for (let j=1; j<join.points.length; j++) segment(join.points[j-1],join.points[j],join.relief ? i : -1);
    segment(join.points.at(-1),joins[(i+1)%joins.length].points[0]);
  }
  for (const [i,relief] of reliefs.entries()) {
    for (const other of reliefs.slice(i+1)) {
      if (overlapsInWood(relief.center,other.center,radius,contour)) {
        throw new Error('Twee hoekontlastingen grijpen in elkaar. Kies een kleinere frees of verplaats de schouders.');
      }
    }
  }
  for (const {a,b,reliefIndex} of segments) {
    for (let j=0; j<contour.length; j++) {
      // The relief alone may trim the two immediately adjacent sides.
      const k = (j+1)%contour.length;
      if (reliefIndex === j || reliefIndex === k) continue;
      if (edgeGap(a,b,contour[j],contour[k]) < radius-EPS) {
        throw new Error('De frees raakt een aangrenzende contourkant. Kies een kleinere diameter of vergroot de afstand tussen de schouders.');
      }
    }
    if (reliefIndex >= 0) {
      // Test the fourth side as well: it is the base inside the tread.
      for (const tongue of tongues) {
        if (tongue.points.some((p,j) => edgeGap(a,b,p,tongue.points[(j+1)%4]) < radius-EPS)) {
          throw new Error('De hoekontlasting raakt een insteeklip. Kies een kleinere frees.');
        }
      }
    }
  }
  // Plunge into straight waste beside a long edge, away from tongue roots.
  let first = 0;
  for (let i=1; i<segments.length; i++) {
    if (segments[i].reliefIndex < 0 && dist(segments[i].a,segments[i].b) > dist(segments[first].a,segments[first].b)) first=i;
  }
  const edge = segments[first];
  const start = shift(edge.a,delta(edge.b,edge.a),.5);
  const ordered = [...segments.slice(first),...segments.slice(0,first)];
  return { path:[start,...ordered.map(s=>s.b),start], reliefs };
}

const f = n => Number(n.toFixed(4)).toString();
const xy = p => 'X'+f(p.x)+' Y'+f(p.y);

export function treadFileStem(part, metadata = {}) {
  return [cncIdentifier(metadata.number,32,true),metadata.revision && 'rev-'+cncIdentifier(metadata.revision,16,true),
    cncIdentifier(part.id,64,true),'trede-bovenvlak'].filter(Boolean).join('_');
}

export function compileTreadJob(part, settings = defaultTreadCam, metadata = {}) {
  const parameters = {};
  for (const key of Object.keys(defaultTreadCam)) {
    parameters[key] = validateTreadCamField(key, settings[key] === undefined ? defaultTreadCam[key] : settings[key]);
  }
  if (!part || ![part.length,part.width,part.thickness].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('De trede mist geldige plankmaten.');
  }
  const {toolDiameter,stockMargin,breakthrough,fluteLength,plungeFeed,cutFeed,stepDown} = parameters;
  const radius = toolDiameter/2, totalDepth = part.thickness + breakthrough;
  if (fluteLength < totalDepth) throw new Error('De snijlengte is te kort voor de trededikte plus de doorsteek.');
  if (plungeFeed > cutFeed || stepDown > fluteLength) throw new Error('Controleer de insteekvoeding en de diepte per gang.');
  const stock = { length:part.length+2*stockMargin, width:part.width+2*stockMargin, thickness:part.thickness, margin:stockMargin };
  const offset = { x:stockMargin, y:stockMargin };
  const place = p => ({x:p.x+offset.x,y:p.y+offset.y});
  const contour = contourOf(part.contour).map(place);
  if (contour.some(p => p.x < stockMargin-EPS || p.y < stockMargin-EPS ||
      p.x > part.length+stockMargin+EPS || p.y > part.width+stockMargin+EPS)) {
    throw new Error('De contour valt buiten de ruwmaat van het tredeblad.');
  }
  const tongues = (part.tongues ?? []).map(tongue => {
    if (!Array.isArray(tongue.points) || tongue.points.length !== 4 || !tongue.points.every(finite)) {
      throw new Error('De insteeklip heeft geen bruikbare hoekpunten.');
    }
    const points = tongue.points.map(place);
    if (!points.every(p => contour.some(vertex=>dist(p,vertex)<EPS))) throw new Error('Een lip ontbreekt op de tredecontour.');
    return { ...tongue,points };
  });
  if (part.tongueCount != null && part.tongueCount !== tongues.length) throw new Error('De lippenlijst is onvolledig.');
  const {path,reliefs} = planOutline(contour,tongues,radius);
  if (path.some(p => p.x-radius < -EPS || p.y-radius < -EPS ||
      p.x+radius > stock.length+EPS || p.y+radius > stock.width+EPS)) {
    throw new Error('De frees verlaat de opspanplank. Vergroot de overmaat per zijde of kies een kleinere diameter.');
  }
  const passes = Math.ceil(totalDepth/stepDown);
  if (!Array.isArray(part.nose) || part.nose.length !== 2 || !part.nose.every(finite)) throw new Error('De voorrand van de trede ontbreekt.');
  return { partId:part.id, metadata,parameters,stock,offset,contour,nose:part.nose.map(place),tongues,path,reliefs,totalDepth,
    ...(part.riserPockets?.length?{priorGrooves:part.riserPockets.map(p=>({id:p.id,face:p.face,depth:p.depth,riserId:p.riserId}))}:{}),
    ...(part.noseDetail?{secondaryOperation:{feature:'upperNosing',kind:part.noseDetail.kind,sizeMm:part.noseDetail.sizeMm,
      section:part.noseDetail.section,edge:part.nose.map(place),instruction:part.noseDetail.operation,includedInProgram:false}}:{}),
    levels:Array.from({length:passes},(_,i)=>-Number(((i+1)*totalDepth/passes).toFixed(4))),
    fileStem:treadFileStem(part,metadata), boardFrame:part.boardFrame ?? null };
}

export function writeTreadLinuxCnc(job) {
  const {parameters:cam,stock,path,levels} = job;
  const lines = [
    '(Open Stair Studio - LinuxCNC 3-axis - tread outside profile)',
    '(File '+job.fileStem+')',
    '(G54 origin lower left of oversize stock. Z0 on top. X along grain. Y+ towards back of tread.)',
    '(Stock L'+f(stock.length)+' W'+f(stock.width)+' T'+f(stock.thickness)+' mm. Margin '+f(stock.margin)+' mm per side. Breakthrough '+f(cam.breakthrough)+' mm.)',
    '(Centre-cut end mill D'+f(cam.toolDiameter)+' mm. Flute '+f(cam.fluteLength)+' mm. Tool length offset OFF. No G52/G92 offsets.)',
    '(Spoilboard. Secure tread and offcut independently for the entire through cut. No tabs.)'
  ];
  const contourBlocks = path.slice(1).map((p,i)=>'G1 '+xy(p)+(i === 0 ? ' F'+f(cam.cutFeed) : ''));
  for(const groove of job.priorGrooves??[]) {
    lines.push('(Machine riser groove before outside profile: '+cncIdentifier(groove.id)+' / separate '+groove.face+' setup / depth '+f(groove.depth)+' mm.)');
  }
  if(job.secondaryOperation) {
    const op=job.secondaryOperation;
    lines.push('(Secondary operation required after this outline program: upper nosing '+
      (op.kind==='round'?'roundover R':'45 degree chamfer ')+f(op.sizeMm)+' mm. Keep tongues full thickness.)');
  }
  const reuse = path.length * levels.length > 100000;
  if (reuse) lines.push('o1000 sub', ...contourBlocks, 'o1000 endsub');
  lines.push('G21 G17 G90 G94 G97 G40 G49 G80 G61 G54','G0 Z'+f(cam.safeZ),'M3 S'+f(cam.spindleSpeed));
  lines.push('G0 '+xy(path[0]));
  for (const z of levels) {
    lines.push('G1 Z'+f(z)+' F'+f(cam.plungeFeed));
    if (reuse) lines.push('o1000 call');
    else lines.push(...contourBlocks);
  }
  lines.push('G0 Z'+f(cam.safeZ),'M5','M2');
  return lines.join('\n')+'\n';
}

export function writeTreadCamJson(job, fit = null) {
  return JSON.stringify({
    format:'OpenStairStudio.TreadCAM', version:1, units:'mm', controller:'LinuxCNC', fixture:'G54',
    datum:'Lower-left corner of oversize stock in top view. Z0 on tread top. Board XY + offset = machine XY.',
    workholding:'Secure tread and offcut independently on a spoilboard for the full through cut.',
    ...job, fit
  },null,2);
}
