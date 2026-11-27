import assert from 'node:assert/strict';
import { tessellate } from '../src/ifc-tessellate.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';

const subtract=(p,q)=>({x:p.x-q.x,y:p.y-q.y,z:p.z-q.z});
const dot=(p,q)=>p.x*q.x+p.y*q.y+p.z*q.z;
const key=p=>[p.x,p.y,p.z].map(v=>v.toFixed(6)).join('/');
const near=(a,b)=>Math.abs(a-b)<1e-5;
const past=(p,v,s)=>({x:p.x+v.x*s,y:p.y+v.y*s,z:p.z+v.z*s});
function local(frame,p) {
  const delta=subtract(p,frame.origin);
  return [frame.xAxis,frame.yAxis,frame.zAxis].map(axis=>dot(axis,delta));
}

let count=0,shortened=0;
for(const type of ['quarter_winder','half_winder']) for(const turnDirection of ['left','right']){
  // At +2/+4/+6 the riser ends straddle a 90° outer mitre. At +25,
  // several ends straddle the faceted *inner* mitres in the half turn.
  for(const nosing of [-60,0,2,4,6,25,100]){
    const model=structuredClone(starterProject);
    Object.assign(model.stair,{type,turnDirection,nosing,outerShape:'square',riserJoint:'housed',riserBoards:'closed',railSide:'none'});
    const w=buildWorkshop(generateStairGeometry(model.stair),model);
    assert.deepEqual(w.riserJoinery.issues,[]);
    const beams=new Map(w.housings.beams.map(b=>[b.id,b]));
    const boards=w.detailParts.filter(p=>p.role==='riser');
    assert.equal(boards.length,w.treads.length+1);
    for(const [i,board] of boards.entries()){
      const label=type+' '+turnDirection+' '+nosing+' '+board.id;
      const {coordinates,triangles}=tessellate(board,p=>[p.x,p.y,p.z]);
      const volume=triangles.reduce((sum,tri)=>{
        const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=tri.map(index=>coordinates[index-1]);
        return sum+(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
      },0)/1e9;
      assert(Math.abs(volume-board.volumeM3)<1e-9,label);
      const vertices=new Set(board.faces.flat().map(key));
      const hosts=new Set();
      for(const f of board.joineryFeatures){
        const tips=f.tongueWorldContour.map(p=>past(p,f.inward,f.tongueDepth));
        for(const corner of [...f.tongueWorldContour,...tips]){
          assert(vertices.has(key(corner)),label+' lip vertex');
          const [acrossThickness]=local(board.riserFrame,corner);
          assert(acrossThickness>=-1e-6 && acrossThickness<=board.thicknessMm+1e-6,label+' raw stock');
        }
        if(f.beamId){
          const beam=beams.get(f.beamId);
          assert(!hosts.has(beam.side),label+' duplicate support');
          hosts.add(beam.side);
          if(f.depth<model.joinery.depth) shortened++;
          for(const p of f.worldContour) for(const depth of [0,f.depth]){
            const [x,y,z]=local(beam.frame,past(p,f.inward,depth));
            assert(near(z,-depth),label+' depth');
            for(const plane of beam.stockPlanes){
              const gap=plane.d-plane.a*x-plane.b*y-plane.c*z;
              assert(gap>=-1e-6,label+' groove escapes beam');
              if(Math.abs(plane.c)<1-1e-6) assert(gap>=1-1e-6,label+' miter web');
            }
          }
        } else hosts.add(f.face);
        count++;
      }
      const expected=i===boards.length-1?['top']:i?['left','right','top','underside']:['left','right','underside'];
      assert.deepEqual([...hosts].sort(),expected,label);
    }
  }
}
assert(shortened>0);
console.log('Verdreven stootborden: '+count+' lippen in gesloten volumes, inclusief '+shortened+' plaatselijk verkorte verstekverbindingen.');
