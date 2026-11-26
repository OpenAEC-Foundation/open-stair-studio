import { box, prism, tube } from './solids.js';

const tau = 2 * Math.PI;
const numeric = (key, label, unit, value, min, max, step = 1) =>
  ({ key, label, unit, type: 'number', default: value, min, max, step });
const fields = [
  {key:'guard',label:'Leuning en bordeshek',type:'select',default:'with',options:[['none','Zonder leuning'],['with','Buitenleuning en bordeshek']]},

  numeric('diameter', 'Buitendiameter treden', 'mm', 2000, 1000, 3600),
  numeric('columnDiameter', 'Buitendiameter spil', 'mm', 114.3, 75, 250, 0.1),
  numeric('risers', 'Optredes inclusief bordes', '', 16, 5, 40),
  numeric('stepsPerTurn', 'Treden per omwenteling', '', 18, 8, 30),
  { key: 'turn', label: 'Draairichting bij stijgen', type: 'select', default: 'right',
    options: [['right', 'Rechtsom'], ['left', 'Linksom']] },
  numeric('walklineInset', 'Klimlijn vanaf buitenrand trede', 'mm', 300, 100, 900),
  numeric('landingDepth', 'Bordesdiepte tot aansluitvloer', 'mm', 900, 400, 1600),
  numeric('plateThickness', 'Staalplaatdikte', 'mm', 5, 3, 15),
  numeric('foldDepth', 'Hoogte omgezette trederand', 'mm', 40, 20, 90),
  numeric('railHeight', 'Leuning boven tredevoorkant', 'mm', 950, 750, 1200),
  numeric('spindlesPerTread', 'Buitenspijlen per trede', '', 4, 1, 7),
  numeric('targetHeadroom', 'Gevraagde vrije draaihoogte', 'mm', 2100, 1500, 3000)
];
const integerFields = new Set(['risers', 'stepsPerTurn', 'spindlesPerTread']);
const defaults = Object.fromEntries(fields.map(f => [f.key, f.default]));
const point = (r, a, z = 0) => ({ x: r * Math.cos(a), y: r * Math.sin(a), z });
const arc = (r, a, b, divisions) => Array.from({ length: divisions + 1 }, (_, i) => point(r, a + (b - a) * i / divisions));
const number = n => String(n).padStart(2, '0');

// A manifold hollow sleeve. Separate inner faces keep the bore around the central newel.
function sleeve(inner, outer, bottom, top) {
  const faces = [];
  for (let k = 0; k < 32; k++) {
    const a = tau * k / 32, b = tau * ((k + 1) % 32) / 32;
    const i0 = point(inner, a, bottom), i1 = point(inner, b, bottom);
    const j0 = point(inner, a, top), j1 = point(inner, b, top);
    const o0 = point(outer, a, bottom), o1 = point(outer, b, bottom);
    const p0 = point(outer, a, top), p1 = point(outer, b, top);
    faces.push([o0,o1,p1,p0], [i1,i0,j0,j1], [p0,p1,j1,j0], [o1,o0,i0,i1]);
  }
  return faces;
}

function railSweep(path, radius) {
  const rings = path.map((p, i) => {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    const delta = [next.x - prev.x, next.y - prev.y, next.z - prev.z];
    const [tx, ty, tz] = delta.map(v => v / Math.hypot(...delta));
    const h = Math.hypot(tx, ty), ux = -ty/h, uy = tx/h;
    return Array.from({ length: 12 }, (_, j) => {
      const a = tau * j / 12, c = radius*Math.cos(a), s = radius*Math.sin(a);
      return { x:p.x + ux*c - tz*uy*s, y:p.y + uy*c + tz*ux*s, z:p.z + h*s };
    });
  });
  const faces = [[...rings[0]].reverse(), rings.at(-1)];
  for (let i = 1; i < rings.length; i++) {
    for (let j = 0; j < 12; j++) {
      const k = (j+1)%12, a = rings[i-1][j], b = rings[i-1][k], c = rings[i][k], d = rings[i][j];
      faces.push([a,b,c], [a,c,d]);
    }
  }
  return faces;
}

