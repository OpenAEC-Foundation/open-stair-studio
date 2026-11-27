import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { riserFaceResults } from '../src/riser-face-cam.js';
import { compileHousingJob, writeLinuxCnc } from '../src/housing-cam.js';

// Recover final-pass cutter motion from the exported program in machine XYZ.
function readSegments(program) {
  const pockets = new Map();
  let segments, depth = 0, previous;
  for (const line of program.split('\n')) {
    if (line.startsWith('(Pocket ')) {
      segments = [];
      pockets.set(line.split(' ')[1], segments);
    }
    if (line.startsWith('G0 Z')) depth = 0;
    if (line.startsWith('G1 Z')) depth = Number(line.match(/Z([-.\d]+)/)[1]);
    const move = line.match(/^G[01] X([-.\d]+) Y([-.\d]+)/);
    if (!move) continue;
    const current = move.slice(1).map(Number);
    if (depth < 0 && previous) segments.push([previous,current,-depth]);
    previous = current;
  }
  return pockets;
}

function distance(x,y,[[a,b],[c,d]]) {
  const dx = c-a, dy = d-b;
  const t = Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(x-a-t*dx,y-b-t*dy);
}

let checked = 0, worst = 0, cases = 0;
const layouts=[['straight','left'],['quarter_turn','left'],['quarter_turn','right']];
for (const type of ['quarter_winder','half_winder'])
  for (const hand of ['left','right'])
    for (const shape of ['square','faceted']) layouts.push([type,hand,shape]);
for (const [type,turnDirection,outerShape='square'] of layouts) {
  for (const nosing of [-60,0,25,100]) {
    const project = structuredClone(starterProject);
    Object.assign(project.stair,{type,turnDirection,outerShape,nosing,riserBoards:'closed',riserJoint:'housed'});
    const workshop = buildWorkshop(generateStairGeometry(project.stair),project);
    assert(workshop.treads.length>0,`${type} ${turnDirection} ${outerShape} ${nosing}`);
    assert.deepEqual(workshop.riserJoinery.issues.filter(i=>i.level==='error'),[]);
    const expected = new Set(workshop.riserJoinery.pockets.map(p=>p.id));
    for (const tread of workshop.treads) {
      const faces = workshop.riserJoinery.pockets.filter(p=>p.hostId===tread.id).map(p=>p.face);
      assert.deepEqual(faces.sort(),['top','underside'],tread.id);
    }
    const jobs = workshop.housings.beams.filter(b=>b.pockets.length).map(beam=>compileHousingJob(beam,project.cam));
    for (const part of workshop.parts.filter(p=>['tread','landing'].includes(p.kind))) {
      for (const result of riserFaceResults(part,project,workshop.riserJoinery.issues)) {
        assert.ok(result.job,result.problem);
        jobs.push(result.job);
      }
    }
    for (const job of jobs) {
      const moves = readSegments(writeLinuxCnc(job));
      const {origin,xAxis,yAxis,zAxis} = job.stock.frame;
      for (const pocket of job.stock.pockets.filter(p=>p.riserId)) {
        assert.ok(expected.delete(pocket.id),pocket.id);
        const segments = moves.get(pocket.id).filter(s=>s[2]>=pocket.tongueDepth);
        assert.ok(segments.length,pocket.id);
        for (const corner of pocket.tongueWorldContour) {
          const projectAxis = axis=>(corner.x-origin.x)*axis.x+(corner.y-origin.y)*axis.y+(corner.z-origin.z)*axis.z;
          assert.ok(Math.abs(projectAxis(zAxis))<1e-5,pocket.id);
          const x=projectAxis(xAxis), y=projectAxis(yAxis);
          const gap=Math.min(...segments.map(s=>distance(x,y,s)));
          assert.ok(gap<=job.cam.toolDiameter/2,`${pocket.id} misses tongue corner by ${gap-job.cam.toolDiameter/2} mm`);
          worst=Math.max(worst,gap);
          checked++;
        }
      }
    }
    assert.equal(expected.size,0,'Missing toolpaths: '+[...expected].join(', '));
    cases++;
  }
}
console.log(`LinuxCNC: ${cases} configuraties, ${checked} liphoeken binnen het freesbereik op lipdiepte, grootste hartlijnafstand ${worst.toFixed(4)} mm.`);
