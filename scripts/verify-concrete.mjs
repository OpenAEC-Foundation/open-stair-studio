import assert from 'node:assert/strict';
import { concrete } from '../src/components/concrete.js';

const near = (a,b) => assert(Math.abs(a-b)<Math.max(1e-7,Math.abs(b)*1e-10), `${a} != ${b}`);
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const key = ({x,y,z}) => [x,y,z].map(v=>Math.round(v*1e7)).join(',');
function verifyMouldOutline(points, id) {
  const turn=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const sameSide=(x,y)=>x>1e-7&&y>1e-7 || x< -1e-7&&y< -1e-7;
  const separated=(a,b,c,d)=>Math.max(a,b)<Math.min(c,d)-1e-7 || Math.max(c,d)<Math.min(a,b)-1e-7;
  for(let i=0;i<points.length;i++) for(let j=i+2;j<points.length;j++) {
    if(i===0&&j===points.length-1) continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    if(separated(a.x,b.x,c.x,d.x)||separated(a.z,b.z,c.z,d.z)) continue;
    assert(sameSide(turn(a,b,c),turn(a,b,d)) || sameSide(turn(c,d,a),turn(c,d,b)),
      id+' has crossing or overlapping mould edges '+i+', '+j);
  }
}
function shellVolume(part) {
  const edges = new Map();
  let volume = 0;
  if(part.material==='concrete') verifyMouldOutline(part.faces[0],part.id);
  for (const face of part.faces) {
    assert(face.length>=3);
    for (let i=0;i<face.length;i++) {
      const a=key(face[i]), b=key(face[(i+1)%face.length]);
      assert.notEqual(a,b,part.id);
      const k=[a,b].sort().join('|'), d=a<b ? 1 : -1;
      const [count,sum]=edges.get(k)??[0,0];
      edges.set(k,[count+1,sum+d]);
    }
    for (let i=1;i+1<face.length;i++) volume+=dot(face[0],cross(face[i],face[i+1]))/6;
  }
  assert([...edges.values()].every(([count,sum])=>count===2&&sum===0),part.id+' has an open or reversed edge');
  assert(volume>0,part.id+' has nonpositive volume');
  return volume/1e9;
}
for(const height of [1500,2880,3100,4200]) for(const headShoulder of [25,70,220]) {
  for(const bevel of [0,5,20]) for(const nosing of [0,18,50]) {
    const m=concrete.build({height,headShoulder,bevel,nosing,guards:'none'});
    for(const p of m.parts.filter(part=>part.kind==='flight')) verifyMouldOutline(p.faces[0],p.id);
  }
}
for (const layout of ['return','straight']) for (const risers of [15,16]) {
  for (const base of ['precast','host']) for (const finish of ['cast','inlay']) {
    const m=concrete.build({layout,risers,base,finish});
    assert(!m.issues.some(x=>x.level==='error'));
    assert.equal(new Set(m.parts.map(p=>p.id)).size,m.parts.length);
    let v=0;
    for (const part of m.parts) {
      const volume=shellVolume(part);
      if (part.material==='concrete') { near(volume,part.volumeM3); v+=volume; }
    }
    near(v,m.metrics.find(x=>x.label==='Betonvolume').value);
    near(v*2450,m.metrics.find(x=>x.label==='Elementmassa beton').value);
    const landings = (layout==='return' ? 2 : 1) + (base==='precast' ? 1 : 0);
    assert.equal(m.parts.filter(p=>p.kind==='landing').length,landings);
    assert.equal(m.parts.filter(p=>p.label==='Verzonken contraststrip').length,
      finish==='inlay' ? risers-(layout==='return'?2:1) : 0);
  }
}
// Independent no-nose, no-chamfer longitudinal section. Inter-step fill
// above the valley line is a half-riser on average along the open run.
const simple=concrete.build({height:2880,layout:'straight',risers:16,nosing:0,bevel:0,finish:'cast',guards:'none'});
const vflight=simple.parts.find(p=>p.id==='vlucht-1').volumeM3;
const verticalWaist=150*Math.hypot(1,180/260);
const expected=(15*260*(180/2+verticalWaist)+2*145*90+70*(180+verticalWaist)-180/260*70**2/2)*1200/1e9;
near(vflight,expected);
const mid=concrete.build({});
const pts=id=>mid.parts.find(p=>p.id===id).faces.flat();
const range=(id,axis)=>[Math.min(...pts(id).map(v=>v[axis])),Math.max(...pts(id).map(v=>v[axis]))];
for (const id of ['vlucht-1-bovenstrip','vlucht-2-onderstrip']) {
  assert.deepEqual(range(id,'z'),[1340,1350]);
  assert.deepEqual(range(id,'x'),[1933,2038]);
}
assert.deepEqual(range('tussenbordes','z'),[1210,1440]);
const plain=concrete.build({finish:'cast'});
near(plain.metrics.find(m=>m.label==='Betonvolume').value-mid.metrics.find(m=>m.label==='Betonvolume').value,
  14*30*4*1200/1e9);
for (const bad of [{height:-1},{height:NaN},{width:Infinity},{risers:7.5},{layout:'turn'},
  {landingThickness:105,nib:100,pad:10},{tongue:80,joint:20,setback:30},{nib:199,waist:80}]) {
  const m=concrete.build(bad);
  assert(!m.parts.length);
  assert(m.issues.some(i=>i.level==='error'));
}
console.log('Prefab beton: 16 configuraties, gesloten vlakken, onafhankelijke massa, sponningen, opstappen en oplegcontact gecontroleerd.');
