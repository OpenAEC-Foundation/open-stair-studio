// Re-open the exported STEP file and walk its actual IFC4 aggregation, material
// and property relations. Optionally write samples for another IFC reader.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { defaultEngineering } from '../src/engineering.js';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';

const api = new IFC.IfcAPI();
await api.Init();
const folder = process.argv[2] === '--fixtures' && process.argv[3];
if (folder) mkdirSync(folder, { recursive: true });
const materials = { glass: 'glass', grating: 'steel', clt: 'wood', custom: null };
const labels = { glass: 'Glazen treden', grating: 'Stalen roostertreden', clt: 'CLT-treden', custom: 'Speciale constructie' };

function readExport(id, model, geometry) {
  const get = handle => api.GetLine(id, handle.value);
  const entities = type => {
    const ids = api.GetLineIDsWithType(id, type);
    return Array.from({ length: ids.size() }, (_, i) => api.GetLine(id, ids.get(i)));
  };
  const children = parent => entities(IFC.IFCRELAGGREGATES)
    .filter(r => r.RelatingObject.value === parent.expressID).flatMap(r => r.RelatedObjects.map(get));
  function props(element) {
    const all = entities(IFC.IFCRELDEFINESBYPROPERTIES)
      .filter(r => r.RelatedObjects.some(ref => ref.value === element.expressID))
      .flatMap(r => get(r.RelatingPropertyDefinition).HasProperties.map(get));
    return new Map(all.map(p => [p.Name.value, p]));
  }
  const e = model.engineering;
  assert.equal(api.GetModelSchema(id), 'IFC4');
  const [stair] = entities(IFC.IFCSTAIR);
  const stairProps = props(stair);
  assert.equal(stairProps.get('EngineeringUse').NominalValue.value, 'Regulier gebruik en vluchtroute');
  assert.equal(stairProps.get('EscapeRouteBasis').NominalValue.value, e.escapeBasis);
  assert.equal(stairProps.get('EngineeringNotes').NominalValue.value, e.notes);
  const timber = e.structureType === 'timber';
  if (timber) {
    assert.equal(stairProps.get('Material').NominalValue.value, model.stair.material);
    assert.equal(stairProps.get('HousingDepth_mm').NominalValue.value, model.joinery.depth);
    assert.equal(entities(IFC.IFCPLATE).length, 0);
    return;
  }
  const forbidden = ['Material', 'StringerType', 'TreadJoint', 'HousingDepth_mm', 'HousingTotalClearance_mm', 'HousingShoulder_mm'];
  assert(entities(IFC.IFCPROPERTYSINGLEVALUE).every(p => !forbidden.includes(p.Name.value)));
  assert.equal(entities(IFC.IFCELEMENTQUANTITY).length, 0);
  assert.equal(entities(IFC.IFCSLAB).length, 0);
  assert.equal(stairProps.get('TreadSystem').NominalValue.value, labels[e.structureType]);
  const flights = children(stair).filter(c => c.type === IFC.IFCSTAIRFLIGHT);
  const landings = children(stair).filter(c => c.type === IFC.IFCBUILDINGELEMENTPROXY);
  assert.deepEqual(landings.map(l => l.Tag.value), geometry.landings.map(l => l.id));
  assert(landings.every(l => l.ObjectType.value === 'Ruimtereservering bordes'));
  const plates = [];
  const surfaceOnly = ['grating','custom'].includes(e.structureType);
  for (const [index, flight] of flights.entries()) {
    assert.equal(flight.Representation, null);
    const parts = children(flight);
    const treads = parts.filter(p => p.type === IFC.IFCPLATE);
    const wangen = parts.filter(p => p.type === IFC.IFCBUILDINGELEMENTPROXY);
    const raw = geometry.treads.filter(t => t.flightIndex === index);
    assert.deepEqual(treads.map(p => p.Tag.value), raw.map(t => t.id));
    assert.deepEqual(wangen.map(p => p.Tag.value), geometry.stringers.filter(b => b.flightIndex === index).map(b => b.id));
    assert(wangen.every(p => p.ObjectType.value === 'Ruimtereservering wang'));
    for (const [i, p] of treads.entries()) {
      plates.push(p);
      assert.equal(p.PredefinedType.value, 'USERDEFINED');
      assert.equal(p.ObjectType.value, labels[e.structureType]);
      const properties = props(p);
      const expected = {
        TreadSystem: labels[e.structureType], SupportArrangement: 'Vrij opgelegd op twee evenwijdige opleglijnen',
        SourceProduct: e.sourceProduct, ProductBuildUp: e.productBasis, LoadDirectionAndConnections: e.arrangement,
        NominalTreadThickness_mm: raw[i].thickness, DeclaredSpan_mm: e.spanMm, DeclaredAreaLoad_kNPerM2: e.loadArea,
        DeclaredPointLoad_kN: e.loadPoint, CustomConstruction: e.structureType === 'custom' ? e.customDescription : null
      };
      for (const [name, value] of Object.entries(expected)) {
        if (value === null) assert(!properties.has(name), name);
        else assert.equal(properties.get(name)?.NominalValue.value, value, name);
      }
      for (const [name, prefix, unit] of [
        ['DeclaredSpan_mm','MILLI','METRE'], ['DeclaredAreaLoad_kNPerM2','KILO','PASCAL'],
        ['DeclaredPointLoad_kN','KILO','NEWTON']
      ]) {
        if (properties.has(name)) {
          const actual = get(properties.get(name).Unit);
          assert.deepEqual([actual.Prefix.value, actual.Name.value], [prefix, unit]);
        }
      }
      const [rep] = get(p.Representation).Representations.map(get);
      const [item] = rep.Items.map(get);
      if (surfaceOnly) {
        assert.equal(rep.RepresentationType.value, 'SurfaceModel');
        assert.equal(item.type, IFC.IFCFACEBASEDSURFACEMODEL);
        const [face] = get(item.FbsmFaces[0]).CfsFaces.map(get);
        const vertices = get(get(face.Bounds[0]).Bound).Polygon.map(ref => get(ref).Coordinates.map(coord => coord.value));
        assert.equal(vertices.length, raw[i].points.length);
        raw[i].points.forEach((point,j) => {
          const expected = [point.x,point.y,raw[i].elevation];
          assert(expected.every((n,k) => Math.abs(vertices[j][k]*1000-n) < 1e-6));
        });
      } else {
        assert.equal(item.type, IFC.IFCEXTRUDEDAREASOLID);
        assert(Math.abs(item.Depth.value*1000-raw[i].thickness)<1e-6);
      }
    }
  }
  const proxies = entities(IFC.IFCBUILDINGELEMENTPROXY);
  assert(proxies.every(p => p.PredefinedType.value === 'PROVISIONFORSPACE' && !props(p).size));
  assert.equal(proxies.length, geometry.landings.length+geometry.stringers.length);
  const associations = entities(IFC.IFCRELASSOCIATESMATERIAL);
  if (!materials[e.structureType]) assert.equal(associations.length, 0);
  else {
    assert.equal(associations.length, 1);
    assert.deepEqual(associations[0].RelatedObjects.map(ref => ref.value), plates.map(p => p.expressID));
    assert.equal(get(associations[0].RelatingMaterial).Category.value, materials[e.structureType]);
  }
}

