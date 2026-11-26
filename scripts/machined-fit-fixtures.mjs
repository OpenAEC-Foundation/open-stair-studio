// Export actual controller programs together with the independent assembly geometry.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { compileHousingJob, writeLinuxCnc } from '../src/housing-cam.js';
import { compileTreadJob, defaultTreadCam, writeTreadLinuxCnc } from '../src/tread-cam.js';
import { verifyTreadFit } from '../src/tread-fit.js';

const target = process.argv[2];
if (!target) throw new Error('Supply a temporary fixture directory.');

function fixture(name, stair, joinery = {}, housingCam = {}, treadCam = {}, expectFit = true) {
  const dir = join(target, name);
  mkdirSync(dir, { recursive: true });
  const model = {
    ...starterProject, stair: { ...starterProject.stair, ...stair },
    joinery: { ...starterProject.joinery, ...joinery }, cam: { ...starterProject.cam, ...housingCam }
  };
  const settings = { ...defaultTreadCam, ...treadCam };
  const design = generateStairGeometry(model.stair);
  const shop = buildWorkshop(design, model);
  if (shop.housings.issues.length) throw new Error(name + ': ' + JSON.stringify(shop.housings.issues));
  const beams = shop.housings.beams.map(beam => {
    const raw = design.stringers.find(b => b.id === beam.id);
    if (beam.pockets.length) {
      writeFileSync(join(dir, beam.id + '.ngc'), writeLinuxCnc(compileHousingJob(beam, model.cam)));
    }
    return { id: beam.id, frame: beam.frame, raw };
  });
  const treads = shop.parts.filter(p => p.kind === 'tread').map(part => {
    const raw = design.treads.find(t => t.id === part.id);
    const assembled = shop.housings.treads.find(t => t.id === part.id);
    const job = compileTreadJob(part, settings);
    writeFileSync(join(dir, part.id + '.ngc'), writeTreadLinuxCnc(job));
    return {
      id: part.id, nose: part.nose, worldNose: raw.frontEdge ?? [raw.points[0], raw.points[3]],
      visible: raw.points, profile: assembled.points, tongues: assembled.tongues, elevation: raw.elevation, thickness: raw.thickness,
      length: part.length, width: part.width, status: verifyTreadFit(part, shop, model.cam, job).status
    };
  });
  writeFileSync(join(dir, 'assembly.json'), JSON.stringify({
    beams, treads, expectFit, joinery: model.joinery, housingCam: model.cam, treadCam: settings
  }));
}

for (const type of ['straight', 'quarter_turn', 'half_turn', 'landing']) fixture(type, { type });
for (const type of ['quarter_winder', 'half_winder']) {
  for (const turnDirection of ['left', 'right']) for (const outerShape of ['square', 'faceted']) {
    fixture([type, turnDirection, outerShape].join('-'), { type, turnDirection, outerShape });
  }
}
fixture('changed-tools-and-stock', {
  type: 'half_winder', turnDirection: 'right', outerShape: 'faceted',
  treadThickness: 32, risers: 20, width: 1000
}, { depth: 9.7, clearance: .8, endMargin: 16 },
{ toolDiameter: 4, stepDown: 2.7, stepoverPercent: 63 },
{ toolDiameter: 5, stockMargin: 18, stepDown: 3.7, breakthrough: .8 });
fixture('rounded-interference', { type: 'quarter_winder', turnDirection: 'right' },
  {}, { cornerMode: 'rounded' }, {}, false);
fixture('rounded-clearance', { type: 'quarter_winder', turnDirection: 'left', outerShape: 'faceted' },
  { clearance: 3 }, { cornerMode: 'rounded', toolDiameter: 8 });
fixture('zero-nominal-clearance', { type: 'straight', risers: 8, floorHeight: 1280 }, { clearance: 0 });

// With a six-millimetre end shoulder, a D6 tangential relief consumes its
// entire flat. A point contact at the very end must not certify a shoulder.
const matched = { ...starterProject, joinery: { ...starterProject.joinery, endMargin: 6 } };
const shop = buildWorkshop(generateStairGeometry(matched.stair), matched);
const middle = shop.parts.find(p => p.id.endsWith('TD-08'));
assert.throws(() => compileTreadJob(middle, { ...defaultTreadCam, toolDiameter: 6 }), /schouder/i);
