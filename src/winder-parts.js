// Model coordinates and board coordinates are both right-handed XY in millimetres.
// Orient the stock along the nosing and keep the upper face towards the viewer.
function boardCoordinates(points, [start, end], elevation) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const averageCross = points.reduce((sum, p) =>
    sum + dx * (p.y - start.y) - dy * (p.x - start.x), 0);
  const sign = averageCross >= 0 ? 1 : -1;
  const cosine = sign * dx / length;
  const sine = sign * dy / length;
  const project = point => {
    const x = point.x - start.x;
    const y = point.y - start.y;
    return { x: x * cosine + y * sine, y: -x * sine + y * cosine };
  };
  const projected = points.map(project);
  const minX = Math.min(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y));
  const local = p => ({ x: p.x - minX, y: p.y - minY });
  return {
    contour: projected.map(local),
    nose: [local(project(start)), local(project(end))],
    toBoard: point => local(project(point)),
    boardFrame: {
      origin: { x: start.x + cosine * minX - sine * minY, y: start.y + sine * minX + cosine * minY, z: elevation },
      xAxis: { x: cosine, y: sine, z: 0 }, yAxis: { x: -sine, y: cosine, z: 0 }, zAxis: { x: 0, y: 0, z: 1 }
    }
  };
}

export function treadPart(tread) {
  const { contour, nose, toBoard, boardFrame } = boardCoordinates(tread.points, tread.frontEdge, tread.elevation);
  // Round outward for a whole-mm stock list, excluding floating-point dust at integer sizes.
  const stockSize = axis => Math.ceil(Math.max(...contour.map(p => p[axis])) - 1e-8);
  const length = stockSize('x');
  const width = stockSize('y');
  return {
    id: tread.id, name: tread.isWinder ? 'Verdreven trede' : 'Rechte trede', kind: 'tread',
    quantity: 1, length, width, thickness: tread.thickness,
    area: tread.area, volume: tread.volume ?? tread.area * tread.thickness / 1e9,
    ...(tread.noseDetail?{noseDetail:tread.noseDetail}:{}),
    ...(tread.windingDistribution ? {windingDistribution:tread.windingDistribution} : {}),
    blankVolume: length * width * tread.thickness / 1e9,
    level: tread.level, elevation: tread.elevation, isWinder: tread.isWinder,
    goingAtWalkline: tread.goingAtWalkline, depthAtWalkline: tread.depthAtWalkline,
    narrowDepth: tread.narrowDepth, tongueCount: tread.tongues?.length, contour, nose, boardFrame,
    tongues: (tread.tongues ?? []).map(tongue => ({ ...tongue, points: tongue.points.map(toBoard) }))
  };
}

export function buildWinderSchedule(treads, stringers, newels = []) {
  const parts = treads.map(treadPart);
  for (const post of newels) {
    const connected = new Set(post.connectedTreadIds);
    for (const part of parts.filter(p => p.kind === 'tread' && connected.has(p.id))) {
      const pocket = post.pockets.find(p => p.treadId === part.id);
      (part.newelJoints ??= []).push({ postId: post.id, depth: pocket?.depth ?? 0 });
    }
    parts.push({
      id: post.id, name: post.corner === 'lower' ? 'Onderspil' : 'Bovenspil', kind: 'quarterNewel',
      quantity: 1, length: post.height, width: post.length, thickness: post.width,
      volume: post.volume, blankVolume: post.blankVolume, pocketCount: post.pockets.length
    });
  }
  for (const beam of stringers) {
    parts.push({
      id: beam.id, name: beam.name ?? 'Wangsegment', kind: 'stringer',
      quantity: 1, length: beam.stockLength??beam.length, width: beam.stockWidth??beam.width, thickness: beam.thickness,
      volume: beam.volume, blankVolume: beam.blankVolume ?? beam.volume, pocketCount: beam.pocketCount
    });
  }
  return {
    parts,
    volume: parts.reduce((sum, part) => sum + part.volume, 0),
    blankVolume: parts.reduce((sum, part) => sum + part.blankVolume, 0)
  };
}

