import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import * as IFC from 'web-ifc';
import {createIfc4WithApi} from '../src/ifc-export-core.js';
import {editWell, readProject, startSession} from '../src/project.js';
import {generateStairGeometry, starterProject} from '../src/stair.js';
import {createStairwellIfc} from '../src/stairwell-ifc.js';
import {emptyWell, newInstance} from '../src/stairwell.js';

const api = new IFC.IfcAPI();
await api.Init();
const folder = process.argv[2] === '--fixtures' && process.argv[3];
if (folder) await mkdir(folder, {recursive:true});
function inspect(bytes) {
  const id = api.OpenModel(bytes);
  try {
    const rootIds = api.GetLineIDsWithType(id, IFC.IFCROOT, true);
    const roots = Array.from({length:rootIds.size()}, (_, i) => api.GetLine(id, rootIds.get(i)));
    const guids = new Set(roots.map(r => r.GlobalId.value));
    assert(roots.length > 20);
    assert.equal(guids.size, roots.length, 'every IfcRoot needs a unique GlobalId');
    assert([...guids].every(g => /^[0-3][\w$]{21}$/.test(g)));
    return {guids, roots};
  } finally {
    api.CloseModel(id);
  }
}
const writeFixture = async (name, bytes) => {
  if (folder) await writeFile(join(folder, name + '.ifc'), bytes);
};
function regular(model) {
  return createIfc4WithApi(api, model, generateStairGeometry(model.stair)).bytes;
}
const archive = structuredClone(starterProject);
delete archive.bim.modelId;
Object.assign(archive.stair, {nlsfbCode:'24.10', riserBoards:'closed', riserJoint:'housed', wellatType:'chamfered'});
const model = readProject(archive);
assert.throws(() => createIfc4WithApi(api, {...model, stairEnabled:false}, null), /traptype/);
assert.equal(readProject(structuredClone(archive)).bim.modelId, model.bim.modelId);
assert.equal(readProject(JSON.parse(JSON.stringify(model))).bim.modelId, model.bim.modelId);
assert.throws(() => readProject({...archive, bim:{...archive.bim, modelId:'123'}}), /identificatie/);
let scenarios = 0;
for (const type of ['quarter_turn', 'quarter_winder', 'half_winder']) {
  for (const hand of ['left', 'right']) {
    const original = structuredClone(model);
    Object.assign(original.stair, {type, turnDirection:hand, nosing:-25});
    const before = regular(original);
    const {guids, roots} = inspect(before);
    const revised = readProject(JSON.parse(JSON.stringify(original)));
    Object.assign(revised.project, {name:'Ander projectopschrift', number:'B-024', revision:'C'});
    Object.assign(revised.bim, {originX:25000, originRotationDeg:20});
    Object.assign(revised.stair, {mark:'T-B', name:'Nieuwe trapnaam', nosing:25});
    const after = regular(revised);
    const revision = inspect(after);
    const productTypes = [IFC.IFCSTAIR, IFC.IFCSTAIRFLIGHT, IFC.IFCSLAB, IFC.IFCMEMBER, IFC.IFCPLATE];
    const partsByTag = (list, mark) => new Map(list.filter(r => productTypes.includes(r.type))
      .map(r => [r.Tag.value.slice(mark.length), r.GlobalId.value]));
    assert.deepEqual(partsByTag(roots, original.stair.mark), partsByTag(revision.roots, revised.stair.mark), type + '/' + hand);
    const repeated = inspect(regular(original));
    assert.deepEqual(repeated.guids, guids);
    if (scenarios === 0) {
      const independent = structuredClone(original);
      independent.bim.modelId = crypto.randomUUID();
      const other = inspect(regular(independent)).guids;
      assert([...other].every(guid => !guids.has(guid)), 'independently authored projects must be disjoint');
    }
    await writeFixture(type + '-' + hand, before);
    scenarios++;
  }
}
const proxyModel = structuredClone(model);
Object.assign(proxyModel.stair, {type:'quarter_turn', nlsfbLandingCode:'23.11'});
proxyModel.engineering.structureType = 'grating';
const proxy = regular(proxyModel);
await writeFixture('grating', proxy);
const proxyRoots = inspect(proxy).roots;
const classified = proxyRoots.filter(r => r.type === IFC.IFCRELASSOCIATESCLASSIFICATION)
  .flatMap(r => r.RelatedObjects.map(h => h.value));
assert(proxyRoots.filter(r => r.type === IFC.IFCBUILDINGELEMENTPROXY).every(p => classified.includes(p.expressID)));
proxyModel.stair.nlsfbCode = '';
const partial = inspect(regular(proxyModel)).roots;
const [onlyLanding] = partial.filter(p => p.type === IFC.IFCRELASSOCIATESCLASSIFICATION);
assert.deepEqual(onlyLanding.RelatedObjects.map(h => h.value),
  partial.filter(p => p.ObjectType?.value === 'Ruimtereservering bordes').map(p => p.expressID));
const well = structuredClone(emptyWell);
for (const family of ['concrete', 'spiral']) {
  const stair = newInstance(family, well, 0);
  if (family === 'concrete') Object.assign(stair.params,{layout:'return', guards:'none'});
  else stair.x += 10000;
  well.instances.push(stair);
}
well.uid = 'ifc-semantics-fixture';
const assembly = await createStairwellIfc(model.project, well);
const complete = inspect(assembly);
assert.equal(complete.roots.filter(r => r.type === IFC.IFCSTAIR).length, 2);
await writeFixture('componenten', assembly);
for (const number of ['LEGACY-01', '', 'Project met spaties']) {
  const old = {...archive, project:{...archive.project, number}, stairwell:{...well, uid:null}};
  const loaded = readProject(old);
  const edited = editWell(startSession(loaded), {...loaded.stairwell, width:loaded.stairwell.width + 10}).model;
  const selected = m => ({...m.stairwell, instances:[m.stairwell.instances[1]]});
  const before = inspect(await createStairwellIfc(loaded.project, selected(loaded))).guids;
  const after = inspect(await createStairwellIfc({...edited.project,number:'Herzien'}, selected(readProject(edited)))).guids;
  assert.deepEqual(before, after, 'unchanged component identifiers survive migration, first edit and rename');
}
console.log(`BIM IFC4: ${scenarios} gesloten bordes-/verdreven trappen in twee revisies, onderscheid tussen projecten, classificaties en twee trapcomponenten gecontroleerd.`);
