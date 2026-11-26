import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readProject} from '../src/project.js';
import {assembleComponent} from '../src/stairwell.js';
import {connectionDrawing} from '../src/connection-drawing.js';

const source=new URL('../examples/rekenvoorbeeld-trapverbindingen.oss.json',import.meta.url);
const {stairwell:well}=readProject(JSON.parse(readFileSync(source,'utf8')));
const samples=[
  ['glass','kop-L','x',2,[58.56,0]],
  ['cantilever','trede-01-wandplaat-1','y',4,[211,82]],
  ['steel','vlucht-1-voet-L','z',4,[64,54]],
  ['escape','keerbordes-voet-1','z',4,[94,94]]
];
for(const [family,id,axis,count,distances] of samples) {
  const instance=well.instances.find(i=>i.type===family);
  const initial=assembleComponent(instance,well);
  const connection=initial.structural.connections.find(c=>c.id===id);
  const drawing=connectionDrawing(initial,well,connection);
  assert.equal(drawing.anchors.length,count);
  const plan=drawing.views[0];
  assert.equal(plan.normal,axis);
  assert.equal(plan.marks.length,count);
  for(const [index,k] of [plan.a,plan.b].entries()) {
    const values=drawing.anchors.map(a=>a.center[k]);
    assert.ok(Math.abs(Math.max(...values)-Math.min(...values)-distances[index])<1e-6,family+' '+k);
  }
  const moved=assembleComponent({...instance,rotation:33.3,x:7250,y:1600,storey:1},well);
  const relocated=connectionDrawing(moved,well,connection);
  for(const [index,anchor] of relocated.anchors.entries()) {
    assert.equal(anchor.axis,drawing.anchors[index].axis);
    for(const k of ['x','y','z'])assert.ok(Math.abs(anchor.center[k]-drawing.anchors[index].center[k])<1e-6);
  }
  for(const view of relocated.views)for(const line of view.lines)assert.ok(line.path&&!/Infinity|NaN/.test(line.path));
  const parts=new Set(initial.parts.map(p=>p.id)),checks=new Set(initial.structural.checks.map(c=>c.id));
  for(const c of initial.structural.connections) {
    assert.ok(c.partIds.length&&c.checkIds.length);
    assert.ok(c.partIds.every(p=>parts.has(p))&&c.focusIds.every(p=>c.partIds.includes(p))&&c.checkIds.every(key=>checks.has(key)),c.id);
  }
}
console.log('Glass, wall and steel anchor schedules, orientation, reference plane and drawing membership verified.');
