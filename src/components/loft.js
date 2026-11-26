import { box, tube } from './solids.js';

const degrees = Math.PI / 180;
const field = (key, label, min, max, step, value, unit = 'mm') =>
  ({ key, label, type: 'number', min, max, step, default: value, unit });
const fields = [
  { key: 'pose', label: 'Werkstand', type: 'select', default: 'open', options: [
    ['open', 'Gebruik · volledig uitgeklapt'], ['half', 'Halverwege ontvouwen'],
    ['hatch-open', 'Luik open · ladder gevouwen'], ['packed', 'Opgeborgen · luik dicht']
  ] },
  {key:'grip',label:'Handgreep aan ladderdeel',type:'select',default:'with',options:[['none','Zonder handgreep'],['with','Met handgreep']]},
  field('openingLength', 'Ruwbouwsparing · lengte', 900, 1800, 10, 1300),
  field('openingWidth', 'Ruwbouwsparing · breedte', 500, 1000, 10, 700),
  field('slabThickness', 'Vloerpakket boven plafond', 60, 500, 5, 180),
  field('frameHeight', 'Kasthoogte', 100, 450, 5, 180),
  field('ladderWidth', 'Buitenwerks ladderdeel', 300, 650, 5, 400),
  field('angle', 'Hellingshoek in gebruik', 60, 78, 1, 68, '°'),
  field('rungsPerSegment', 'Treden per segment', 2, 5, 1, 4, 'st.'),
  field('freeRun', 'Vrij tot obstakel vanaf achterrand sparing', 0, 6000, 10, 2200),
  field('freeAbove', 'Vrij boven de afgewerkte bovenvloer', 0, 2500, 10, 450)
];

const point = (x, y, z) => ({ x, y, z });
const mapFaces = (faces, fn) => faces.map(face => face.map(fn));
const xyz = point(0, 0, 0);
// x is along the rail downhill, y transverse and z normal to its back.
function frame(origin, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return p => point(origin.x + p.x * c + p.z * s, origin.y + p.y, origin.z - p.x * s + p.z * c);
}

function arcMax(x, z, a0, a1) {
  const coordinate = a => x * Math.cos(a) + z * Math.sin(a);
  const angle = Math.atan2(z, x);
  const peak = angle + 2 * Math.PI * Math.ceil((a0 - angle) / (2 * Math.PI));
  return peak <= a1 ? Math.hypot(x, z) : Math.max(coordinate(a0), coordinate(a1));
}

