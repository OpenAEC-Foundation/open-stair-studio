import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as IFC from 'web-ifc';
import {createIfc4WithApi} from '../src/ifc-export-core.js';
import {createIfcxWithApi} from '../src/ifcx-export.js';
import {generateStairGeometry, starterProject} from '../src/stair.js';
import {createStairwellIfc} from '../src/stairwell-ifc.js';

const api = new IFC.IfcAPI();
await api.Init();
const destination = process.argv[2];
const source = node => node.attributes['openaec::ifc4'];
const meshOf = node => node.attributes['usd::usdgeom::mesh'];
let meshes = 0, products = 0;

function check(name, bytes) {
  const layer = JSON.parse(JSON.stringify(createIfcxWithApi(api, bytes)));
  assert.equal(layer.header.ifcxVersion, 'ifcx_alpha');
  const byPath = new Map(layer.data.map(node => [node.path,node]));
  const [root] = layer.data.filter(node => node.attributes['bsi::ifc::class'].code === 'IfcProject');
  const seen = new Set();
  function visit(node) {
    assert(node && !seen.has(node.path), 'Missing child or duplicate parent in ' + name);
    seen.add(node.path);
    for (const path of Object.values(node.children ?? {})) visit(byPath.get(path));
  }
  visit(root);
  assert.equal(seen.size, layer.data.length);
  for (const node of layer.data) {
    for (const assignment of source(node).assignments ?? []) {
      assert(assignment.targets.length && assignment.targets.every(path => byPath.has(path)));
    }
  }
  const id = api.OpenModel(bytes);
  try {
    const byGuid = new Map(layer.data.map(node => [source(node).globalId, node]));
    const ids = api.GetLineIDsWithType(id, IFC.IFCPRODUCT, true);
    for (let i = 0; i < ids.size(); i++) {
      const obj = api.GetLine(id,ids.get(i));
      const node = byGuid.get(obj.GlobalId.value);
      assert(node, 'Missing IFCX product ' + obj.Name?.value);
      assert.equal(node.attributes['bsi::ifc::class'].code, api.GetNameFromTypeCode(obj.type));
      assert.equal(source(node).Tag, obj.Tag?.value);
      assert.match(node.path,/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/);
      for (const connection of source(node).connections ?? []) assert(byPath.has(connection.target));
      products++;
      if (!obj.Representation) { assert.equal(meshOf(node), undefined); continue; }
      const mesh = meshOf(node);
      assert(mesh && mesh.points.length >= 3 && mesh.faceVertexIndices.length >= 3);
      assert.equal(mesh.faceVertexIndices.length % 3, 0);
      assert(mesh.points.every(point => point.length === 3 && point.every(Number.isFinite)));
      assert(mesh.faceVertexIndices.every(index => Number.isInteger(index) && index >= 0 && index < mesh.points.length));
      meshes++;
    }
  } finally {api.CloseModel(id);}
  if (destination) {
    writeFileSync(join(destination,name+'.ifcx'), JSON.stringify(layer));
    writeFileSync(join(destination,name+'.ifc'), bytes);
  }
  return layer;
}

for (const [type,hand,nose] of [['straight','left',25],['quarter_turn','left',-25],
  ['quarter_winder','left',100], ['quarter_winder','right',-60], ['half_winder','left',-60], ['half_winder','right',100]]) {
  const model = structuredClone(starterProject);
  Object.assign(model.stair,{type,turnDirection:hand,nosing:nose,riserJoint:'housed',riserBoards:'closed',railSide:'none',nlsfbCode:'24.1'});
  Object.assign(model.bim,{originX:15000,originY:-3600,originZ:3200,originRotationDeg:33});
  const bytes = createIfc4WithApi(api,model,generateStairGeometry(model.stair)).bytes;
  const layer = check([type,hand,nose].join('-'),bytes);
  assert(layer.data.some(node => source(node).connections?.length));
  assert(layer.data.some(node => source(node).classifications?.length));
  assert(layer.data.some(node => source(node).propertySets));
  assert(layer.data.some(node => node.attributes['bsi::ifc::prop::TypeName']));
  const firstTread = layer.data.find(node => source(node).Tag === model.stair.mark+'-TD-01');
  const top = Math.max(...meshOf(firstTread).points.map(p=>p[2]));
  assert(Math.abs(top - (model.bim.originZ + model.stair.floorHeight/model.stair.risers)/1000) < 1e-6,
    'IFCX first tread elevation in metres, Z up: ' + top);
}

const concrete = JSON.parse(readFileSync(new URL('../examples/prefab-elementhijsplannen.oss.json',import.meta.url)));
const well = check('prefab',await createStairwellIfc(concrete.project,concrete.stairwell));
assert(well.data.some(node => node.attributes['bsi::ifc::class'].code === 'IfcReinforcingBar'));
assert(well.data.some(node => source(node).material));
assert(well.data.some(node => Object.values(source(node).quantitySets ?? {}).some(set =>
  set.GrossVolume?.value > 0 && set.GrossVolume.unit === 'CUBIC_METRE')));
assert(well.data.some(node => source(node).assignments?.some(a => a.type === 'IfcRelAssignsToProduct')));

const steelGlass = JSON.parse(readFileSync(new URL('../examples/rekenvoorbeeld-trapverbindingen.oss.json',import.meta.url)));
const combined = check('aansluitingen',await createStairwellIfc(steelGlass.project,steelGlass.stairwell));
const group = combined.data.find(node => node.attributes['bsi::ifc::class'].code === 'IfcGroup');
assert(group && source(group).propertySets.OSS_Verbinding);
assert(source(group).assignments.some(a => a.type === 'IfcRelAssignsToGroup'));
console.log('IFCX alpha: 8 modellen, '+products+' fysieke en ruimtelijke IFC-producten, '+meshes+' meshes gevalideerd.');
