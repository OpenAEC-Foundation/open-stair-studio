// With an IFC pathname, write the independently re-readable fixture. Add --ifcopenshell
// to check the IFC4 EXPRESS rules and resolve each physical solid through OpenCascade.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import * as IFC from 'web-ifc';
import { emptyWell, newInstance, assembleWell, typeOf } from '../src/stairwell.js';
import { createStairwellIfc } from '../src/stairwell-ifc.js';

const well=structuredClone(emptyWell);
Object.assign(well,{uid:'audit-prefab-ifc',length:9000,width:8000,heights:{0:3200}});
const stair=newInstance('concrete',well,1);
Object.assign(stair,{id:'cast-audit',mark:'BT-09',x:4400,y:2200,rotation:-37});
Object.assign(stair.params,{detailing:'engineered',layout:'return',base:'precast',guards:'none',rigging:'equalised',liftingAssembly:'bare',stationResultants:'vertical',
  liftingReference:"Testproduct 'H' / 30°",riggingReference:'Testplan met vereffening',
  liftingStrength:30,requiredLiftingStrength:25,liftingWLL:.25});
well.instances.push(stair);
const project={number:'QA-BT',name:'Prefab audit',location:'Delft',revision:'V1'};
const [assembly]=assembleWell(well);
assert(assembly.precast?.elements?.length===5,'Expected structural results for two flights and three landing elements.');
assert(assembly.precast.elements.every(element=>element.checks.some(c=>c.id==='liftFree'&&c.status==='fail')));
const model=await createStairwellIfc(project,well);
const file=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
if (file) await writeFile(file,model);
const api=new IFC.IfcAPI();
await api.Init();
const mid=api.OpenModel(model);
const rows=(type,id=mid)=>{
  const indices=api.GetLineIDsWithType(id,type);
  return Array.from({length:indices.size()},(_,j)=>api.GetLine(id,indices.get(j)));
};
const ref=r=>api.GetLine(mid,r.value);
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} and ${b} differ by more than ${tol}`);
const taggedTypes=[IFC.IFCSTAIRFLIGHT,IFC.IFCSLAB,IFC.IFCREINFORCINGBAR,IFC.IFCDISCRETEACCESSORY,IFC.IFCMECHANICALFASTENER,IFC.IFCPLATE,IFC.IFCMEMBER];
const objects=(id,mark)=>new Map(taggedTypes.flatMap(t=>rows(t,id)).filter(e=>e.Tag?.value.startsWith(mark+'/'))
  .map(e=>[e.Tag.value.slice(mark.length+1),e]));
const elements=objects(mid,stair.mark);
assert.equal(elements.size,assembly.parts.length);
const parents=new Map();
for (const rel of rows(IFC.IFCRELAGGREGATES)) for (const child of rel.RelatedObjects) {
  assert(!parents.has(child.value),'Multiple parents '+child.value);
  parents.set(child.value,rel.RelatingObject.value);
}
const sets=new Map();
for (const rel of rows(IFC.IFCRELDEFINESBYPROPERTIES)) {
  const set=ref(rel.RelatingPropertyDefinition);
  const props=new Map(set.HasProperties.map(ref).map(p=>[p.Name.value,p]));
  assert.equal(props.size,set.HasProperties.length,'Duplicate property name in '+set.Name.value);
  for (const handle of rel.RelatedObjects) {
    if (!sets.has(handle.value)) sets.set(handle.value,new Map());
    sets.get(handle.value).set(set.Name.value,props);
  }
}
const typedBars=new Map();
for (const rel of rows(IFC.IFCRELDEFINESBYTYPE))
  for (const handle of rel.RelatedObjects) typedBars.set(handle.value,ref(rel.RelatingType));
const stairObject=rows(IFC.IFCSTAIR)[0], stairSets=sets.get(stairObject.expressID);
assert(stairSets.has('OSS_PrefabEngineering'));
const inputs=stairSets.get('OSS_Trapcomponent');
assert.equal(stairSets.get('OSS_PrefabEngineering').get('Status').NominalValue.value,'Overschreden');
assert.equal(inputs.get('liftingReference').NominalValue.value,stair.params.liftingReference);
assert.equal(ref(inputs.get('finishLoad').Unit).UnitType.value,'PLANARFORCEUNIT');
near(inputs.get('slingAngle').NominalValue.value,Math.PI/6);
const mode=typeOf('concrete').fields.find(f=>f.key==='detailing');
assert.equal(stairSets.get('OSS_Trapcomponent').get('detailing').NominalValue.value,
  mode.options.find(([key])=>key==='engineered')[1]);

function worldCoordinates(pos,xyz) {
  let [x,y,z]=xyz;
  for (let place=ref(pos);place;place=place.PlacementRelTo?ref(place.PlacementRelTo):null) {
    const a=ref(place.RelativePlacement), origin=ref(a.Location).Coordinates.map(v=>v.value);
    const [c,s]=a.RefDirection?ref(a.RefDirection).DirectionRatios.map(v=>v.value):[1,0];
    [x,y,z]=[origin[0]+c*x-s*y,origin[1]+s*x+c*y,origin[2]+z];
  }
  return [x,y,z];
}
const byRole=new Map(), independent={};
for (const part of assembly.parts) {
  const element=elements.get(part.id);
  assert(element,part.id);
  const rep=ref(ref(element.Representation).Representations[0]), shape=ref(rep.Items[0]);
  const mesh=ref(shape.Coordinates).CoordList.map(row=>worldCoordinates(element.ObjectPlacement,row.map(v=>v.value)));
  const points=part.faces.flat();
  for (const [k,axis] of ['x','y','z'].entries()) {
    near(Math.min(...mesh.map(v=>v[k])),Math.min(...points.map(p=>p[axis])),1e-5);
    near(Math.max(...mesh.map(v=>v[k])),Math.max(...points.map(p=>p[axis])),1e-5);
  }
  let volume6=0;
  const origin=points[0], diff=p=>[p.x-origin.x,p.y-origin.y,p.z-origin.z];
  for (const face of part.faces) for (let j=1;j<face.length-1;j++) {
    const [a,b,c]=[face[0],face[j],face[j+1]].map(diff);
    volume6+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  }
  independent[element.GlobalId.value]={
    min:['x','y','z'].map(k=>Math.min(...points.map(v=>v[k]))/1000),
    max:['x','y','z'].map(k=>Math.max(...points.map(v=>v[k]))/1000),
    volume:volume6/6e9
  };
  if (!part.parentId) continue;
  byRole.set(part.role,(byRole.get(part.role)??0)+1);
  const parent=elements.get(part.parentId);
  assert.equal(parents.get(element.expressID),parent.expressID);
  assert.equal(ref(element.ObjectPlacement).PlacementRelTo.value,parent.ObjectPlacement.value);
  const props=sets.get(element.expressID).get('OSS_PrefabDetail');
  assert.equal(props.get('Betonelement').NominalValue.value,stair.mark+'/'+part.parentId);
  assert.equal(props.get('Positiemerk').NominalValue.value,part.position);
  for (const [field,label] of [['lengthMm','Lengte'],['diameterMm','Diameter'],['thicknessMm','Dikte']])
    if (part[field]) near(props.get(label).NominalValue.value,part[field]);
  if (part.role==='mainBar'||part.role==='crossBar') {
    assert.equal(element.type,IFC.IFCREINFORCINGBAR);
    const type=typedBars.get(element.expressID);
    assert.equal(type.type,IFC.IFCREINFORCINGBARTYPE);
    near(type.NominalDiameter.value,part.diameterMm);
    near(type.BarLength.value,part.lengthMm,1e-5);
    near(type.CrossSectionArea.value,Math.PI*part.diameterMm**2/4e6,1e-12);
    assert.equal(type.PredefinedType.value,part.role==='mainBar'?'MAIN':'USERDEFINED');
  } else if (part.role==='anchorBolt') assert.equal(element.PredefinedType.value,'ANCHORBOLT');
  else if (part.role==='liftAnchor') {
    assert.equal(element.type,IFC.IFCDISCRETEACCESSORY);
    assert.equal(props.get('Productreferentie').NominalValue.value,stair.params.liftingReference);
    assert.equal(props.get('Hijsplanreferentie').NominalValue.value,stair.params.riggingReference);
  }
  else if (part.role==='connectionPlate') assert.equal(element.type,IFC.IFCPLATE);
}
for (const role of ['mainBar','crossBar','liftAnchor','connectionPlate','anchorBolt','anchorNut']) assert(byRole.get(role)>0,role);
for (const result of assembly.precast.elements) {
  const set=sets.get(elements.get(result.id).expressID);
  assert(set.has('OSS_PrefabElement'));
  for (const check of result.checks) {
    const props=set.get('OSS_Toets_'+check.id);
    assert(props,check.id);
    assert.equal(props.get('Status').NominalValue.value,({open:'Open',fail:'Overschreden',pass:'Deeltoets voldoet'})[check.status]);
    for (const [key,field] of [['Rekenwaarde','demand'],['Grenswaarde','capacity']]) {
      if (!Number.isFinite(check[field])) {assert(!props.has(key));continue;}
      const value=props.get(key);
      const factor=check.unit==='mm²'?1e-6:1;
      near(value.NominalValue.value,check[field]*factor);
      if (check.unit==='kN') assert.equal(ref(value.Unit).Prefix.value,'KILO');
      if (check.unit==='kNm') assert.equal(ref(value.Unit).UnitType.value,'TORQUEUNIT');
      if (check.unit==='N/mm²'||check.unit==='MPa') assert.equal(ref(value.Unit).Prefix.value,'MEGA');
    }
  }
}
const moved=structuredClone(well);
Object.assign(moved.instances[0],{storey:2,x:2130,y:980,rotation:68,mark:'BT-HERZIEN'});
const mid2=api.OpenModel(await createStairwellIfc({...project,revision:'V2'},moved));
const revised=objects(mid2,'BT-HERZIEN');
for (const [id,element] of elements) assert.equal(revised.get(id).GlobalId.value,element.GlobalId.value);
api.CloseModel(mid2); api.CloseModel(mid);
console.log(`IFC4 prefab: ${assembly.precast.elements.length} casts, ${[...byRole.values()].reduce((a,b)=>a+b,0)} details, berekeningsstatus, eenheden, ouderrelaties, wereldplaatsing en wijzigingsvaste GUIDs gecontroleerd.`);
if (process.argv.includes('--ifcopenshell')) {
  assert(file,'Geef een uitvoerpad voor het IFC-bestand.');
  const python=`
