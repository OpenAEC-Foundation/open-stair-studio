import assert from 'node:assert/strict';
import {glassStair,cantileverStair} from '../src/components/glass-stair.js';
import {boundsOf} from '../src/components/solids.js';
import {emptyWell,readWell} from '../src/stairwell.js';

const input={risers:4,height:720,guard:'none',designBasis:'Handberekening A',detailBasis:'Fictief testdetail A',
  designG:1,designQ:1,designP:1,designGammaG:1,designGammaQ:1,designLimit:40};
const glass={...input,carrier:'steel',glassFd:150,glassStrip:100,glassCarrierEI:300,glassCarrierMRd:8,
  glassHeadLever:20,glassHeadNRd:50,glassHeadVRd:50,glassSeatRd:5,glassFootRd:10,glassHeadRd:10};
const floating={...input,armFd:500,armVRd:10,skinStrip:80,skinFd:60,skinE:11000,
  weldMRd:5,weldVRd:8,wallRowNRd:40,wallGroupVRd:40,wallLever:75};
const byId=(s,id)=>{const row=s.checks.find(row=>row.id===id);assert.ok(row,id);return row;};
const close=(a,b)=>assert.ok(Number.isFinite(a) && Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*1e-9),a+' vs '+b);
for(const def of [glassStair,cantileverStair]) {
  const legacy=readWell({...emptyWell,instances:[{id:'old',mark:'A',type:def.id,storey:0,x:0,y:0,rotation:0,params:{}}]});
  assert.equal(legacy.instances[0].params.designBasis,'');
  const result=def.build(legacy.instances[0].params).structural;
  assert.equal(result.status,'open');
  assert.ok(result.checks.every(row=>row.status==='open'));
}
for(const [def,p] of [[glassStair,glass],[cantileverStair,floating]]) {
  const model=def.build(p),s=model.structural,partIds=new Set(model.parts.map(part=>part.id));
  const byPart=id=>model.parts.find(part=>part.id===id);
  for(const anchor of model.parts.filter(part=>part.fastenerType==='ANCHORBOLT')) {
    const bounds=boundsOf([anchor]),spans=['x','y','z'].map(axis=>bounds[axis+'max']-bounds[axis+'min']).sort((a,b)=>b-a);
    close(anchor.lengthMm,spans[0]);close(anchor.diameterMm,spans[1]);
  }
  if(def===glassStair) {
    const head=byPart('kopanker-L0'),foot=byPart('voetanker-L0');
    close(head.embedMm,boundsOf([head]).xmax-boundsOf([byPart('kopflens-L')]).xmax);
    close(foot.embedMm,boundsOf([byPart('vloerplaat-L')]).zmin-boundsOf([foot]).zmin);
  } else {
    const shaft=byPart('bordes-wandplaat-1-anker-0');
    close(shaft.embedMm,boundsOf([byPart('bordes-wandplaat-1')]).ymin-boundsOf([shaft]).ymin);
    assert.equal(byPart('bordes-las-1').fastenerType,'WELD');
  }
  assert.equal(new Set(s.connections.map(c=>c.id)).size,s.connections.length);
  assert.equal(new Set(s.checks.map(c=>c.id)).size,s.checks.length);
  for(const c of s.connections) {
    assert.ok(c.partIds.length && c.focusIds.length && c.checkIds.length);
    assert.ok(c.partIds.every(id=>partIds.has(id)),c.id);
    assert.ok(c.focusIds.every(id=>c.partIds.includes(id)),c.id);
    assert.ok(c.checkIds.every(id=>s.checks.some(row=>row.id===id)),c.id);
  }
  for(const row of s.checks) {
    assert.ok(row.partIds.length && row.partIds.every(id=>partIds.has(id)),row.id);
    for(const val of [row.demand,row.capacity]) assert.ok(val===null || Number.isFinite(val));
  }
  assert.ok(s.checks.some(row=>row.status==='pass'));
}

