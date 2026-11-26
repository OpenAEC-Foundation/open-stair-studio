import assert from 'node:assert/strict';
import { steelStair, escapeStair } from '../src/components/steel-stair.js';
import { steelBeam, foldedSection } from '../src/components/steel-design.js';
import { boundsOf } from '../src/components/solids.js';

const near=(value,expected)=>assert(Math.abs(value-expected)<1e-8*Math.max(1,Math.abs(expected)),value+' versus '+expected);
const basis={designBasis:'Handvoorbeeld staal',designG:.5,designQ:3,designP:2,designLimit:300,railSide:'none',steelFyd:215};
const find=(g,id)=>{const c=g.structural.checks.find(v=>v.id===id);assert(c,id);return c;};
const unit={designGammaG:1,designGammaQ:1,designLimit:250};

// An exactly horizontal beam with either 1 N/mm or 1 kN over 1 m.
const section={I:100000,W:1000};
const uniform=steelBeam(unit,1000,section,0,1,0),centre=steelBeam(unit,1000,section,0,0,1000);
near(uniform.stress,125);near(centre.stress,250);near(uniform.reaction,500);
near(centre.reaction,1000);near(uniform.delta,5e12/(384*210000*100000));near(centre.capacity,4);
near(centre.delta,1e12/(48*210000*100000));

// U-tray by subtracting a void from a 253×35 rectangle, using moments about
// the top fibre. This does not decompose it into the three pieces used in code.
const t=5,d=253,h=35,w=1000,outer=d*h,voidArea=(d-2*t)*(h-t);
const area=outer-voidArea,z=(outer*h/2-voidArea*(h+t)/2)/area;
const I=(d*h**3-(d-2*t)*(h**3-t**3))/3-area*z*z,W=I/(h-z);
near(foldedSection(d,t).I,I);near(foldedSection(d,t).W,W);
const test=steelStair.build(basis);
const self=area*7850*9.81/1e9,qG=self+.5*.26;
near(find(test,'vlucht-1-trede-buiging').demand,(1.35*qG*w*w/8+1.5*2000*w/4)/W);
near(find(test,'vlucht-1-trede-doorbuiging').demand,(5*qG*w**4/384+2000*w**3/48)/(210000*I));
assert.equal(find(test,'vlucht-1-trede-buiging').status,'fail');
assert.equal(find(test,'vlucht-1-lokaal').status,'open');
assert.equal(find(test,'vlucht-1-voet-L-ankers').status,'open');
assert.deepEqual(test.structural.connections.find(c=>c.id==='vlucht-1-kopplaat-L').partIds,
  ['vlucht-1-kopplaat-L','vlucht-1-wang-L','bovenbordes-rand-L']);

// Difference of two design load cases isolates exact stringer end reactions
// independently of mesh mass and of the routine computing the centroid.
const qCase=q=>steelStair.build({...basis,designQ:q,designP:.1});
const a=qCase(3),b=qCase(4);
const flightLength=15*260,total=15*.26/2; // kN on one side for +1 kN/m²
const meanStation=(14*260/2+253/2)/flightLength;
near(find(b,'vlucht-1-voet-L-reactie').demand-find(a,'vlucht-1-voet-L-reactie').demand,1.5*total*(1-meanStation));
near(find(b,'vlucht-1-kopplaat-L-reactie').demand-find(a,'vlucht-1-kopplaat-L-reactie').demand,1.5*total*meanStation);
const oneRail=steelStair.build({...basis,railSide:'left'});
assert(find(oneRail,'vlucht-1-wang-L-buiging').demand>find(oneRail,'vlucht-1-wang-R-buiging').demand);
const stepLoad=p=>steelStair.build({...basis,designQ:.01,designP:p});
near(find(stepLoad(3),'vlucht-1-opleghoek-L').demand-find(stepLoad(2),'vlucht-1-opleghoek-L').demand,1.5);