import json,sys,numpy as np
import ifcopenshell,ifcopenshell.validate as val,ifcopenshell.geom as geom
from ifcopenshell.util.shape import get_vertices,get_volume
model=ifcopenshell.open(sys.argv[1])
logger=val.json_logger()
val.validate(model,logger,express_rules=True)
assert not logger.statements, logger.statements[:4]
settings=geom.settings()
settings.set('use-world-coords',True)
proof=json.load(sys.stdin)
for guid,s in proof.items():
    product=model.by_guid(guid)
    shape=geom.create_shape(settings,product)
    verts=get_vertices(shape.geometry)
    assert np.allclose(verts.min(axis=0),s['min'],atol=1e-7,rtol=0), product.Tag
    assert np.allclose(verts.max(axis=0),s['max'],atol=1e-7,rtol=0), product.Tag
    assert s['volume']>0 and np.isclose(get_volume(shape.geometry),s['volume'],rtol=1e-6,atol=1e-11), product.Tag
print(f'IfcOpenShell {ifcopenshell.version} / OpenCascade: {len(proof)} wereldsolids en volumes, 0 EXPRESS-fouten.')
`;
  console.log(execFileSync('uv',['run','--no-project','--python','3.12','--with','ifcopenshell==0.9.0.post1','--with','pytest','python','-c',python,file],{input:JSON.stringify(independent),encoding:'utf8',timeout:300000}).trim());
}
