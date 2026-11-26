import assert from 'node:assert/strict';
import { ladder, portableStair } from '../src/components/access-stairs.js';
import { boundsOf } from '../src/components/solids.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' versus '+b);
const coords=v=>[v.x,v.y,v.z];
const key=v=>coords(v).map(i=>Math.round(i*1e6)).join(',');
function solid(p) {
  const edges=new Map(),o=p.faces[0][0];
  const local=v=>[v.x-o.x,v.y-o.y,v.z-o.z];
  let sum=0;
  for(const face of p.faces) {
    assert.ok(face.length>=3&&face.every(v=>coords(v).every(Number.isFinite)));
    face.forEach((v,i)=>{
      const a=key(v),b=key(face[(i+1)%face.length]);assert.notEqual(a,b,p.id);
      const pair=a<b?a+';'+b:b+';'+a,counts=edges.get(pair)??[0,0];
      counts[a<b?0:1]++;edges.set(pair,counts);
    });
    const a=local(face[0]);
    for(let i=1;i+1<face.length;i++) {
      const b=local(face[i]),c=local(face[i+1]);
      sum+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    }
  }
  assert.ok(sum>0,p.id+' has inward or degenerate volume');
  for(const value of edges.values()) assert.deepEqual(value,[1,1],p.id+' open edge');
}
let total=0;
const metric=(g,name)=>g.metrics.find(m=>m.label===name).value;
function common(g) {
  assert.ok(!g.issues.some(i=>i.level==='error'));
  assert.equal(new Set(g.parts.map(p=>p.id)).size,g.parts.length);
  g.parts.forEach(solid);
  close(boundsOf(g.parts).zmin,0);
  const feet=g.parts.filter(p=>p.id.endsWith('-voet'));
  for(const foot of feet) {
    const timber=g.parts.find(p=>p.id===foot.id.slice(0,-5));
    close(boundsOf([timber]).zmin,boundsOf([foot]).zmax);
    close(boundsOf([foot]).zmin,0);
  }
  total+=g.parts.length;
  return feet;
}
for(const [angle,height,count,guard] of [[54,1000,5,'back'],[35,650,4,'none'],[72,1475,8,'sides']]){
  const g=portableStair.build({angle,accessHeight:height,steps:count,guard,frameMaterial:guard==='none'?'galvanized':'timber',height:4225});
  const feet=common(g);assert.equal(feet.length,4);
  const tops=g.parts.filter(p=>p.kind==='tread');
  assert.equal(tops.length,count-1);tops.forEach((p,i)=>close(boundsOf([p]).zmax,(i+1)*height/count));
  close(boundsOf(g.parts.filter(p=>p.id==='platform')).zmax,height);
  const bb=boundsOf(feet);close(metric(g,'Buitenwerks van voet tot voet in looprichting'),bb.xmax-bb.xmin);
  assert.equal(g.parts.some(p=>p.id==='rugbeugel'),guard!=='none');
  assert.equal(g.parts.filter(p=>p.id.startsWith('zijleuning-')).length,guard==='sides'?2:0);
  assert.equal(g.parts.filter(p=>p.id.startsWith('spreidstang-')).length,2);
  const narrow=portableStair.build({angle,accessHeight:height,steps:count,width:530});
  close(boundsOf(narrow.parts.filter(p=>p.id==='platform')).ymax,265);
}
for(const [angle,height,count,shape,grips] of [[74,2500,9,'round','none'],[55,1650,6,'flat','pair'],[85,4050,15,'round','pair']]) {
  const g=ladder.build({angle,accessHeight:height,rungs:count,rungShape:shape,handholds:grips,height:3225});
  const feet=common(g);assert.equal(feet.length,2);
  assert.equal(g.parts.filter(p=>p.id.startsWith('handgreep-')).length,grips==='pair'?2:0);
  const rungs=g.parts.filter(p=>p.kind==='tread');assert.equal(rungs.length,count);
  const dz=height/(count+1),top=rungs.map(p=>boundsOf([p]).zmax);
  top.forEach((z,i)=>close(z,(i+1)*dz));
  close(metric(g,'Sportafstand langs de boom'),dz/Math.sin(angle*Math.PI/180));
  const pads=g.parts.filter(p=>p.id.startsWith('aanlegblok-'));
  assert.equal(pads.length,2);
  const planeX=metric(g,'Afstand voetas tot aanlegvlak');
  pads.forEach(p=>{const b=boundsOf([p]); close(b.zmax,height);close(b.xmax,planeX);});
  close(boundsOf(g.parts).xmax,planeX);
  for(const p of rungs){
    const b=boundsOf([p]),stile=boundsOf(g.parts.filter(q=>q.id==='ladderboom-links'));
    close(b.ymin,stile.ymax);
  }
}
for(const [c,p] of [[portableStair,{steps:3.3}],[portableStair,{accessHeight:350,steps:16,stepThickness:50}],
  [ladder,{angle:90}],[ladder,{accessHeight:400,rungs:25}],[ladder,{rungShape:'invalid'}]]) {
  const g=c.build(p);assert.equal(g.parts.length,0);assert.ok(g.issues.some(i=>i.level==='error'));
}
console.log(total+' gesloten ladder- en platformtraponderdelen gecontroleerd op aanlegvlak, vloercontact, sportafstand, optredes en leuningvarianten.');
