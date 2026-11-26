import assert from 'node:assert/strict';
import { loft } from '../src/components/loft.js';
import { boundsOf, box } from '../src/components/solids.js';
import { motionWarnings } from '../src/stairwell-sweep.js';
import { assembleWell, emptyWell, newInstance } from '../src/stairwell.js';

const epsilon = 1e-5;
const phases = ['packed', 'hatch-open', 'half', 'open'];
const models = Object.fromEntries(phases.map(pose => [pose, loft.build({pose})]));
const {open, packed} = models;
const get = (model, id) => model.parts.find(p => p.id === id);
const metric = (model, label) => model.metrics.find(m => m.label === label).value;
const close = (a,b,tol=epsilon) => assert.ok(Math.abs(a-b) <= tol, `${a} differs from ${b}`);
const unique = p => {
  const coordinates = new Map(p.faces.flat().map(v => [[v.x,v.y,v.z].map(x => x.toFixed(6)).join(','), v]));
  return [...coordinates.values()];
};
const centre = p => {
  const points = unique(p);
  return Object.fromEntries(['x','y','z'].map(key => [key,points.reduce((s,q) => s+q[key],0)/points.length]));
};
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// Integral of tetrahedral volumes plus edge pairing verifies solid topology and orientation.
function volume(p) {
  const edges = new Map();
  const first = p.faces[0][0];
  const relative = v => [v.x-first.x,v.y-first.y,v.z-first.z];
  const key = v => relative(v).map(n => Math.round(n*1e6)).join(',');
  let vol = 0;
  for (const face of p.faces) {
    const a = relative(face[0]);
    for (let i=0; i<face.length; i++) {
      const from = key(face[i]), to = key(face[(i+1)%face.length]);
      assert.notEqual(from,to,p.id);
      const edge = [from,to].sort().join('/');
      const counts = edges.get(edge) || [0,0];
      counts[from < to ? 0 : 1]++;
      edges.set(edge,counts);
    }
    for (let i=1;i<face.length-1;i++) {
      const b = relative(face[i]), c = relative(face[i+1]);
      vol += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    }
  }
  for (const value of edges.values()) assert.deepEqual(value,[1,1],p.id);
  assert.ok(vol > 0, p.id);
  return vol;
}
assert.equal(open.parts.filter(p => p.kind === 'tread').length,12);
assert.equal(new Set(open.parts.map(p => p.id)).size,open.parts.length);
const baseVolume = new Map(open.parts.map(p => [p.id,volume(p)]));
for (const m of Object.values(models)) {
  assert.deepEqual(m.sweepZone,open.sweepZone);
  assert(m.parts.every(p => p.moves === !/^(case-|anchor-)/.test(p.id)));
  assert.equal(m.issues.filter(i => i.level !== 'info').length,0);
  assert.deepEqual(m.parts.map(p => p.id),open.parts.map(p => p.id));
  for (const p of m.parts) {
    const v = volume(p);
    if (!p.id.startsWith('rod-')) close(v,baseVolume.get(p.id),v*1e-7);
  }
  for (const i of [1,2]) for (const side of ['L','R']) {
    const pin = `pin-${i}-${side}`;
    for (const leaf of [0,1]) {
      const plate = `leaf-${i}-${side}-${leaf}`;
      close(distance(centre(get(open,pin)),centre(get(open,plate))),distance(centre(get(m,pin)),centre(get(m,plate))));
    }
  }
}
close(boundsOf([get(open,'shoe-L')]).zmin,0);
close(boundsOf([get(open,'shoe-R')]).zmin,0);
for (const p of open.parts.filter(p => p.kind === 'tread')) {
  const levels = [...new Set(unique(p).map(v => Math.round(v.z*1e5)))];
  assert.equal(levels.length,2);
  close(Math.abs(levels[0]-levels[1])/1e5,19);
}
close(metric(open,'Vrije plafondhoogte'),2700);
close(metric(open,'Opbouw boven afgewerkte bovenvloer'),boundsOf(packed.parts).zmax-2880);
close(metric(open,'Overstap bovenste trede naar vloer'),2880-boundsOf([get(open,'tread-1')]).zmax);

