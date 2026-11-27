import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { addTimberTakeoff } from '../src/timber-takeoff.js';
import { buildViewportMesh } from '../src/viewport-mesh.js';
import { buildWorkshop } from '../src/workshop.js';

// Reconstruct the signed volume from the triangles actually sent to the GPU.
function renderedVolume(partGeometry) {
  const mesh = buildViewportMesh(partGeometry);
  const data = new Float32Array(mesh.bytes.buffer);
  let volume = 0;
  for (let i=0;i<mesh.triangles*8;i+=24) {
    const [x,y,z,nx,ny,nz] = data.subarray(i,i+6);
    const [bx,by,bz] = data.subarray(i+8,i+11);
    const [cx,cy,cz] = data.subarray(i+16,i+19);
    const u = (by-y)*(cz-z)-(bz-z)*(cy-y);
    const v = (bz-z)*(cx-x)-(bx-x)*(cz-z);
    const w = (bx-x)*(cy-y)-(by-y)*(cx-x);
    volume += (x*u+y*v+z*w)*Math.sign(nx*u+ny*v+nz*w)/6;
  }
  return volume;
}

for (const [turnDirection,nosing,noseProfile] of [['left',-60,'bevel'],['right',100,'round']]) {
  const model=structuredClone(starterProject);
  Object.assign(model.stair,{type:'quarter_turn',turnDirection,nosing,noseProfile,riserBoards:'closed',riserJoint:'housed'});
  const workshop=buildWorkshop(generateStairGeometry(model.stair),model);
  const schedule=addTimberTakeoff(workshop,model.stair,workshop.detailParts);
  assert.deepEqual(workshop.riserJoinery.issues,[]);
  for (const key of ['treads','landings','stringers']) {
    for (const host of workshop[key]) {
      const part=schedule.parts.find(p=>p.id===host.id);
      const volume=renderedVolume({treads:[],landings:[],stringers:[],[key]:[host],
        riserJoinery:workshop.riserJoinery,housings:workshop.housings});
      assert(Math.abs(volume-part.volume)<2e-7,host.id+' viewport '+volume+' versus '+part.volume);
    }
  }
}
console.log('GPU-driehoeken van treden, bomen en bordessen nagemeten bij terugliggende en uitstekende neus.');
