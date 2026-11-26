import Drawing from 'dxf-writer';
import { individualTreads } from './workshop.js';

const mmFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2, useGrouping: false });
export const mm = value => Number.isFinite(value) ? mmFormat.format(value) : '—';
export const stockText = sizes => sizes.map(mm).join(' × ');
export const groupNames = { tread: 'Treden', riser: 'Stootborden', nosingStrip: 'Wellatten', newel: 'Trappalen', baluster: 'Spijlen', handrail: 'Leuningdelen' };
const profileNames = { square: 'Haakse neus', round: 'Afgeronde bovenneus', bevel: 'Afgeschuinde bovenneus' };

export function timberSheetParts(geometry, details) {
  const treads = individualTreads(geometry).map(p => ({
    id: p.id, type: 'tread', name: p.name, profile: profileNames[p.noseDetail?.kind ?? 'square'],
    stock: [p.length, p.width, p.thickness], netVolume: p.volume, length: null, part: p
  }));
  const railing = details.filter(p => Object.hasOwn(groupNames,p.role)).map(p => ({
    id: p.id, type: p.role, name: p.label, profile: p.profileName ?? p.label,
    stock: [p.stockLengthMm, p.stockWidthMm, p.stockThicknessMm],
    netVolume: p.volumeM3, length: p.lengthMm, part: p
  }));
  return [...treads, ...railing];
}

const point = (x, y) => ({ x, y });
const line = (points, mode = 'wood', closed = true) => ({ points, mode, closed });
const diagram = (title, paths, note) => ({ title, paths, note });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (p, s) => ({ x: p.x * s, y: p.y * s, z: p.z * s });
function unit(v) { return scale(v, 1 / Math.hypot(v.x, v.y, v.z)); }

function treadViews(p) {
  const top = diagram('Bovenaanzicht', [
    line(p.contour), ...(p.tongues ?? []).map(t => line(t.points, 'joint')),
    line(p.nose, 'edge', false)
  ], p.tongues?.length ? 'Voorrand in blauw, insteeklippen in groen.' : 'De blauwe lijn geeft de voorrand aan.');
  const d = p.noseDetail, t = p.thickness;
  const cut = Math.min(Math.max(45, (d?.sizeMm ?? 0) * 2 + 15), p.depthAtWalkline ?? p.width);
  const form = d?.section?.map(q => point(q.inset, t - q.depth)) ?? [point(0, t)];
  const section = line([point(0, 0), ...form, point(cut, t), point(cut, 0)]);
  if (d?.kind === 'round') {
    // Exact 90-degree convex arc in the exported closed LWPOLYLINE.
    section.dxf = [[0, 0], [0, t - d.sizeMm, -Math.tan(Math.PI / 8)], [d.sizeMm, t], [cut, t], [cut, 0]];
    if (Math.abs(t - d.sizeMm) < 1e-8) section.dxf.shift();
  }
  return [top, diagram('Doorsnede loodrecht op de neus', [section],
    (d?.kind === 'round' ? 'Bovenrand R ' + mm(d.sizeMm) + ' mm.' :
     d?.kind === 'bevel' ? 'Bovenrand ' + mm(d.sizeMm) + ' × 45°.' : 'Haakse bovenrand.') +
     ' Afgebeeld tot ' + mm(cut) + ' mm achter de voorrand.')];
}

function uprightViews(p, index) {
  const stations = p.profileStations;
  const station = stations[Math.min(index, stations.length - 1)];
  const half = (s, side) => {
    const transverse = side * s.widthMm / 2;
    return point(s.atMm + (s.grade ?? 0) * transverse, transverse);
  };
  const outline = [...stations.map(s => half(s, 1)), ...[...stations].reverse().map(s => half(s, -1))];
  const sectionLine = line([half(station, 1), half(station, -1)], 'edge', false);
  const section=line(station.contour);
  if(station.section==='rond') {
    const r=station.widthMm/2, b=Math.tan(Math.PI/8);
    section.dxf=[[r,0,b],[0,r,b],[-r,0,b],[0,-r,b]];
  }
  return [
    diagram('Profielverloop langs de as', [line(outline), sectionLine],
      'Stations vanaf de voet op de hartlijn. De blauwe lijn markeert de getoonde doorsnede.'),
    diagram('Doorsnede op station ' + mm(station.atMm) + ' mm', [section],
      station.section + ' · ' + stockText([station.widthMm, station.depthMm]) + ' mm. ' +
      (Math.abs(station.grade??0)>1e-7?'Projectie van het schuine eindvlak langs de as.':'Gemeten dwars op de as.'))
  ];
}

