import assert from 'node:assert/strict';
import { calculateEstimate, generateStairGeometry, starterProject } from '../src/stair.js';
import { buildStairDetails } from '../src/stair-details.js';
import { devriesTwoQuarterSettings } from '../src/two-quarter-settings.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { winderIssues } from '../src/winder.js';
import { makePartsCsvRows } from '../src/winder-parts.js';
import { timberSheetParts, timberViews, timberDetailDxf } from '../src/timber-sheet.js';
import { compileTreadJob, writeTreadLinuxCnc } from '../src/tread-cam.js';
import { buildHousings } from '../src/housings.js';
import { compileHousingJob } from '../src/housing-cam.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .0001,
  `${label}: ${actual} / ${expected}`);
const area = points => Math.abs(points.reduce((sum, point, i) => {
  const next = points[(i + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2;

let sheets = 0, contours = 0, smallerTools = 0;
for (const changes of [
  {},
  { nosing:-15 }, { nosing:15 },
  { firstQuarterAngles:[17,18,19,20,16] },
  { secondQuarterAngles:[15,17,19,20,19], outerLength:3300, outerDepth:1100 },
  { firstQuarterAngles:[22.5,22.5,22.5,22.5], secondQuarterAngles:[15,15,15,15,15,15],
    outerLength:3300, outerDepth:1100 }
]) {
  let left;
  for (const turnDirection of ['left','right']) {
    const model = structuredClone(starterProject);
    Object.assign(model.stair, devriesTwoQuarterSettings, changes, {turnDirection});
    model.joinery.type = 'none';
    const stair = model.stair;
    assert.deepEqual(winderIssues(stair), []);
    const geometry = generateStairGeometry(stair);
    const shop = buildWorkshop(geometry,model);
    const parts = individualTreads(shop);
    const details = buildStairDetails(stair,geometry);
    const boards = details.filter(p => p.role === 'riser').sort((a,b) => a.riserFrame.origin.z-b.riserFrame.origin.z);
    assert.equal(boards.length,16);
    assert.equal(parts.length,15);
    const expected = [...stair.firstQuarterAngles, ...Array(stair.middleSteps).fill(0), ...stair.secondQuarterAngles];
    for (let i=0; i<expected.length; i++) {
      const a = boards[i].direction, b = boards[i+1].direction;
      const delta = Math.atan2(a.x*b.y-a.y*b.x, a.x*b.x+a.y*b.y)*180/Math.PI;
      near(delta, turnDirection === 'left' ? expected[i] : -expected[i], boards[i].id + ' snijrichting');
    }
    const extents = [geometry.footprint.width, geometry.footprint.depth].sort((a,b) => b-a);
    assert(Math.abs(extents[0]-stair.outerLength)<.02 && Math.abs(extents[1]-stair.outerDepth)<.02,
      'Buitenmaten van treden en bomen: '+extents);
    assert.deepEqual(parts.map(p => p.isWinder), [
      ...stair.firstQuarterAngles.map(() => true), ...Array(stair.middleSteps).fill(false),
      ...stair.secondQuarterAngles.map(() => true)
    ]);
    const [header, ...rows] = makePartsCsvRows(shop, stair.material);
    const net = header.indexOf('Netto m3');
    assert(net >= 0);
    near(rows.reduce((sum,row) => sum + Number(row[net]), 0), shop.volume, 'onderdelenstaat');
    const estimate = calculateEstimate(shop, model.estimate);
    near(estimate.materialVolume, shop.blankVolume * model.estimate.wasteFactor, 'houtinkoop');
    if (left) near(estimate.materialVolume, left.materialVolume, 'gespiegelde houtinkoop');
    else left = estimate;

    // Probe the full tread thickness against both sawn stringer faces. A
    // small geometric contact check is distinct from the chosen shop joint.
    const contact = buildHousings(geometry,{depth:1,clearance:.4,endMargin:1});
    for (const tread of contact.treads)
      assert.equal(new Set(tread.tongues.map(t => t.side)).size, 2, 'Wangaansluiting ' + tread.id);
    if (changes.firstQuarterAngles == null && changes.secondQuarterAngles == null) {
      const actual = buildHousings(geometry, starterProject.joinery);
      assert(actual.issues.some(issue => issue.code === 'missing-support'));
      const blocked = actual.beams.find(beam => beam.issues.some(i => i.level === 'error'));
      assert.throws(() => compileHousingJob(blocked,model.cam),/ruimte|lip|huis/i);
    }

    for (const [i,part] of parts.entries()) {
      const tread = geometry.treads[i];
      near(area(part.contour), area(tread.points), part.id + ' plankcontour');
      let job;
      try { job = compileTreadJob(part,model.treadCam); }
      catch (error) {
        assert.match(error.message,/aangrenzende contourkant/);
        job = compileTreadJob(part,{ ...model.treadCam, toolDiameter:2 });
        smallerTools++;
      }
      assert.equal(job.partId,part.id);
      near(area(job.contour),area(tread.points),part.id + ' CNC-contour');
      assert(writeTreadLinuxCnc(job).endsWith('M2\n'));
      contours++;
    }
    for (const row of timberSheetParts(shop, boards)) {
      const views = timberViews(row);
      assert(views.some(view => view.paths.some(p => p.closed)), row.id);
      assert(timberDetailDxf(row,views).includes(row.id),row.id);
      sheets++;
    }
  }
}
console.log(`Compacte tweekwart links/rechts: ${sheets} werkbladen, ${contours} tredeprogramma's (${smallerTools} met een kleinere frees), wangaansluitingen en houtinkoop gecontroleerd.`);
