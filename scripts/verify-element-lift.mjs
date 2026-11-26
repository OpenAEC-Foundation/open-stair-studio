import assert from 'node:assert/strict';
import {concrete} from '../src/components/concrete.js';
import {readLiftPlans,editLiftPlan,editLiftPlanFields,effectiveLiftPlan,drawnLiftStations,fixedLiftLayout} from '../src/precast-plans.js';
import {checkLocalSteel} from '../src/precast-local-checks.js';

const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),a+' / '+b);
const p={detailing:'engineered',base:'precast',liftingAssembly:'bare',rigging:'two',stationResultants:'vertical',
  liftingReference:'P test',riggingReference:'Frame test',requiredLiftingStrength:15,liftingStrength:25,
  liftingWLL:80,slingAngle:0,hoistFactor:1,stripping:'released'};
const defaultModel=concrete.build(p),base=defaultModel.precast;
const cast=(m,id)=>m.elements.find(c=>c.id===id);
const test=(c,id)=>c.checks.find(k=>k.id===id);
let fixedPlans={};
for(const element of base.elements) {
  const points=element.liftStations.map(station=>station.point);
  const stations=drawnLiftStations(points);
  assert.ok(stations);
  fixedPlans=editLiftPlanFields(fixedPlans,element.id,fixedLiftLayout(stations,{}));
}
const fixedModel=concrete.build({...p,liftPlans:fixedPlans}).precast;
for(const element of fixedModel.elements) assert.deepEqual(element.liftStations,cast(base,element.id).liftStations);
const pinned={liftStationAX:452,liftLayout:'auto'};
const switchMode=fixedLiftLayout({liftStationAX:441,liftStationBX:872,liftStationY:201},pinned);
assert.deepEqual(editLiftPlanFields({'vlucht-1':pinned},'vlucht-1',switchMode)['vlucht-1'],
  {liftLayout:'fixed',liftStationAX:452,liftStationBX:872,liftStationY:201});
assert.deepEqual(fixedLiftLayout(drawnLiftStations([]),{}),{liftLayout:'fixed'});
assert.throws(()=>editLiftPlanFields(fixedPlans,'vlucht-1',{liftLayout:'auto',liftStationY:-20}));
assert.equal(fixedPlans['vlucht-1'].liftLayout,'fixed');
let plans=editLiftPlan({},'tussenbordes','rigging','equalised');
plans=editLiftPlan(plans,'tussenbordes','slingAngle',60);
plans=editLiftPlan(plans,'tussenbordes','hoistFactor',2);
plans=editLiftPlan(plans,'tussenbordes','riggingReference','  J-13  ');
let result=concrete.build({...p,liftPlans:plans}).precast;
const b=cast(base,'tussenbordes'),c=cast(result,'tussenbordes');
assert.equal(c.liftPlan.riggingReference,'J-13');
for(const id of ['onderbordes','vlucht-1','bovenbordes','vlucht-2']) assert.deepEqual(cast(result,id),cast(base,id));
near(test(c,'liftFree').demand,test(b,'liftFree').demand*2);
const G=c.metrics.find(m=>m.label==='Gewicht betonelement').value;
near(c.liftStations.reduce((sum,r)=>sum+r.freeKN*Math.cos(Math.PI/3),0),2*G);
near(Math.max(...c.liftStations.map(s=>s.freeKN)),test(c,'liftFree').demand);
near(c.liftStations.reduce((sum,r)=>sum+r.stripKN*Math.cos(Math.PI/3),0),G);
const physical=concrete.build({...p,liftPlans:{'bovenbordes':{liftDiameter:22}}});
for(const id of ['vlucht-1','bovenbordes']) {
  const bars=physical.parts.filter(s=>s.role==='liftAnchor'&&s.parentId===id);
  assert.equal(bars.length,4);
  assert.ok(bars.every(x=>x.diameterMm===(id==='bovenbordes'?22:24)));
}
const oneReset=editLiftPlan(plans,'tussenbordes','slingAngle',null);
assert.equal(effectiveLiftPlan({...p,slingAngle:19},oneReset,'tussenbordes').slingAngle,19);
assert.equal(effectiveLiftPlan(p,oneReset,'tussenbordes').hoistFactor,2);
const allReset=editLiftPlan(plans,'tussenbordes',null);
assert.deepEqual(allReset,{});
assert.equal(plans.tussenbordes.slingAngle,60);
for(const invalid of [{constructor:{}},{'verkeerde-vlucht':{}},{'vlucht-1':{slingAngle:99}},
  {'vlucht-1':{liftEmbed:44}},{'bovenbordes':{rigging:'drie'}},{'vlucht-1':{liftingReference:1}},
  {'onderbordes':{reserve:1}},JSON.parse('{"__proto__":{"slingAngle":10}}'),[]]) assert.throws(()=>readLiftPlans(invalid));
