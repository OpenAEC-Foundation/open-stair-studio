import assert from 'node:assert/strict';
import { checkResistance } from '../src/tread-resistance.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';

const model = structuredClone(starterProject);
const geometry = generateStairGeometry(model.stair);
const base = {
  support: 'two-edge', sourceProduct: 'Testproduct, revisie 1', productBasis: 'Synthetische referentie',
  arrangement: 'Twee kopranden', designBasis: 'Rekenvoorbeeld', connectionBasis: 'Testdetail',
  spanMm: 800, deadArea: 0.5, loadArea: 3, loadPoint: 2, gammaG: 1.35, gammaQ: 1.5,
  deflectionLimitMm: 10, assessedThicknessMm: 40, pointPatchLengthMm: 50, pointPatchWidthMm: 50,
  connectionRd: 5, patchRd: 4, effectiveWidthMm: 100,
};
const systems = {
  glass: { glassE: 70000, glassStressThicknessMm: 32, glassDeflectionThicknessMm: 30, glassFd: 55,
    glassShearRd: 4, glassResidualBasis: 'Projectrapport glas na breuk' },
  grating: { barWidthMm: 8, barHeightMm: 40, barPitchMm: 33, steelE: 210000, steelFd: 310, barShearRd: 7 },
  clt: { cltEI: 150, cltGA: 6500, cltMRd: 12, cltVRd: 50, cltKdef: 0.8, cltPsi2: 0.3 },
};
const test = (system, changes = {}, shape = geometry, doc = model) =>
  checkResistance({ ...base, ...systems[system], structureType: system, ...changes }, doc, shape);
const row = (r, id) => r.rows.find(v => v.id === id);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), String(actual) + ' versus ' + expected);
const treadDepth=geometry.treads[0].length/1000;
const pointConnection=1.35*0.5*treadDepth*0.8/2+1.5*2;

assert.equal(test('timber').status, 'na');
for (const system of Object.keys(systems)) {
  const result = test(system);
  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.equal(result.rows.length, 5);
  near(row(result, 'connection').demand, pointConnection);
  near(row(result, 'patch').demand, 3);
  assert.equal(row(test(system, { connectionRd: 2 }), 'connection').status, 'fail');
  assert.equal(row(test(system, { patchRd: 2 }), 'patch').status, 'fail');
  for (const changes of [{ designBasis: '' }, { connectionBasis: ' ' }, { gammaG: 0.9 }, { assessedThicknessMm: 41 },
    { deadArea: null }, { pointPatchWidthMm: 276 }, { pointPatchLengthMm: 801 }, { support: 'cantilever' }, { spanMm: 799 }])
    assert.equal(test(system, changes).status, 'open', JSON.stringify(changes));
  const missingAndOverloaded = test(system, { designBasis: '', connectionRd: 2 });
  assert.equal(missingAndOverloaded.status, 'fail');
  assert(missingAndOverloaded.reasons.length);
  const area = test(system, { loadArea: 40, loadPoint: 0.01 });
  for (const r of area.rows) assert.match(r.caseLabel, /vlaklast/);
  near(row(area, 'connection').demand, (1.35 * 0.5 + 1.5 * 40) * treadDepth * 0.8 / 2);
}

const glassResult = test('glass');
near(row(glassResult, 'bending').demand, 0.6054);
near(row(glassResult, 'bending').limit, 55 * 100 * 32 ** 2 / 6 / 1e6);
near(row(glassResult, 'shear').demand, 3.027);
const glassEI = 70000 * 100 * (30 ** 3 / 12);
near(row(glassResult, 'deflection').demand, 5 * 0.05 * 800 ** 4 / (384 * glassEI) + 2000 * 800 ** 3 / (48 * glassEI));
for (const changes of [{ glassResidualBasis: '' }, { glassDeflectionThicknessMm: 400 }, { glassStressThicknessMm: 50 }, { effectiveWidthMm: 300 }])
  assert.equal(test('glass', changes).status, 'open');
const grating = test('grating');
near(row(grating, 'shear').demand, 3 + 1.35 * 0.5 * 0.033 * 0.8 / 2);
near(row(grating, 'bending').limit, 310 * 8 * 40 ** 2 / 6 / 1e6);
const barEI = 210000 * 8 * 40 ** 3 / 12, barGA = (5 / 6) * (210000 / 3) * 8 * 40;
near(row(grating, 'deflection').demand, 5 * 0.0165 * 800 ** 4 / (384 * barEI) + 0.0165 * 800 ** 2 / (8 * barGA)
  + 2000 * 800 ** 3 / (48 * barEI) + 2000 * 800 / (4 * barGA));
assert.equal(test('grating', { barWidthMm: 40 }).status, 'open');
const clt = test('clt');
const Wg = 5 * 0.05 * 800 ** 4 / (384 * 15e9) + 0.05 * 800 ** 2 / (8 * 650000);
const Wp = 2000 * 800 ** 3 / (48 * 15e9) + 2000 * 800 / (4 * 650000);
near(row(clt, 'deflection').demand, 1.8 * Wg + 1.24 * Wp);
near(row(clt, 'bending').limit, 1.2);
near(row(clt, 'shear').limit, 5);
assert.equal(test('clt', { cltGA: 0 }).status, 'open');
assert.equal(test('clt', { cltPsi2: 1.1 }).status, 'open');
const local = { supportDetailMode: 'bearing', supportDetailSource: 'Rapport opleg', supportDetailRevision: '1',
  supportDetailGeometry: 'Randtoleranties en oplegzone', bearingContactLengthMm: 100, bearingContactWidthMm: 20, bearingPressureRd: 2 };
const bearing = test('glass', local);
assert.equal(bearing.status, 'pass', JSON.stringify(bearing.reasons));
near(row(bearing, 'bearing-pressure').demand, pointConnection * 1000 / 2000);
assert.equal(test('glass', { ...local, supportDetailSource: '' }).status, 'open');
assert.equal(test('glass', { ...local, bearingPressureRd: 1 }).status, 'fail');
assert.equal(test('glass', { ...local, supportDetailMode: 'fasteners' }).status, 'open');
const series = { ...local, supportDetailMode: 'series', supportSeriesPath: 'Opleg naar console via bout aan kolom',
  fastenerCount: 2, fastenerMaxFactor: 0.6, fastenerShearRd: 2, fastenerGroupRd: 6 };
assert.equal(test('grating', series).status, 'pass');
assert.equal(test('grating', { ...series, fastenerMaxFactor: 0.49 }).status, 'open');
assert.equal(test('clt', { ...series, fastenerShearRd: 1 }).status, 'fail');
const winderModel = { ...model, stair: { ...model.stair, type: 'quarter_winder' } };
assert.equal(test('glass', {}, generateStairGeometry(winderModel.stair), winderModel).status, 'open');
const badContour = structuredClone(geometry);
badContour.treads[0].points[0].x += 20;
assert.equal(test('glass', {}, badContour).status, 'open');
const invalidModel = { ...model, stair: { ...model.stair, width: 300, stringerThickness: 150 } };
assert.equal(test('glass', { spanMm: 1, pointPatchLengthMm: 1 }, generateStairGeometry(invalidModel.stair), invalidModel).status, 'open');
console.log('Drie materialen, twee lastposities voor P, q maatgevend, UGT/BGT, opleggingen, lokale capaciteit, kruip en geometriegrenzen gecontroleerd.');