function gusset(root, end, z, drop, t) {
  const dx = end.x - root.x, dy = end.y - root.y, len = Math.hypot(dx,dy);
  const side = k => [ { ...root, z:z-drop }, { ...end, z }, { ...root, z } ]
    .map(p => ({x:p.x-k*dy/len, y:p.y+k*dx/len, z:p.z}));
  const a = side(-t/2), b = side(t/2);
  return [[a[0],a[1],a[2]], [b[2],b[1],b[0]],
    [a[0],b[0],b[1],a[1]], [a[1],b[1],b[2],a[2]], [a[2],b[2],b[0],a[0]]];
}

function overlapsAfterTurn(lower, upper) {
  // The rear edge of an upper tread can sit directly over the lower nosing.
  // A shared radial boundary matters even if the open sector interiors do not overlap.
  const epsilon = 1e-9;
  const first = Math.max(1, Math.ceil((upper.start - lower.end - epsilon) / tau));
  for (let k = first; k*tau <= upper.end - lower.start + epsilon; k++) {
    if (Math.min(lower.end + k*tau, upper.end) >= Math.max(lower.start + k*tau, upper.start) - epsilon) return true;
  }
  return false;
}

function perpendicularGoing(contour, walkRadius) {
  // First exit along +Y, perpendicular to the first radial nose. The ray can
  // reach an outside facet before it reaches the following nosing.
  let distance = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if (Math.abs(a.x - b.x) < 1e-10) continue;
    const t = (walkRadius - a.x) / (b.x - a.x);
    const y = a.y + t*(b.y-a.y);
    if (t >= -1e-10 && t <= 1+1e-10 && y > 1e-7) distance = Math.min(distance,y);
  }
  return distance;
}