const gs=p=>glassStair.build({...glass,...p}).structural;
const g=gs({});
// Hand case: steel support axes at y=40 and 960 mm. Three plies,
// top ply dispensable. G strip = 0.10 N/mm and centred Q = 1000 N.
const M=240580, W=2*100*10**2/6, EI=70000*2*100*10**3/12;
close(byId(g,'treden-buiging').demand,M/W);
close(byId(g,'treden-doorbuiging').demand,M*920**2/(8*EI));
const Pedge=960/920;
close(byId(g,'treden-oplegdruk').demand,.255/2+Pedge);
close(byId(g,'bordes-oplegdruk').demand,.9/2+Pedge);
close(byId(g,'kop-L-trek').demand,byId(g,'kop-L-reactie').demand*110/20);
assert.equal(byId(gs({glassHeadLever:0}),'kop-L-interactie').status,'open');
assert.equal(byId(gs({glassStrip:300}),'treden-buiging').status,'open');
assert.equal(byId(gs({glassStrip:300}),'bordes-buiging').status,'pass');
assert.equal(byId(gs({glassFd:1,designBasis:''}),'treden-buiging').status,'fail');
assert.equal(byId(gs({detailBasis:''}),'voet-R-reactie').status,'open');
assert.equal(byId(g,'glas-resttoestand').status,'open');
close(byId(gs({layers:5}),'treden-buiging').demand,M/(2*W));
assert.equal(byId(gs({designQ:0}),'treden-oplegdruk').demand,null);
const gd=gs({designQ:20});
close(byId(gd,'bordes-oplegdruk').demand,.9/2+20*(.5+.04**2/(2*.92))*.9);

const fs=p=>cantileverStair.build({...floating,...p}).structural;
const f=fs({});
// Tread 255 mm deep, two supports 127.5 mm apart. Point at free corner.
// Global four-anchor group carries 1 kN; the outer arm carries 1.5 kN.
const rootMoment=.1275*1012**2/2+1500*1012;
const sectionI=(40*50**3-32*42**3)/12;
close(byId(f,'treden-arm-buiging').demand,rootMoment/(sectionI/25));
close(byId(f,'treden-las-moment').demand,rootMoment/1e6);
close(byId(f,'treden-las-dwarskracht').demand,(.1275*1012+1500)/1000);
close(byId(f,'treden-wand-trek').demand,(.255*524+1024)/75);
close(byId(f,'treden-wand-afschuiving').demand,1.255+127.5/Math.hypot(105.5,41));
assert.equal(byId(fs({wallLever:83}),'treden-wand-trek').status,'open');
assert.equal(byId(fs({armVRd:.2}),'treden-arm-interactie').status,'fail');
assert.equal(byId(fs({weldMRd:.1}),'treden-las').status,'fail');
assert.equal(byId(fs({going:180,armWidth:75,armWeldLeg:8}),'treden-las-plaatrand').status,'fail');
assert.equal(byId(fs({wallGroupVRd:.1}),'treden-wand-interactie').status,'fail');
assert.equal(byId(fs({skinStrip:500}),'treden-huls-buiging').status,'open');
assert.equal(byId(fs({designP:0}),'treden-arm-buiging').demand,null);
assert.deepEqual(fs({wallSide:'left'}),f);
assert.ok(f.connections.some(c=>c.id==='bordes-wandplaat-2'));
assert.ok(fs({landingDepth:1600}).connections.some(c=>c.id==='bordes-wandplaat-4'));
assert.equal(byId(fs({guard:'free'}),'wand-balustrade').status,'open');
assert.equal(fs({wallRowNRd:.1,detailBasis:''}).status,'fail');
console.log('Glas en boomloos: handberekeningen voor treden, bordessen, kokers, lassen, kop- en wandankers, legacy-invoer en onderdeelkoppelingen geslaagd.');
