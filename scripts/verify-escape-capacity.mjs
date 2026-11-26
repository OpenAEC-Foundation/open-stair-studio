import assert from 'node:assert/strict';
import { starterProject, generateStairGeometry } from '../src/stair.js';
import { deriveEngineering } from '../src/engineering.js';
import { editSession, startSession, undoSession } from '../src/project.js';
import { goingBandWidth } from '../src/going-band.js';

function assess(eng = {}, stair = {}, regulatory = {}) {
  const model = structuredClone(starterProject);
  Object.assign(model.stair, { type: 'straight', risers: 8 }, stair);
  Object.assign(model.regulatory, { profile: 'NL_NEW_GENERAL' }, regulatory);
  Object.assign(model.engineering, { use: 'escape', escapeFunction: 'listed', escapePersons: 36,
    escapeWidth: 800, escapeBasis: 'Bezettingsstaat X / rev 1', ...eng });
  return deriveEngineering(model, generateStairGeometry(model.stair)).escape;
}
assert.equal(assess().status, 'pass');
assert.equal(assess({escapePersons:37}).status, 'fail');
assert.equal(assess({}, { floorHeight: 1000 }).capacity, 72);
assert.equal(assess({}, { floorHeight: 1000.01 }).capacity, 36);
assert.equal(assess({}, { going: 169.99 }).capacity, 0);
assert.equal(assess({}, { going: 170 }).capacity, 36);
assert.equal(assess({escapeWidth:799.99}).capacity, 35);
assert.equal(assess({escapeWidth:801}).status, 'open');
assert.equal(assess({escapeBasis:''}).status, 'open');
assert.equal(assess({escapePersons:null}).status, 'open');
assert.equal(assess({escapeSection:'room-door'}).capacity, null);
assert.equal(assess({}, {}, {profile:'NL_NEW_HOME'}).status, 'na');
assert.equal(assess({}, {}, {profile:'UNSET'}).status, 'open');
assert.equal(assess({}, {}, {construction:'existing'}).status, 'open');
assert.equal(assess({use:'escape-only'}).status, 'open');
for (const [door, rate] of [['double',90], ['single',110], ['other',135]]) {
  const r = assess({escapeDoor:door, escapeSection:'room-door', escapeDoorWidth:200, escapeRoomWidth:900});
  assert.equal(r.capacity, rate / 5);
  assert.deepEqual(r.governing, ['door']);
}
const front = [{x:0,y:0},{x:800,y:0}], normal = {x:0,y:1};
const contour = (a,b) => [...front,{x:800,y:b},{x:0,y:a}];
assert.equal(goingBandWidth(front,normal,contour(100,240),170),400);
assert.equal(goingBandWidth(front,normal,contour(170,170),170),800);
assert.equal(goingBandWidth(front,normal,contour(165,165),170),0);
for (const type of ['quarter_winder','half_winder']) {
  for (const outerShape of ['square','faceted']) {
    const stair = {type, outerShape, risers:18};
    const r = assess({escapeWinderWidth:800}, stair);
    const mirrored = assess({escapeWinderWidth:800}, {...stair,turnDirection:'right'});
    assert.equal(r.status,'open');
    assert(Math.abs(r.modelBandLimitMm - mirrored.modelBandLimitMm) < 1e-6);
    assert(r.modelBandLimitMm > 0 && r.modelBandLimitMm < 800);
    assert.equal(assess({escapePersons:1,escapeWinderWidth:Math.floor(r.modelBandLimitMm)}, stair).status,'pass');
  }
}
const project = structuredClone(starterProject);
assert.equal(assess({escapePersons:1,escapeWinderWidth:400}, {type:'quarter_winder', width:1000, going:170, windersPerQuarter:5, risers:18}).capacity,18);
Object.assign(project.engineering, {escapeWidth:730, escapeWinderWidth:500});
const edited = editSession(startSession(project), 'stair', 'going', 220);
assert.equal(edited.model.engineering.escapeWinderWidth,null);
assert.equal(undoSession(edited).model.engineering.escapeWinderWidth,500);
assert.equal(editSession(edited,'stair','width',1200).model.engineering.escapeWidth,null);
console.log('Doorstroomcapaciteit, grenswaarden, routeonderdelen, verdreven tredecontouren, maatwijziging en toepassingscontext gecontroleerd.');
