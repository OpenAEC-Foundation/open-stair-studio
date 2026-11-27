import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as IFC from 'web-ifc';
import {readProject} from '../src/project.js';
import {generateStairGeometry} from '../src/stair.js';
import {createIfc4WithApi} from '../src/ifc-export-core.js';
import {createIfcxWithApi} from '../src/ifcx-export.js';

const destination = process.argv[2];
if (!destination) throw new Error('Geef een uitvoermap op.');
mkdirSync(destination, {recursive: true});
const source = JSON.parse(readFileSync(new URL('../examples/bim-steektrap-vergelijking.oss.json', import.meta.url)));
const api = new IFC.IfcAPI();
await api.Init();
if (process.argv.includes('--bordessen')) {
  for (const turnDirection of ['left', 'right']) for (const nosing of [-15, 15]) {
    for (const riserJoint of ['butt', 'housed']) {
      const model = readProject({...source, joinery: {type: 'housed'}, stair: {
        ...source.stair, type: 'half_turn', wel: 45, turnDirection, nosing, riserJoint,
        landingLength: 1000, landingThickness: 40, laneGap: 100, wellatType: 'none'
      }});
      const name = [turnDirection, nosing, riserJoint].join('_');
      const bytes = createIfc4WithApi(api, model, generateStairGeometry(model.stair)).bytes;
      writeFileSync(join(destination, name + '.ifc'), bytes);
      writeFileSync(join(destination, name + '.ifcx'), JSON.stringify(createIfcxWithApi(api, bytes)));
    }
  }
  process.exit(0);
}
for (const family of ['straight', 'two_quarter_winder']) {
  const turning = family === 'two_quarter_winder';
  for (const hand of turning ? ['left','right'] : ['left']) {
    for (const position of [-15,0,15]) {
      const name = [turning ? 'tweekwart' : 'steek', hand, position].join('_');
      const model = readProject({
        ...source,
        project: {...source.project, name: 'BIM-vergelijking ' + name},
        stairwell: {...source.stairwell, uid: name},
        stair: {...source.stair, name, type: family, turnDirection: hand, nosing: position, wel: 45,
          ...(turning ? {floorHeight: 2900, width: 966, going: 220.513, entrySteps: 0,
            windersPerQuarter: 5, middleSteps: 5, outerShape: 'square'} : {})}
      });
      const bytes = createIfc4WithApi(api, model, generateStairGeometry(model.stair)).bytes;
      writeFileSync(join(destination, name + '.oss.json'), JSON.stringify(model, null, 2));
      writeFileSync(join(destination, name + '.ifc'), bytes);
      writeFileSync(join(destination, name + '.ifcx'), JSON.stringify(createIfcxWithApi(api, bytes)));
    }
  }
}
