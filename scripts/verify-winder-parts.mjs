import assert from 'node:assert/strict';
import { buildWinderSchedule, makePartsCsvRows } from '../src/winder-parts.js';
import { createTreadDxf } from '../src/tread-dxf.js';
import { calculateEstimate } from '../src/stair.js';

// Trapezoid with an 800 x 300 mm stock rectangle; the back left corner is cut off.
const corners = [[0, 0], [800, 0], [800, 300], [200, 300]];
const compare = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const signedArea = points => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + a.x * b.y - b.x * a.y;
}, 0) / 2;
const rate = {
  timberPricePerM3: 2000, wasteFactor: 1.1, laborHours: 0,
  laborRate: 0, overheadPercent: 0, marginPercent: 0
};
for (const handedness of [1, -1]) {
  for (const rotation of [0, 0.33, 1.87]) {
    const transform = ([x, y]) => ({
      x: 4000 + x * Math.cos(rotation) - handedness * y * Math.sin(rotation),
      y: -1800 + x * Math.sin(rotation) + handedness * y * Math.cos(rotation)
    });
    const points = corners.map(transform);
    const sample = {
      id: 'T-TD-01', points, frontEdge: points.slice(0, 2), thickness: 40, level: 1,
      elevation: 180, area: 210000, goingAtWalkline: 241, depthAtWalkline: 261,
      narrowDepth: 52, isWinder: true
    };
    const schedule = buildWinderSchedule([sample], []);
    const [part] = schedule.parts;
    assert.deepEqual([part.length, part.width, part.thickness], [800, 300, 40]);
    compare(part.volume, 0.0084);
    compare(part.blankVolume, 0.0096);
    compare(schedule.volume, part.volume);
    compare(schedule.blankVolume, part.blankVolume);
    compare(signedArea(part.contour), signedArea(sample.points));
    compare(part.nose[0].y, part.nose[1].y);
    assert(part.contour.every(p => p.x >= 0 && p.y >= 0 && p.x <= part.length + 1e-7 && p.y <= part.width + 1e-7));
    const [header, row] = makePartsCsvRows(schedule, 'eiken');
    const csv = Object.fromEntries(header.map((label, i) => [label, row[i]]));
    assert.equal(csv.Merk, sample.id);
    compare(Number(csv['Netto m3']), part.volume);
    compare(Number(csv['Bruto m3']), part.blankVolume);
    assert.equal(csv['Aantrede klimlijn mm'], 241);
    assert.match(createTreadDxf(part), /OSS-TREAD/);
    compare(calculateEstimate(schedule, rate).materials, 0.0096 * 1.1 * 2000);
  }
}
// A trimmed stringer must retain its own net and procurement volumes in both handoffs.
const beam = {
  id: 'T-WG-L1', name: 'Wangsegment L1', length: 840, width: 270, thickness: 48,
  volume: 0.009, blankVolume: 840 * 270 * 48 / 1e9
};
const order = buildWinderSchedule([], [beam]);
compare(order.volume, beam.volume);
compare(order.blankVolume, beam.blankVolume);
compare(calculateEstimate(order, rate).materials, beam.blankVolume * 1.1 * 2000);
const [beamHeader, beamRow] = makePartsCsvRows(order, 'eiken');
compare(Number(beamRow[beamHeader.indexOf('Netto m3')]), beam.volume);
compare(Number(beamRow[beamHeader.indexOf('Bruto m3')]), beam.blankVolume);
console.log('Verified six rotated/mirrored WVB blanks, trimmed stringer net and gross volumes, CSV metrics and timber pricing.');
