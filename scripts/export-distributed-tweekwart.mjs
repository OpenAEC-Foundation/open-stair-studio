import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { readProject } from '../src/project.js';
import { generateStairGeometry } from '../src/stair.js';
import { devriesDistributedSettings, devriesIfcDepth } from '../src/two-quarter-settings.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { compileTreadJob, writeTreadLinuxCnc, writeTreadCamJson } from '../src/tread-cam.js';
import { verifyTreadFit } from '../src/tread-fit.js';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { createIfcxWithApi } from '../src/ifcx-export.js';

const directory = process.argv[2];
if (!directory) throw new Error('Geef een uitvoermap op.');
mkdirSync(directory, {recursive: true});
const api = new IFC.IfcAPI();
await api.Init();
for (const [variant, outerDepth] of [['nominaal', 992], ['bronmaat', devriesIfcDepth], ['td4-proef', devriesIfcDepth]]) {
  for (const [hand, turnDirection] of [['links', 'left'], ['rechts', 'right']]) {
    const stem = 'verdrijving-' + variant + '-' + hand;
    const base = join(directory, stem);
    const model = readProject({project: {name: stem, number: 'OSS-VD', revision: 'A'},
      stair: {...structuredClone(devriesDistributedSettings), outerDepth, turnDirection,
        name: stem, mark: hand === 'links' ? 'TK-L' : 'TK-R'}, joinery: {type: 'none'}});
    if (variant === 'td4-proef') model.stair.firstQuarterOffsets[3] += 5;
    const geometry = generateStairGeometry(model.stair);
    const workshop = buildWorkshop(geometry, model);
    const {bytes} = createIfc4WithApi(api, model, geometry);
    writeFileSync(base + '.oss.json', JSON.stringify(model, null, 2) + '\n');
    writeFileSync(base + '.ifc', bytes);
    writeFileSync(base + '.ifcx', JSON.stringify(createIfcxWithApi(api, bytes)));
    for (const part of individualTreads(workshop)) {
      const file = base + '-TD' + String(part.level).padStart(2, '0');
      const job = compileTreadJob(part, model.treadCam, model.project);
      const fit = verifyTreadFit(part, workshop, model.cam, job);
      writeFileSync(file + '.ngc', writeTreadLinuxCnc(job));
      writeFileSync(file + '.cam.json', writeTreadCamJson(job, fit));
    }
  }
}