const anchors={...basis,steelBaseN:1,steelBaseV:1.5,steelBaseMx:.108,steelBaseMy:.128,steelBaseMz:.054,
  steelBaseActions:'envelope',steelAnchorNRd:10,steelAnchorVRd:5,steelAnchorBasis:'Rekenstaat ankers'};
const anchored=steelStair.build(anchors);
// N=1+.108/.054+.128/.064=5 kN and V=1.5+.054/.054=2.5 kN.
near(find(anchored,'vlucht-1-voet-L-ankers').demand,1);
assert.equal(find(anchored,'vlucht-1-voet-L-ankers').status,'pass');
assert.equal(find(steelStair.build({...anchors,steelAnchorVRd:4.9}),'vlucht-1-voet-L-ankers').status,'fail');
for(const missing of [{steelBaseActions:'unknown'},{steelAnchorNRd:0},{steelAnchorBasis:' '}])
  assert.equal(find(steelStair.build({...anchors,...missing}),'vlucht-1-voet-L-ankers').status,'open');
const rod=anchored.parts.find(v=>v.id==='vlucht-1-voet-L-anker-1');
near(boundsOf([rod]).zmin,-90);
for(const part of anchored.parts.filter(v=>v.role==='floorAnchor')){
  assert.equal(part.fastenerType,'ANCHORBOLT');
  near(part.diameterMm,12);near(part.embedMm,90);
  near(part.lengthMm,part.id.startsWith('vlucht')?100:102);
}
const long=steelStair.build({...anchors,steelEmbed:140});
near(boundsOf([long.parts.find(v=>v.id===rod.id)]).zmin,-140);
near(long.parts.find(v=>v.id===rod.id).lengthMm,150);
assert(long.parts.find(v=>v.id===rod.id).massKg>rod.massKg);

// Undocumented sharing and impossible bar counts stay unresolved. A whole
// point load on one strip has the rectangular W=3·30²/6, giving this increment.
const grid=p=>escapeStair.build({...basis,layout:'return',risers:17,designQ:.01,designP:p});
near(find(grid(3),'vlucht-1-trede-buiging').demand-find(grid(2),'vlucht-1-trede-buiging').demand,
  1.5*1000*1200/(4*450));
const bad=escapeStair.build({...basis,steelBars:3});
assert.equal(find(bad,'vlucht-1-trede-buiging').status,'open');
const excess=escapeStair.build({...basis,steelBars:20,steelPanelBasis:'roosterberekening'});
assert.equal(find(excess,'vlucht-1-trede-buiging').status,'open');
const g=grid(2),partIds=new Set(g.parts.map(v=>v.id)),checkIds=new Set(g.structural.checks.map(c=>c.id));
assert.equal(checkIds.size,g.structural.checks.length);
assert.equal(new Set(g.structural.connections.map(c=>c.id)).size,g.structural.connections.length);
assert(!g.parts.some(v=>v.role==='floorAnchor'&&v.id.startsWith('vlucht-2')));
for(const c of g.structural.connections){
  assert(c.partIds.every(id=>partIds.has(id)),c.id);
  assert(c.focusIds.every(id=>c.partIds.includes(id)),c.id);
  assert(c.checkIds.every(id=>checkIds.has(id)),c.id);
}
for(const c of g.structural.checks)assert(c.partIds.every(id=>partIds.has(id)),c.id);
assert.equal(steelStair.build().structural.status,'open');
assert.equal(escapeStair.build({steelBaseActions:'xx'}).parts.length,0);
const building=steelStair.build({...basis,supports:'building'});
assert.equal(find(building,'bovenbordes-rand-L-buiging').status,'open');
assert.equal(building.parts.filter(v=>v.role==='floorAnchor').length,8);
console.log('Staalrekenmodel: handberekeningen plaat, ligger, puntlast, eindreacties, roosterstrip en ankergroep; projectstatus en fysieke detailverwijzingen gecontroleerd.');
