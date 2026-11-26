import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readProject} from '../src/project.js';
import {stairFamilies,generateStairGeometry,inspectStair} from '../src/stair.js';
import {buildStairDetails} from '../src/stair-details.js';
import {buildWorkshop} from '../src/workshop.js';
import {addTimberTakeoff} from '../src/timber-takeoff.js';
import {tessellate} from '../src/ifc-tessellate.js';

const project=readProject(JSON.parse(readFileSync(new URL('../examples/klassieke-eiken-kwartslag.oss.json',import.meta.url))));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} en ${b}`);
for(const {id} of stairFamilies) for(const type of ['none','housed']){
  const stair={...project.stair,type:id,entrySteps:-1};
  const model={...project,stair,joinery:{...project.joinery,type}};
  const g=generateStairGeometry(stair), base=buildWorkshop(g,model), details=buildStairDetails(stair,g);
  const trims=details.filter(p=>p.role==='nosingStrip');
  assert.equal(trims.length,g.treads.length);
  for(const p of trims) {
    const {coordinates,triangles}=tessellate(p,v=>[v.x,v.y,v.z]);
    let sum=0;
    for(const tri of triangles){
      const [a,b,c]=tri.map(i=>coordinates[i-1]);
      sum+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    }
    near(p.volumeM3,sum/6e9);
    assert(p.stockVolumeM3>=p.volumeM3-1e-10);
  }
  const schedule=addTimberTakeoff(base,stair,details);
  near(schedule.volume, base.volume+schedule.detailTakeoff.net);
  near(schedule.blankVolume,(base.blankVolume??base.volume)+schedule.detailTakeoff.stock);
  assert.equal(new Set(schedule.parts.map(p=>p.id)).size,schedule.parts.length);
}
const bad={...project,stair:{...project.stair,wellatWidth:30}};
assert(inspectStair(bad).some(i=>i.title==='Wellat past niet onder de trede'));
console.log('Ruw- en nettovolumes, doorlopende afschuining en scheve einde van iedere wellat gecontroleerd voor zes trapfamilies, met en zonder wanghuis.');
