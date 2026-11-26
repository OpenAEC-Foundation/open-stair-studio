import assert from 'node:assert/strict';
import { concrete } from '../src/components/concrete.js';
import { calculatePrecast, handlingMoments, liftingShare } from '../src/precast-engineering.js';

const inputs=Object.fromEntries(concrete.fields.map(f=>[f.key,f.default]));
const p={...inputs,detailing:'engineered',base:'precast',liftingAssembly:'bare',stationResultants:'vertical',riggingReference:'Synthetische handproef H-1',
  liftingReference:'Synthetische ankerproef S-1',liftingWLL:30,requiredLiftingStrength:15,liftingStrength:20,earlyCylinderStrength:20,
  stripping:'soffit',adhesionPressure:1.25,connectionReference:'Synthetische productvergelijking K-1',
  padResistance:4,landingLineResistance:120,connectionTension:4,connectionNRd:10,connectionShear:5,connectionVRd:10,requiredEmbed:80};
const m=concrete.build(p);
const casts=m.parts.filter(c=>c.material==='concrete'&&c.detail);
assert.equal(casts.length,5);
const run=(override={},parts=m.parts)=>calculatePrecast({...p,...override},parts);
const row=(e,id)=>e.checks.find(c=>c.id===id);
const el=(r,id='vlucht-1')=>r.elements.find(e=>e.id===id);
const almost=(a,b,tol=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),a+' versus '+b);
const base=run();
assert.equal(base.status,'open');
for(const e of base.elements){
  assert.equal(e.status,'open',e.id);
  for(const c of e.checks.filter(c=>c.id!=='engineering'))assert.equal(c.status,'pass',e.id+' '+c.id);
}
const layout=[{x:0,y:0},{x:0,y:1000},{x:2000,y:0},{x:2000,y:1000}];
almost(liftingShare(layout,{x:1000,y:500},false)*9.81/Math.cos(Math.PI/6),5.663806140750229);
almost(liftingShare(layout,{x:1400,y:200},true),.7*.8);
almost(liftingShare(layout,{x:1400,y:200},false),.7);
assert.equal(liftingShare(layout,{x:-1,y:500},true),null);
assert.equal(liftingShare(layout,{x:1000,y:1000},true),null);
// A uniform 2 m slab supported 400 mm from each end, carrying 20 kN:
// negative support moment 10*.4²/2, positive centre moment 10*.6 - 10*1²/2.
const slab={kind:'landing',detail:{width:2000,centroid:{y:1000},liftPoints:[{y:400},{y:400},{y:1600},{y:1600}]}};
const lifted=handlingMoments(slab,20);
almost(lifted.hogging,.8);almost(lifted.sagging,1);
const flight=casts.find(c=>c.id==='vlucht-1'), d=flight.detail;
const g=flight.massKg*9.81/1000;
const noFinish=run({finishLoad:0,useLoad:0,pointLoad:0,permanentFactor:1,variableFactor:1});
const fg=el(noFinish);
const a=(d.centroid.x-d.supportX[0])/1000,l=d.span/1000;
almost(row(fg,'flexure').demand,g*a*(l-a)/l);
almost(row(fg,'shear').demand,g*Math.max(a/l,1-a/l));
const first=el(base);
// Independent flight oracle: clip the XZ mould to each trial cut and compute
// the first moment of the clipped polygon directly, without line load integration.
function clipToLeft(profile,cut) {
  const kept=[];
  profile.forEach(([x,z],idx)=>{
    const [v,h]=profile[(idx+1)%profile.length];
    if(x<=cut) kept.push([x,z]);
    if((x<cut&&v>cut)||(x>cut&&v<cut)) kept.push([cut,z+(h-z)*(cut-x)/(v-x)]);
  });
  return kept;
}
function sectionIntegral(polygon) {
  let twiceArea=0,sixFirstMoment=0;
  polygon.forEach(([x,z],idx)=>{
    const [v,h]=polygon[(idx+1)%polygon.length];
    const cross=x*h-v*z;twiceArea+=cross;sixFirstMoment+=(x+v)*cross;
  });
  return {area:Math.abs(twiceArea)/2,first:sixFirstMoment*Math.sign(twiceArea)/6};
}
const stations=[...new Set(d.liftPoints.map(pt=>pt.x))].sort((a,b)=>a-b);
const [lo,hi]=stations;
const totalG=g*p.hoistFactor*p.handlingFactor,crossArea=sectionIntegral(d.profile).area;
const highForce=totalG*(d.centroid.x-lo)/(hi-lo);
const minX=Math.min(...d.profile.map(pt=>pt[0])),maxX=Math.max(...d.profile.map(pt=>pt[0]));
let positiveM=0,negativeM=0;
for(const cut of [...stations,...Array.from({length:1001},(_,i)=>minX+(maxX-minX)*i/1000)]) {
  const {area,first}=sectionIntegral(clipToLeft(d.profile,cut));
  const moment=((totalG-highForce)*Math.max(0,cut-lo)+highForce*Math.max(0,cut-hi)-totalG*(area*cut-first)/crossArea)/1000;
  positiveM=Math.max(positiveM,moment);negativeM=Math.max(negativeM,-moment);
}
almost(row(first,'handling-sagging').demand,positiveM,.00002);
almost(row(first,'handling-hogging').demand,negativeM,.00002);
const barArea=m.parts.filter(b=>b.parentId===flight.id&&b.role==='mainBar'&&b.layer==='bottom').length*Math.PI*12**2/4;
const fyd=500/1.15,fcd=.85*30/1.5;
almost(row(first,'flexure').capacity,barArea*fyd*(d.d-.5*barArea*fyd/(d.width*fcd))/1e6);
almost(row(first,'restraint').demand,.9);
const heavier=run({connectionShear:8,connectionReference:''});assert.equal(row(el(heavier),'restraint').status,'fail');
assert.equal(row(el(run({connectionReference:''})),'restraint').status,'open');
assert.equal(row(el(run({liftingReference:'',liftingWLL:.5})),'liftFree').status,'fail');
assert.equal(row(el(run({liftingReference:''})),'liftFree').status,'open');
assert.equal(row(el(run({liftingStrength:0})),'liftFree').status,'open');
assert.equal(row(el(run({liftingStrength:10})),'hoistStrength').status,'fail');
assert.equal(row(el(run({riggingReference:'',rigging:'equalised'})),'liftFree').status,'open');
for(const stationResultants of ['inclined','unconfirmed']) {
  const e=el(run({stationResultants}));assert.equal(row(e,'liftFree').demand,null);
  assert.equal(row(e,'handling-hogging').status,'open');
}
assert.equal(row(el(run({stationResultants:'unconfirmed',slingAngle:0})),'liftFree').status,'pass');
for(const liftingAssembly of ['unconfirmed','assembled']){
  const e=el(run({liftingAssembly}));for(const id of ['liftFree','demould','handling-sagging','handling-hogging']){
    assert.equal(row(e,id).status,'open');assert.equal(row(e,id).demand,null);
  }
}
assert.equal(row(el(run({stripping:'unknown'})),'demould').demand,null);
assert.equal(row(el(run({stripping:'soffit',adhesionPressure:0})),'demould').status,'open');
const release=el(run({stripping:'released',hoistFactor:1}));
almost(row(release,'demould').demand,row(release,'liftFree').demand);
assert.ok(row(first,'demould').demand>row(release,'demould').demand);
assert.equal(row(el(run({earlyCylinderStrength:0})),'handling-hogging').status,'open');
assert.equal(row(el(run({padResistance:.001})),'bearing').status,'fail');
assert.equal(row(el(run({landingLineResistance:.001}),'tussenbordes'),'bearing').status,'fail');
assert.equal(row(el(run({requiredEmbed:1000})),'embed').status,'fail');
const mid=el(noFinish,'tussenbordes'),midCast=casts.find(c=>c.id==='tussenbordes');
const up=g*a/l,down=g*(1-a/l);
const right=(midCast.massKg*9.81/1000)/2+(up*(p.width/2)+down*(1.5*p.width+p.well))/midCast.detail.width;
const left=midCast.massKg*9.81/1000+up+down-right;
almost(row(mid,'bearing').demand,Math.max(left,right));
const straight=concrete.build({...p,layout:'straight',base:'host',height:3000,risers:15});
assert.deepEqual(straight.precast.elements.map(c=>c.id),['vlucht-1','bovenbordes']);
assert.ok(straight.precast.elements.every(e=>e.checks.every(c=>c.demand===null||Number.isFinite(c.demand))));
const bad=concrete.build({...p,waist:90,cover:50});
assert.equal(bad.precast.status,'fail');assert.ok(el(bad.precast).checks.some(c=>c.id.startsWith('geometry-')&&c.status==='fail'));
console.log('Prefab berekend: vijf elementen, veld en tijdelijke momenten, reacties, lastoverdracht, 2/4-strengen, hechting, inbedding en open bewijsgrenzen.');
