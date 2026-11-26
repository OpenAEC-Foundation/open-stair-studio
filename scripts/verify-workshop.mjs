import assert from 'node:assert/strict';
import { generateStairGeometry, calculateEstimate, stairFamilies, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { makePartsCsvRows } from '../src/winder-parts.js';

const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} vs ${b}`);
const area = points => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0)) / 2;
for (const { id } of stairFamilies) {
  const model = structuredClone(starterProject);
  model.stair.type = id;
  const geometry = generateStairGeometry(model.stair);
  assert.equal(buildWorkshop(geometry, { ...model, joinery: { type: 'none' } }), geometry);
  const original = JSON.stringify(geometry);
  for (const depth of [8, 12, 16]) {
    model.joinery.depth = depth;
    const workshop = buildWorkshop(geometry, model);
    assert.deepEqual(workshop.housings.issues, []);
    let net = 0, gross = 0;
    const byId = new Map(workshop.parts.map(part => [part.id, part]));
    for (const tread of geometry.treads) {
      const part = byId.get(tread.id);
      assert.ok(part.tongueCount >= 2 && area(part.contour) > area(tread.points));
      near(part.volume, area(part.contour) * part.thickness / 1e9);
      near(part.blankVolume, part.length * part.width * part.thickness / 1e9);
      net += part.volume;
      gross += part.blankVolume;
    }
    for (const beam of geometry.stringers) {
      const part = byId.get(beam.id);
      const setup = workshop.housings.beams.find(b => b.id === beam.id);
      const removed = setup.pockets.reduce((sum, p) => sum + area(p.contour)*p.depth/1e9, 0);
      near(beam.volume - part.volume, removed);
      near(part.blankVolume, beam.blankVolume ?? beam.volume);
      assert.equal(setup.pockets.length, part.pocketCount);
      net += part.volume;
      gross += part.blankVolume;
    }
    for (const landing of geometry.landings) {
      near(byId.get(landing.id).volume, landing.volume);
      net += landing.volume;
      gross += landing.volume;
    }
    near(workshop.volume, net);
    near(workshop.blankVolume, gross);
    const estimate = calculateEstimate(workshop, model.estimate);
    near(estimate.materials, gross * model.estimate.wasteFactor * model.estimate.timberPricePerM3);
    const [header, ...rows] = makePartsCsvRows(workshop, model.stair.material);
    const total = key => rows.reduce((sum, row) => sum + Number(row[header.indexOf(key)]), 0);
    assert.equal(total('Insteeklippen'), total('Infrezingen'));
    assert.ok(total('Infrezingen') >= 2*geometry.treads.length);
    assert.equal(JSON.stringify(geometry), original, 'Coordination geometry must remain in design coordinates.');
  }
}
console.log('Checked all six workshop schedules at three housing depths, including matching tread and stringer volumes, stock costs, landing boards and CSV joint counts.');
