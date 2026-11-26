import assert from 'node:assert/strict';
import { checkSupportDetail, supportDetailFields, supportFieldVisible, supportModeOptions } from '../src/support-detail.js';

const tread = { width: 900, length: 280 };
const base = {
  structureType: 'clt', support: 'two-edge', supportDetailMode: 'series',
  supportDetailSource: 'Rekenblad verbinding D-2', supportDetailRevision: 'B', supportDetailGeometry: 'Geldige randpositie en contactzone, groep volgens detail D-2',
  supportSeriesPath: 'Trede op console, console met boutgroep aan wand', bearingContactWidthMm: 30,
  bearingContactLengthMm: 100, bearingPressureRd: 2, fastenerCount: 4, fastenerMaxFactor: 0.7,
  fastenerShearRd: 4.2, fastenerGroupRd: 6
};
const run = (changes = {}, reaction = 6, dimensions = tread) => checkSupportDetail({ ...base, ...changes }, reaction, dimensions);
const row = (result, id) => result.rows.find(r => r.id === id);
assert.deepEqual(checkSupportDetail({}, 1, tread), { rows: [], reasons: [] });
assert.deepEqual(run({ supportDetailMode: 'whole' }), { rows: [], reasons: [] });
assert.equal(supportDetailFields.find(f => f.key === 'supportDetailMode').default, 'whole');

const series = run();
assert.deepEqual(series.reasons, []);
assert.deepEqual(series.rows.map(r => r.id), ['bearing-pressure', 'fastener-shear', 'fastener-group']);
assert(series.rows.every(r => r.status === 'pass'));
assert.equal(row(series, 'bearing-pressure').demand, 2);
assert.equal(row(series, 'bearing-pressure').ratio, 1);
assert(Math.abs(row(series, 'fastener-shear').demand - 4.2) < 1e-12);
assert.equal(row(series, 'fastener-group').demand, 6);

for (const system of ['glass', 'clt', 'grating']) {
  const result = run({ supportDetailMode: 'bearing', structureType: system, bearingContactLengthMm: 75 });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, 'fail');
  assert.equal(result.rows[0].demand, 6e3 / (30 * 75));
}
const concentrated = run({ supportDetailMode: 'fasteners', fastenerMaxFactor: 1.5, fastenerShearRd: 8 });
assert.equal(row(concentrated, 'fastener-shear').demand, 9);
assert.equal(row(concentrated, 'fastener-shear').status, 'fail');
assert.equal(row(concentrated, 'fastener-group').status, 'pass');
assert.equal(row(run({ fastenerGroupRd: 5.9 }), 'fastener-group').status, 'fail');
assert.equal(row(run({ fastenerMaxFactor: 0.25 }), 'fastener-shear').status, 'pass');

for (const wrong of [{ fastenerMaxFactor: 0.24999 }, { fastenerMaxFactor: null }, { fastenerMaxFactor: Infinity },
  { fastenerCount: 3.5 }, { fastenerCount: 0 }, { fastenerCount: Number.MAX_SAFE_INTEGER + 1 }]) {
  const invalid = run(wrong);
  assert.equal(row(invalid, 'fastener-shear').status, 'open');
  assert(invalid.reasons.length);
}
for (const wrong of [{ bearingContactWidthMm: 451 }, { bearingContactLengthMm: 281 }, { bearingContactLengthMm: 0 },
  { bearingContactWidthMm: null }, { bearingPressureRd: NaN }, { bearingPressureRd: -1 },
  { bearingPressureRd: Number.MIN_VALUE }]) {
  const invalid = run(wrong);
  assert.equal(row(invalid, 'bearing-pressure').status, 'open');
  assert.equal(row(invalid, 'bearing-pressure').ratio, null);
  assert(invalid.reasons.length);
}
for (const missing of ['supportDetailSource', 'supportDetailRevision', 'supportDetailGeometry', 'supportSeriesPath']) {
  const invalid = run({ [missing]: '  ' });
  assert(invalid.rows.every(r => r.status === 'open'));
  assert(invalid.reasons.length);
}
assert.equal(row(run({ supportDetailSource: '', fastenerShearRd: 1 }), 'fastener-shear').status, 'fail');
assert(run({ support: 'cantilever' }).rows.every(r => r.status === 'open'));
for (const invalidGeometry of [null, { ...tread, width: 0 }, { ...tread, isWinder: true }]) {
  assert(run({}, 6, invalidGeometry).rows.every(r => r.status === 'open'));
}
for (const reaction of [-1, Infinity, NaN]) assert(run({}, reaction).rows.every(r => r.status === 'open'));
assert(run({}, 0).rows.every(r => r.demand === 0 && r.status === 'pass'));
assert(run({ supportDetailMode: 'unknown' }).reasons.length);
for (const mode of ['series', 'fasteners']) {
  const unsupported = run({ structureType: 'glass', supportDetailMode: mode });
  assert(!unsupported.rows.some(r => r.status === 'pass'));
  assert(unsupported.reasons.some(s => s.includes('glas')));
}
assert.deepEqual(supportModeOptions({ structureType: 'glass' }).map(([id]) => id), ['whole', 'bearing']);
for (const [mode, expected] of [['whole', 1], ['bearing', 7], ['fasteners', 8], ['series', 12]]) {
  const input = { ...base, supportDetailMode: mode };
  assert.equal(supportDetailFields.filter(f => supportFieldVisible(f, input)).length, expected);
}
console.log('Oplegdruk, maatgevende kracht per bevestiger, groepsweerstand, serieniveau en open gegevens gecontroleerd.');