// Reconstruct the complete motion independently from the produced meshes and pin centres.
const turn = (v,o,a) => ({x:o.x+(v.x-o.x)*Math.cos(a)+(v.z-o.z)*Math.sin(a),
  z:o.z-(v.x-o.x)*Math.sin(a)+(v.z-o.z)*Math.cos(a)});
const pin1 = centre(get(open,'pin-1-L')), pin2 = centre(get(open,'pin-2-L'));
const lidPin = centre(get(packed,'lid-hinge-L')), alpha = 68*Math.PI/180;
const moving = p => !/^(case-|barrel-|rod-|anchor-|lug-)/.test(p.id);
const middleIds = /^(rail-2-|tread-[5-8]$|pin-2-|leaf-1-.-1$|leaf-2-.-0$)/;
const lowerIds = /^(rail-3-|tread-(9|10|11|12)$|leaf-2-.-1$|shoe-)/;
const vertices = model => model.flatMap(unique);
const packedPoints = vertices(packed.parts.filter(moving));
const middlePoints = vertices(open.parts.filter(p => middleIds.test(p.id)));
const lowerPoints = vertices(open.parts.filter(p => lowerIds.test(p.id)));
let maxX = Math.max(...vertices(open.parts.filter(moving)).map(p => p.x)), minX = Infinity, minZ = Infinity, maxZ = -Infinity;
function record(x,z) {
  maxX=Math.max(maxX,x); minX=Math.min(minX,x);
  maxZ=Math.max(maxZ,z); minZ=Math.min(minZ,z);
}
for (let i=0;i<=900;i++) {
  const u=i/900, a=(u-1)*Math.PI, k=turn(pin2,pin1,a);
  for (const v of packedPoints) {
    const q=turn(v,lidPin,u*alpha);
    record(q.x,q.z);
  }
  for (const v of middlePoints) {
    const q=turn(v,pin1,a);
    record(q.x,q.z);
  }
  for (const v of lowerPoints) {
    record(v.x+k.x-pin2.x,v.z+k.z-pin2.z);
  }
}
close(maxX,metric(open,'Bedieningsruimte vanaf achterrand sparing'),0.02);
assert.ok(minX>=Math.min(...open.sweepZone.polygon.map(p=>p.x))-epsilon);
assert.ok(minZ>=open.sweepZone.zmin-epsilon && maxZ<=open.sweepZone.zmax+epsilon);
const outline = packed.guides.find(g => g.label.includes('Bewegingsenvelop'));
assert.ok(outline && outline.points.length === 5);
close(Math.min(...outline.points.map(v=>v.x)),0);
close(Math.max(...outline.points.map(v=>v.x)),metric(open,'Bedieningsruimte vanaf achterrand sparing'));
assert.deepEqual(outline,open.guides.find(g => g.label.includes('Bewegingsenvelop')));
assert.ok(minZ > -epsilon,'De ontvouwende ladder doorsnijdt de ondervloer');
for (const [change,text] of [
  [{openingLength:900},'voorbij'],[{openingLength:1100},'kantelen'],
  [{ladderWidth:630},'zijruimte'],[{freeRun:1600},'obstakel'],[{freeAbove:50},'opberghoogte'],[{height:1200},'ondervloer']
]) assert(loft.build(change).issues.some(i => i.level==='error' && i.text.includes(text)));
for (const change of [{height:0},{pose:'onbekend'},{rungsPerSegment:3.5},{angle:NaN}])
  assert.equal(loft.build(change).parts.length,0);
assert.equal(loft.build({rungsPerSegment:3}).parts.filter(p=>p.kind==='tread').length,9);
assert.ok(loft.build({slabThickness:420}).issues.some(i => i.text.toLowerCase().includes('overstap')));

