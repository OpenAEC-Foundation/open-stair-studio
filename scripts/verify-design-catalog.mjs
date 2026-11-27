// Add --ifcopenshell for independent EXPRESS and OpenCascade checks in a temporary directory.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, writeFile, rm, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as IFC from 'web-ifc';
import {assembleWell, emptyWell, heightOn, elevationOf, newInstance, readWell, typeOf} from '../src/stairwell.js';
import {createStairwellIfc} from '../src/stairwell-ifc.js';
import {boundsOf} from '../src/components/solids.js';

const cases=[
  ['glass',{layers:4,risers:10,guard:'left'}],
  ['cantilever',{risers:10,guard:'free'}],
  ['steel',{risers:6,layout:'straight',treadType:'grating',stringerStyle:'openFrame',railSide:'left'}],
  ['escape',{risers:13,layout:'return',railSide:'both'}],
  ['portable',{steps:5,guard:'sides',accessHeight:1270}],
  ['ladder',{rungs:8,handholds:'pair',accessHeight:2470}]
];
let well={...structuredClone(emptyWell),uid:'catalog-test',width:30000,length:30000,heights:{0:2860,1:3120,2:3300}};
for(const [j,[type,edit]] of cases.entries()){
  const i=newInstance(type,well,j%3);
  Object.assign(i,{id:'catalog-'+type,x:2500+j*2000,y:2500+j*1700,rotation:[12,-29,47,97,-33,19][j]});
  Object.assign(i.params,edit);well.instances.push(i);
  const railKey=({glass:'guard',cantilever:'guard',steel:'railSide',escape:'railSide',portable:'guard',ladder:'handholds'})[type];
  const first=typeOf(type).build({...i.params,height:heightOn(well,i.storey)});
  const bare=typeOf(type).build({...i.params,height:heightOn(well,i.storey),[railKey]:'none'});
  assert.ok(first.parts.some(p=>p.kind==='railing'),type);
  assert.ok(!bare.parts.some(p=>p.kind==='railing'),type);
}
const saved=JSON.stringify(well);well=readWell(JSON.parse(saved));
assert.deepEqual(JSON.parse(saved),well);
const assemblies=assembleWell(well);
assert.equal(assemblies.length,6);
const project={number:'CAT-TEST',name:'Ontwerpcatalogus',revision:'A'};
const bim={originX:12500,originY:-6200,originZ:875,originRotationDeg:90,originAgreed:true};
const data=await createStairwellIfc(project,well,bim);
const api=new IFC.IfcAPI();await api.Init();
const m=api.OpenModel(data),ref=h=>api.GetLine(m,h.value);
const all=t=>{const ids=api.GetLineIDsWithType(m,t);return Array.from({length:ids.size()},(_,i)=>api.GetLine(m,ids.get(i)));};
const near=(x,y,tol=1e-5)=>assert.ok(Math.abs(x-y)<tol,x+' versus '+y);
assert.equal(api.GetModelSchema(m),'IFC4');
const stairs=all(IFC.IFCSTAIR),rels=all(IFC.IFCRELAGGREGATES),contained=all(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE),
  material=all(IFC.IFCRELASSOCIATESMATERIAL),psets=all(IFC.IFCRELDEFINESBYPROPERTIES);