export function makePartsCsvRows(geometry, material, cncStock) {
  const extraHeader = cncStock ? ['CNC-opspanlengte mm', 'CNC-opspanbreedte mm', 'CNC-rand per zijde mm'] : [];
  const stockFields = tread => {
    if (!cncStock) return [];
    const m = cncStock.margin;
    return tread ? [tread.length + 2*m, tread.width + 2*m, m] : ['', '', ''];
  };
  const originalHeader = ['Merk', 'Onderdeel', 'Aantal', 'Lengte mm', 'Breedte mm', 'Dikte mm', 'Volume m3', 'Materiaal'];
  if (geometry.blankVolume === undefined) {
    // In the grouped legacy list only the first row represents all identical treads.
    return [[...originalHeader, ...extraHeader], ...geometry.parts.map((p, i) => [
      p.id, p.name, p.quantity, Math.round(p.length), Math.round(p.width), Math.round(p.thickness), p.volume.toFixed(4), material,
      ...stockFields(i === 0 ? cncStock?.treads[0] : null)
    ])];
  }
  const mm = v => v == null ? '' : Number(v.toFixed(3));
  const hasProfiles=geometry.parts.some(p=>p.noseDetail);
  const hasNewels=geometry.parts.some(p=>p.kind==='quarterNewel');
  const hasDistribution=geometry.parts.some(p=>p.windingDistribution);
  const header = ['Merk', 'Onderdeel', 'Aantal', 'Ruwlengte mm', 'Ruwbreedte mm', 'Dikte mm',
    'Netto m3', 'Bruto m3', 'Materiaal', 'Tredenummer', 'Bovenkant mm',
    'Aantrede klimlijn mm', 'Tredevlak klimlijn mm', 'Kortste zijmaat langs wang mm', 'Contouroppervlak mm2'];
  if (geometry.housings) header.push('Insteeklippen', 'Infrezingen', 'Insteekdiepte mm');
  if (geometry.riserJoinery) header.push('Stootbordgroeven', 'Groefdiepte stootbord mm');
  if (hasProfiles) header.push('Neusprofiel','Profielmaat mm','Lengte voorrand mm','Volumevermindering neus cm3');
  if (hasNewels) header.push('Spilaansluiting', 'Insteek in spil mm', 'Tredehuizen in spil');
  if (hasDistribution) header.push('Kwart', 'Trede in kwart', 'Correctie voorste stootbordlijn mm', 'Correctie achterste stootbordlijn mm');
  return [[...header, ...extraHeader], ...geometry.parts.map(p => [
    p.id, p.name, p.quantity, mm(p.length), mm(p.width), mm(p.thickness),
    p.volume.toFixed(8), p.blankVolume.toFixed(8), material, p.level ?? '', mm(p.elevation),
    mm(p.goingAtWalkline), mm(p.depthAtWalkline), mm(p.narrowDepth), mm(p.area),
    ...(geometry.housings ? [p.tongueCount ?? '', p.kind==='quarterNewel'?'':p.pocketCount ?? '', ['landing','quarterNewel'].includes(p.kind) ? '' : mm(geometry.housings.settings.depth)] : []),
    ...(geometry.riserJoinery ? [p.riserPockets?.length ?? '', mm(p.riserPockets?.[0]?.depth)] : []),
    ...(hasProfiles ? (p.noseDetail?[p.noseDetail.kind==='round'?'Kwartrond bovenrand':'Velling 45° bovenrand',p.noseDetail.sizeMm,
      mm(p.noseDetail.frontLengthMm),mm(p.noseDetail.removedMm3/1000)]:['','','','']) : []),
    ...(hasNewels ? [(p.newelJoints ?? []).map(j=>j.postId).join(' / '),
      (p.newelJoints ?? []).map(j=>mm(j.depth)).join(' / '),p.kind==='quarterNewel'?p.pocketCount:''] : []),
    ...(hasDistribution ? (p.windingDistribution ? [p.windingDistribution.quarter==='lower'?'Onderkwart':'Bovenkwart',
      p.windingDistribution.index,mm(p.windingDistribution.frontOffsetMm),mm(p.windingDistribution.backOffsetMm)] : ['','','','']) : []),
    ...stockFields(p.kind === 'tread' ? p : null)
  ])];
}
