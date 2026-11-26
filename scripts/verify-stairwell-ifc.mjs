// Optional argument: destination for the three-storey IFC4 fixture for other readers.
// Add --ifcopenshell after the pathname for independent EXPRESS and OpenCascade checks using uv.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import * as IFC from 'web-ifc';
import { emptyWell, newInstance, assembleComponent } from '../src/stairwell.js';
import { createStairwellIfc } from '../src/stairwell-ifc.js';

const well = structuredClone(emptyWell);
well.uid = 'stairwell-ifc-audit';
well.width = well.length = 6000;
well.heights = {0:3100};
const project = {number:"WK-01", name:"Trappenhuis 't Hof – coördinatie", location:'Delft', revision:'B'};
for (const [index,type] of ['concrete','spiral','loft'].entries()) {
  const i = newInstance(type,well,index);
  Object.assign(i,{id:type+'-test',rotation:[90,-35,179][index],x:2520+index*200,y:2300-index*100});
  if (type==='loft') i.params.pose='packed';
  well.instances.push(i);
}
const api = new IFC.IfcAPI();
await api.Init();
const model = await createStairwellIfc(project,well);
if (process.argv[2]) await writeFile(process.argv[2],model);
const m = api.OpenModel(model);
const all = (type, id=m) => {
  const ids = api.GetLineIDsWithType(id,type);
  return Array.from({length:ids.size()},(_,j)=>api.GetLine(id,ids.get(j)));
};
const ref = v => api.GetLine(m,v.value);
const val = a => a.map(v=>v.value);
const near = (a,b,epsilon=1e-4) => assert(Math.abs(a-b)<epsilon,`${a} vs ${b}`);
assert.equal(api.GetModelSchema(m),'IFC4');
assert.equal(all(IFC.IFCPROJECT)[0].Name.value,project.name);
assert.equal(all(IFC.IFCSITE).length,1);
assert.equal(all(IFC.IFCBUILDING).length,1);
assert.deepEqual(all(IFC.IFCBUILDINGSTOREY).map(s=>s.Elevation.value).sort((a,b)=>a-b),[0,3100,5980,8860]);
const stairs = all(IFC.IFCSTAIR);
assert.deepEqual(new Set(stairs.map(i=>i.PredefinedType.value)),new Set(['HALF_TURN_STAIR','SPIRAL_STAIR','USERDEFINED']));
const materials = all(IFC.IFCRELASSOCIATESMATERIAL);
const aggregate = all(IFC.IFCRELAGGREGATES);
const productSet = all(IFC.IFCRELDEFINESBYPROPERTIES);
const contained = all(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
const tags = new Map(), leaves = new Set(), sourceSolids = {};
const vecKey = p => p.map(x=>x.toFixed(3)).map(x=>x==='-0.000'?'0.000':x).join(',');
function applyPlacements(xyz, pos) {
  let [x,y,z] = xyz;
  for (let loc = ref(pos); loc;) {
    const a = ref(loc.RelativePlacement), [X,Y,Z] = val(ref(a.Location).Coordinates);
    const [c,s] = a.RefDirection ? val(ref(a.RefDirection).DirectionRatios) : [1,0];
    [x,y,z] = [X+c*x-s*y,Y+s*x+c*y,Z+z];
    loc = loc.PlacementRelTo && ref(loc.PlacementRelTo);
  }
  return [x,y,z];
}
// Verify that triangulation retained all directed edge partners, including the
// holes in the spiral sleeves and the re-entrant corners in the concrete soffit.
function closedMesh(triangles,coords,tag) {
  const edges = new Map();
  let volume = 0;
  for (const tri of triangles) {
    const [a,b,c] = tri.map(k=>coords[k-1]);
    for (let j=0;j<3;j++) {
      const x=tri[j], y=tri[(j+1)%3], k=Math.min(x,y)+','+Math.max(x,y);
      const n=edges.get(k)??[0,0]; n[x<y?0:1]++; edges.set(k,n);
    }
    volume += a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  }
  for (const [edge,n] of edges) assert.deepEqual(n,[1,1],tag+' edge '+edge);
  assert(volume>0,tag+' volume');
}
const keySet = (coords,min,max) => coords.every((v,j)=>v >= min[j]-1e-5 && v <= max[j]+1e-5);
for (const i of well.instances) {
  const g = assembleComponent(i,well);
  const stair = stairs.find(s=>s.Tag.value===i.mark);
  const assigned = contained.filter(r=>r.RelatedElements.some(x=>x.value===stair.expressID));
  assert.equal(assigned.length,1); assert.equal(ref(assigned[0].RelatingStructure).Name.value,'Bouwlaag '+i.storey);
  assert.equal(stair.Representation,null);
  const pset = productSet.find(rel=>rel.RelatedObjects.some(h=>h.value===stair.expressID));
  const props = new Map(ref(pset.RelatingPropertyDefinition).HasProperties.map(h=>{const p=ref(h);return [p.Name.value,p.NominalValue.value];}));
  assert.equal(props.get('Hoogte'),i.storey===0?3100:2880);
  if(i.type==='loft') assert.equal(props.get('pose'),'Opgeborgen · luik dicht');
  const collect = obj => {
    if (obj.Representation) {
      assert(!leaves.has(obj.expressID), 'Double geometry'); leaves.add(obj.expressID);
      const p = g.parts.find(p=>i.mark+'/'+p.id===obj.Tag.value);
      assert(p,obj.Tag.value); tags.set(i.id+'/'+p.id,obj.GlobalId.value);
      assert.equal(materials.filter(r=>r.RelatedObjects.some(h=>h.value===obj.expressID)).length,1);
      const [rep] = ref(obj.Representation).Representations.map(ref), [mesh] = rep.Items.map(ref);
      assert.equal(mesh.type,IFC.IFCTRIANGULATEDFACESET);
      assert.equal(mesh.Closed.value,true);
      const coords=ref(mesh.Coordinates).CoordList.map(val);
      closedMesh(mesh.CoordIndex.map(val),coords,p.id);
      const world=coords.map(v=>applyPlacements(v,obj.ObjectPlacement));
      const sourceVertices = p.faces.flat().map(q=>[q.x,q.y,q.z]);
      let sourceVolume6=0;
      for(const face of p.faces) {
        const a=face[0];
        for(let j=1;j+1<face.length;j++) {
          const b=face[j], c=face[j+1];
          sourceVolume6+=a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x);
        }
      }
      sourceSolids[obj.GlobalId.value] = {
        min:[0,1,2].map(k=>Math.min(...sourceVertices.map(v=>v[k]))/1000),
        max:[0,1,2].map(k=>Math.max(...sourceVertices.map(v=>v[k]))/1000), volume:sourceVolume6/6e9
      };
      const expected=new Set(p.faces.flat().map(q=>vecKey([q.x,q.y,q.z])));
      const actual = new Set(world.map(vecKey));
      // Rounding close to a decimal midpoint can change the last printed digit.
      if ([...actual].some(k=>!expected.has(k))) {
        const src=p.faces.flat();
        for (const v of world) assert(src.some(q=>Math.hypot(v[0]-q.x,v[1]-q.y,v[2]-q.z)<.00001),p.id);
      }
      const bounds=g.bounds;
      assert(world.every(v=>keySet(v,[bounds.xmin,bounds.ymin,bounds.zmin],[bounds.xmax,bounds.ymax,bounds.zmax])),p.id);
      assert.equal(expected.size,actual.size,p.id);
    }
    for(const r of aggregate.filter(r=>r.RelatingObject.value===obj.expressID)) for(const child of r.RelatedObjects) collect(ref(child));
  };
  collect(stair);
  for(const p of g.parts) assert(tags.has(i.id+'/'+p.id),p.id);
}
assert.equal(all(IFC.IFCTRIANGULATEDFACESET).length,leaves.size);
assert.equal(all(IFC.IFCPRODUCTDEFINITIONSHAPE).length,leaves.size);
assert.equal(all(IFC.IFCDOOR).filter(d=>d.PredefinedType.value==='TRAPDOOR').length,1);
const guids=new Set([...tags.values(),...stairs.map(s=>s.GlobalId.value)]);
assert.equal(guids.size,leaves.size+3);
assert([...guids].every(g=>/^[0-3][0-9A-Za-z_$]{21}$/.test(g)));
const changed = structuredClone(well);
changed.instances[1].x += 420; changed.instances[1].mark='Nieuw merk';
changed.instances[2].params.pose='open'; changed.instances[0].params.layout='straight';
const m2=api.OpenModel(await createStairwellIfc({...project,revision:'C'},changed));
for(const obj of all(IFC.IFCSTAIR,m2)) assert(guids.has(obj.GlobalId.value));
assert(all(IFC.IFCSTAIR,m2).some(o=>o.PredefinedType.value==='STRAIGHT_RUN_STAIR'));
const updated = all(IFC.IFCPLATE,m2).find(p=>p.Tag?.value==='Nieuw merk/tread-01');
assert.equal(updated.GlobalId.value,tags.get('spiral-test/tread-01'));
api.CloseModel(m2); api.CloseModel(m);
await assert.rejects(createStairwellIfc(project,emptyWell));
const bad=structuredClone(well); bad.instances[1].params.diameter=1000;bad.instances[1].params.walklineInset=490;
await assert.rejects(createStairwellIfc(project,bad),/klimlijn/i);
console.log(`IFC4: ${leaves.size} gesloten componentvolumes, lokale en wereldpunten, semantiek, verdiepingspeilen, werkstand en stabiele GlobalIds gecontroleerd (${model.length} bytes).`);
if (process.argv.includes('--ifcopenshell')) {
  const check = `
import json, sys
import numpy as np
import ifcopenshell, ifcopenshell.geom as geom, ifcopenshell.validate as validator
from ifcopenshell.util.shape import get_vertices, get_volume
proof = json.load(sys.stdin)
model = ifcopenshell.open(sys.argv[1])
log = validator.json_logger()
validator.validate(model, log, express_rules=True)
assert not log.statements, log.statements[:3]
settings = geom.settings()
settings.set("use-world-coords", True)
for guid, expected in proof.items():
    part = model.by_guid(guid)
    shape = geom.create_shape(settings, part)
    vertices = get_vertices(shape.geometry)
    assert np.allclose(vertices.min(axis=0),expected["min"],atol=1e-7,rtol=0), part
    assert np.allclose(vertices.max(axis=0),expected["max"],atol=1e-7,rtol=0), part
    assert np.isclose(get_volume(shape.geometry),expected["volume"],rtol=1e-6,atol=1e-11), part
print(f"IfcOpenShell {ifcopenshell.version}: EXPRESS en OpenCascade-geometrie geverifieerd voor {len(proof)} onderdelen.")
`;
  const result = execFileSync('uv',['run','--no-project','--python','3.12','--with','ifcopenshell==0.9.0.post1','--with','pytest','python','-c',check,process.argv[2]],
    {input:JSON.stringify(sourceSolids),encoding:'utf8',timeout:300000});
  console.log(result.trim());
}
