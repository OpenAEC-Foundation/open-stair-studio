import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as IFC from 'web-ifc';
import {readHostIfc,checkHostFit} from '../src/host-ifc.js';
import {viewportTriangles,sectionSegments,sectionLoops,pointInLoops} from '../src/host-section.js';
import {createIfc4WithApi} from '../src/ifc-export-core.js';
import {generateStairGeometry,starterProject} from '../src/stair.js';

const model=structuredClone(starterProject);
model.stair.type='quarter_turn';
const geometry=generateStairGeometry(model.stair);
const api=new IFC.IfcAPI();
await api.Init();
const bytes=createIfc4WithApi(api,model,geometry).bytes;
const hostId=api.OpenModel(bytes);
const slabId=api.GetLineIDsWithType(hostId,IFC.IFCSLAB).get(0);
const slab=api.GetLine(hostId,slabId);
const make=(type,...args)=>api.CreateIfcEntity(hostId,type,...args);
const length=value=>api.CreateIfcType(hostId,IFC.IFCLENGTHMEASURE,value);
const real=value=>api.CreateIfcType(hostId,IFC.IFCREAL,value);
const label=value=>api.CreateIfcType(hostId,IFC.IFCLABEL,value);
const position=geometry.landings[0].points.reduce((sum,p)=>({x:sum.x+p.x/4,y:sum.y+p.y/4}),{x:0,y:0});
const point=make(IFC.IFCCARTESIANPOINT,[length(position.x/1000),length(position.y/1000),
  length((geometry.landings[0].elevation-geometry.landings[0].thickness)/1000)]);
const axis=make(IFC.IFCAXIS2PLACEMENT3D,point,
  make(IFC.IFCDIRECTION,[real(0),real(0),real(1)]),
  make(IFC.IFCDIRECTION,[real(1),real(0),real(0)]));
const profilePosition=make(IFC.IFCAXIS2PLACEMENT2D,
  make(IFC.IFCCARTESIANPOINT,[length(0),length(0)]),null);
const profile=make(IFC.IFCRECTANGLEPROFILEDEF,{type:3,value:'AREA'},null,profilePosition,length(.2),length(.2));
const solid=make(IFC.IFCEXTRUDEDAREASOLID,profile,axis,
  make(IFC.IFCDIRECTION,[real(0),real(0),real(1)]),length(.2));
const slabShape=api.GetLine(hostId,slab.Representation.value);
const slabRepresentation=api.GetLine(hostId,slabShape.Representations[0].value);
const openingShape=make(IFC.IFCPRODUCTDEFINITIONSHAPE,null,null,[make(IFC.IFCSHAPEREPRESENTATION,
  slabRepresentation.ContextOfItems,label('Body'),label('SweptSolid'),[solid])]);
const opening=api.CreateIfcEntity(hostId,IFC.IFCOPENINGELEMENT,
  api.CreateIFCGloballyUniqueId(hostId),null,
  api.CreateIfcType(hostId,IFC.IFCLABEL,'Testtrapgat'),null,null,
  slab.ObjectPlacement,openingShape,
  api.CreateIfcType(hostId,IFC.IFCIDENTIFIER,'TEST-OPENING'),{type:3,value:'OPENING'});
const relation=api.CreateIfcEntity(hostId,IFC.IFCRELVOIDSELEMENT,
  api.CreateIFCGloballyUniqueId(hostId),null,null,null,slab,opening);
api.WriteLine(hostId,opening);
api.WriteLine(hostId,relation);
const hostBytes=api.SaveModel(hostId);
api.CloseModel(hostId);
if(process.argv[2]==='--fixture'&&process.argv[3])writeFileSync(process.argv[3],hostBytes);
const host=await readHostIfc(hostBytes,'testgebouw.ifc');
assert.equal(host.schema,'IFC4');
assert.equal(host.slabs.length,1);
assert(host.slabs[0].bounds.max[2]>host.slabs[0].bounds.min[2]);
assert.equal(host.openings.length,1);
assert.equal(host.voids.length,1);
assert(host.openings[0].bounds);
assert.equal(host.openings[0].triangles.length,12);
assert.equal(checkHostFit(geometry,host).status,'outside');
assert.equal(sectionLoops(host.openings[0].triangles,1420).length,1);
assert(sectionSegments(viewportTriangles(geometry),1420).length>0);
const target={min:[-1000,-1000,1400],max:[10000,10000,1600]};
const source=host.openings[0].bounds;
const stretch=point=>point.map((value,i)=>target.min[i]+(value-source.min[i])*(target.max[i]-target.min[i])/(source.max[i]-source.min[i]));
const testOpening={id:10001,name:'Testtrapgat',bounds:target,
  triangles:host.openings[0].triangles.map(face=>face.map(stretch))};
const testHost={...host,openings:[testOpening],voids:[{slabId:host.slabs[0].id,openingId:testOpening.id}]};
assert.equal(checkHostFit(geometry,testHost).status,'precheck');
const shifted={...testHost,slabs:[{...host.slabs[0],bounds:{
  min:[host.slabs[0].bounds.min[0]+12000,...host.slabs[0].bounds.min.slice(1)],
  max:[host.slabs[0].bounds.max[0]+12000,...host.slabs[0].bounds.max.slice(1)]}}],openings:[{...testOpening,
  triangles:testOpening.triangles.map(face=>face.map(([x,y,z])=>[x+12000,y,z]))}]};
assert.equal(checkHostFit(geometry,shifted,{originX:12000,originY:0}).status,'precheck');
const narrow={...testHost,openings:[{...testOpening,
  triangles:testOpening.triangles.map(face=>face.map(([x,y,z])=>[x/100,y,z]))}]};
assert.equal(checkHostFit(geometry,narrow).status,'outside');
const concave=[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]];
const walls=concave.flatMap((a,i)=>{
  const b=concave[(i+1)%concave.length];
  const lo=[...a,0],hi=[...a,10],nextLo=[...b,0],nextHi=[...b,10];
  return [[lo,nextLo,nextHi],[lo,nextHi,hi]];
});
const loops=sectionLoops(walls,5);
assert.equal(loops.length,1);
assert(pointInLoops([.5,2],loops));
assert(!pointInLoops([2,2],loops));
console.log('Host IFC4: vloer gemesht; sparingsrelatie en planpassing gecontroleerd.');
