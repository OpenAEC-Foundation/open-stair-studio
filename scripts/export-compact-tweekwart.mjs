import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { readProject } from '../src/project.js';
import { generateStairGeometry } from '../src/stair.js';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { createIfcxWithApi } from '../src/ifcx-export.js';
import { devriesTwoQuarterSettings } from '../src/two-quarter-settings.js';

const destination = process.argv[2];
if (!destination || destination.startsWith('--')) {
  throw new Error('Geef een uitvoermap op. Voeg --varianten toe voor de maatproef op 3300 × 1100 mm.');
}
mkdirSync(destination, { recursive: true });
const api = new IFC.IfcAPI();
await api.Init();

const layouts = [{ settings: devriesTwoQuarterSettings }];
if (process.argv.includes('--varianten')) {
  layouts.push(
    { settings: { ...devriesTwoQuarterSettings, outerLength: 3300, outerDepth: 1100,
      secondQuarterAngles: [15, 17, 19, 20, 19] } },
    { settings: { ...devriesTwoQuarterSettings, firstQuarterAngles: [17, 18, 19, 20, 16] }, stem: 'eerste-kwart' },
    { settings: { ...devriesTwoQuarterSettings, nosing: -15 }, stem: 'positie-min15' },
    { settings: { ...devriesTwoQuarterSettings, nosing: 15 }, stem: 'positie-plus15' }
  );
}
for (const { settings: layout, stem } of layouts) {
  for (const turnDirection of ['left', 'right']) {
    const hand = turnDirection === 'left' ? 'links' : 'rechts';
    const size = layout.outerLength + 'x' + layout.outerDepth;
    const filename = 'tweekwart-' + (stem ?? size) + '-' + hand;
    const name = 'Dichte tweekwart ' + layout.outerLength + ' × ' + layout.outerDepth + ' mm · ' + hand;
    const model = readProject({
      project: { name, number: 'OSS-TK-' + size, revision: 'A' },
      stair: {
        ...structuredClone(layout), turnDirection, mark: hand === 'links' ? 'TK-L' : 'TK-R', name
      },
      joinery: { type: 'none' }
    });
    const geometry = generateStairGeometry(model.stair);
    const { bytes } = createIfc4WithApi(api, model, geometry);
    const base = join(destination, filename);
    writeFileSync(base + '.oss.json', JSON.stringify(model, null, 2) + '\n');
    writeFileSync(base + '.ifc', bytes);
    writeFileSync(base + '.ifcx', JSON.stringify(createIfcxWithApi(api, bytes)));
    console.log(filename);
  }
}
