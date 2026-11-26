import assert from 'node:assert/strict';
import { glassStair, cantileverStair } from '../src/components/glass-stair.js';
import { boundsOf } from '../src/components/solids.js';
import { emptyWell, newInstance, assembleWell } from '../src/stairwell.js';
import { createStairwellIfc } from '../src/stairwell-ifc.js';
import * as IFC from 'web-ifc';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const close=(a,b,eps=1e-4)=>assert(Math.abs(a-b)<eps,`${a} vs ${b}`);
const xyz=p=>[p.x,p.y,p.z].map(n=>Math.round(n*1e6)).join(',');
const bounds=part=>boundsOf([part]);
let tested=0;
function solid(part) {
  const edges=new Map(),origin=part.faces[0][0];
  let v6=0;
  for(const f of part.faces) {
    assert.equal(new Set(f.map(xyz)).size,f.length,part.id);
    for(let i=0;i<f.length;i++) {
      const a=xyz(f[i]),b=xyz(f[(i+1)%f.length]),id=a<b?a+'/'+b:b+'/'+a;
      const v=edges.get(id)??[0,0];v[a<b?0:1]++;edges.set(id,v);
    }
    const [a,...fan]=f.map(p=>({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z}));
    for(let j=1;j<fan.length;j++) {
      const b=fan[j-1],c=fan[j];v6+=a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x);
    }
  }
  assert([...edges.values()].every(([a,b])=>a===1&&b===1),part.id+' open');
  assert(v6/6>0,part.id+' volume');tested++;return v6/6;
}
function check(parts) {
  assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
  return Object.fromEntries(parts.map(p=>[p.id,{...bounds(p),volume:solid(p)}]));
}
for(const [n,layers,ply,film,carrier,guard] of [[16,3,10,1.52,'glass','both'],[8,4,12,.76,'steel','none'],[6,2,8,.38,'glass','right'],[4,2,6,.38,'glass','left']]) {
  const height=n*(n===4?100:178),rise=height/n,thick=layers*ply+(layers-1)*film;
  const model=glassStair.build({height,risers:n,layers,ply,film,carrier,guard,going:242,finish:'plain'});
  assert(!model.issues.some(i=>i.level==='error'),JSON.stringify(model.issues));
  const b=check(model.parts);
  assert.equal(model.parts.filter(p=>p.kind==='tread').length,n-1);
  assert.equal(model.parts.filter(p=>p.kind==='landing').length,1);
  for(let i=0;i<n;i++) {
    const key=i<n-1?'trede-'+String(i+1).padStart(2,'0'):'bordes';
    const deck=b[key+'-glas-1'];
    close(deck.zmin,rise*(i+1)-thick);
    close(b[key+'-glas-'+layers].zmax,rise*(i+1));
    for(let j=1;j<layers;j++) {close(b[key+'-glas-'+j].zmax,b[key+'-folie-'+j].zmin);close(b[key+'-folie-'+j].zmax,b[key+'-glas-'+(j+1)].zmin);}
    for(const side of ['L','R']) {
      const en=key+'-'+side;
      close(b[en+'-glasband'].zmax,deck.zmin);close(b[en+'-stoel'].zmax,b[en+'-glasband'].zmin);
      close(b[en+'-onderband'].zmax,b[en+'-stoel'].zmin);
    }
  }
  assert.equal(!!b['wang-L-glas-1'],carrier==='glass');
}
const baseParams={height:2900,risers:16,going:260,width:930,thickness:96,armWidth:40,armHeight:50,armWall:4,tipCover:32,wallGap:14};
for(const guard of ['wall','free','both','none']) {
  const right=cantileverStair.build({...baseParams,guard}),left=cantileverStair.build({...baseParams,guard,wallSide:'left'});
  const r=check(right.parts),l=check(left.parts);
  assert.deepEqual(Object.keys(r),Object.keys(l));
  const z=baseParams.height/16,through=['free','both'].includes(guard),x=baseParams.going-5,w=baseParams.width,h=baseParams.thickness,edge=12+14+w;
  for(const id of Object.keys(r)) {
    close(r[id].volume,l[id].volume,.001);close(r[id].xmin,l[id].xmin);
    close(r[id].ymin,edge-l[id].ymax);close(r[id].ymax,edge-l[id].ymin);
    close(r[id].zmin,l[id].zmin);
  }
  const length=through?w:w-baseParams.tipCover;
  // Two rectangular mortises, measured in the actual closed wood body.
  close(r['trede-01'].volume,x*w*h-2*(baseParams.armWidth+2)*(baseParams.armHeight+2)*length);
  close(r['trede-01'].zmax,z);
  const arm=r['trede-01-arm-1'];
  close(arm.volume,(40*50-32*42)*(arm.ymax-arm.ymin));
  close(arm.ymin,r['trede-01-wandplaat-1'].ymax);close(arm.zmax,r['trede-01-opleg-1'].zmin);
  close(r['trede-01-opleg-1'].zmax,z-(h-52)/2);
  close(arm.ymax,through?edge+7:edge-baseParams.tipCover-2);
  assert.equal(Object.keys(r).filter(id=>id.startsWith('trede-01-wandplaat-1-anker-')).length,4);
  assert.equal(right.parts.filter(p=>p.kind==='landing').length,1);
  assert.equal(right.parts.filter(p=>p.kind==='tread').length,15);
  assert.equal(!!r['vrij-hek-01-glas-1'],through);
}
for(const [def,params] of [[glassStair,{height:100}],[glassStair,{layers:2.5}],[cantileverStair,{thickness:75,armHeight:62}],[cantileverStair,{wallGap:1}]]) {
  const m=def.build(params);assert.equal(m.parts.length,0);assert(m.issues.some(i=>i.level==='error'));
}
const steep=check(glassStair.build({risers:4,height:9600,going:180,guard:'none',finish:'plain'}).parts);
assert(steep['vloerplaat-R'].xmax>=80 && steep['voetblok-R'].xmax<80);
const tall=check(cantileverStair.build({thickness:135,armHeight:100,armWidth:75}).parts);
assert(tall['trede-01-wandplaat-1-kop-0'].zmax<tall['trede-01-arm-1'].zmin);
console.log(`${tested} gesloten volumes van glazen en boomloze trappen gecontroleerd op laagdikten, primaire opleglijnen, glasbanden, doorboringen, echte kokervolumes, blinde uitsparingen en spiegeling.`);
const api=new IFC.IfcAPI();
await api.Init();
for(const [type,guard] of [['glass','both'],['cantilever','free']]) {
  const w=structuredClone(emptyWell),i=newInstance(type,w);i.params.guard=guard;i.rotation=19;w.instances.push(i);
  const [assembly]=assembleWell(w),data=await createStairwellIfc({number:'Q-01',name:'Glas en wandconstructie',revision:'A'},w);
  if(process.argv[2]==='--ifc-dir') writeFileSync(join(process.argv[3],'oss-full-'+type+'.ifc'),data);
  const sid=api.OpenModel(data);
  try {
    const ids=kind=>api.GetLineIDsWithType(sid,kind);
    assert.equal(ids(IFC.IFCTRIANGULATEDFACESET).size(),assembly.parts.length);
    assert.equal(ids(IFC.IFCSTAIR).size(),1);
    const labels=[...Array(ids(IFC.IFCMATERIAL).size())].map((_,j)=>api.GetLine(sid,ids(IFC.IFCMATERIAL).get(j)).Category.value);
    assert(labels.includes('glass')&&labels.includes('steel')&&labels.includes('rubber')&&labels.includes('interlayer'));
    assert(labels.includes(type==='glass'?'ceramic':'timber'));
    assert(ids(IFC.IFCSTYLEDITEM).size()>0);
    console.log(type+': '+assembly.parts.length+' onderdelen met materiaal en glasweergave uit IFC4 herlezen.');
  } finally {api.CloseModel(sid);}
}
