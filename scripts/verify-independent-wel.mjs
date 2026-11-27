import assert from 'node:assert/strict';
import { generateStairGeometry, inspectStair, starterProject } from '../src/stair.js';
import { effectiveWel } from '../src/timber-riser.js';
import { buildStairDetails } from '../src/stair-details.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { checkRiserBoardFit } from '../src/riser-board-fit.js';
import { compileTreadJob } from '../src/tread-cam.js';
import { verifyTreadFit } from '../src/tread-fit.js';

const near=(a,b,label)=>assert(Math.abs(a-b)<.0001,`${label}: ${a} / ${b}`);
const along=(p,origin,axis)=>(p.x-origin.x)*axis.x+(p.y-origin.y)*axis.y;
function project(settings) {
  const p=structuredClone(starterProject);
  Object.assign(p.stair,{railSide:'none',riserBoards:'closed'},settings);
  return p;
}

// Measure assembled solids at the underside of the upper tread. This also
// works on an inclined manual board, whose lower and upper faces differ.
function measuredWel(tread,board) {
  const z=tread.elevation-tread.thickness;
  const edge=board.faces.flat().filter(p=>Math.abs(p.z-z)<.0001);
  return Math.min(...edge.map(p=>along(p,tread.frontEdge[0],tread.direction)));
}

const sample=project({going:220,nosing:15,wel:45,riserThickness:13,treadThickness:38});
const geometry=generateStairGeometry(sample.stair);
const tread=geometry.treads[0];
near(tread.length,265,'zichtbare en fysieke bladmaat bij koude aansluiting');
near(tread.frontEdge[0].x,-15,'tredepositie');
const checks=inspectStair(sample,geometry);
assert.equal(checks.find(x=>x.title==='Tredevlak').level,'ok');
assert.equal(checks.find(x=>x.title==='Aantrede').level,'ok');
const noWel=generateStairGeometry({...sample.stair,wel:0});
assert(noWel.volume<geometry.volume && noWel.blankVolume<geometry.blankVolume);

for(const settings of [
  {riserBoards:'open'},{riserBoards:'closed'},
  {riserBoards:'closed',riserJoint:'housed',wellatType:'chamfered',wellatWidth:7},
  {riserBoards:'closed',riserPosition:'manual',riserTopInset:21,riserBottomInset:27}
]){
  const p=project(settings),legacy={...p.stair};
  delete legacy.wel;
  assert.deepEqual(generateStairGeometry(legacy),generateStairGeometry(p.stair));
  const g=generateStairGeometry(legacy),b=buildStairDetails(legacy,g).find(p=>p.role==='riser');
  near(effectiveWel(legacy),b?measuredWel(g.treads[0],b):0,'oude wel');
  for(const wel of [0,45]){
    const s={...legacy,wel},g=generateStairGeometry(s),t=g.treads[0];
    near(t.frontEdge[0].x,-s.nosing,'vaste tredevoorzijde');
    const b=buildStairDetails(s,g).find(p=>p.role==='riser');
    if(b) near(measuredWel(t,b),wel,'ingestelde wel');
    else near(t.length,s.going+wel,'overlap open trede');
  }
}
const strip=project({wel:0,wellatType:'chamfered',riserJoint:'housed'});
assert(inspectStair(strip).some(f=>f.level==='error' && f.title.includes('Wellat')));
const manual=project({wel:45,wellatType:'chamfered',wellatWidth:18,riserPosition:'manual',
  riserTopInset:21,riserBottomInset:27,type:'quarter_turn'});
const manualGeometry=generateStairGeometry(manual.stair);
const manualParts=buildStairDetails(manual.stair,manualGeometry);
const first=manualGeometry.treads[0],trim=manualParts.find(p=>p.id===first.id+'-WL');
const clearHeight=manualGeometry.dimensions.rise-first.thickness;
const boardSlope=(manual.stair.riserTopInset+manual.stair.riserBottomInset)/clearHeight;
for(const vertex of trim.faces.flat()) {
  const below=first.elevation-first.thickness-vertex.z;
  assert(along(vertex,first.frontEdge[0],first.direction)<=45-boardSlope*below+1e-6,'schuine achterzijde wellat');
}
const terminal=manualParts.find(p=>p.id.endsWith('V1-UIT-SB'));
near(terminal.riserFrame.origin.x-manualGeometry.landings[0].points[0].x,45,'eindstootbord bij handmatige stand');

let fits=0;
for(const type of ['straight','quarter_turn','half_turn','quarter_winder','half_winder','two_quarter_winder']){
  for(const hand of type==='straight'?['left']:['left','right']){
    for(const nosing of [-15,15]){
      const p=project({type,turnDirection:hand,nosing,wel:45,riserJoint:'housed',
        wellatType:'chamfered',wellatWidth:8,landingFrame:'perimeter',noseProfile:'round'});
      // Fits the narrow shoulder where a housing near a mitre changes rail.
      p.treadCam.toolDiameter=4;
      const g=generateStairGeometry(p.stair);
      assert(g.treads.length>0,type);
      const work=buildWorkshop(g,p);
      assert.deepEqual(work.riserJoinery.issues,[],type+' '+hand+' '+nosing);
      const parts=individualTreads(work);
      for(const t of g.treads) {
        const board=work.detailParts.find(b=>b.id===t.id+'-SB');
        const trim=work.detailParts.find(b=>b.id===t.id+'-WL');
        near(measuredWel(t,board),45,'geassembleerd '+board.id);
        const offsets=trim.faces.flat().map(p=>along(p,t.frontEdge[0],t.direction));
        near(Math.max(...offsets),45,'achterzijde wellat tegen stootbord');
        near(Math.min(...offsets),37,'wellatbreedte');
        const fit=checkRiserBoardFit(board,work,p);
        assert.deepEqual(fit.problems,[],board.id);
        fits+=fit.connections.length;
        const part=parts.find(b=>b.id===t.id);
        const treadFit=verifyTreadFit(part,work,p.cam,compileTreadJob(part,p.treadCam));
        assert.equal(treadFit.status,'pass',t.id+' '+treadFit.message);
      }
      if(type==='half_turn'){
        const landing=g.landings[0], board=work.detailParts.find(b=>b.id.endsWith('V1-UIT-SB'));
        const entryX=landing.points[0].x;
        near(board.riserFrame.origin.x-entryX,45,'wel intrede halfslagbordes');
        assert.equal(landing.points.length,6);
        assert(landing.volume<landing.blankVolume,'versprongen rand in de calculatie');
        assert.deepEqual(checkRiserBoardFit(board,work,p).problems,[]);
      }
    }
  }
}
console.log('Onafhankelijke wel, tredepositie, bordescontour, wellat en '+fits+' CNC-verbindingen gecontroleerd.');
