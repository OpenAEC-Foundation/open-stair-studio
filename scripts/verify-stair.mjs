import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { generateStairGeometry, inspectStair, stairFamilies, starterProject } from '../src/stair.js';

const fixtureDirectory = process.argv[2] === '--fixtures' ? process.argv[3] : undefined;

// Signed tetrahedra also check that each face points outwards. Each directed
// edge of a closed shell needs exactly one opposite neighbour.
function inspectShell(solid, line) {
  const vertices = new Map();
  const edges = new Map();
  let volume = 0;
  for (const face of line(solid.Outer).CfsFaces.map(line)) {
    assert.equal(face.Bounds.length, 1);
    const bound = line(face.Bounds[0]);
    assert.ok(bound.Orientation.value === true || bound.Orientation.value === 'T');
    const ids = line(bound.Bound).Polygon.map(handle => {
      if (!vertices.has(handle.value)) vertices.set(handle.value, line(handle).Coordinates.map(coord => coord.value));
      return handle.value;
    });
    assert.equal(new Set(ids).size, ids.length);
    for (let i = 0; i < ids.length; i++) {
      const start = ids[i], end = ids[(i + 1) % ids.length];
      const key = start + ':' + end;
      assert.ok(!edges.has(key), 'repeated directed edge in IFC shell');
      edges.set(key, end + ':' + start);
    }
    const [a, ...fan] = ids.map(id => vertices.get(id));
    for (let i = 1; i < fan.length; i++) {
      const b = fan[i - 1], c = fan[i];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  assert.ok([...edges.values()].every(key => edges.has(key)), 'IFC shell has an open edge');
  assert.ok(volume > 0);
  return { vertices: [...vertices.values()], volume };
}

function verifyIfcValues(api, modelId, model, geometry) {
  const line = handle => api.GetLine(modelId, handle.value);
  const entities = type => {
    const ids = api.GetLineIDsWithType(modelId, type);
    return Array.from({ length: ids.size() }, (_, index) => api.GetLine(modelId, ids.get(index)));
  };
  const project = entities(IFC.IFCPROJECT)[0];
  const projectLength = line(project.UnitsInContext).Units.map(line).find(unit => unit.UnitType.value === 'LENGTHUNIT');
  assert.equal(projectLength.Name.value, 'METRE');
  assert.equal(projectLength.Prefix, null);

  const stair = entities(IFC.IFCSTAIR)[0];
  const windingType = { quarter_winder: 'QUARTER_WINDING_STAIR', half_winder: 'HALF_WINDING_STAIR' }[model.stair.type];
  if (windingType) assert.equal(stair.PredefinedType.value, windingType);
  const [storeyRelation] = entities(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  assert.deepEqual(storeyRelation.RelatedElements.map(item => item.value), [stair.expressID]);
  assert.equal(line(storeyRelation.RelatingStructure).type, IFC.IFCBUILDINGSTOREY);
  const assemblies = entities(IFC.IFCRELAGGREGATES);
  const children = parent => assemblies.find(relation => relation.RelatingObject.value === parent.expressID).RelatedObjects.map(line);
  const [site] = children(project);
  const [building] = children(site);
  const [storey] = children(building);
  assert.deepEqual([site.type, building.type, storey.expressID], [IFC.IFCSITE, IFC.IFCBUILDING, storeyRelation.RelatingStructure.value]);
  const components = children(stair);
  assert.equal(components.filter(item => item.type === IFC.IFCSTAIRFLIGHT).length, geometry.flights.length);
  assert.equal(components.filter(item => item.type === IFC.IFCSLAB).length, geometry.landings.length);
  const [defines] = entities(IFC.IFCRELDEFINESBYPROPERTIES);
  assert.deepEqual(defines.RelatedObjects.map(item => item.value), [stair.expressID]);
  const properties = line(defines.RelatingPropertyDefinition).HasProperties.map(line);
  if (windingType) {
    assert.equal(properties.find(item => item.Name.value === 'StringerType').NominalValue.value, 'Gesegmenteerde trapboom met verstek');
    assert.equal(properties.find(item => item.Name.value === 'TurnDirection').NominalValue.value, model.stair.turnDirection);
    assert.equal(properties.find(item => item.Name.value === 'OuterShape').NominalValue.value, model.stair.outerShape);
    assert.equal(properties.find(item => item.Name.value === 'WindersPerQuarter').NominalValue.value, model.stair.windersPerQuarter);
  }
  for (const [name, millimetres] of Object.entries({
    FloorToFloorHeight_mm: model.stair.floorHeight,
    OverallWidth_mm: model.stair.width,
    ClearTreadWidth_mm: model.stair.width - 2 * model.stair.stringerThickness,
    RiserHeight_mm: geometry.dimensions.rise,
    Going_mm: model.stair.going
  })) {
    const prop = properties.find(item => item.Name.value === name);
    const unit = line(prop.Unit);
    assert.equal(unit.UnitType.value, 'LENGTHUNIT');
    assert.equal(unit.Name.value, 'METRE');
    assert.equal(unit.Prefix.value, 'MILLI');
    assert.ok(Math.abs(prop.NominalValue.value - millimetres) < 1e-6, name);
  }

  let cubicMetres = 0;
  const expectedTreads = new Map(geometry.treads.map(tread => [tread.id, tread]));
  const unmatchedBeams = new Set(geometry.stringers);
  let verifiedContours = 0;
  for (const component of components) {
    if (component.type === IFC.IFCSTAIRFLIGHT) {
      assert.equal(component.PredefinedType.value, windingType ? 'WINDER' : 'STRAIGHT');
      if (windingType) assert.equal(component.TreadLength, null, 'winding treads have variable going');
    }
    const [shape] = line(component.Representation).Representations.map(line);
    assert.equal(shape.RepresentationType.value, windingType ? 'SolidModel' : 'SweptSolid');
    for (const solid of shape.Items.map(line)) {
      if (solid.type === IFC.IFCFACETEDBREP) {
        const shell = inspectShell(solid, line);
        const beam = [...unmatchedBeams].find(part => part.meshFaces.flat().every(p =>
          shell.vertices.some(([x, y, z]) => Math.hypot(x * 1000 - p.x, y * 1000 - p.y, z * 1000 - p.z) < 1e-5)));
        assert.ok(beam, 'IFC shell vertices agree with the cut stringer');
        assert.ok(Math.abs(shell.volume - beam.volume) < 1e-8, beam.id);
        unmatchedBeams.delete(beam);
        cubicMetres += shell.volume;
        continue;
      }
      assert.equal(solid.type, IFC.IFCEXTRUDEDAREASOLID);
      const profile = line(solid.SweptArea);
      let area;
      if (profile.type === IFC.IFCRECTANGLEPROFILEDEF) {
        area = profile.XDim.value * profile.YDim.value;
      } else {
        assert.equal(profile.type, IFC.IFCARBITRARYCLOSEDPROFILEDEF);
        const tread = expectedTreads.get(profile.ProfileName.value);
        assert.ok(tread, 'contour belongs to a unique model tread');
        expectedTreads.delete(tread.id);
        const polygon = line(profile.OuterCurve);
        assert.equal(polygon.type, IFC.IFCPOLYLINE);
        assert.equal(polygon.Points.length, tread.points.length + 1);
        assert.equal(polygon.Points[0].value, polygon.Points.at(-1).value);
        const coords = polygon.Points.map(point => line(point).Coordinates.map(coord => coord.value));
        let twiceArea = 0;
        for (let i = 0; i < tread.points.length; i++) {
          const [x, y] = coords[i];
          const [nextX, nextY] = coords[i + 1];
          assert.ok(Math.abs(x * 1000 - tread.points[i].x) < 1e-5 && Math.abs(y * 1000 - tread.points[i].y) < 1e-5);
          twiceArea += x * nextY - nextX * y;
        }
        area = Math.abs(twiceArea) / 2;
        const z = line(line(solid.Position).Location).Coordinates[2].value;
        assert.ok(Math.abs((z + solid.Depth.value) * 1000 - tread.elevation) < 1e-5);
        assert.ok(Math.abs(area * solid.Depth.value - tread.volume) < 1e-8);
        verifiedContours++;
      }
      cubicMetres += area * solid.Depth.value;
    }
  }
  assert.equal(verifiedContours, windingType ? geometry.treads.length : 0);
  if (windingType) assert.equal(unmatchedBeams.size, 0);
  assert.ok(Math.abs(cubicMetres - geometry.volume) < 1e-8, 'IFC solids and parts schedule must have the same timber volume');
}

function verifyFamily(api, family, turnDirection, outerShape) {
  const model = structuredClone(starterProject);
  model.stair.type = family.id;
  model.stair.turnDirection = turnDirection;
  if (family.winder) model.stair.outerShape = outerShape;
  const geometry = generateStairGeometry(model.stair);
  const blockers = inspectStair(model).filter(item => item.level === 'error');
  if (blockers.length) throw new Error(`${family.id}: ${blockers.map(item => item.title).join(', ')}`);
  if (!family.id.endsWith('_winder')) {
    const expectedStringers = 2 * geometry.flights.length;
    assert.equal(geometry.stringers.length, expectedStringers);
    const clear = model.stair.width - 2 * model.stair.stringerThickness;
    assert.ok(geometry.treads.every(tread => Math.abs(tread.width - clear) < 0.01));
  } else {
    assert.equal(geometry.flights.length, 1);
    assert.equal(geometry.landings.length, 0);
    assert.ok(geometry.stringers.length > 2);
  }
  if (geometry.footprint.width + 0.01 < model.stair.width) throw new Error(`${family.id}: plan footprint is narrower than the entered outside width`);
  if (geometry.treads.some(item => item.volume <= 0) || geometry.stringers.some(item => item.volume <= 0) || geometry.landings.some(item => item.volume <= 0)) throw new Error(`${family.id}: non-positive part volume`);
  const result = createIfc4WithApi(api, model, geometry);
  if (fixtureDirectory) {
    const stem = join(fixtureDirectory, [family.id, turnDirection, outerShape].filter(Boolean).join('-'));
    const { x, y, width, depth } = geometry.footprint;
    const expected = {
      name: model.project.name, volume: geometry.volume, winding: Boolean(family.winder),
      bounds: [x, y, width, depth, model.stair.floorHeight].map(value => value / 1000),
      treads: geometry.treads.map(t => ({ key: t.id, volume: t.volume, z: t.elevation / 1000,
        coords: t.points.map(p => [p.x / 1000, p.y / 1000]) })),
      beams: family.winder ? geometry.stringers.map(b => ({ id: b.id, side: b.side, volume: b.volume,
        vertices: b.vertices.map(v => [v.x / 1000, v.y / 1000, v.z / 1000]) })) : []
    };
    writeFileSync(stem + '.ifc', result.bytes);
    writeFileSync(stem + '.json', JSON.stringify(expected));
  }
  const reopened = api.OpenModel(result.bytes);
  try {
    verifyIfcValues(api, reopened, model, geometry);
  } finally {
    api.CloseModel(reopened);
  }
  console.log(`${[family.label, turnDirection, outerShape].filter(Boolean).join(' ')}: geometry OK (${geometry.treads.length} treads, ${geometry.stringers.length} stringers), IFC4 ${result.bytes.length} bytes, ${result.flightCount} flights, ${result.landingCount} landings, ${result.solidCount} solids`);
}

const api = new IFC.IfcAPI();
await api.Init();
for (const family of stairFamilies) {
  if (family.winder) {
    for (const side of ['left', 'right']) {
      for (const shape of ['square', 'faceted']) verifyFamily(api, family, side, shape);
    }
  } else {
    verifyFamily(api, family);
  }
}

const invalid = structuredClone(starterProject);
invalid.stair.width = 2 * invalid.stair.stringerThickness;
assert.throws(() => createIfc4WithApi(api, invalid, generateStairGeometry(invalid.stair)), /breedte/i);

const concept = structuredClone(starterProject);
concept.stair.risers = 15;
concept.stair.floorHeight = 2912;
assert.ok(inspectStair(concept).some(item => item.level === 'error'));
const conceptGeometry = generateStairGeometry(concept.stair);
const conceptExport = createIfc4WithApi(api, concept, conceptGeometry);
const reopened = api.OpenModel(conceptExport.bytes);
try {
  verifyIfcValues(api, reopened, concept, conceptGeometry);
} finally {
  api.CloseModel(reopened);
}
console.log('Geometrisch ongeldige trap geweigerd. Concept met Bbl-bevinding en fractionele optrede correct geëxporteerd.');
