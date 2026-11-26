import assert from 'node:assert/strict';
import * as IFC from 'web-ifc';
import {starterProject,generateStairGeometry,calculateEstimate} from '../src/stair.js';
import {buildWorkshop} from '../src/workshop.js';
import {writeCutStringerDxf} from '../src/cut-stringer.js';
import {readProject,editSession,startSession} from '../src/project.js';
import {geometryErrors} from '../src/stair-validity.js';
import {createIfc4WithApi} from '../src/ifc-export-core.js';
import {compileTreadJob,defaultTreadCam,writeTreadLinuxCnc} from '../src/tread-cam.js';

const triple=(a,b,c)=>a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x);
const api=new IFC.IfcAPI();
await api.Init();
let checked=0;
for(const type of ['straight','quarter_turn','landing','half_turn'])
for(const direction of ['left','right'])
for(const [left,right] of [['cut','housed'],['housed','cut'],['cut','cut']]){
  const model=structuredClone(starterProject);
  Object.assign(model.stair,{type,turnDirection:direction,stringerLeft:left,stringerRight:right});
  const geometry=generateStairGeometry(model.stair);
  const cuts=geometry.stringers.filter(beam=>beam.profile==='cut');
  assert.equal(cuts.length,(type==='straight'?1:2)*Number(left==='cut')+(type==='straight'?1:2)*Number(right==='cut'));
  for(const beam of cuts){
    assert(beam.blankVolume>=beam.volume,beam.id);
    assert.equal(beam.minWeb,model.stair.stringerDepth);
    const edgeCount=new Map();
    for(const face of beam.faces)for(let i=0;i<face.length;i++){
      const a=face[i],b=face[(i+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(':');
      edgeCount.set(key,(edgeCount.get(key)??0)+1);
    }
    assert([...edgeCount.values()].every(count=>count===2),beam.id+' manifold');
    const signed=beam.faces.reduce((sum,face)=>sum+face.slice(1,-1).reduce((part,_,i)=>
      part+triple(beam.vertices[face[0]],beam.vertices[face[i+1]],beam.vertices[face[i+2]])/6,0),0);
    assert(Math.abs(signed/1e9-beam.volume)<1e-7,beam.id+' volume');
    assert(beam.section.length>2*geometry.flights[beam.flightIndex].treadCount);
    assert(writeCutStringerDxf(beam,{number:'TEST'}).includes('OSS-KEEPBOOM-CONTOUR'));
  }
  const workshop=buildWorkshop(geometry,model);
  assert.equal(workshop.housings.issues.length,0,`${type} ${direction} ${left}/${right}`);
  const expectedTongues=Number(left==='housed')+Number(right==='housed');
  for(const tread of workshop.housings.treads)assert.equal(tread.tongues.length,expectedTongues);
  assert(calculateEstimate(workshop,model.estimate).materials>0);
  const reopened=readProject(model);
  assert.equal(reopened.stair.stringerLeft,left);
  const ifc=createIfc4WithApi(api,model,geometry);
  assert(ifc.bytes.length>1000);
  checked++;
}
const invalid=structuredClone(starterProject);
invalid.stair.type='quarter_winder';invalid.stair.stringerLeft='cut';
assert(geometryErrors(invalid.stair,generateStairGeometry(invalid.stair).dimensions).some(item=>item.title==='Keepboom bij verdreven treden'));
const switched=editSession(startSession(invalid),'stair','type','half_winder');
assert.equal(switched.model.stair.stringerLeft,'housed');
for(const type of ['straight','quarter_turn','landing','half_turn']){
  const model=structuredClone(starterProject);
  Object.assign(model.stair,{type,stringerLeft:'cut',stringerRight:'cut',nosing:-25,stringerOverhang:-20});
  const geometry=generateStairGeometry(model.stair);
  assert.equal(geometryErrors(model.stair,geometry.dimensions).length,0,type);
  assert.equal(geometry.treads[0].length,model.stair.going-25);
  assert.equal(geometry.treads[0].width,model.stair.width-40);
  const flight=geometry.flights[0],tread=geometry.treads[0];
  const front=tread.points[0],along=(front.x-flight.origin.x)*flight.direction.x+(front.y-flight.origin.y)*flight.direction.y;
  assert(Math.abs(along-25)<1e-7,`${type} terugliggende neus`);
  const workshop=buildWorkshop(geometry,model);
  assert.equal(workshop.housings.issues.length,0,type);
  const treadPart=workshop.parts.find(part=>part.kind==='tread');
  const job=compileTreadJob(treadPart,defaultTreadCam);
  assert(writeTreadLinuxCnc(job).includes('G21 G17 G90'));
  assert.equal(readProject(model).stair.nosing,-25);
  assert(createIfc4WithApi(api,model,geometry).bytes.length>1000);
}
const unsupported=structuredClone(starterProject);
unsupported.stair.stringerLeft='cut';unsupported.stair.stringerOverhang=-unsupported.stair.stringerThickness;
assert(geometryErrors(unsupported.stair,generateStairGeometry(unsupported.stair).dimensions).some(item=>item.title==='Trede mist keepboom'));
const reversed=editSession(startSession({...starterProject,stair:{...starterProject.stair,nosing:-25}}),'stair','type','quarter_winder');
assert.equal(reversed.model.stair.nosing,0);
console.log(`Keepbomen: ${checked} vlakke trapvarianten plus vier terugliggende neus- en trederanden, 3D-solid, volume, huizen, DXF en IFC4 gecontroleerd.`);