// Switching stair family keeps the remaining override keyed by the stable physical mark.
const straight=concrete.build({...p,layout:'straight',liftPlans:plans}).precast;
assert.ok(!cast(straight,'tussenbordes'));
assert.equal(cast(straight,'bovenbordes').liftPlan.rigging,'two');
assert.equal(cast(concrete.build({...p,layout:'return',liftPlans:plans}).precast,'tussenbordes').liftPlan.rigging,'equalised');

// Independent example of horizontal equilibrium for the bearing seat:
// R=30 kN, load arm=75 mm, tie lever=25 mm, external horizontal action=5 kN.
const zone=(kind,targetId)=>({kind,targetId,label:targetId,requestedCount:2,barIds:['U1','U2'],providedAreaMm2:300,anchorageMm:170});
const mock={kind:'flight',detail:{localZones:[zone('bearing','vlucht-2-bovenstrip'),zone('lifting','vlucht-1-H-01'),zone('anchorage','vlucht-1-A-02')]}};
const design={...p,localReinforcement:'detailed',nib:100,cover:25,tongue:140,joint:10,bearingTieLever:25,
  bearingTieHorizontal:5,barYield:500,reinforcementFactor:1.25,bearingBarArea:100,bearingBarTail:160,
  bearingBarReference:'TK-1',bearingBarPath:'verified',liftBarArea:310,liftBarTail:180,liftBarReference:'',anchorBarArea:51,anchorBarTail:120,
  connectionTension:40,connectionShear:0,connectionReference:'CC-1',anchorBarReference:'KA-1',anchorBarPath:'verified'};
Object.assign(mock.detail,{count:1,rise:100,supportX:[-75,175]});
const steel=['U1','U2'].map(id=>({id,bendSchedule:[10,50].map(y=>({type:'line',start:{x:50,y,z:64},end:{x:155,y,z:64}}))}));
const flightActions=[{left:1,right:2},{left:3,right:30}];
const rows=checkLocalSteel(mock,design,flightActions,[{id:'vlucht-1-H-01',freeKN:10,stripKN:12}],steel);
near(rows[0].forceKN,95);near(rows[0].requiredAreaMm2,237.5);
assert.equal(rows[0].status,'pass');assert.equal(rows[1].status,'fail');assert.equal(rows[1].forceKN,12);
assert.equal(rows[2].status,'pass');near(rows[2].requiredAreaMm2,100);
const missing=checkLocalSteel(mock,{...design,bearingTieLever:0,liftBarArea:250,liftBarTail:130,anchorBarReference:''},flightActions,[]);
assert.deepEqual(missing.map(z=>z.status),['open','open','open']);
assert.equal(missing[0].forceKN,null);
assert.equal(rows[0].maxLeverMm,36);
assert.equal(checkLocalSteel(mock,{...design,bearingTieLever:37},flightActions,[],steel)[0].forceKN,null);
assert.equal(checkLocalSteel(mock,{...design,anchorBarPath:'contact'},flightActions,[],steel)[2].status,'open');
assert.equal(checkLocalSteel(mock,{...design,bearingBarPath:'unconfirmed'},flightActions,[],steel)[0].status,'open');
assert.equal(checkLocalSteel(mock,{...design,localReinforcement:'none'},flightActions,[]).length,0);
console.log('Hijsplannen geïsoleerd per prefab, terugval en herstel, vierpuntsvereffening, geometrische hulsmaat en referentiegevallen voor drie lokale trekbanden gecontroleerd.');
