import assert from 'node:assert/strict';
import { generateStairGeometry,starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { compileHousingJob,writeHousingDxf,writeLinuxCnc } from '../src/housing-cam.js';
import { riserFaceResults } from '../src/riser-face-cam.js';
import { compileTreadJob,writeTreadLinuxCnc } from '../src/tread-cam.js';

const nearby=(a,b)=>Math.abs(a-b)<.001;
let setups=0;
for(const [type,hand] of [['straight','left'],['quarter_turn','left'],['quarter_turn','right']]) {
  for(const nosing of [-40,0,50]) {
    const model=structuredClone(starterProject);
    Object.assign(model.stair,{type,turnDirection:hand,nosing,riserBoards:'closed',riserJoint:'housed'});
    const work=buildWorkshop(generateStairGeometry(model.stair),model);
    assert.deepEqual(work.riserJoinery.issues,[]);
    const processed=new Set();
    for(const host of work.parts.filter(p=>p.riserPockets?.length && p.kind!=='stringer')) {
      const results=riserFaceResults(host,model,work.riserJoinery.issues);
      assert.deepEqual(results.map(r=>r.setup.face),['underside','top'],host.id+' both setups, top last for profiling');
      for(const {setup,job,problem} of results) {
        assert.ok(job,problem);
        if (!setups) {
          // A wide blank can enclose a groove even when profiling would
          // cut a notch through it. The CNC export must catch the whole edge.
          const pocket=setup.pockets[0].contour;
          const midX=pocket.reduce((sum,p)=>sum+p.x,0)/pocket.length;
          const midY=pocket.reduce((sum,p)=>sum+p.y,0)/pocket.length;
          const notch=[{x:0,y:0},{x:setup.length,y:0},{x:setup.length,y:setup.width},
            {x:midX+1,y:setup.width},{x:midX+1,y:midY},{x:midX-1,y:midY},{x:midX-1,y:setup.width},{x:0,y:setup.width}];
          assert.throws(()=>compileHousingJob({...setup,partContour:notch},model.cam),/afgewerkte buitencontour/);
        }
        const program=writeLinuxCnc(job);
        assert.ok(program.includes(setup.face==='underside'?'UNDERSIDE UP':'TOP FACE UP'));
        const dxf=writeHousingDxf(setup,job.metadata);
        assert.ok(dxf.includes('OSS-STOOTBORD-D'));
        const emittedMoves=[...program.matchAll(/^G1 X([-.\d]+) Y([-.\d]+)/gm)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
        for(const p of setup.pockets) {
          processed.add(p.id);
          assert.ok(program.includes('G1 Z-'+p.depth+' F'));
          // Back-project actual emitted cutting moves to the finished part.
          // Even a Y mirror about the wrong edge / datum fails this check.
          const [a,b,c]=p.worldContour,axes=[{x:b.x-a.x,y:b.y-a.y},{x:c.x-b.x,y:c.y-b.y}];
          const axisRanges=axes.map(axis=>{
            const length=Math.hypot(axis.x,axis.y),u={x:axis.x/length,y:axis.y/length};
            const v=p.worldContour.map(q=>u.x*q.x+u.y*q.y);
            return {u,min:Math.min(...v),max:Math.max(...v)};
          });
          // Exactly one groove per face in these stairs.
          const radius=job.cam.toolDiameter/2;
          const machineToModel=({x,y})=>({x:setup.frame.origin.x+x*setup.frame.xAxis.x+y*setup.frame.yAxis.x,
            y:setup.frame.origin.y+x*setup.frame.xAxis.y+y*setup.frame.yAxis.y});
          for(const {u,min,max} of axisRanges) {
            const extents=emittedMoves.map(machineToModel).map(q=>u.x*q.x+u.y*q.y);
            assert(nearby(Math.min(...extents)-radius,min) && nearby(Math.max(...extents)+radius,max),p.id);
          }
        }
        setups++;
      }
      if(host.kind==='tread') {
        const contour=writeTreadLinuxCnc(compileTreadJob(host,model.treadCam));
        assert.ok(host.riserPockets.every(p=>contour.includes('Machine riser groove before outside profile: '+p.id)));
        const oversized={...model,cam:{...model.cam,toolDiameter:26}};
        assert.ok(riserFaceResults(host,oversized).every(r=>r.problem && !r.job));
      }
    }
    for(const beam of work.housings.beams) {
      const planned=compileHousingJob(beam,model.cam).operations.filter(op=>op.riserId);
      for(const op of planned) processed.add(op.id);
    }
    assert.deepEqual(processed,new Set(work.riserJoinery.pockets.map(p=>p.id)));
  }
}
console.log(`Stootbordgroeven: ${setups} opspanningen gecontroleerd via DXF, herlezen NC-extremen, diepte en koppeling met de wang- en tredeprogramma's.`);