function build(parameters = {}) {
  const p = { height:2880, ...defaults, ...parameters };
  const parts = [], metrics = [], issues = [], guides = [];
  const result = { parts, metrics, issues, guides };
  for (const f of fields) {
    const n = p[f.key];
    if (f.type === 'select' ? !f.options.some(([id]) => id === n) :
      !Number.isFinite(n) || n < f.min || n > f.max || (integerFields.has(f.key) && !Number.isInteger(n))) {
      issues.push({level:'error',text:`Ongeldige invoer voor ${f.label.toLowerCase()}.`});
    }
  }
  if (!Number.isFinite(p.height) || p.height <= 0 || p.height > 10000) issues.push({level:'error', text:'Geef een positief vloerverschil op van ten hoogste 10.000 mm.'});
  if (issues.length) return result;

  const ro = p.diameter/2, columnR = p.columnDiameter/2, hubR = columnR + 15;
  const walkR = ro - p.walklineInset, railR = ro - 28;
  const angle = tau / p.stepsPerTurn, rise = p.height / p.risers;
  const n = p.risers - 1, landingAngle = n*angle, thickness = p.plateThickness;
  const railTube = 21, postR = 8, footDepth = 14, hubRoot = hubR - 3;
  const ribDrop = Math.min(120, .64 * rise);
  const outerClear=p.guard==='with'?railR-railTube:ro;
  if (walkR <= hubR || walkR >= outerClear) issues.push({level:'error',text:'De klimlijn moet tussen de buitenzijde van de spilhuls en de vrije binnenzijde van de leuning liggen.'});
  if (rise <= Math.max(footDepth + thickness + ribDrop, p.foldDepth + footDepth)) issues.push({level:'error',text:'De optrede biedt onvoldoende ruimte voor de trederand, voetplaat en consoles.'});
  if (issues.length) return result;
  const add = (id,label,kind,faces,material = 'galvanized') => {if(kind!=='railing'||p.guard==='with')parts.push({id,label,kind,material,faces});};
  const metric = (label, value, unit = 'mm') => metrics.push({label,value,unit});
  const transform = (x,y,z) => ({
    x:Math.cos(landingAngle)*x - Math.sin(landingAngle)*y,
    y:Math.sin(landingAngle)*x + Math.cos(landingAngle)*y, z
  });
  const vertical = (id,label,kind,x,y,z1,z2,r,sides=12) => add(id,label,kind,tube({x,y,z:z1},{x,y,z:z2},r,sides));
  const plateR = hubR + 62;
  add('base','Voetplaat spil','plate',box(-plateR,-plateR,0,plateR,plateR,footDepth));
  add('column','Centrale buisspil','column',sleeve(columnR-5,columnR,footDepth,p.height+60));
  vertical('cap','Afdekplaat spil','plate',0,0,p.height+60,p.height+65,columnR,32);
  const boltOffset = plateR - 24;
  [[1,1],[-1,1],[-1,-1],[1,-1]].forEach(([i,j], idx) => {
    const x = i*boltOffset, y = j*boltOffset;
    vertical('washer-'+(idx+1),'Ankerring '+(idx+1),'fastener',x,y,footDepth,footDepth+3,16);
    vertical('nut-'+(idx+1),'Ankermoer '+(idx+1),'fastener',x,y,footDepth+3,footDepth+16,12,6);
  });
  const sectors = [], walkPath = [], railPath = [];
  const segments = Math.ceil(angle / (tau/64));
  const firstContour = [...arc(ro,0,angle,segments), ...arc(hubRoot,angle,0,segments)];
  // Pitched centreline is defined at the leading edge. Each post stands on its own horizontal tread.
  const railZ = a => rise + p.railHeight + rise*a/angle;
  for (let i = 0; i < n; i++) {
    const a = i*angle, b = (i+1)*angle, name = number(i+1), z = (i+1)*rise;
    const contour = [...arc(ro,a,b,segments), ...arc(hubRoot,b,a,segments)];
    add('tread-'+name,'Gevouwen trede '+name,'tread',prism(contour,z-thickness,z));
    add('hub-'+name,'Spilhuls '+name,'member',sleeve(columnR,hubR,i === 0 ? footDepth : i*rise,z));
    // Welded lip and radial web under the deck are separate coordinated shop pieces.
    const root = point(hubRoot,a), end = point(ro,a), nx = -Math.sin(a)*thickness, ny = Math.cos(a)*thickness;
    add('lip-'+name,'Neuszetting '+name,'plate',prism([root,end,{x:end.x+nx,y:end.y+ny},{x:root.x+nx,y:root.y+ny}], z-p.foldDepth, z-thickness));
    add('rib-'+name,'Radiale verstijvingsrib '+name,'plate',gusset(point(hubRoot,(a+b)/2),point(ro-60,(a+b)/2),z-thickness,ribDrop,thickness));
    sectors.push({start:a,end:b,top:z,depth:Math.max(p.foldDepth, thickness+ribDrop), name:'trede '+name});
    for (let j = 0; j < segments; j++) {
      const t = a + j/segments*angle;
      railPath.push(point(railR,t,railZ(t)));
      walkPath.push(point(walkR,t,railZ(t)-p.railHeight));
    }
    for (let j = 0; j < p.spindlesPerTread; j++) {
      const at = a + (j+.5)/p.spindlesPerTread*angle, node = point(railR,at);
      vertical('post-'+name+'-'+(j+1),'Buitenspijl '+name+'.'+(j+1),'railing',node.x,node.y,z,railZ(at),postR,8);
    }
  }
  // The last rise reaches a flush rectangular floor interface. The quadrant at the newel follows its socket.
  const landing = [point(hubRoot,0),point(ro,0),{x:ro,y:p.landingDepth},{x:0,y:p.landingDepth},...arc(hubRoot, Math.PI/2, 0, 16).slice(0,-1)]
    .map(q => transform(q.x,q.y,0));
  add('landing','Aansluitbordes met rechte vloeraansluiting','landing',prism(landing,p.height-thickness,p.height));
  add('hub-top','Bordeshuls','member',sleeve(columnR,hubR,n*rise,p.height));
  const landingDrop = Math.min(140,.7*rise);
  for (const [side,x] of [['left',28],['right',ro-28]]) {
    const from = side === 'left' ? hubR+16 : 0;
    const postCount = Math.max(2,Math.ceil((p.landingDepth-from)/130)+1);
    for (let j = 0; j < postCount; j++) {
      const y = from + (p.landingDepth-from-12)*j/(postCount-1);
      const q = transform(x,y,p.height);
      vertical('landing-post-'+side+'-'+(j+1),'Bordesspijl '+side+' '+(j+1),'railing',q.x,q.y,p.height,p.height+p.railHeight,postR,8);
    }
    const start = transform(x,from,p.height+p.railHeight), end = transform(x,p.landingDepth,p.height+p.railHeight);
    if (side === 'right') railPath.push(start,end);
    else add('inner-rail','Binnenleuning bordes','railing',tube(start,end,railTube,12));
    const supportX = side === 'left' ? ro*.24 : ro*.76;
    const at = transform(supportX,p.landingDepth,0), tip = transform(supportX,p.landingDepth-200,0);
    add('landing-rib-'+side,'Eindrib bordes '+side,'plate',gusset(at,tip,p.height-thickness,landingDrop,thickness));
  }
  add('outer-rail','Doorlopende buitenleuning en bordesleuning','railing',railSweep(railPath,railTube));
  walkPath.push(point(walkR,landingAngle,p.height),transform(walkR,p.landingDepth,p.height));
  guides.push({label:'Klimlijn en uittrede',points:walkPath});

  const landingSweep = Math.asin(Math.min(1,p.landingDepth/walkR));
  sectors.push({start:landingAngle,end:landingAngle+landingSweep,top:p.height,depth:landingDrop+thickness,name:'bordes'});
  let clearance = Infinity, location = '';
  for (let i = 0; i < n; i++) {
    for (const upper of sectors.slice(i+1)) {
      if (!overlapsAfterTurn(sectors[i],upper)) continue;
      const gap = upper.top - upper.depth - sectors[i].top;
      if (gap < clearance) {clearance = gap; location = sectors[i].name + ' onder ' + upper.name;}
    }
  }
  const going = perpendicularGoing(firstContour,walkR);
  metric('Optrede',rise);
  metric('Aantrede loodrecht op de neus bij klimlijn',going);
  metric('Klimlijnstraal',walkR);
  metric('Uittrede vanaf eerste neus',n*360/p.stepsPerTurn,'°');
  metric('Hoogte per omwenteling',p.stepsPerTurn*rise);
  metric(p.guard==='with'?'Vrije breedte tussen huls en buitenleuning':'Vrije breedte van huls tot trederand',outerClear-hubR);
  metric('Bordesdiepte tot aansluitvloer',p.landingDepth);
  if (Number.isFinite(clearance)) {
    metric('Vrije draaihoogte op klimlijn · ondergrens',clearance);
    if (clearance < p.targetHeadroom) issues.push({level:'warning',text:`De conservatieve draaihoogte bij ${location} is ${Math.floor(clearance)} mm bij een projecteis van ${p.targetHeadroom} mm. Controleer de vrije ruimte in het trappenhuis.`});
  } else metric('Overlapping op klimlijn','Geen bovenliggende trede of bordes','');
  issues.push({level:'info',text:'Controleer de vrije hoogte onder de gebouwvloer en de aansluiting van het bordes op de sparing. Dimensioneer spil, treden, hekwerk, ankers en bordesoplegging voor de projectbelastingen.'});
  if (p.turn === 'right') {
    for (const part of parts) part.faces = part.faces.map(face => face.map(q => ({...q,y:-q.y})).reverse());
    for (const g of guides) g.points = g.points.map(q => ({...q,y:-q.y}));
  }
  return result;
}

export const spiral = { id:'spiral', label:'Spiltrap', fields, build };
