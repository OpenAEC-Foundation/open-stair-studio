import assert from 'node:assert/strict';
import { generateStairGeometry, stairFamilies, starterProject } from '../src/stair.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { profileTimberTread } from '../src/timber-tread-profile.js';
import { compileTreadJob, writeTreadCamJson, writeTreadLinuxCnc } from '../src/tread-cam.js';
import { makePartsCsvRows } from '../src/winder-parts.js';

const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} versus ${b}`);
const coords=p=>[p.x,p.y,p.z].map(x=>Math.round(x*1e6)).join(',');
function physicalVolume(tread) {
  const edges=new Map(),origin=tread.meshFaces[0][0];
  let sixVolume=0;
  for(const face of tread.meshFaces) {
    assert(face.length>=3,tread.id+' degenerate face');
    const [a,...rest]=face.map(p=>({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z}));
    for(let i=1;i<rest.length;i++) {
      const b=rest[i-1],c=rest[i];
      sixVolume+=a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x);
    }
    face.forEach((p,i)=>{
      const k=coords(p),j=coords(face[(i+1)%face.length]);
      assert.notEqual(k,j,tread.id+' duplicate corner');
      const id=k<j?k+'|'+j:j+'|'+k,counts=edges.get(id)??[0,0];
      counts[k<j?0:1]++;
      edges.set(id,counts);
    });
  }
  assert([...edges.values()].every(([a,b])=>a===1&&b===1),tread.id+' open or self-touching shell');
  return sixVolume/6;
}

// A tapering slab has width W+kd at distance d behind the leading edge.
const W=800,k=.45,run=260,r=8,x=(d,y)=>({x:d,y});
const tapered={id:'Taper',frontEdge:[x(0,0),x(0,W)],direction:{x:1,y:0},thickness:40,elevation:176,
  points:[x(0,0),x(run,0),x(run,W+k*run),x(0,W)],area:W*run+k*run**2/2};
for(const kind of ['round','bevel']) {
  const t=profileTimberTread(tapered,{noseProfile:kind,noseSize:r});
  const expected=kind==='round'?W*r**2*(1-Math.PI/4)+k*r**3*(5/6-Math.PI/4):W*r**2/2+k*r**3/6;
  close(t.noseDetail.removedMm3,expected,.0001);
  close(t.volume,(t.area*t.thickness-expected)/1e9,1e-12);
  const meshRemoval=t.area*t.thickness-physicalVolume(t);
  close(meshRemoval,expected,kind==='round'?expected*.003:1e-6);
}

let total=0,partsWithTongues=0,tongueProbe=0;
for(const {id,winder} of stairFamilies) for(const direction of winder?['left','right']:['left']) {
  for(const [kind,size,housed] of [['round',8,true],['round',24,true],['bevel',6,false]]) {
    const m=structuredClone(starterProject);
    Object.assign(m.stair,{type:id,turnDirection:direction,outerShape:direction==='right'?'faceted':'square',noseProfile:kind,noseSize:size});
    m.joinery.type=housed?'housed':'none';
    const g=generateStairGeometry(m.stair,{projectIsometric:false});
    const w=buildWorkshop(g,m),parts=individualTreads(w);
    assert(w.treads.length>0);
    const original=buildWorkshop(g,{...m,stair:{...m.stair,noseProfile:'square'}});
    close(w.blankVolume,original.blankVolume??original.volume);
    close(original.volume-w.volume,w.treads.reduce((v,t)=>v+t.noseDetail.removedMm3/1e9,0),1e-8);
    const rows=makePartsCsvRows(w,'Eiken');
    assert(rows[0].includes('Profielmaat mm'));
    for(const [i,t] of w.treads.entries()) {
      total++;
      let removed;
      try { removed=t.area*t.thickness-physicalVolume(t); }
      catch(error){throw new Error(`${id} ${direction} ${kind} ${size} housed=${housed} ${t.id}: ${error.message}`,{cause:error});}
      close(removed,t.noseDetail.removedMm3,kind==='round'?t.noseDetail.removedMm3*.003:1e-5);
      close(parts[i].volume,t.volume);
      assert.deepEqual(t.frontEdge,g.treads[i].frontEdge);
      const vertices=new Set(t.meshFaces.flat().map(coords));
      for(const tongue of t.tongues??[]) for(const p of tongue.points) {
        assert(vertices.has(coords({...p,z:t.elevation})),t.id+' tongue upper corner lost');
        assert(vertices.has(coords({...p,z:t.elevation-t.thickness})),t.id+' tongue lower corner lost');
        tongueProbe++;
      }
      if(t.tongues?.length) partsWithTongues++;
    }
    const job=compileTreadJob(parts[0],m.treadCam);
    assert.equal(job.secondaryOperation.includedInProgram,false);
    assert.equal(job.secondaryOperation.kind,kind);
    assert.match(writeTreadLinuxCnc(job),/Secondary operation required/);
    assert.equal(JSON.parse(writeTreadCamJson(job)).secondaryOperation.sizeMm,size);
    const glass=buildWorkshop(g,{...m,engineering:{...m.engineering,structureType:'glass'}});
    assert.equal(glass,g);
    assert(!glass.treads.some(t=>t.noseDetail));
  }
}
console.log(`${total} geprofileerde tredesolids, ${partsWithTongues} met insteeklippen, ${tongueProbe} liphoekparen; boogmaat, netto-/ruwvolume, spiegels, CAM-vervolgbewerking en materiaalafbakening gecontroleerd.`);