// Project the actual centreline onto its plane of curvature. For a straight
// handrail use the vertical plane through the axis so the station length is true.
function railViews(p) {
  const path = p.axisPath, origin = path[0], axis = unit(subtract(path[1], origin));
  const points = path.map(v => subtract(v, origin));
  const normal = points.map(v => subtract(v, scale(axis, dot(v, axis))))
    .sort((a, b) => dot(b, b) - dot(a, a))[0];
  const vertical = { x: 0, y: 0, z: 1 };
  const crossAxis = dot(normal, normal) > 1e-10 ? unit(normal) : unit(subtract(vertical, scale(axis, axis.z)));
  const projection = points.map(v => point(dot(v, axis), dot(v, crossAxis)));
  const centreline=line(projection,'edge',false);
  if(p.railPiece==='transition' && projection.length>2 && p.bendAngleDeg>0){
    const a=projection[0],m=projection[Math.floor(projection.length/2)],b=projection.at(-1);
    const turn=Math.sign((m.x-a.x)*(b.y-m.y)-(m.y-a.y)*(b.x-m.x));
    centreline.dxf=[[a.x,a.y,turn*Math.tan(p.bendAngleDeg*Math.PI/720)],[b.x,b.y]];
  }
  return [
    diagram(p.railPiece === 'transition' ? 'Hartlijn in het buigvlak' : 'Hartlijn van het leuningdeel',
      [centreline], 'De as loopt van de beginkop naar de eindkop.'),
    diagram('Handlijst · dwarsdoorsnede', [line(p.profileContour)], 'Loodrecht op de leuningas. De bovenkant van het profiel ligt boven in de tekening.')
  ];
}

export function timberViews(row, stationIndex = 0) {
  if (row.type === 'tread') return treadViews(row.part);
  if (row.type === 'handrail') return railViews(row.part);
  if (row.type === 'riser' || row.type === 'nosingStrip') {
    const p=row.part, top=diagram('Plankvoet · bovenaanzicht',[line(p.faceContour)],'Lokale X langs de voorrand. Y loopt van de zichtzijde naar achteren.');
    if (row.type==='nosingStrip') return [top,diagram('Wellat · dwarsdoorsnede',[line(p.profileContour)],'Gemeten loodrecht op de lengteas van de wellat.')];
    const t=p.stockThicknessMm,h=p.stockWidthMm;
    return [top,diagram('Stootbord · dwarsdoorsnede',[line(p.profileContour??[point(0,0),point(t,0),point(t,h),point(0,h)])],
      p.profileContour?(p.developedHeightMm>p.heightMm+1e-6?'Afwijkend schuin stootbord: doorsnede en ruwplank volgen de ontwikkelde lengte.':'Verticaal stootbord: rechte doorsnede en ruwplank volgens de vrije hoogte.'):
        'Verticale richting geeft de plankhoogte. Horizontale richting geeft de dikte.')];
  }
  return uprightViews(row.part, stationIndex);
}

export function viewBounds(view) {
  const points = view.paths.flatMap(p => p.points);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// The SVG is printed in a fixed metric viewport. The selected scale and the
// projected dimensions therefore also hold when measured on a full-size print.
export function layoutTimberView(view) {
  const b = viewBounds(view), spanX = b.x1 - b.x0, spanY = b.y1 - b.y0;
  const width = 120, height = 65, drawWidth = width - 25, drawHeight = height - 15;
  const ratio = Math.max(spanX / drawWidth, spanY / drawHeight, 1);
  const magnitude = 10 ** Math.floor(Math.log10(ratio));
  const denominator = ([1, 2, 2.5, 4, 5, 7.5, 10].find(n => n * magnitude >= ratio - 1e-8) ?? 10) * magnitude;
  const left = (drawWidth - spanX / denominator) / 2 + 4, bottom = (drawHeight + spanY / denominator) / 2 + 4;
  const project = p => point(left + (p.x - b.x0) / denominator, bottom - (p.y - b.y0) / denominator);
  return { width, height, denominator, spanX, spanY, a: project(point(b.x0, b.y0)), b: project(point(b.x1, b.y1)),
    paths: view.paths.map(p => ({ ...p, svg: p.points.map(v => { const q = project(v); return q.x + ',' + q.y; }).join(' ') })) };
}

export function timberDetailDxf(row, views) {
  const drawing = new Drawing();
  drawing.setUnits('Millimeters');
  const layers = { wood: 'OSS-OMTREK', joint: 'OSS-INSTEEKLIP', edge: 'OSS-REFERENTIE' };
  for (const [name, color] of [[layers.wood, 7], [layers.joint, 3], [layers.edge, 5], ['OSS-PROFIEL', 2], ['OSS-MERK', 7]]) {
    drawing.addLayer(name, color, 'CONTINUOUS');
  }
  let nextX = 0;
  views.forEach((view, i) => {
    const b = viewBounds(view), delta = i === 0 ? 0 : nextX - b.x0;
    for (const shape of view.paths) {
      drawing.setActiveLayer(i === 1 ? 'OSS-PROFIEL' : layers[shape.mode]);
      // dxf-writer accepts an arc bulge on the starting vertex.
      const raw = shape.dxf ?? shape.points.map(p => [p.x, p.y]);
      drawing.drawPolyline(raw.map(([x, y, bulge]) => bulge ? [x + delta, y, bulge] : [x + delta, y]), shape.closed);
    }
    drawing.setActiveLayer('OSS-MERK');
    drawing.drawText(b.x0 + delta, b.y1 + 12, 4, 0, row.id + ' | ' + view.title + ' | mm');
    nextX = delta + b.x1 + 80;
  });
  return drawing.toDxfString();
}
