import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject, stairFamilies, elevationPath } from '../src/stair.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${label}: expected ${expected}, got ${actual}`);

function bounds(points, key) {
  const values = points.map(point => point[key]);
  return [Math.min(...values), Math.max(...values)];
}

function verifyLanding(stair, model) {
  const [first, second] = model.flights;
  const [landing] = model.landings;
  const firstEnd = first.origin.x + first.treadCount * stair.going;
  const [xmin, xmax] = bounds(landing.points, 'x');
  const [ymin, ymax] = bounds(landing.points, 'y');
  assert.ok(xmin <= firstEnd - stair.nosing + 1e-7, 'landing covers the incoming tread back');
  near(ymin, -stair.width / 2, 'incoming flight fits over full width');
  assert.ok(ymax >= stair.width / 2);
  near(landing.elevation, first.risers * model.dimensions.rise, 'landing level');
  const nextTread = model.treads.find(board => board.flightIndex === 1);
  near(nextTread.elevation - landing.elevation, model.dimensions.rise, 'departure rise');
  if (stair.type === 'quarter_turn') {
    assert.ok(second.origin.y - stair.nosing + stair.riserThickness <= ymax + 1e-7,
      'quarter-turn landing supports the outgoing riser');
    assert.ok(second.origin.x - stair.width/2 >= xmin - 1e-7 && second.origin.x + stair.width/2 <= xmax + 1e-7,
      'quarter-turn departure width lies on landing');
  } else if (stair.type === 'half_turn') {
    assert.ok(second.origin.x + stair.nosing - stair.riserThickness >= xmin - 1e-7,
      'return landing supports the outgoing riser');
    near(second.origin.y, ymax - stair.width / 2, 'return flight centring');
    assert.ok(xmax - xmin >= stair.landingLength, 'return landing depth');
    near(ymax - ymin, 2 * stair.width + stair.laneGap, 'return landing width');
  } else {
    assert.ok(second.origin.x - stair.nosing + stair.riserThickness <= xmax + 1e-7,
      'straight landing supports the outgoing riser');
    near(second.origin.y, (ymin + ymax) / 2, 'straight landing centring');
  }
}

function verifyBeam(beam, model, stair) {
  const { origin, axis, sideAxis, down } = beam.frame;
  const flight = model.flights[beam.flightIndex];
  const sideOffset = flight.direction.x * (origin.y - flight.origin.y)
    - flight.direction.y * (origin.x - flight.origin.x);
  assert.ok(sideOffset * (beam.id.endsWith('-L') ? 1 : -1) > 0, 'left/right viewed in ascending direction');
  const corners = [];
  for (const along of [0, beam.length]) {
    for (const across of [-beam.thickness / 2, beam.thickness / 2]) {
      for (const depth of [-beam.width / 2, beam.width / 2]) {
        corners.push({
          x: origin.x + axis.x * along + sideAxis.x * across + down.x * depth,
          y: origin.y + axis.y * along + sideAxis.y * across + down.y * depth,
          z: origin.z + axis.z * along + down.z * depth
        });
      }
    }
  }
  for (const key of ['x', 'y']) {
    const [lo, hi] = bounds(corners, key);
    const [loPlan, hiPlan] = bounds(beam.points, key);
    near(loPlan, lo, 'stringer plan minimum');
    near(hiPlan, hi, 'stringer plan maximum');
  }
  near(beam.length, (flight.treadCount+(flight.index>0?1:0)) * Math.hypot(stair.going, model.dimensions.rise), 'stringer pitch length');
  near(Math.max(...corners.map(p => p.z)),
    (flight.firstRiser + flight.risers) * model.dimensions.rise, 'stringer top landing elevation');
}

let count = 0;
for (const family of stairFamilies.filter(family => !family.winder)) {
  for (const risers of [4, 17, 18, 39]) {
    for (const landingLength of [975, 1430]) {
      const stair = { ...starterProject.stair, type: family.id, width: 925, stringerThickness: 47,
        going: 243, risers, laneGap: 137, landingLength };
      const model = generateStairGeometry(stair);
      const d = model.dimensions;
      near(d.pitch, Math.atan2(stair.floorHeight / risers, stair.going) * 180 / Math.PI, 'pitch angle');
      near(d.treadCount + model.landings.length + 1, risers, 'tread/landing/floor sequence');
      if (family.flights > 1) verifyLanding(stair, model);
      const landingWalk = family.flights > 1 ? landingLength : 0;
      const traverse = family.id === 'half_turn' ? stair.width + stair.laneGap : 0;
      near(d.totalRun, model.treads.length * stair.going + landingWalk + traverse, 'developed midline');
      for (const beam of model.stringers) verifyBeam(beam, model, stair);
      near(model.parts[0].width, stair.width - 2 * stair.stringerThickness, 'parts list clear tread width');
      for (const part of model.parts) {
        near(part.volume, part.length * part.width * part.thickness * part.quantity / 1e9, part.id);
      }
      assert.ok(model.isoFaces.every(face => !/NaN|Infinity/.test(face.points)), 'finite projected faces');
      const tops = model.isoFaces.filter(face => face.type === 'top');
      assert.equal(tops.length, model.treads.length, 'every tread has an upward-facing polygon');
      for (const top of tops) {
        const [a, b, c] = top.points.split(' ').map(pair => pair.split(',').map(Number));
        assert.ok((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]) < 0,
          'upper surfaces preserve world XY orientation in screen coordinates');
      }
      const path = elevationPath(stair).match(/-?\d+(?:\.\d+)?/g).map(Number);
      near(path[0], 105, 'section base x');
      near(path[1], 410, 'section base y');
      near(path.at(-2), 688, 'section floor x');
      near(path.at(-1), 105, 'section floor y');
      count++;
    }
  }
}
console.log(`Verified ${count} stair layouts, landing interfaces, beam envelopes, quantities and section endpoints.`);
