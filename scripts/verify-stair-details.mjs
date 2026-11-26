import assert from 'node:assert/strict';
import * as IFC from 'web-ifc';
import { generateStairGeometry, inspectStair, stairFamilies, starterProject } from '../src/stair.js';
import { buildStairDetails, detailDefaults, newDesignDetails } from '../src/stair-details.js';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import {readProject} from '../src/project.js';
import {timberSheetParts,timberViews} from '../src/timber-sheet.js';

const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const key=p=>[p.x,p.y,p.z].map(x=>Math.round(x*1e6)).join(',');
const shape=(type,settings={})=>{
  const stair={...starterProject.stair,...newDesignDetails,type,...settings};
  const geometry=generateStairGeometry(stair,{projectIsometric:false});
  return {stair,geometry,parts:buildStairDetails(stair,geometry)};
};
const volume=faces=>{
  let v=0;
  const counts=new Map();
  for(const face of faces) {
    for(let i=0;i<face.length;i++) {
      const a=key(face[i]),b=key(face[(i+1)%face.length]);
      assert.notEqual(a,b);
      const id=[a,b].sort().join(';');
      const [n,d]=counts.get(id)??[0,0];
      counts.set(id,[n+1,d+(a<b?1:-1)]);
    }
    for(let i=1;i+1<face.length;i++) {
      const [a,b,c]=[face[0],face[i],face[i+1]];
      v+=(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;
    }
  }
  assert([...counts.values()].every(([n,d])=>n===2&&d===0));
  return v;
};

for(const family of stairFamilies.filter(f=>!f.component)) {
  const {stair,geometry,parts}=shape(family.id);
  assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
  assert.equal(parts.filter(p=>p.kind==='plate').length,stair.risers);
  assert.equal(parts.filter(p=>p.kind==='railing').length,2);
  assert(parts.some(p=>p.kind==='member'));
  assert.deepEqual(buildStairDetails({...stair,...detailDefaults},geometry),[]);
  for(const p of parts) {
    const v=volume(p.faces);
    assert(Number.isFinite(v)&&v>0,p.id);
    if(p.kind==='plate') near(p.volumeM3,v/1e9);
  }
  const onlyLeft=shape(family.id,{railSide:'left',riserBoards:'none'}).parts;
  assert(onlyLeft.every(p=>p.id.includes('-LN-L')));
  const onlyBoards=shape(family.id,{railSide:'none'}).parts;
  assert(onlyBoards.every(p=>p.kind==='plate'));
}
for(const type of ['quarter_winder','half_winder']) for(const outerShape of ['square','faceted']) {
  const original=shape(type,{outerShape,turnDirection:'left'});
  const mirror=shape(type,{outerShape,turnDirection:'right'});
  const a=original.parts.find(p=>p.kind==='railing'&&p.id.endsWith('-L'));
  const b=mirror.parts.find(p=>p.kind==='railing'&&p.id.endsWith('-R'));
  assert.equal(a.axisPath.length,b.axisPath.length);
  a.axisPath.forEach((p,i)=>{near(p.x,b.axisPath[i].x);near(p.y,-b.axisPath[i].y);near(p.z,b.axisPath[i].z);});
  for(const p of original.parts.filter(v=>v.kind==='plate')) {
    const q=mirror.parts.find(v=>v.id===p.id);near(p.volumeM3,q.volumeM3);
  }
}
for(const type of ['half_turn','quarter_turn']) {
  const {stair,geometry,parts}=shape(type);
  const z=geometry.landings[0].elevation+stair.railHeight;
  const right=parts.find(p=>p.id.endsWith('LN-R')).axisPath;
  const start=right.findIndex(p=>Math.abs(p.z-z)<1e-6);
  assert(start>=0);
  const end=right.findIndex((p,i)=>i>start&&p.z>z+1e-6);
  assert(end>start);
  const land=geometry.landings[0].points;
  const xs=land.map(p=>p.x),ys=land.map(p=>p.y);
  for(let i=start;i<end;i++) for(let s=0;s<=1;s+=.125) {
    const a=right[i],b=right[i+1];
    const x=a.x+(b.x-a.x)*s,y=a.y+(b.y-a.y)*s;
    assert(Math.min(Math.abs(x-Math.max(...xs)),Math.abs(y-Math.min(...ys)),Math.abs(y-Math.max(...ys)))<=stair.stringerThickness);
  }
}
const api=new IFC.IfcAPI();
await api.Init();
for(const type of ['straight','quarter_turn','landing','half_turn'])
for(const nose of [-25,0,25]){
  const {stair,geometry,parts}=shape(type,{railSide:'none',nosing:nose});
  const tread=geometry.treads[1],board=parts.find(p=>p.id===tread.id+'-SB');
  assert(board,`${type} ${nose} stootbord`);
  near(board.volumeM3,volume(board.faces)/1e9);
  assert(board.stockWidthMm>=board.heightMm);
  const station=p=>(p.x-tread.frontEdge[0].x)*tread.direction.x+(p.y-tread.frontEdge[0].y)*tread.direction.y;
  const top=board.faces.flat().filter(p=>Math.abs(p.z-(tread.elevation-tread.thickness))<1e-6);
  const bottom=board.faces.flat().filter(p=>Math.abs(p.z-(tread.elevation-geometry.dimensions.rise))<1e-6);
  near(Math.min(...top.map(station)),Math.max(0,nose-stair.riserThickness));
  near(Math.max(...bottom.map(station)),nose);
  const model={...structuredClone(starterProject),stair};
  assert(createIfc4WithApi(api,model,geometry).bytes.length>0);
}
{
  const {stair,geometry,parts}=shape('straight',{railSide:'none',nosing:-25,riserPosition:'manual',riserTopInset:12,riserBottomInset:25});
  const tread=geometry.treads[1],board=parts.find(p=>p.id===tread.id+'-SB');
  assert.equal(board.topInsetMm,12);assert.equal(board.bottomInsetMm,25);
  assert(board.developedHeightMm>board.heightMm);
  near(board.volumeM3,volume(board.faces)/1e9);
  assert.equal(readProject({...structuredClone(starterProject),stair}).stair.riserTopInset,12);
  const row=timberSheetParts(geometry,parts).find(p=>p.id===board.id);
  const section=timberViews(row)[1].paths[0].points;
  assert(section[0].x!==section[3].x,'werkblad toont schuine stootbordzijde');
  assert(inspectStair({...structuredClone(starterProject),stair}).every(f=>f.title!=='Stootbord past niet onder boventrede'));
}
{
  const {stair,geometry,parts}=shape('quarter_turn',{railSide:'none',nosing:-25,
    stringerLeft:'cut',stringerRight:'housed',stringerOverhang:20});
  const board=parts.find(p=>p.id===geometry.treads[1].id+'-SB');
  const ys=board.faces.flat().map(p=>p.y);
  near(Math.max(...ys)-Math.min(...ys),stair.width-2*stair.stringerThickness);
  near(board.volumeM3,volume(board.faces)/1e9);
}

{
  const stair={...starterProject.stair,...newDesignDetails,type:'straight',floorHeight:1040,risers:26,treadThickness:45};
  const model={...structuredClone(starterProject),stair};
  for(const [riserBoards,nosing,thickness,message] of [
    ['closed',25,45,'vrije stootbordhoogte is -5 mm'],
    ['closed',0,40,'vrije stootbordhoogte is 0 mm'],
    ['none',25,45,'overlappen opeenvolgende tredecontouren'],
    ['none',25,40,null],['none',0,45,null],['closed',25,39,null]
  ]) {
    Object.assign(stair,{riserBoards,nosing,treadThickness:thickness});
    const geometricIssue=inspectStair(model).find(f=>f.reference==='Geometrische invoer');
    const g=generateStairGeometry(stair);
    if(message) {
      assert(geometricIssue?.detail.includes(message));
      assert.throws(()=>buildStairDetails(stair,g),e=>e.message.includes(message));
      assert.throws(()=>createIfc4WithApi(api,model,g),e=>e.message.includes(message));
    } else {
      assert.equal(geometricIssue,undefined);
      assert.equal(buildStairDetails(stair,g).filter(p=>p.kind==='plate').length,riserBoards==='closed'?26:0);
    }
  }
  Object.assign(stair,{riserBoards:'closed',nosing:0,treadThickness:45});
  model.engineering.structureType='glass';
  assert(!inspectStair(model).some(f=>f.title==='Geen ruimte voor gesloten stootborden'));
  assert(createIfc4WithApi(api,model,generateStairGeometry(stair)).bytes.length>0);
}
for(const type of ['straight','half_winder']) {
  const {stair,geometry,parts}=shape(type);
  const model={...structuredClone(starterProject),stair};
  const out=createIfc4WithApi(api,model,geometry);
  const id=api.OpenModel(out.bytes);
  const elements=t=>{const ids=api.GetLineIDsWithType(id,t);return Array.from({length:ids.size()},(_,i)=>api.GetLine(id,ids.get(i)));};
  try {
    const rails=elements(IFC.IFCRAILING),members=elements(IFC.IFCMEMBER),plates=elements(IFC.IFCPLATE);
    for(const e of [...rails,...members,...plates]) {
      const p=parts.find(p=>p.id===e.Tag.value);
      assert(p,e.Tag.value);
      const definition=api.GetLine(id,e.Representation.value);
      const body=api.GetLine(id,definition.Representations[0].value);
      assert.equal(body.RepresentationType.value,'Brep');
      assert.equal(api.GetLine(id,body.Items[0].value).type,IFC.IFCFACETEDBREP);
    }
    assert.equal(plates.length,stair.risers);
    assert(rails.every(r=>r.PredefinedType.value==='HANDRAIL'));
    assert(members.every(m=>m.PredefinedType.value==='POST'));
  } finally {api.CloseModel(id);}
  model.engineering.structureType='glass';
  geometry.detailParts=parts;
  const glass=createIfc4WithApi(api,model,geometry);
  const check=api.OpenModel(glass.bytes);
  assert.equal(api.GetLineIDsWithType(check,IFC.IFCRAILING).size(),0);
  api.CloseModel(check);
}
console.log('Zes klassieke trapfamilies: gesloten leuningen en stootborden, bordespassage, links/rechts, spiegeling en materiaalzuivere IFC4 gecontroleerd.');