for (const structureType of ['timber', ...Object.keys(materials)]) {
  for (const type of ['half_turn','quarter_winder']) {
    const model = structuredClone(starterProject);
    model.stair.type = type;
    model.stair.turnDirection = 'right';
    model.stair.material = 'Timber-only marker';
    model.engineering = {
      ...defaultEngineering, structureType, use:'escape', support:'two-edge', sourceProduct:'Fiche 24A',
      productBasis:'Opbouw volgens getekend monster', arrangement:'Dwars tussen oplegassen',
      customDescription:'Vrije vorm met gebogen steunen', escapeBasis:'Route en bezetting volgens projectplan',
      notes:'Referentie schets 05', spanMm:723.5, loadPoint:0, loadArea:type === 'half_turn' ? 2.5 : null
    };
    const geometry = generateStairGeometry(model.stair);
    const { bytes, landingCount } = createIfc4WithApi(api, model, geometry);
    assert.equal(landingCount,geometry.landings.length);
    if (structureType !== 'timber') assert(!new TextDecoder().decode(bytes).includes('Timber-only marker'));
    const id = api.OpenModel(bytes);
    try { readExport(id, model, geometry); } finally { api.CloseModel(id); }
    if (folder) writeFileSync(join(folder, structureType+'-'+type+'.ifc'), bytes);
  }
}
console.log('IFC4 coordination verified for ten stair assemblies, including individual treads, support reservations, engineering units and escape-route use.');
