import assert from 'node:assert/strict';
import { starterProject, generateStairGeometry, calculateEstimate } from '../src/stair.js';
import { buildWorkshop, individualTreads, treadStockAllowance } from '../src/workshop.js';
import { makePartsCsvRows } from '../src/winder-parts.js';
import { compileTreadJob } from '../src/tread-cam.js';
import { verifyTreadFit } from '../src/tread-fit.js';

const model = structuredClone(starterProject);
Object.assign(model.stair, { type: 'half_winder', turnDirection: 'right', entrySteps: 3 });
for (const [cornerMode, clearance, expected] of [['dogbone', 0.4, 'pass'], ['rounded', 0.4, 'blocked'], ['rounded', 3, 'pass']]) {
  model.cam.cornerMode = cornerMode;
  model.joinery.clearance = clearance;
  const workshop = buildWorkshop(generateStairGeometry(model.stair), model);
  const treads = individualTreads(workshop);
  for (const part of treads) {
    const job = compileTreadJob(part, model.treadCam);
    const check = verifyTreadFit(part, workshop, model.cam, job);
    assert.equal(check.status, expected, part.id + ': ' + check.message);
    assert.equal(check.connections.length, part.tongueCount);
    for (const connection of check.connections) {
      assert.equal(connection.status, expected);
      if (expected === 'pass') {
        assert(Math.abs(connection.edgeClearance - clearance/2) < 1e-6);
        assert(connection.depthClearance < 0.0001);
      }
    }
  }
  const part = treads.find(p => p.tongueCount > 2);
  const job = compileTreadJob(part, model.treadCam);
  if (expected === 'pass') {
    const shifted = structuredClone(part);
    shifted.boardFrame.origin.z += 3;
    assert.equal(verifyTreadFit(shifted, workshop, model.cam, job).status, 'blocked', 'Vertical misalignment');
    const wrongStock = structuredClone(job);
    wrongStock.offset.x += 1;
    assert.equal(verifyTreadFit(part, workshop, model.cam, wrongStock).status, 'blocked', 'Incorrect G54 to board offset');
    const clipped = structuredClone(job);
    const p = clipped.tongues[0].points[1];
    clipped.path.splice(2, 0, p);
    assert.equal(verifyTreadFit(part, workshop, model.cam, clipped).status, 'blocked', 'Toolpath feeds across tongue');
  }
  const allowance = treadStockAllowance(treads, model.treadCam.stockMargin);
  const cncPrice = calculateEstimate(workshop, {...model.estimate, treadStock:'cnc'}, allowance);
  assert(Math.abs(cncPrice.blankVolume - workshop.blankVolume - allowance) < 1e-10);
  const rows = makePartsCsvRows(workshop, model.stair.material, {treads, margin:model.treadCam.stockMargin});
  const row = rows.find(r => r[0] === part.id);
  const column = rows[0].indexOf('CNC-opspanlengte mm');
  assert.equal(row[column], job.stock.length);
  assert.equal(row[column + 1], job.stock.width);
}
for (const type of ['straight', 'half_turn', 'half_winder']) {
  model.joinery.type = 'none';
  model.stair.type = type;
  const workshop = buildWorkshop(generateStairGeometry(model.stair), model);
  const treads = individualTreads(workshop);
  assert.equal(treads.length, workshop.treads.length);
  for (const part of treads) {
    assert.equal(verifyTreadFit(part, workshop, model.cam, compileTreadJob(part, model.treadCam)).status, 'unconnected');
  }
}
console.log('Verified machined fit gates, rounded housing clearance, displaced setups, CNC stock quantities and free-standing legacy treads.');
