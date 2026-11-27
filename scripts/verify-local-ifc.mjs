// node scripts/verify-local-ifc.mjs [model.ifc] [--ifcopenshell]
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import * as I from 'web-ifc';
import {newInstance,emptyWell,assembleWell} from '../src/stairwell.js';
import {createStairwellIfc} from '../src/stairwell-ifc.js';

const near=(a,b,tol=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),a+' / '+b);
const well={...structuredClone(emptyWell),uid:'ifc-bijlegwapening-test',length:7600,width:5600,heights:{0:3100}};
const stair=newInstance('concrete',well,1);
Object.assign(stair,{id:'stairwall-test-local',mark:'BT-17',rotation:37,x:1700,y:2180});
Object.assign(stair.params,{detailing:'engineered',localReinforcement:'detailed',base:'precast',guards:'none',
  liftingAssembly:'bare',rigging:'two',stationResultants:'vertical',slingAngle:30,stripping:'released',
  bearingTieLever:20,bearingBarTail:80,bearingBarReference:'NOK-2 test',bearingBarPath:'verified',
  anchorBarArea:75,anchorBarTail:75,anchorBarReference:'KOP-2 test',anchorBarPath:'verified',connectionReference:'K-04',connectionTension:1});
stair.liftPlans={tussenbordes:{rigging:'equalised',slingAngle:45,liftingReference:'P-23/H',riggingReference:'H-23/R',
  liftBarArea:50,liftBarTail:400,liftBarReference:'B-23-01',liftBarTransfer:'separate',
  requiredLiftingStrength:20,liftingStrength:30,liftingWLL:25}};
