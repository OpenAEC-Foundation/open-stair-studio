import assert from 'node:assert/strict';
import {concrete} from '../src/components/concrete.js';

const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} <> ${b}`);
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const key=p=>[p.x,p.y,p.z].map(v=>Math.round(v*1e6)).join(',');
const norm=p=>Math.sqrt(dot(p,p));
function readShell(part) {
  const edges=new Map(),unique=new Map(),origin=part.faces[0][0];
  let volume=0;
  for(const f of part.faces) {
    for(let i=0;i<f.length;i++) {
      const p=f[i],a=key(p),b=key(f[(i+1)%f.length]);
      assert.notEqual(a,b,part.id);
      const k=a<b?a+'|'+b:b+'|'+a;
      const edge=edges.get(k)??[0,0];edge[0]++;edge[1]+=a<b?1:-1;
      edges.set(k,edge);unique.set(a,p);
    }
    for(let i=1;i<f.length-1;i++)
      volume+=dot(sub(f[0],origin),cross(sub(f[i],origin),sub(f[i+1],origin)))/6;
  }
  assert([...edges.values()].every(([n,d])=>n===2&&d===0),part.id+' open shell');
  assert(volume>0,part.id+' inside out');
  return [...unique.values()];
}
function local(d,p) {
  const v=sub(p,d.axes.origin);
  return {x:dot(v,d.axes.x),y:dot(v,d.axes.y),z:v.z};
}
function fromEdge(x,z,[x1,z1],[x2,z2]) {
  const dx=x2-x1,dz=z2-z1;
  const t=Math.max(0,Math.min(1,((x-x1)*dx+(z-z1)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-x1-t*dx,z-z1-t*dz);
}
function inside(profile,x,z) {
  let contained=false;
  for(let i=0;i<profile.length;i++) {
    const [a,b]=profile[i],[c,d]=profile[(i+1)%profile.length];
    if((b>z)!==(d>z) && x<a+(c-a)*(z-b)/(d-b)) contained=!contained;
  }
  return contained;
}
const geometries=[{layout:'straight',guards:'none'},{layout:'return',base:'precast',height:3040},
  {layout:'return',base:'precast',risers:15,anchorSide:'highY',cover:32,mainDiameter:14,mainPitch:133,crossPitch:161},
  {layout:'return',width:550,going:185,anchorSide:'highY'}];
let checked=0;
for(const input of geometries) {
  const m=concrete.build({...input,detailing:'engineered'});
  const hosts=m.parts.filter(p=>p.detail),details=m.parts.filter(p=>p.parentId);
  assert(hosts.length);assert(details.length);
  const allIds=m.parts.map(p=>p.id);assert.equal(new Set(allIds).size,allIds.length);
  for(const host of hosts) {
    const d=host.detail,parts=details.filter(p=>p.parentId===host.id);
    assert.deepEqual(d.geometryIssues,[],host.id);assert.equal(d.partCount,parts.length);
    assert.equal(d.liftPoints.length,4);assert.equal(d.anchorPoints.length,2);
    assert(d.liftPoints.some(p=>p.x<d.centroid.x)&&d.liftPoints.some(p=>p.x>d.centroid.x));
    assert(d.liftPoints.some(p=>p.y<d.centroid.y)&&d.liftPoints.some(p=>p.y>d.centroid.y));
    for(const role of ['connectionPlate','anchorBolt','anchorNut']) assert.equal(parts.filter(p=>p.role===role).length,2);
    const main=parts.filter(p=>p.role==='mainBar'&&p.layer==='bottom');
    assert.equal(main.length,d.mainCount);
    const station=p=>host.kind==='flight'?p.start.y:p.start.x;
    for(let i=1;i<main.length;i++) near(station(main[i])-station(main[i-1]),d.mainPitch);
    assert(d.mainPitch<=(input.mainPitch??150)+1e-9);
    const cover=input.cover??30;
    for(const part of parts) {
      const points=readShell(part).map(v=>local(d,v));
      near(norm(sub(part.start,part.end)),part.lengthMm);
      if(part.kind==='rebar') {
        for(const {x,y,z} of points) {
          assert(inside(d.profile,x,z),host.id+'/'+part.id+' bar outside cast');
          const c=Math.min(y,d.width-y,...d.profile.map((a,i)=>fromEdge(x,z,a,d.profile[(i+1)%d.profile.length])));
          assert(c>=cover-.00001,`${part.id} cover ${c} < ${cover}`);
        }
      }
      if(part.role==='liftAnchor') {
        const inner=points.filter(p=>Math.abs(p.z-part.start.z)>1e-7);
        assert(inner.every(p=>inside(d.profile,p.x,p.z)),part.id+' insert outside concrete');
        assert(points.some(p=>Math.abs(part.start.z-p.z)<1e-8));
        assert(d.liftPoints.some(p=>key(p)===key(part.start)));
      }
      if(part.role==='anchorBolt') {
        const end=part.end;assert(inside(d.profile,end.x,end.z));
        near(end.y,input.anchorSide==='highY'?d.width-120:120);
        const plate=parts.find(p=>p.role==='connectionPlate'&&p.position.slice(2)===part.position.slice(2));
        assert(plate.boreMm>part.diameterMm);
      }
      checked++;
    }
  }
}
// Disabled legacy model is exactly the existing concrete assembly; no implicit supplier/lifting data.
const old=concrete.build({layout:'return',base:'precast'});
assert(!old.parts.some(p=>p.parentId||p.detail));
// Extreme depths cannot silently create loose anchors or partial connection assemblies.
for(const [q,kind,expected] of [
  [{cover:75},'flight','wapeningsnetten'],[{liftEmbed:300},'landing','hijshulzen'],
  [{waist:90,cover:35},'flight','wapeningsnetten']]) {
  const m=concrete.build({...q,detailing:'engineered'});
  assert(m.parts.some(p=>p.kind===kind&&p.detail.geometryIssues.some(s=>s.includes(expected))));
}
console.log('Prefabdetail: '+checked+' gesloten wapenings- en instortdelen, werkelijke betondekking, hoofdstaafafstanden, vier verankerde hijshulzen, kopbouten, doorboorde platen en losse moeren gecontroleerd.');