const well={storeyHeight:2880,heights:{0:3600,1:3400}};
function fixture(model,mark,x=0,y=0,rotation=0,storey=0) {
  const t=rotation*Math.PI/180, c=Math.cos(t), s=Math.sin(t);
  const elevation = [0,3600,7000][storey];
  const toWorld = p=>({x:x+c*p.x-s*p.y,y:y+s*p.x+c*p.y,z:p.z+elevation});
  const parts = model.parts.map(p=>({...p,faces:p.faces.map(f=>f.map(toWorld))}));
  return {instance:{mark,x,y,rotation,storey},parts,bounds:boundsOf(parts),
    partBounds:parts.map(p=>boundsOf([p])),sweepZone:model.sweepZone,issues:[]};
}
function obstacle(x,y,z) {
  return {parts:[{label:'Proefobstakel',faces:box(x-3,y-3,z-3,x+3,y+3,z+3)}]};
}
function expectWarning(a,b,expected) {
  motionWarnings([a,b],well);
  assert.equal(a.issues.length,expected?1:0);
  assert.deepEqual(a.issues,b.issues);
  if(expected) assert.match(a.issues[0].text,/bedieningsomhullend.+mogelijk/i);
}
// This point actually lies inside a foot in the intermediate state and
// beyond every visible solid's X-extents in either end position.
const shoe=centre(get(models.half,'shoe-R'));
assert(shoe.x>boundsOf(open.parts).xmax && shoe.x>boundsOf(packed.parts).xmax);
for (const model of Object.values(models)) {
  for (const rotation of [0,45,90,-120]) {
    expectWarning(fixture(model,'VZ-01',131,702,rotation,1),
      fixture(obstacle(shoe.x,shoe.y,shoe.z),'SP-01',131,702,rotation,1),true);
  }
  expectWarning(fixture(model,'VZ-01'),fixture(obstacle(shoe.x,shoe.y,shoe.z),'SP-01',0,0,0,1),false);
  expectWarning(fixture(model,'VZ-01',0,0,45),fixture(obstacle(80,1300,1000),'SP-01'),false);
  expectWarning(fixture(model,'VZ-01'),fixture(packed,'VZ-02',3650,0,180),true);
  expectWarning(fixture(model,'VZ-01'),fixture(packed,'VZ-02',4100,0,180),false);
}
// Nonstandard storey datums affect low obstacles immediately above/below
// the envelope. Assembly bounds enclosing empty air must not cause a hit.
expectWarning(fixture(packed,'VZ-01',0,0,0,1),fixture(obstacle(1700,0,3602),'BT-01'),true);
expectWarning(fixture(packed,'VZ-01',0,0,0,1),fixture(obstacle(1700,0,3550),'BT-01'),false);
const gap = {parts:[...obstacle(1700,-1000,1250).parts,...obstacle(1700,1000,1250).parts]};
expectWarning(fixture(open,'VZ-01'),fixture(gap,'BT-01'),false);
const project={...emptyWell,slabThickness:180,instances:[]};
const ladder={...newInstance('loft',project),x:500,y:1700};
const spiral={...newInstance('spiral',project),x:2920,y:1700};
for (const pose of phases) {
  const current={...project,instances:[{...ladder,params:{...ladder.params,pose}},spiral]};
  const assembled=assembleWell(current);
  for(const a of assembled) {
    const warnings=a.issues.filter(i=>/bedieningsomhullend/i.test(i.text));
    assert.equal(warnings.length,1,`${pose} / ${a.instance.mark}`);
    assert.match(warnings[0].text,/VZ-01.+SP-01/);
  }
  if (pose==='open' || pose==='packed') assert(assembled[0].bounds.xmax<assembled[1].bounds.xmin);
}
console.log('Vlizotrap gecontroleerd: vier standen, 55 gesloten solids, vaste scharnierassen, vloercontact, analytische uitzwaai en mogelijke botsingen tijdens ontvouwen in gebouwcoördinaten.');