const childList=e=>rels.filter(r=>r.RelatingObject.value===e.expressID).flatMap(r=>r.RelatedObjects.map(ref));
function props(e,name){
  const set=psets.filter(r=>r.RelatedObjects.some(h=>h.value===e.expressID)).map(r=>ref(r.RelatingPropertyDefinition)).find(s=>s.Name.value===name);
  assert.ok(set,name+' on '+e.Name.value);
  return Object.fromEntries(set.HasProperties.map(h=>{const p=ref(h);return [p.Name.value,p.NominalValue.value];}));
}
function worldBounds(p,xyz){
  let coords=xyz;
  for(let h=p.ObjectPlacement;h;){
    const loc=ref(h),axis=ref(loc.RelativePlacement),base=ref(axis.Location).Coordinates.map(n=>n.value);
    const [c,s]=axis.RefDirection?ref(axis.RefDirection).DirectionRatios.map(n=>n.value):[1,0];
    coords=coords.map(([x,y,z])=>[base[0]+c*x-s*y,base[1]+s*x+c*y,base[2]+z]);h=loc.PlacementRelTo;
  }
  return [0,1,2].flatMap(k=>[Math.min(...coords.map(v=>v[k])),Math.max(...coords.map(v=>v[k]))]);
}
const truth={}, seen=new Set();
const datum=props(all(IFC.IFCSITE)[0],'OSS_ProjectOrigin');
assert.equal(datum.OriginZ_mm,bim.originZ);
assert.equal(datum.RotationDegrees,90);
assert.ok(datum.OriginAgreed===true || datum.OriginAgreed==='T');
for(const g of assemblies){
  const i=g.instance,p=i.params,host=stairs.find(s=>s.Tag.value===i.mark),local=typeOf(i.type).build({...p,height:heightOn(well,i.storey)});
  assert.ok(host&&!g.issues.some(v=>v.level==='error'),i.type);
  const P=props(host,'OSS_Trapcomponent'),level=contained.filter(r=>r.RelatedElements.some(h=>h.value===host.expressID));
  assert.equal(level.length,1);near(ref(level[0].RelatingStructure).Elevation.value,elevationOf(well,i.storey));
  const H=p.accessHeight??heightOn(well,i.storey);near(P.Hoogte,H);
  if(p.accessHeight) assert.ok(!('Aankomstbouwlaag' in P));else assert.equal(P.Aankomstbouwlaag,i.storey+1);
  const descendants=e=>childList(e).flatMap(q=>[q,...descendants(q)]);
  const children=descendants(host),flights=childList(host).filter(e=>e.type===IFC.IFCSTAIRFLIGHT);
  const count=p.layout==='return'?2:1;assert.equal(flights.length,count,i.type);
  const treads=local.parts.filter(q=>q.kind==='tread');
  assert.equal(flights.reduce((s,f)=>s+f.NumberOfTreads.value,0),treads.length);
  if(i.type!=='ladder'){
    const n=p.risers??p.steps;assert.equal(flights.reduce((s,f)=>s+f.NumberOfRisers.value,0),n,i.type);
    for(const f of flights)near(f.RiserHeight.value,H/n);
  }
  const rails=childList(host).filter(e=>e.type===IFC.IFCRAILING);
  assert.equal(rails.length,1);
  assert.equal(childList(rails[0]).length,local.parts.filter(q=>q.kind==='railing').length);
  const physical=children.filter(e=>e.Representation);
  assert.equal(physical.length,g.parts.length,i.type);
  const src=new Map(g.parts.map(q=>[i.mark+'/'+q.id,q]));
  for(const product of physical){
    const tag=product.Tag.value,q=src.get(tag);assert.ok(q,tag);
    assert.ok(!seen.has(tag),tag);seen.add(tag);
    const materials=material.filter(r=>r.RelatedObjects.some(h=>h.value===product.expressID));
    assert.equal(materials.length,1,tag);assert.equal(ref(materials[0].RelatingMaterial).Category.value,q.material,tag);
    const rep=ref(ref(product.Representation).Representations[0]),mesh=ref(rep.Items[0]);
    assert.equal(mesh.type,IFC.IFCTRIANGULATEDFACESET);assert.equal(mesh.Closed.value,true);
    const b=boundsOf([q]);
    // At +90 degrees the west edge comes from the northernmost vertex.
    const target=[bim.originX-b.ymax,bim.originX-b.ymin,bim.originY+b.xmin,bim.originY+b.xmax,
      bim.originZ+b.zmin,bim.originZ+b.zmax];
    const actual=worldBounds(product,ref(mesh.Coordinates).CoordList.map(v=>v.map(n=>n.value)));
    actual.forEach((v,k)=>near(v,target[k],.00001));
    truth[product.GlobalId.value]=target.map(n=>n/1000);
  }
  if(i.type==='glass'){
    const stack=g.parts.filter(q=>/^trede-01-(glas|folie)-/.test(q.id));
    assert.equal(stack.filter(q=>q.material==='glass').length,p.layers);
    assert.equal(stack.filter(q=>q.material==='interlayer').length,p.layers-1);
    const layers=stack.map(q=>boundsOf([q])).sort((a,b)=>a.zmin-b.zmin);
    layers.forEach((l,j)=>{near(l.zmax-l.zmin,j%2?p.film:p.ply);if(j)near(l.zmin,layers[j-1].zmax);});
  }
  if(i.type==='escape') assert.equal(props(host,'OSS_Vluchtroute').Status,g.escape.status);
}
assert.equal(stairs.length,6);
assert.equal(seen.size,all(IFC.IFCTRIANGULATEDFACESET).length);
api.CloseModel(m);
console.log('Zes ontwerpfamilies opnieuw geopend vanuit project en IFC4. '+seen.size+' fysieke delen met correcte merken, materialen, wereldplaatsing en vluchtmaten.');

if(process.argv.includes('--ifcopenshell')){
  const dir=await mkdtemp(join(tmpdir(),'oss-design-catalog-'));
  const file=join(dir,'ontwerpcatalogus.ifc');
  try{
    await writeFile(file,data);
    const check=String.raw`
import sys,json,numpy as np,ifcopenshell,ifcopenshell.geom,ifcopenshell.validate
from ifcopenshell.util.shape import get_vertices,get_volume
m=ifcopenshell.open(sys.argv[1])
log=ifcopenshell.validate.json_logger()
ifcopenshell.validate.validate(m,log,express_rules=True)
assert not log.statements,log.statements[:4]
settings=ifcopenshell.geom.settings()
settings.set('use-world-coords',True)
truth=json.load(sys.stdin)
for guid,d in truth.items():
    p=m.by_guid(guid)
    shape=ifcopenshell.geom.create_shape(settings,p)
    coords=get_vertices(shape.geometry)
    assert get_volume(shape.geometry)>0,p.Tag
    assert np.allclose(coords.min(axis=0),d[::2],rtol=0,atol=.000001) and np.allclose(coords.max(axis=0),d[1::2],rtol=0,atol=.000001),p.Tag
print(f'IfcOpenShell EXPRESS: 0 fouten. OpenCascade controleerde {len(truth)} wereldvolumes.')
`;
    console.log(execFileSync('uv',['run','--no-project','--python','3.12','--with','ifcopenshell==0.9.0.post1','--with','pytest','python','-c',check,file],
      {input:JSON.stringify(truth),encoding:'utf8',timeout:360000}).trim());
  } finally {await rm(file,{force:true});await rmdir(dir);}
}
