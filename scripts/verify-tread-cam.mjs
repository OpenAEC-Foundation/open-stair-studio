import assert from 'node:assert/strict';
import { generateStairGeometry, stairFamilies, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { compileTreadJob, defaultTreadCam, treadFileStem, validateTreadCamField,
  writeTreadCamJson, writeTreadLinuxCnc } from '../src/tread-cam.js';

const close = (a,b,tol=.00011) => assert(Math.abs(a-b) <= tol, `${a} and ${b} differ`);
const d = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
// Independently interpret the emitted controller blocks. Check the XY stock
// envelope of the cutter, pass progression, feeds and the complete closed lap.
function readProgram(nc, job) {
  const {parameters:cam,stock,levels,path} = job;
  const lines = nc.trimEnd().split('\n');
  assert.equal(lines.at(-1), 'M2');
  assert(lines.includes('G21 G17 G90 G94 G97 G40 G49 G80 G61 G54'));
  const body = [];
  let defining = false, running = false, feed = 0, z = NaN, pass = -1, pos = 0;
  let x = NaN, y = NaN, calls = 0;
  function move(line) {
    const opcode = line.split(' ')[0];
    const words = Object.fromEntries(Array.from(line.matchAll(/([FXYZ])(-?[\d.]+)/g), m=>[m[1],Number(m[2])]));
    if (words.F !== undefined) feed=words.F;
    if (words.X !== undefined) {
      x=words.X; y=words.Y;
      if (opcode === 'G0') assert(z === cam.safeZ && running);
      else {
        assert(opcode === 'G1' && running && pass >= 0 && feed === cam.cutFeed);
        pos++;
        close(x,path[pos].x); close(y,path[pos].y);
      }
      const radius=cam.toolDiameter/2;
      assert(x >= radius-.0001 && x <= stock.length-radius+.0001);
      assert(y >= radius-.0001 && y <= stock.width-radius+.0001);
    }
    if (words.Z !== undefined) {
      if (opcode === 'G0') {
        assert.equal(words.Z,cam.safeZ);
      } else {
        assert(opcode === 'G1' && running && feed === cam.plungeFeed);
        if (pass >= 0) {
          assert.equal(pos,path.length-1);
          assert(z-words.Z <= cam.stepDown+.0001);
        } else assert(-words.Z <= cam.stepDown+.0001);
        close(x,path[0].x); close(y,path[0].y);
        close(words.Z,levels[++pass]);
        pos=0;
      }
      z=words.Z;
    }
  }
  for (const line of lines) {
    assert(line.length < 250);
    if (line.startsWith('(')) {
      assert(/^\([^()]*\)$/.test(line));
      assert(!/^\((debug|print|msg|log|abort|probe)/i.test(line));
      continue;
    }
    if (line === 'o1000 sub') defining=true;
    else if (line === 'o1000 endsub') defining=false;
    else if (defining) body.push(line);
    else if (line === 'o1000 call') {
      assert(body.length > 0); body.forEach(move); calls++;
    } else if (line.startsWith('M3 S')) { running=true; close(Number(line.slice(4)),cam.spindleSpeed); }
    else if (line === 'M5') { running=false; assert.equal(z,cam.safeZ); }
    else move(line);
  }
  assert.equal(pass+1,levels.length);
  assert.equal(pos,path.length-1);
  assert.equal(running,false);
  close(levels.at(-1),-(job.stock.thickness+cam.breakthrough));
  if (body.length) assert.equal(calls,levels.length);
  return calls;
}

const meta = { number:'QA Maatwerk', revision:'C', stairMark:'TR-05' };
let count=0,pairs=0,largest, thick;
for (const family of stairFamilies) {
  const hands = family.winder ? ['left','right'] : ['left'];
  const shapes = family.winder ? ['square','faceted'] : ['square'];
  for (const turnDirection of hands) for (const outerShape of shapes) {
    const model = structuredClone(starterProject);
    Object.assign(model.stair, { type:family.id, turnDirection, outerShape });
    const shop = buildWorkshop(generateStairGeometry(model.stair),model);
    assert.deepEqual(shop.housings.issues,[]);
    for (const part of shop.parts.filter(p=>p.kind === 'tread')) {
      if (!largest || part.contour.length > largest.contour.length) largest=part;
      thick=part;
      const job=compileTreadJob(part,defaultTreadCam,meta);
      assert.equal(job.tongues.length,part.tongueCount);
      for (const tongue of job.tongues) {
        const rootReliefs=job.reliefs.filter(r=>r.pocketId === tongue.pocketId);
        assert.equal(rootReliefs.length,2);
        const world=shop.housings.treads.find(t=>t.id===part.id).tongues.find(t=>t.pocketId===tongue.pocketId);
        for (const [i,p] of tongue.points.entries()) {
          const {origin,xAxis,yAxis}=part.boardFrame;
          const x=p.x-job.offset.x, y=p.y-job.offset.y;
          close(world.points[i].x,origin.x+x*xAxis.x+y*yAxis.x);
          close(world.points[i].y,origin.y+x*xAxis.y+y*yAxis.y);
        }
        for (const r of rootReliefs) {
          close(d(r.center,r.corner),job.parameters.toolDiameter/2);
          // Cutter-centre at the root stays exactly one radius off the flank.
          const k=d(r.corner,tongue.points[0])<.0001 ? 0 : 3;
          const flank={x:tongue.points[k===0?1:2].x-r.corner.x,y:tongue.points[k===0?1:2].y-r.corner.y};
          close((r.center.x-r.corner.x)*flank.x+(r.center.y-r.corner.y)*flank.y,0);
        }
        pairs++;
      }
      readProgram(writeTreadLinuxCnc(job),job);
      const payload=JSON.parse(writeTreadCamJson(job,{status:'example'}));
      assert.equal(payload.partId,part.id); assert.equal(payload.stock.margin,defaultTreadCam.stockMargin);
      assert.deepEqual(payload.path,job.path);
      count++;
    }
  }
}

for (const key of Object.keys(defaultTreadCam)) assert.throws(()=>validateTreadCamField(key,NaN));
assert.throws(()=>compileTreadJob(thick,{...defaultTreadCam,fluteLength:40}),/snijlengte/i);
assert.throws(()=>compileTreadJob(thick,{...defaultTreadCam,stockMargin:2}),/overmaat/i);
assert.throws(()=>compileTreadJob(thick,{...defaultTreadCam,plungeFeed:1000}),/insteekvoeding/i);
const longBoard={...largest,thickness:140};
const deep=compileTreadJob(longBoard,{...defaultTreadCam,stepDown:.1,fluteLength:148});
assert(readProgram(writeTreadLinuxCnc(deep),deep)>0);
const bad={...thick,id:'P)\nM30\n('};
assert(!writeTreadLinuxCnc(compileTreadJob(bad,defaultTreadCam,{number:'(DEBUG,one)'})).includes('\nM30\n'));
assert(treadFileStem({...bad,id:'S'.repeat(280)+'-TD-31'},meta).includes('-TD-31'));
const points=coords=>coords.map(([x,y])=>({x,y}));
const slot={id:'SLOT',width:100,length:100,thickness:12,tongues:[],nose:points([[0,0],[100,0]]),
  contour:points([[0,0],[100,0],[100,100],[52,100],[52,55],[48,55],[48,100],[0,100]])};
assert.throws(()=>compileTreadJob(slot),/ontlasting|contourkant/);
assert.doesNotThrow(()=>compileTreadJob(slot,{...defaultTreadCam,toolDiameter:2}));
assert.throws(()=>compileTreadJob({...slot,contour:points([[0,0],[100,100],[0,100],[95,0]])}),/zichzelf/);
function shoulderTestPart(endMargin) {
  const model=structuredClone(starterProject);
  model.joinery.endMargin=endMargin;
  return buildWorkshop(generateStairGeometry(model.stair),model).parts.find(p=>p.level===8);
}
assert.throws(()=>compileTreadJob(shoulderTestPart(6)),/geen vlakke schouder/);
assert.throws(()=>compileTreadJob(shoulderTestPart(6.0001)),/geen vlakke schouder/);
assert.doesNotThrow(()=>compileTreadJob(shoulderTestPart(6.001)));
// Each T-bone takes 6 mm from the *same* shoulder between these two tongues.
function twoTongues(gap) {
  const lip=(x,id)=>({pocketId:id,points:points([[x,20],[x,8],[x+15,8],[x+15,20]])});
  const a=lip(20,'A'), b=lip(35+gap,'B');
  return {...slot, tongues:[a,b], contour:[{x:0,y:20},...a.points,...b.points,...points([[100,20],[100,85],[0,85]])]};
}
assert.throws(()=>compileTreadJob(twoTongues(12)),/geen vlakke schouder/);
const barelySeparate=compileTreadJob(twoTongues(12.001));
const smallest=Math.min(...barelySeparate.reliefs.map(r=>r.remainingShoulderLength));
close(smallest,.001);
console.log(`Tread CAM: ${count} emitted programs re-read, ${pairs} tongue pairs and shoulder reliefs, deep O-subroutine and unreachable slots checked.`);
