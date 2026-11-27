import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { readProject } from '../src/project.js';
import { generateStairGeometry } from '../src/stair.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { newelFaceSetups, compileNewelFaceJob, writeNewelLinuxCnc } from '../src/newel-cam.js';
import { compileTreadJob, writeTreadLinuxCnc, writeTreadCamJson } from '../src/tread-cam.js';
import { devriesIfcDepth, devriesNewelSettings } from '../src/two-quarter-settings.js';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { createIfcxWithApi } from '../src/ifcx-export.js';

const destination = process.argv[2];
if (!destination || destination.startsWith('--')) throw new Error('Geef een uitvoermap op.');
mkdirSync(destination, {recursive: true});
const variants = [['stuik', {}]];
if (process.argv.includes('--varianten')) {
  variants.push(['bronmaat', {outerDepth: devriesIfcDepth}], ['insteek', {lowerNewelHousing: 8, upperNewelHousing: 8,
    lowerNewelClearance: .4, upperNewelClearance: .4}], ['gemengd', {upperNewelHousing: 5}]);
}
const api = new IFC.IfcAPI();
await api.Init();
for (const [variant, settings] of variants) {
  for (const turnDirection of ['left', 'right']) {
    const hand = turnDirection === 'left' ? 'links' : 'rechts';
    const stem = 'spil-' + variant + '-' + hand;
    const model = readProject({project: {name: 'Tweekwart met spillen · ' + hand, number: 'OSS-SP', revision: 'A'},
      stair: {...structuredClone(devriesNewelSettings), ...settings, turnDirection, name: stem,
        mark: hand === 'links' ? 'TK-L' : 'TK-R'}, joinery: {type: 'none'}});
    const geometry = generateStairGeometry(model.stair);
    const {bytes} = createIfc4WithApi(api, model, geometry);
    const base = join(destination, stem);
    writeFileSync(base + '.oss.json', JSON.stringify(model, null, 2) + '\n');
    const td15 = individualTreads(buildWorkshop(geometry, model)).find(p => p.level === 15);
    const job = compileTreadJob(td15, model.treadCam, model.project);
    writeFileSync(base + '-TD15.ngc', writeTreadLinuxCnc(job));
    writeFileSync(base + '-TD15.cam.json', writeTreadCamJson(job));
    for (const post of geometry.newels ?? []) {
      for (const face of newelFaceSetups(post).filter(f => f.pockets.length)) {
        const job = compileNewelFaceJob(face, model.cam, {...model.project, stairMark: model.stair.mark});
        writeFileSync(base + '-' + post.corner + '-' + face.id + '.ngc', writeNewelLinuxCnc(job));
      }
    }
    writeFileSync(base + '.ifc', bytes);
    writeFileSync(base + '.ifcx', JSON.stringify(createIfcxWithApi(api, bytes)));
  }
}
