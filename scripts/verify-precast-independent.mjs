import assert from 'node:assert/strict';
import {concrete} from '../src/components/concrete.js';
import {sheetFor,makeDetailCsv} from '../src/precast-sheets.js';

function close(actual,expected,message) {
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-6*Math.max(1,Math.abs(expected)),message+' '+actual+' vs '+expected);
}

// Independent two-point integration by vertical strips. The cast is bounded by
// planar faces between vertices, so the area and both first moments are exact.
function integrate(profile) {
  const xs=[...new Set(profile.map(([x])=>x))].sort((a,b)=>a-b);
  let area=0,mx=0,mz=0;
  for(let i=1;i<xs.length;i++) {
    const half=(xs[i]-xs[i-1])/2,mid=(xs[i]+xs[i-1])/2;
    for(const sign of [-1,1]) {
      const x=mid+sign*half/Math.sqrt(3),hits=[];
      profile.forEach(([a,z],j)=>{
        const [b,w]=profile[(j+1)%profile.length];
        if((a<x&&x<b)||(b<x&&x<a))hits.push(z+(w-z)*(x-a)/(b-a));
      });
      hits.sort((a,b)=>a-b);
      assert.equal(hits.length%2,0);
      for(let k=0;k<hits.length;k+=2) {
        const lower=hits[k],upper=hits[k+1],strip=half*(upper-lower);
        area+=strip;mx+=x*strip;mz+=(upper+lower)*strip/2;
      }
    }
  }
  return {area,x:mx/area,z:mz/area};
}

for(const rigging of ['two','equalised']) {
  const p={detailing:'engineered',layout:'return',base:'precast',risers:15,height:2970,
    guards:'none',density:2480,rigging,stationResultants:'vertical',liftingAssembly:'bare',liftingWLL:.01,
    liftingReference:'Auditinsert',riggingReference:'Auditplan',liftingStrength:35,requiredLiftingStrength:24,
    slingAngle:37,hoistFactor:1.42,stripping:'released'};
  const model=concrete.build(p);
  const hosts=model.parts.filter(part=>part.detail);
  assert.equal(hosts.length,5);
  for(const host of hosts) {
    const d=host.detail, ref=integrate(d.profile);
    const mass=ref.area*d.width/1e9*p.density;
    close(host.massKg,mass,host.id+' mass');
    close(d.centroid.x,ref.x,host.id+' centroid X');
    close(d.centroid.z,ref.z,host.id+' centroid Z');
    const [a,b]=[...new Set(d.liftPoints.map(q=>q.x))].sort((x,y)=>x-y);
    const total=mass*9.81/1000;
    const row=Math.max(b-ref.x,ref.x-a)/(b-a);
    const strand=total*row/(rigging==='equalised'?2:1)/Math.cos(37*Math.PI/180);
    const sheet=sheetFor(model,host);
    const lift=sheet.calculation.checks.find(c=>c.id==='liftFree');
    const strip=sheet.calculation.checks.find(c=>c.id==='demould');
    close(lift.demand,strand*p.hoistFactor,host.id+' transport');
    close(strip.demand,strand,host.id+' stripped');
    assert.equal(lift.status,'fail');
    const output=makeDetailCsv(sheet,'audit').split('\r\n').slice(1);
    assert.equal(output.length,model.parts.filter(item=>item.parentId===host.id).length);
    for(const piece of sheet.pieces)assert.equal(output.filter(line=>line.includes('"'+piece.part.id+'"')).length,1);
  }
}


for (const liftingAssembly of ['unconfirmed','assembled']) {
  const model=concrete.build({detailing:'engineered',liftingAssembly,stationResultants:'vertical',liftingWLL:400,
    liftingReference:'Proof',riggingReference:'Plan',liftingStrength:35,requiredLiftingStrength:20,
    stripping:'released'});
  for(const element of model.precast.elements) {
    for (const check of element.checks.filter(c=>['liftFree','demould'].includes(c.id))) {
      assert.equal(check.demand,null,element.id+' missing lifted gross mass');
      assert.equal(check.status,'open',element.id+' missing lifted gross mass');
    }
  }
}

// JRC Eurocode 8 worked examples, section 5.19.4, p. 197. C30/37,
// fyk=500, b=1000, d=155: As,min=233.7 mm² using rounded fctm=2.9 MPa.
// https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EC8_Seismic_Design_of_Buildings-Worked_examples.pdf
const strip=concrete.build({layout:'straight', detailing:'engineered',width:1000,waist:191,
  cover:30,mainDiameter:12,concreteStrength:30,barYield:500});