function build(params = {}) {
  const p = Object.assign(Object.fromEntries(fields.map(f => [f.key, f.default])), { height: 2880 }, params);
  const issues = [], metrics = [], guides = [];
  const issue = (text, level = 'error') => issues.push({ level, text });
  for (const f of fields) {
    if (f.type === 'number' && (!Number.isFinite(p[f.key]) || p[f.key] < f.min || p[f.key] > f.max))
      issue(`${f.label} moet tussen ${f.min} en ${f.max} ${f.unit} liggen.`);
  }
  if (!Number.isInteger(p.rungsPerSegment)) issue('Geef een geheel aantal treden per segment op.');
  if (!fields[0].options.some(([id]) => id === p.pose)) issue('Kies een van de vier werkstanden.');
  if (!Number.isFinite(p.height) || p.height <= p.slabThickness + 300) issue('Geef een verdiepingshoogte op die ruimte biedt onder het plafond.');
  if (issues.length) return { parts: [], metrics, issues, guides };

  const angle = p.angle * degrees, ceiling = p.height - p.slabThickness;
  const wall = 18, sealGap = 3, lidThickness = 36;
  const frameX = 8, frameHalf = p.openingWidth / 2 - 10;
  const insideHalf = frameHalf - wall, near = frameX + wall, far = p.openingLength - near;
  const pivot = point(near + sealGap, 0, ceiling);
  const lidLength = far - sealGap - pivot.x, lidHalf = insideHalf - sealGap;
  const railHalf = p.ladderWidth / 2, railWidth = 21, railDepth = 84;
  const foldOffset = railDepth / 2 + 6, topS = 52, topN = lidThickness + railDepth / 2 + 14;
  const length = frame(pivot, angle)(point(topS, 0, topN)).z / Math.sin(angle) / 3;
  const pitch = length / p.rungsPerSegment;
  const topTransition = p.height - 3 * length * Math.sin(angle);
  // Balance the two terminal steps, leaving enough timber at every cut end.
  const rungStart = Math.min(pitch / 2, Math.max(38, (pitch - topTransition / Math.sin(angle)) / 2));
  const partsLocal = [];
  const add = (group, id, label, kind, material, faces) => partsLocal.push({ group, id, label, kind, material, faces });
  const fixedBox = (id, label, x0, y0, x1, y1) => add('fixed', id, label, 'frame', 'timber',
    box(x0, y0, ceiling, x1, y1, ceiling + p.frameHeight));
  fixedBox('case-back', 'Luikkast · scharnierzijde', frameX, -frameHalf, near, frameHalf);
  fixedBox('case-front', 'Luikkast · sluitzijde', far, -frameHalf, p.openingLength - frameX, frameHalf);
  fixedBox('case-left', 'Luikkast · links', near, -frameHalf, far, -insideHalf);
  fixedBox('case-right', 'Luikkast · rechts', near, insideHalf, far, frameHalf);
  add('lid', 'lid', 'Geïsoleerd luik · buitencontour', 'hatch', 'timber', box(0, -lidHalf, 0, lidLength, lidHalf, lidThickness));
  add('lid', 'latch', 'Bedieningsslot met sluitpen', 'fastener', 'steel',
    tube(point(lidLength - 38, 0, -5), point(lidLength - 38, 0, lidThickness + 6), 12));

  for (const side of [-1, 1]) {
    const sideId = side < 0 ? 'L' : 'R';
    const yRail = side * (railHalf - railWidth / 2);
    const hingeY = side * railHalf;
    add('lid', 'lid-hinge-' + sideId, 'Luikscharnier ' + sideId, 'fastener', 'steel',
      tube(point(0, hingeY - 20, 0), point(0, hingeY + 20, 0), 5));
    for (const [index, station] of [0.17, 0.78].entries()) {
      const s = topS + length * station;
      add('lid', `saddle-${sideId}-${index + 1}`, 'Afstandhouder luik ' + sideId, 'plate', 'galvanized',
        box(s - 18, yRail - 11, lidThickness, s + 18, yRail + 11, topN - railDepth / 2));
    }
    for (let i = 0; i < 3; i++) {
      const y0 = yRail - railWidth / 2, y1 = yRail + railWidth / 2;
      const rail = box(0, y0, -railDepth / 2, length, y1, railDepth / 2);
      const bevel = v => point(v.x + (v.x === length ? v.z / Math.tan(angle) : 0), v.y, v.z);
      const capped = i === 2;
      add(i, `rail-${i + 1}-${sideId}`, `Ladderboom ${i + 1} · ${sideId}`, 'member', 'timber',
        capped ? mapFaces(rail, v => v.x === length ? point(length - 24, v.y, v.z) : v) : rail);
      if (capped) add(i, 'shoe-' + sideId, 'Voetschoen ' + sideId, 'plate', 'rubber',
        mapFaces(box(length - 24, y0, -railDepth / 2, length, y1, railDepth / 2), bevel));
    }
    for (let joint = 0; joint < 2; joint++) {
      const offset = joint === 0 ? foldOffset : -foldOffset;
      const y = side * (railHalf + 3);
      add(joint, `pin-${joint + 1}-${sideId}`, `Vouwscharnierpen ${joint + 1} · ${sideId}`, 'fastener', 'steel',
        tube(point(length, y - 8, offset), point(length, y + 8, offset), 6));
      for (const leaf of [0, 1]) {
        const yPlate = y + side * (leaf ? 3 : 0);
        const x0 = leaf ? -5 : length - 40;
        add(joint + leaf, `leaf-${joint + 1}-${sideId}-${leaf}`, `Scharnierblad ${joint + 1} · ${sideId}`, 'plate', 'galvanized',
          box(x0, yPlate - 1.5, Math.min(-12, offset - 6), x0 + 45, yPlate + 1.5, Math.max(12, offset + 6)));
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < p.rungsPerSegment; j++) {
      const rung = i * p.rungsPerSegment + j + 1;
      // Tread planes stay fixed to their own segment as the hinges rotate.
      const local = frame(point(rungStart + j * pitch, 0, 0), -angle);
      add(i, 'tread-' + rung, 'Laddertrede ' + rung, 'tread', 'timber',
        mapFaces(box(-38, -railHalf + railWidth, -19, 38, railHalf - railWidth, 0), local));
    }
  }
  const grip = [point(length * .16, railHalf, 0), point(length * .21, railHalf + 22, 70),
    point(length * .72, railHalf + 22, 70), point(length * .79, railHalf, 0)];
  for (let i = 1; p.grip==='with' && i < grip.length; i++)
    add(0, 'grip-' + i, 'Handgreep · deel ' + i, 'railing', 'steel', tube(grip[i-1], grip[i], 9));

  function placement(hatch, unfolded) {
    const lid = frame(pivot, hatch), f1 = frame(lid(point(topS, 0, topN)), hatch);
    const hinge1 = f1(point(length, 0, foldOffset));
    const middle = hatch - (1 - unfolded) * Math.PI;
    const f2 = frame(frame(hinge1, middle)(point(0, 0, -foldOffset)), middle);
    const hinge2 = f2(point(length, 0, -foldOffset));
    const f3 = frame(frame(hinge2, hatch)(point(0, 0, foldOffset)), hatch);
    return { fixed: v => v, lid, 0:f1, 1:f2, 2:f3, hinge1 };
  }
  const closed = placement(0, 0), opened = placement(angle, 1);
  const positions = { packed:closed, open:opened, half:placement(angle,.5), 'hatch-open':placement(angle,0) };
  const selected = positions[p.pose];
  const parts = partsLocal.map(({group, faces, ...properties}) => ({...properties, moves:group !== 'fixed', faces:mapFaces(faces, selected[group])}));

  // The struts flank the folded package, with a constant barrel and a sliding rod.
  let sweep = -Infinity, sweepMinX = 0, sweepHalfWidth = insideHalf, highest = ceiling, lowest = ceiling;
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'L' : 'R', y = side * (insideHalf - 12);
    const anchor = point(near + 65, y, ceiling + Math.min(p.frameHeight - 15, 108));
    const end = point(lidLength * .63, y, lidThickness);
    const tip = selected.lid(end);
    const span = b => Math.hypot(b.x - anchor.x, b.z - anchor.z);
    const barrel = span(closed.lid(end)) * .86;
    const ratio = barrel / span(tip);
    const outlet = point(anchor.x + (tip.x-anchor.x)*ratio,y,anchor.z+(tip.z-anchor.z)*ratio);
    for (const [key, label, faces] of [
      ['barrel', 'Cilinder', tube(anchor, outlet, 9)],
      ['rod', 'Zuigerstang', tube(outlet, tip, 4)],
      ['anchor', 'Kastscharnier', tube(point(anchor.x,y-11,anchor.z),point(anchor.x,y+11,anchor.z),6)],
      ['lug', 'Luikscharnier cilinder', tube(point(tip.x,y-10,tip.z),point(tip.x,y+10,tip.z),6)]
    ]) parts.push({id:key+'-'+name,label:label+' '+name,kind:'member',material:'steel',moves:key!=='anchor',faces});
    // A strut stays between its fixed anchor and rotating tip. Bound the
    // full tube with the larger barrel radius, and include the tip hinge.
    sweep = Math.max(sweep,anchor.x + 9,pivot.x + arcMax(end.x,end.z,0,angle) + 9);
    sweepMinX = Math.min(sweepMinX,anchor.x - 9,pivot.x - arcMax(-end.x,-end.z,0,angle) - 9);
    highest = Math.max(highest, anchor.z+9, pivot.z+arcMax(end.z,-end.x,0,angle)+9);
    lowest = Math.min(lowest, anchor.z-9, pivot.z-arcMax(-end.z,end.x,0,angle)-9);
    sweepHalfWidth = Math.max(sweepHalfWidth,Math.abs(y) + 10);
  }

  // During opening the packed assembly rotates about the hatch axis. During
  // unfolding the second member turns about the first fold pin; the third
  // translates along an arc and stays parallel to the upper member.
  let openRun = 0, packageTop = ceiling, packedMaxX = -Infinity, packedMinX = Infinity, openingMaxX = -Infinity;
  for (const {group, faces} of partsLocal) {
    if (group === 'fixed') continue;
    for (const poly of faces) for (const v of poly) {
      const folded = closed[group](v), openedVertex = opened[group](v);
      packageTop = Math.max(packageTop, folded.z);
      openRun = Math.max(openRun, openedVertex.x);
      const openingX = pivot.x + arcMax(folded.x-pivot.x, folded.z-pivot.z, 0, angle);
      sweep = Math.max(sweep, openingX, openedVertex.x);
      sweepMinX = Math.min(sweepMinX,pivot.x-arcMax(pivot.x-folded.x,pivot.z-folded.z,0,angle),openedVertex.x);
      sweepHalfWidth = Math.max(sweepHalfWidth,Math.abs(v.y));
      highest = Math.max(highest,pivot.z+arcMax(folded.z-pivot.z,pivot.x-folded.x,0,angle),openedVertex.z);
      lowest = Math.min(lowest, pivot.z - arcMax(pivot.z-folded.z, folded.x-pivot.x, 0, angle), openedVertex.z);
      if (typeof group === 'number') {
        packedMinX = Math.min(packedMinX, folded.x);
        packedMaxX = Math.max(packedMaxX, folded.x);
        openingMaxX = Math.max(openingMaxX, openingX);
      }
      if (group === 1) {
        sweep = Math.max(sweep, opened.hinge1.x + arcMax(v.x, v.z-foldOffset, angle-Math.PI, angle));
        sweepMinX = Math.min(sweepMinX, opened.hinge1.x - arcMax(-v.x, foldOffset-v.z, angle-Math.PI, angle));
        highest = Math.max(highest, opened.hinge1.z + arcMax(v.z-foldOffset, -v.x, angle-Math.PI, angle));
        lowest = Math.min(lowest, opened.hinge1.z - arcMax(foldOffset-v.z, v.x, angle-Math.PI, angle));
      }
      if (group === 2) {
        const lastOffset = frame(xyz, angle)(point(v.x, v.y, v.z + foldOffset));
        sweep = Math.max(sweep, opened.hinge1.x + lastOffset.x + arcMax(length, -2*foldOffset, angle-Math.PI, angle));
        sweepMinX = Math.min(sweepMinX, opened.hinge1.x + lastOffset.x - arcMax(-length, 2*foldOffset, angle-Math.PI, angle));
        highest = Math.max(highest, opened.hinge1.z + lastOffset.z + arcMax(-2*foldOffset,-length,angle-Math.PI,angle));
        lowest = Math.min(lowest, opened.hinge1.z + lastOffset.z - arcMax(2*foldOffset, length, angle-Math.PI, angle));
      }
    }
  }
  if (p.grip==='with' && railHalf + 31 >= insideHalf - 23) issue('Ladder met handgreep raakt de zijruimte voor het openingsbeslag. Vergroot de sparing of verklein de ladderbreedte.');
  if (packedMinX < near || packedMaxX > far) issue('Het gevouwen ladderpakket steekt voorbij de binnenkant van de luikkast. Vergroot de sparingslengte.');
  else if (openingMaxX > far) issue('Tijdens het kantelen raakt het gevouwen pakket de kop van de luikkast. Vergroot de sparingslengte.');
  if (sweep > p.freeRun) issue(`Bij bediening ontbreekt ${Math.ceil(sweep - p.freeRun)} mm vrije ruimte tot het obstakel.`);
  if (lowest < -.01) issue(`Luik of ladder zou tijdens bediening ${Math.ceil(-lowest)} mm door de ondervloer bewegen. Pas inbouwhoogte of luiklengte aan.`);
  const aboveFloor = Math.max(0, packageTop - p.height, ceiling + p.frameHeight - p.height);
  if (aboveFloor > p.freeAbove) issue(`Boven de afgewerkte bovenvloer is ${Math.ceil(aboveFloor)} mm vrije opberghoogte nodig.`);
  const first = opened[0](point(rungStart,0,0));
  const stepRise = pitch * Math.sin(angle), upperStep = p.height - first.z;
  if (upperStep > stepRise * 1.25) issue('De overstap van de hoogste trede naar de bovenvloer is groter dan 1,25 maal de berekende tredeafstand. Stem het uitstapdetail af op de inbouwsituatie.', 'warning');
  if (pitch <= 100) issue('De treden liggen te dicht bij elkaar voor dit ladderdetail.');
  issue('Vlieringtoegang voor incidenteel gebruik. Verifieer luikmontage, randbeveiliging, bedieningsruimte en productspecificatie bij de fabrikant.', 'info');

  const metric = (label, value, unit = 'mm') => metrics.push({label,value,unit});
  metric('Vrije plafondhoogte', ceiling);
  metric('Buitenlengte luikkast', p.openingLength - 2 * frameX);
  metric('Buitenbreedte luikkast', 2 * frameHalf);
  metric('Inwendige lengte luikkast', far-near);
  metric('Vrije breedte tussen de bomen', p.ladderWidth - 2*railWidth);
  metric('Ladderdelen', 3, 'st.');
  metric('Laddertreden', 3*p.rungsPerSegment, 'st.');
  metric('Lengte per ladderdeel langs de as', length);
  metric('Verticale tredeafstand in gebruik', stepRise);
  metric('Overstap bovenste trede naar vloer', upperStep);
  metric('Uitloop vanaf achterrand sparing', openRun);
  metric('Bedieningsruimte vanaf achterrand sparing', sweep);
  metric('Gesloten pakket boven onderkant plafond', packageTop-ceiling);
  metric('Opbouw boven afgewerkte bovenvloer', aboveFloor);
  const y = p.openingWidth / 2;
  guides.push({label:'Ruwbouwsparing',points:[point(0,-y,p.height),point(p.openingLength,-y,p.height),point(p.openingLength,y,p.height),point(0,y,p.height),point(0,-y,p.height)]});
  // Plan clearance box encloses the moving hardware in both phases. Its
  // left datum is the opening edge on the hinge side; the operator is extra.
  const polygon = [{x:sweepMinX,y:-sweepHalfWidth},{x:sweep,y:-sweepHalfWidth},
    {x:sweep,y:sweepHalfWidth},{x:sweepMinX,y:sweepHalfWidth}];
  guides.push({label:`Bewegingsenvelop model vanaf achterrand sparing · ${Math.ceil(sweep)} mm`,
    points:[...polygon,polygon[0]].map(p=>({...p,z:0}))});
  // Conservative prism throughout both consecutive movements. It also
  // reserves the free width in the hatch; headroom for the operator is extra.
  const sweepZone = {polygon,zmin:Math.min(0,lowest),zmax:highest};
  return {parts,metrics,issues,guides,sweepZone};
}

export const loft = { id:'loft', label:'Vlizotrap', fields, build };
