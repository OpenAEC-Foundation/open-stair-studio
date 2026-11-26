import assert from 'node:assert/strict';
import { spiral } from '../src/components/spiral.js';

const near = (actual, expected, eps = 1e-7) => assert(Math.abs(actual-expected) < eps, `${actual} vs ${expected}`);
const metric = (g, prefix) => g.metrics.find(m => m.label.startsWith(prefix))?.value;
const key = v => [v.x,v.y,v.z].map(n => Math.round(n*1e6)).join(',');

// Independently check directed uses of every edge, including bores, and
// signed volume in mm³. Shared coplanar triangles are allowed.
function closedVolume(part) {
  const edges = new Map();
  let volume = 0;
  for (const face of part.faces) {
    assert(face.length >= 3,part.id);
    for (let i = 0; i < face.length; i++) {
      assert([face[i].x,face[i].y,face[i].z].every(Number.isFinite),part.id);
      const a = key(face[i]), b = key(face[(i+1)%face.length]);
      assert.notEqual(a,b,part.id);
      const edge = a < b ? a+';'+b : b+';'+a;
      const uses = edges.get(edge) ?? [0,0];
      uses[a < b ? 0 : 1]++;
      edges.set(edge,uses);
    }
    const [a] = face;
    for (let i = 1; i+1 < face.length; i++) {
      const b = face[i], c = face[i+1];
      volume += a.x*(b.y*c.z-b.z*c.y) + a.y*(b.z*c.x-b.x*c.z) + a.z*(b.x*c.y-b.y*c.x);
    }
  }
  for (const counts of edges.values()) assert.deepEqual(counts,[1,1],part.id);
  assert(volume > 0,part.id+' outward volume');
  return volume/6;
}

const left = spiral.build({turn:'left'}), right = spiral.build({turn:'right'});
assert(left.issues.every(i => i.level === 'info'));
assert.equal(new Set(left.parts.map(p => p.id)).size,left.parts.length);
assert.equal(left.parts.filter(p => p.kind === 'tread').length,15);
assert.equal(left.parts.filter(p => p.kind === 'landing').length,1);
for (const [i, part] of left.parts.entries()) {
  assert.equal(right.parts[i].id,part.id);
  near(closedVolume(part),closedVolume(right.parts[i]),.001);
  for (const [j, face] of part.faces.entries()) {
    const mirrored = right.parts[i].faces[j].toReversed();
    for (const [k,v] of face.entries()) assert.deepEqual(mirrored[k],{x:v.x,y:-v.y,z:v.z});
  }
}
const topZ = part => Math.max(...part.faces.flat().map(p => p.z));
for (const [i,part] of left.parts.filter(p => p.kind === 'tread').entries()) near(topZ(part),(i+1)*180);
near(topZ(left.parts.find(p => p.id === 'landing')),2880);
near(metric(left,'Aantrede'),700*Math.tan(Math.PI/9));
near(metric(left,'Uittrede'),300);
near(metric(left,'Vrije draaihoogte'),2880-(5+126)-2*180);
const crowded = spiral.build({stepsPerTurn:14});
near(metric(crowded,'Vrije draaihoogte'),1849);
assert(crowded.issues.some(i => i.level === 'warning' && i.text.includes('onder bordes')));
const partial = spiral.build({height:1500,risers:8,stepsPerTurn:24,turn:'left'});
assert.equal(metric(partial,'Vrije draaihoogte'),undefined);
assert.match(metric(partial,'Overlapping'),/Geen/);
const heightChanged = spiral.build({height:3200});
near(topZ(heightChanged.parts.find(p => p.kind === 'landing')),3200);
near(metric(heightChanged,'Optrede'),200);
const falseMeasurements = [{height:150},{height:Infinity},{risers:3},{risers:10.2},{columnDiameter:0},
  {diameter:1000,walklineInset:475},{walklineInset:NaN},{turn:'clockwise'},{stepsPerTurn:0}];
for (const p of falseMeasurements) {
  const r = spiral.build(p);
  assert.equal(r.parts.length,0);
  assert(r.issues.some(i=>i.level==='error'));
}
console.log(`Spiltrap: ${left.parts.length} gesloten onderdelen per draairichting, gespiegelde volumes, bordesaansluiting, klimlijn, overlapping en ongeldige invoer gecontroleerd.`);
