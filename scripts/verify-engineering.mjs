import assert from 'node:assert/strict';
import {
  defaultEngineering, deriveEngineering, engineeringUses, structureTypes, supportTypes, validateEngineeringField
} from '../src/engineering.js';

const model = {
  project: { number: 'ENG-01' }, stair: { floorHeight: 2880, width: 1000 },
  regulatory: { profile: 'NL_NEW_GENERAL' }
};
const geometry = { treads: [{}, {}, {}] };
const derive = changes => deriveEngineering({ ...model, engineering: { ...defaultEngineering, ...changes } }, geometry);
const baseline = deriveEngineering(model, geometry);
assert.deepEqual(baseline, derive({}));
assert.equal(baseline.geometry.overallWidthMm, 1000);
assert.equal(baseline.geometry.treadCount, 3);
assert.equal(baseline.cases.length, 0);
assert(Object.isFrozen(defaultEngineering));
assert.equal(validateEngineeringField('spanMm', null), null);
assert.equal(validateEngineeringField('loadPoint', 0), 0);
for (const [key, value] of [
  ['loadArea', -1], ['loadPoint', Infinity], ['loadArea', '3.5'], ['spanMm', 0], ['spanMm', Number.MAX_VALUE],
  ['support', 'fixed'], ['use', true], ['structureType', 'iron'], ['structureType', 'toString'],
  ['productBasis', {}], ['notes', null], ['peakLoad', 4]
]) assert.throws(() => validateEngineeringField(key, value));

const inputs = { support: 'two-edge', spanMm: 2400, loadArea: 5, loadPoint: 9 };
const { cases } = derive(inputs);
assert.equal(cases.length, 2);
const near = (n, want) => assert(Math.abs(n - want) < 1e-10, `${n} vs ${want}`);
near(cases[0].moment, 3.6);
near(cases[0].reaction, 6);
assert.equal(cases[0].momentUnit, 'kN·m/m');
assert.equal(cases[0].reactionUnit, 'kN/m');
near(cases[1].moment, 5.4);
near(cases[1].reaction, 4.5);
assert.equal(cases[1].momentUnit, 'kN·m');
assert.equal(cases[1].reactionUnit, 'kN');
assert.deepEqual(derive({ ...inputs, loadPoint: null }).cases.map(c => c.id), ['area']);
assert.deepEqual(derive({ ...inputs, loadArea: null }).cases.map(c => c.id), ['point']);
assert.deepEqual(derive({ ...inputs, loadPoint: 0 }).cases[1].reaction, 0);
assert.deepEqual(derive({ ...inputs, spanMm: null }).cases, []);
for (const { id } of supportTypes.filter(s => s.id !== 'two-edge')) {
  assert.deepEqual(derive({ ...inputs, support: id }).cases, []);
}
for (const { id: material } of structureTypes) {
  for (const { id: use } of engineeringUses) {
    const result = derive({ ...inputs, structureType: material, use });
    assert.deepEqual(result.cases, cases);
    assert(result.productHint.length > 0 && result.checks.length >= 3);
    assert.equal(result.missing.some(s => s.includes('bijzondere constructieprincipe')), material === 'custom');
    assert.equal(result.sources.some(s => s.url.includes('iplo.nl')), use !== 'regular');
    assert.equal(result.missing.some(s => s.includes('Bbl-maatprofiel')), use === 'escape-only');
    assert.equal(result.checks.some(s => s.includes('routecapaciteit')), use !== 'regular');
    for (const source of result.sources) assert(new URL(source.url).protocol === 'https:');
  }
}
for (const use of ['regular', 'escape', 'escape-only']) {
  const result = deriveEngineering({
    ...model, regulatory: { profile: 'NL_NEW_EGRESS' }, engineering: { ...defaultEngineering, use }
  }, geometry);
  assert.equal(result.missing.some(s => s.includes('Bbl-maatprofiel')), use !== 'escape-only');
}
const complete = derive({ ...inputs, structureType:'custom', use:'escape', customDescription:'Spanten in staal',
  productBasis:'Plaat en ribben', sourceProduct:'Tekening S01 rev. 2', arrangement:'Twee evenwijdige opleglijnen',
  escapeBasis:'Bezettingsstaat en vluchtrouteplan VO-08'
});
assert.deepEqual(complete.missing, []);
assert(complete.checks.length > 0);
console.log('Engineeringdossier: vijf tredesystemen × drie gebruiksdoelen, vijf opleggingen, twee onafhankelijke lastgevallen, eenheden, open punten en documentbronnen gecontroleerd.');
