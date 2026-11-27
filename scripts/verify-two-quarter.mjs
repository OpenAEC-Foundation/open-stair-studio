import assert from 'node:assert/strict';
import {generateStairGeometry, starterProject} from '../src/stair.js';
import {winderIssues} from '../src/winder.js';
import {buildWorkshop} from '../src/workshop.js';
import {compileHousingJob, writeLinuxCnc, writeHousingDxf} from '../src/housing-cam.js';
import {compileTreadJob, writeTreadLinuxCnc} from '../src/tread-cam.js';
import {verifyTreadFit} from '../src/tread-fit.js';
import {riserFaceResults} from '../src/riser-face-cam.js';
import {checkRiserBoardFit} from '../src/riser-board-fit.js';
import {compileRiserBoardJob, writeRiserBoardLinuxCnc} from '../src/riser-board-cam.js';
import {timberSheetParts, timberViews, timberDetailDxf} from '../src/timber-sheet.js';

const base = {...starterProject.stair, type:'two_quarter_winder', windersPerQuarter:5, middleSteps:5,
  entrySteps:0, risers:16, floorHeight:2900, going:220.513, width:966, stringerThickness:38,
  riserBoards:'closed', riserJoint:'housed', wel:45};
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-6, a+' ≠ '+b);
for (const [override, message] of [
  [{middleSteps:0},/rechte trede/], [{middleSteps:1.5},/rechte trede/],
  [{risers:15},/16 optredes/], [{entrySteps:1},/nul tot 0/],
  [{width:900, stringerThickness:50, going:250, nosing:-60},/eindzaagsnede kruist het verstek/],
]) {
  const stair = {...base, ...override};
  assert.match(winderIssues(stair).join(' '), message);
  assert.equal(generateStairGeometry(stair).treads.length,0);
}

function verifyLayout(stair, geometry) {
  const {treads, dimensions:d, walkline} = geometry;
  const hand = stair.turnDirection === 'right' ? -1 : 1;
  assert.equal(treads.length, stair.risers-1);
  assert.equal(geometry.landings.length, 0);
  const start = d.entrySteps + d.perQuarter;
  const end = start + d.middleSteps;
  const expected = [...Array(d.entrySteps).fill(false), ...Array(d.perQuarter).fill(true),
    ...Array(d.middleSteps).fill(false), ...Array(d.perQuarter).fill(true), ...Array(d.exitSteps).fill(false)];
  assert.deepEqual(treads.map(t=>t.isWinder), expected);
  // Measure each middle interval between two independent physical nose planes.
  for (let i=start; i<end; i++) {
    const first = treads[i].frontEdge, next = treads[i+1].frontEdge;
    close(first[0].y, first[1].y);
    close(next[0].y, next[1].y);
    close(hand*(next[0].y-first[0].y), stair.going);
    close(treads[i].goingAtWalkline, stair.going);
  }
  for (let j=start*8; j<=end*8; j++) close(walkline[j].x,walkline[start*8].x);
  close(hand*(walkline[end*8].y-walkline[start*8].y),d.middleSteps*stair.going);
  close(hand*walkline.at(-1).y,2*d.radius+d.middleSteps*stair.going);
  for (const beam of geometry.stringers) {
    assert.ok(beam.volume>0 && beam.blankVolume>=beam.volume-1e-9,beam.id);
  }
}

for (const middleSteps of [1,3,7]) for (const entrySteps of [-1,0,3]) {
  const stair = {...base, middleSteps, entrySteps, risers:14+middleSteps};
  const geometry = generateStairGeometry(stair);
  verifyLayout(stair,geometry);
  assert.equal(geometry.dimensions.entrySteps,entrySteps<0?1:entrySteps);
}

let treadPrograms=0, boardSetups=0, housingSetups=0;
for (const outerShape of ['square','faceted']) for (const nosing of [-15,0,15]) {
  let left;
  for (const turnDirection of ['left','right']) {
    const stair = {...base, outerShape, nosing, turnDirection};
    assert.deepEqual(winderIssues(stair),[]);
    const model = {...starterProject, stair};
    const geometry = generateStairGeometry(stair);
    verifyLayout(stair,geometry);
    if (left) {
      for (const [i,tread] of geometry.treads.entries()) {
        close(tread.area,left.treads[i].area);
        for (const point of tread.points) assert.ok(left.treads[i].points.some(p=>
          Math.hypot(p.x-point.x,p.y+point.y)<1e-6),tread.id);
      }
      close(geometry.volume,left.volume);
    } else left=geometry;
    const shop = buildWorkshop(geometry,model);
    assert.deepEqual(shop.housings.issues,[]);
    assert.deepEqual(shop.riserJoinery.issues,[]);
    const expectedGrooves = new Set(shop.riserJoinery.pockets.map(p=>p.id));
    function checkHost(job) {
      const drawing = writeHousingDxf(job.stock);
      const program = writeLinuxCnc(job);
      for (const op of job.operations) {
        assert.ok(program.includes('(Pocket '+op.id+' '),op.id);
        if (op.riserId) {
          assert.ok(drawing.includes('OSS-STOOTBORD-D'));
          assert.ok(expectedGrooves.delete(op.id),op.id);
        }
      }
      housingSetups++;
    }
    for (const blank of shop.housings.beams.filter(b=>b.pockets.length)) checkHost(compileHousingJob(blank,model.cam));
    for (const part of shop.parts.filter(p=>p.kind==='tread')) {
      const job=compileTreadJob(part,model.treadCam);
      assert.deepEqual(verifyTreadFit(part,shop,model.cam,job).issues,[],part.id);
      assert.ok(writeTreadLinuxCnc(job).endsWith('M2\n'));
      for (const result of riserFaceResults(part,model,shop.riserJoinery.issues)) {
        assert.ok(result.job,result.problem);
        checkHost(result.job);
      }
      treadPrograms++;
    }
    assert.equal(expectedGrooves.size,0);
    const boards=shop.detailParts.filter(part=>part.role==='riser');
    assert.equal(boards.length,stair.risers);
    for (const part of boards) {
      const fit=checkRiserBoardFit(part,shop,model);
      assert.deepEqual(fit.problems,[],part.id);
      const job=compileRiserBoardJob(part,model.riserCam,{},shop.riserJoinery.issues,model.riserDetailCam);
      assert.ok(job.setups.length>0,part.id);
      for (const setup of job.setups) {
        assert.ok(writeRiserBoardLinuxCnc(job,setup).endsWith('M2\n'));
        boardSetups++;
      }
    }
    for (const row of timberSheetParts(shop,boards)) {
      const views=timberViews(row);
      assert.ok(views[0].paths.some(p=>p.mode==='joint'),row.id);
      assert.ok(timberDetailDxf(row,views).includes(row.id));
    }
  }
}
console.log('Tweekwartstrap gecontroleerd met '+treadPrograms+' tredeprogramma’s, '+boardSetups+
  ' stootbordopspanningen en '+housingSetups+' opspanningen voor huizen en groeven.');