well.instances.push(stair);
const project={name:'Controle lokale wapening',number:'PF-09',revision:'01',location:'Delft'};
const [assembly]=assembleWell(well),bars=assembly.parts.filter(p=>p.targetId);
assert.equal(bars.length,46);
const data=await createStairwellIfc(project,well);
const api=new I.IfcAPI();
await api.Init();
const file=process.argv.slice(2).find(s=>!s.startsWith('--'));
if(file) await writeFile(file,data);
const mid=api.OpenModel(data);
assert.equal(api.GetModelSchema(mid),'IFC4');
const rows=(id,type)=>{const list=api.GetLineIDsWithType(id,type);return Array.from({length:list.size()},(_,n)=>api.GetLine(id,list.get(n)));};
const ref=x=>api.GetLine(mid,x.value);
const getTags=(id)=>new Map(rows(id,I.IFCREINFORCINGBAR).map(p=>[p.Tag.value.split('/').at(-1),p]));
const sets=new Map();
for(const relation of rows(mid,I.IFCRELDEFINESBYPROPERTIES)) {
  const set=ref(relation.RelatingPropertyDefinition);
  if (set.type === I.IFCELEMENTQUANTITY) continue;
  const props=new Map(set.HasProperties.map(ref).map(v=>[v.Name.value,v.NominalValue.value]));
  assert.equal(props.size,set.HasProperties.length);
  for(const e of relation.RelatedObjects){
    if(!sets.has(e.value)) sets.set(e.value,new Map());
    sets.get(e.value).set(set.Name.value,props);
  }
}
const targets=new Map();
for(const relation of rows(mid,I.IFCRELASSIGNSTOPRODUCT)){
  const to=ref(relation.RelatingProduct);
  for(const o of relation.RelatedObjects) {
    assert(!targets.has(o.value));
    targets.set(o.value,to.Tag.value);
  }
}
const byBar=getTags(mid);
const parents=new Map();
for(const a of rows(mid,I.IFCRELAGGREGATES)) for(const o of a.RelatedObjects) parents.set(o.value,ref(a.RelatingObject));
const types=new Map();
for(const t of rows(mid,I.IFCRELDEFINESBYTYPE)) for(const o of t.RelatedObjects) types.set(o.value,ref(t.RelatingType));
const occ={};
const classes=new Set();
for(const b of bars) {
  const bar=byBar.get(b.id),host=parents.get(bar.expressID),base=stair.mark+'/';
  assert.equal(bar.type,I.IFCREINFORCINGBAR);
  assert.equal(host.Tag.value,base+b.parentId);
  assert.equal(targets.get(bar.expressID),base+b.targetId);
  const type=types.get(bar.expressID);
  assert.equal(type.type,I.IFCREINFORCINGBARTYPE);
  near(type.BarLength.value,b.lengthMm);
  near(type.NominalDiameter.value,b.diameterMm);
  const shape=ref(bar.Representation);
  const reps=shape.Representations.map(ref);
  const axis=ref(reps.find(r=>r.RepresentationIdentifier.value==='Axis').Items[0]);
  const body=ref(reps.find(r=>r.RepresentationIdentifier.value==='Body').Items[0]);
  assert.equal(body.type,I.IFCTRIANGULATEDFACESET); assert.equal(axis.type,I.IFCPOLYLINE);
  assert.equal(axis.Points.length,b.path.length);
  axis.Points.map(ref).forEach((p,i)=>p.Coordinates.forEach((n,k)=>near(n.value,b.path[i][['x','y','z'][k]],1e-6)));
  const prop=sets.get(bar.expressID).get('OSS_PrefabDetail');
  assert.equal(prop.get('Doelvoorziening'),base+b.targetId);
  near(prop.get('Doorndiameter'),b.mandrelMm);
  near(prop.get('Buigstraal hartlijn'),b.bendRadiusMm);
  near(prop.get('Rechte verankeringsstaart'),b.anchorageMm);
  const schedule=JSON.parse(prop.get('Buigsegmenten'));
  assert(schedule.some(s=>s.type==='arc'));
  near(schedule.reduce((s,x)=>s+x.lengthMm,0),b.lengthMm);
  // Independent OpenCascade digest against the geometric model's world bounding box.
  const vertices=b.faces.flat();
  occ[bar.GlobalId.value]=['x','y','z'].map(k=>[Math.min(...vertices.map(p=>p[k]))/1000,Math.max(...vertices.map(p=>p[k]))/1000]);
  classes.add(b.role);
}
assert.deepEqual([...classes].sort(),['anchorageBar','bearingBar','liftingBar']);
assert.equal(targets.size,bars.length);
const allCasts=[...rows(mid,I.IFCSLAB),...rows(mid,I.IFCSTAIRFLIGHT)];
for(const e of assembly.precast.elements) {
  const obj=allCasts.find(c=>c.Tag?.value===stair.mark+'/'+e.id),set=sets.get(obj.expressID);
  const plan=set.get('OSS_Elementhijsplan');
  near(plan.get('slingAngle'),(e.id==='tussenbordes'?45:30)*Math.PI/180);
  assert.equal(plan.get('riggingReference'),e.id==='tussenbordes'?'H-23/R':'');
  assert.equal(plan.get('Element'),e.id);
  if(e.id==='tussenbordes') assert(plan.get('Elementwaarden').includes('riggingReference'));
  else assert.equal(plan.get('Elementwaarden'),'Trapwaarden');
  for(const z of e.localDetails) {
    const s=set.get('OSS_Bijlegzone_'+z.targetId);
    assert.equal(s.get('Doelvoorziening'),z.targetId);
    near(s.get('Getekende doorsnede'),z.providedAreaMm2/1e6);
    near(s.get('Getekende staartlengte'),z.availableTailMm);
    if(z.requiredTailMm>0) near(s.get('Vereiste staartlengte'),z.requiredTailMm);
    if(z.requiredAreaMm2>0) near(s.get('Benodigde doorsnede'),z.requiredAreaMm2/1e6);
    if(e.id==='tussenbordes'&&z.kind==='lifting') assert.equal(s.get('Status'),'Overschreden');
  }
}
const altered=structuredClone(well);
const copy=altered.instances[0];
Object.assign(copy,{storey:2,rotation:-81,mark:'BT-X'});
copy.liftPlans.tussenbordes.liftingReference='Gewijzigd proefanker';
const second=api.OpenModel(await createStairwellIfc({...project,revision:'02'},altered));
const after=getTags(second);
for(const b of bars) assert.equal(byBar.get(b.id).GlobalId.value,after.get(b.id).GlobalId.value);
api.CloseModel(second);api.CloseModel(mid);
console.log('IFC4: 46 gebogen staven met stabiele identiteit, lokale buigas, doelrelatie, 38 rekenzones en vijf elementhijsplannen herlezen.');
if(process.argv.includes('--ifcopenshell')) {
  assert(file,'Geef een IFC-pad voor onafhankelijke validatie.');
  const python=String.raw`
import json,sys,numpy as np
import ifcopenshell,ifcopenshell.geom as geom,ifcopenshell.validate as validate
from ifcopenshell.util.shape import get_vertices,get_volume
model=ifcopenshell.open(sys.argv[1])
logger=validate.json_logger()
validate.validate(model,logger,express_rules=True)
assert not logger.statements,logger.statements[:3]
cfg=geom.settings()
cfg.set('use-world-coords',True)
items=json.load(sys.stdin)
for gid,bounds in items.items():
    obj=model.by_guid(gid)
    shape=geom.create_shape(cfg,obj)
    coords=get_vertices(shape.geometry)
    assert get_volume(shape.geometry)>0 and np.allclose(coords.min(axis=0),np.array(bounds)[:,0],atol=1e-7) and np.allclose(coords.max(axis=0),np.array(bounds)[:,1],atol=1e-7),obj.Tag
print(f'IfcOpenShell/OpenCascade: 0 schemafouten, {len(items)} wereldvolumes van gebogen staven gecontroleerd.')
`;
  console.log(execFileSync('uv',['run','--no-project','--python','3.12','--with','ifcopenshell==0.9.0.post1','--with','pytest','python','-c',python,file],
    {input:JSON.stringify(occ),encoding:'utf8',timeout:300000}).trim());
}
