import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyWell, assembleWell, newInstance, readWell, heightOn, elevationOf } from '../src/stairwell.js';
import { editWell, readProject, startSession, undoSession, redoSession } from '../src/project.js';
import { starterProject } from '../src/stair.js';

const sample=name=>JSON.parse(readFileSync(new URL('../examples/'+name+'.oss.json',import.meta.url),'utf8'));
for (const name of ['trappenhuis-beton','trappenhuis-spil','trappenhuis-vlizotrap']) {
  const model=readProject(sample(name));
  const a=assembleWell(model.stairwell);
  assert(a.every(v=>v.parts.length>40 && v.bounds && !v.issues.some(i=>i.level==='error')));
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(model))),model);
}
const legacy=readProject(sample('rekenvoorbeeld-clt'));
assert.deepEqual(legacy.stairwell,emptyWell);
assert.equal(legacy.stair.railSide,'none');
assert.equal(legacy.stair.riserBoards,'none');
const project=readProject(sample('trappenhuis-beton'));
const well=project.stairwell;
assert.equal(heightOn(well,0),3040);
assert.equal(elevationOf(well,2),5920);
const first=well.instances[0];
const copy=newInstance(first.type,well,2,first);
assert.equal(copy.x,first.x);
assert.equal(copy.rotation,first.rotation);
assert.notEqual(copy.id,first.id);
assert.equal(copy.mark,'BT-03');
const session=editWell(startSession(project),{...well,instances:[...well.instances,copy]});
assert.equal(session.model.stairwell.instances[0],first);
assert.deepEqual(undoSession(session).model,project);
assert.equal(redoSession(undoSession(session)).model.stairwell.instances.length,3);
const overlapped={...copy,storey:first.storey};
assert(assembleWell({...well,instances:[first,overlapped]}).every(a=>a.issues.some(i=>i.text.includes('Onderdeelomhullenden overlappen'))));
assert.throws(()=>readWell({...well,instances:[first,{...copy,mark:first.mark.toLowerCase()}]}));
assert.throws(()=>readWell({...well,instances:[first,{...copy,id:first.id}]}));
assert.throws(()=>readWell({...well,heights:{'2':well.slabThickness}}));
assert.throws(()=>readWell({...well,instances:[{...first,storey:.5}]}));
assert.equal(starterProject.stairwell.instances.length,0);
console.log('Trappenhuizen, bouwlaagpeilen, plaatsing, merken, overlap, oude dossiers en undo/redo gecontroleerd.');