const section=strip.precast.elements.find(e=>e.id==='vlucht-1');
const minimumSteel=section.checks.find(c=>c.id==='minimumSteel');
assert.ok(Math.abs(minimumSteel.demand-233.7)<.35, String(minimumSteel.demand));

// Direct loading of a sliced physical stair, evaluated at 501 cut sections.
const asymmetric=concrete.build({detailing:'engineered',layout:'return',risers:15,height:3105,
  guards:'none',density:2480,stationResultants:'vertical',liftingAssembly:'bare',hoistFactor:1.42,handlingFactor:1.35});
for(const cast of asymmetric.parts.filter(p=>p.kind==='flight')) {
  const {profile,width,liftPoints}=cast.detail;
  const xs=[...new Set(profile.map(q=>q[0]))].sort((a,b)=>a-b),loads=[];
  for(let i=1;i<xs.length;i++) {
    const dx=(xs[i]-xs[i-1])/10;
    for(let j=0;j<10;j++) {
      const x=xs[i-1]+(j+.5)*dx,h=[];
      profile.forEach(([a,z],k)=>{
        const [b,v]=profile[(k+1)%profile.length];
        if((a<x&&x<b)||(b<x&&x<a))h.push(z+(v-z)*(x-a)/(b-a));
      });
      h.sort((a,b)=>a-b);
      const depth=h.reduce((s,val,k)=>s+(k%2?val:-val),0);
      loads.push({x,force:-dx*depth*width*2480*9.81*1.42*1.35/1e12});
    }
  }
  const [a,b]=[...new Set(liftPoints.map(q=>q.x))].sort((u,v)=>u-v);
  const right=-loads.reduce((s,q)=>s+q.force*(q.x-a)/(b-a),0);
  const left=-loads.reduce((s,q)=>s+q.force,0)-right;
  loads.push({x:a,force:left},{x:b,force:right});
  const maxX=xs.at(-1),minX=xs[0];
  const cuts=[a,b,...Array.from({length:501},(_,k)=>minX+k*(maxX-minX)/500)];
  const moments=cuts.map(x=>loads.reduce((s,q)=>s+q.force*Math.max(0,x-q.x)/1000,0));
  const checks=asymmetric.precast.elements.find(e=>e.id===cast.id).checks;
  for(const [key,expected] of [['sagging',Math.max(...moments)],['hogging',-Math.min(...moments)]]) {
    const actual=checks.find(c=>c.id==='handling-'+key).demand;
    assert.ok(Math.abs(actual-expected)<.004*Math.max(expected,1),[cast.id,key,expected,actual].join(' '));
  }
}
const baseRig={detailing:'engineered',layout:'straight',liftingAssembly:'bare',rigging:'two',
  stripping:'released',liftingReference:'Anchor',riggingReference:'Rigging',liftingStrength:35,
  requiredLiftingStrength:25,liftingWLL:300,slingAngle:37,hoistFactor:1.42};
for(const stationResultants of [undefined,'unconfirmed','inclined']) {
  const config=stationResultants?{...baseRig,stationResultants}:baseRig;
  const inclined=concrete.build(config);
  const cast=inclined.parts.find(p=>p.kind==='flight');
  assert.equal(new Set(cast.detail.liftPoints.map(point=>point.z)).size,2);
  for(const id of ['liftFree','demould','handling-sagging','handling-hogging']){
    const check=inclined.precast.elements.find(e=>e.id===cast.id).checks.find(c=>c.id===id);
    assert.equal(check.status,'open',id);
    assert.equal(check.demand,null,id);
  }
  const straight=concrete.build({...config,slingAngle:0});
  const result=straight.precast.elements.find(e=>e.id===cast.id);
  const [left,right]=[...new Set(cast.detail.liftPoints.map(point=>point.x))].sort((a,b)=>a-b);
  const x=integrate(cast.detail.profile).x;
  const staticForce=cast.massKg*.00981*Math.max(right-x,x-left)/(right-left);
  const free=result.checks.find(c=>c.id==='liftFree'),release=result.checks.find(c=>c.id==='demould');
  assert.equal(free.status,'pass');
  close(free.demand,staticForce*baseRig.hoistFactor,'vertical free lift');
  close(release.demand,staticForce,'vertical demould');
}
console.log('Independent mass, centroid, lifting demand, mass gates, handling moments, JRC minimum steel and CSV checks passed.');

