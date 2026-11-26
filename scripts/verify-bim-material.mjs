import assert from 'node:assert/strict';
import * as IFC from 'web-ifc';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { calculateEstimate, generateStairGeometry, starterProject } from '../src/stair.js';
import { parseInput, readProject } from '../src/project.js';
import { buildWorkshop } from '../src/workshop.js';
import { buildViewportMesh } from '../src/viewport-mesh.js';
import { createLandingFrameDxf } from '../src/landing-frame-dxf.js';
import { checkLandingJoints } from '../src/landing-joint-check.js';
import {geometryErrors} from '../src/stair-validity.js';

assert.equal(parseInput('stair', 'nlsfbCode', '22.11'), '22.11');
assert.throws(() => parseInput('stair', 'nlsfbCode', '2211'), /NL-SfB/);
assert.throws(() => parseInput('stair', 'materialName', 'hout\nstaal'), /materiaalomschrijving/);
assert.equal(parseInput('bim', 'originAgreed', true), true);
const legacy = structuredClone(starterProject);
delete legacy.bim;
legacy.version='0.12.0';
legacy.schema='https://openaec.foundation/schemas/open-stair-studio/project-0.12.json';
assert.equal(readProject(legacy).bim.originAgreed, false);

const model = structuredClone(starterProject);
Object.assign(model.stair, {
  type: 'quarter_turn', landingRiser: 8, turnDirection: 'right',
  materialName: 'Eikenhout', materialFeature: 'massief',
  materialApplication: 'trapvlucht en bordes', nlsfbCode: '22.11',
  nlsfbLandingCode: '23.11', nlsfbRailingCode: '34.11', landingThickness: 65,
  railSide: 'both', landingFrame: 'perimeter', landingFrameWidth: 70, landingFrameDepth: 160,
  landingScrewShearRd: 1, landingTimberE: 11000, landingTimberFmRd: 10
});
model.bim = { originX: 120000, originY: -34000, originZ: 4500, originRotationDeg: 90, originAgreed: true };
model.engineering.loadArea=2;
model.engineering.loadPoint=1;
model.estimate.fastenerUnitPrice=2.5;
const geometry = generateStairGeometry(model.stair);
assert.equal(geometry.landings[0].thickness, 65);
assert.equal(geometry.parts.find(p => p.id === geometry.landings[0].id).volume, geometry.landings[0].volume);
assert.equal(geometry.landingFrame.length, 4);
assert.equal(geometry.landingJoints.length, 4);
assert.equal(geometry.landingFasteners.length,8);
const jointCheck=checkLandingJoints(model,geometry);
assert.equal(jointCheck.status,'within-input');
assert.equal(jointCheck.totalLoad,2*geometry.landings[0].length*geometry.landings[0].width/1e6+1);
assert.equal(jointCheck.screwDemand,jointCheck.totalLoad/8);
const firstMember=jointCheck.memberChecks[0];
const q=model.engineering.loadArea*jointCheck.areaM2*1000/(4*firstMember.span);
const p=model.engineering.loadPoint*1000/4;
assert.equal(firstMember.moment,q*firstMember.span**2/8+p*firstMember.span/4);
assert.equal(firstMember.bendingStress,firstMember.moment/(geometry.landingFrame[0].width*geometry.landingFrame[0].thickness**2/6));
assert.equal(checkLandingJoints({...model,stair:{...model.stair,landingTimberFmRd:.1}},geometry).status,'over');
assert(geometry.landingFasteners.every(part=>part.faces.length===10&&part.length===120&&part.diameter===8));
for(const screw of geometry.landingFasteners){
  const edges=new Set();
  let volume=0;
  for(const face of screw.faces){
    for(let i=0;i<face.length;i++){
      const a=face[i],b=face[(i+1)%face.length];
      edges.add(`${a.x},${a.y},${a.z}|${b.x},${b.y},${b.z}`);
    }
    for(let i=1;i+1<face.length;i++){
      const [a,b,c]=[face[0],face[i],face[i+1]];
      volume+=(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;
    }
  }
  assert([...edges].every(edge=>edges.has(edge.split('|').reverse().join('|'))),`open screw mesh ${screw.id}`);
  assert(volume>0,`inverted screw mesh ${screw.id}`);
}
assert(geometryErrors({...model.stair,landingScrewLength:75},geometry.dimensions).some(issue=>issue.title==='Bordesschroeven passen niet'));
assert(geometry.landingFrame.every(part => part.elevation === geometry.landings[0].elevation-65));
assert(geometry.landingFrame.every(part => part.faces.length === 6));
const frameDxf=createLandingFrameDxf(geometry.landings[0],geometry.landingFrame,geometry.landingJoints,geometry.landingFasteners);
assert(frameDxf.includes('OSS-RANDLIGGERS')&&frameDxf.includes('OSS-BOORPUNTEN-BUITENZIJDE'));
const left=generateStairGeometry({...model.stair,turnDirection:'left'});
assert.equal(left.landingFrame.length,geometry.landingFrame.length);
assert.equal(left.landingFrame.reduce((sum,p)=>sum+p.volume,0),geometry.landingFrame.reduce((sum,p)=>sum+p.volume,0));
const workshop=buildWorkshop(geometry,model);
assert.equal(workshop.parts.filter(part=>part.kind==='landingRim').length,4);
assert(calculateEstimate(workshop).volume>calculateEstimate(buildWorkshop(
  generateStairGeometry({...model.stair,landingFrame:'none'}),model)).volume);
assert.equal(calculateEstimate(workshop,model.estimate).hardware,20);
assert(buildViewportMesh({componentParts:[...geometry.landingFrame,...geometry.landingFasteners]}).triangles>0);
const api = new IFC.IfcAPI();
await api.Init();
const exported = createIfc4WithApi(api, model, geometry);
const id = api.OpenModel(exported.bytes);
try {
  const entities = type => {
    const ids = api.GetLineIDsWithType(id, type);
    return Array.from({length: ids.size()}, (_, i) => api.GetLine(id, ids.get(i)));
  };
  const resolve = handle => api.GetLine(id, handle.value);
  const [stair] = entities(IFC.IFCSTAIR);
  const [site] = entities(IFC.IFCSITE);
  const sitePlacement = resolve(site.ObjectPlacement);
  const origin = resolve(resolve(sitePlacement.RelativePlacement).Location).Coordinates.map(v => v.value);
  assert.deepEqual(origin, [120, -34, 4.5]);
  const heading = resolve(resolve(sitePlacement.RelativePlacement).RefDirection).DirectionRatios.map(v=>v.value);
  assert(Math.abs(heading[0])<1e-12 && Math.abs(heading[1]-1)<1e-12);
  const sitePset=entities(IFC.IFCRELDEFINESBYPROPERTIES)
    .filter(relation=>relation.RelatedObjects.some(item=>item.value===site.expressID))
    .map(relation=>resolve(relation.RelatingPropertyDefinition))
    .find(item=>item.Name.value==='OSS_ProjectOrigin');
  assert.equal(resolve(sitePset.HasProperties.find(item=>resolve(item).Name.value==='OriginAgreed')).NominalValue.value,true);
  const materialRelations = entities(IFC.IFCRELASSOCIATESMATERIAL);
  const timber = materialRelations.find(relation => resolve(relation.RelatingMaterial).Name.value ===
    'Eikenhout - massief - trapvlucht en bordes');
  assert(timber, 'specified timber material is missing');
  assert.equal(timber.RelatedObjects.filter(item => resolve(item).type === IFC.IFCSTAIRFLIGHT).length, geometry.flights.length);
  assert.equal(timber.RelatedObjects.filter(item => resolve(item).type === IFC.IFCSLAB).length, geometry.landings.length);
  assert.equal(timber.RelatedObjects.filter(item => resolve(item).type === IFC.IFCBEAM).length, 4);
  assert.equal(entities(IFC.IFCMECHANICALFASTENER).length,8);
  assert(materialRelations.some(relation=>resolve(relation.RelatingMaterial).Name.value==='Verzinkt staal'&&
    relation.RelatedObjects.filter(item=>resolve(item).type===IFC.IFCMECHANICALFASTENER).length===8));

  const classifications = entities(IFC.IFCRELASSOCIATESCLASSIFICATION);
  const classified = classifications.flatMap(relation => relation.RelatedObjects.map(item => ({
    object: resolve(item), code: resolve(relation.RelatingClassification).Identification.value
  })));
  assert.equal(classified.find(entry => entry.object.expressID === stair.expressID).code, '22.11');
  assert(classified.some(entry => entry.object.type === IFC.IFCSLAB && entry.code === '23.11'));
  assert(classified.some(entry => entry.object.type === IFC.IFCBEAM && entry.code === '23.11'));
  assert(classified.some(entry => entry.object.type === IFC.IFCMECHANICALFASTENER && entry.code === '23.11'));
  assert(classified.some(entry => entry.object.type === IFC.IFCRAILING && entry.code === '34.11'));
  assert.equal(new Set(classified.map(entry => entry.object.expressID)).size,
    entities(IFC.IFCSTAIR).length + entities(IFC.IFCSTAIRFLIGHT).length +
    entities(IFC.IFCSLAB).length + entities(IFC.IFCBEAM).length + entities(IFC.IFCMECHANICALFASTENER).length + entities(IFC.IFCRAILING).length +
    entities(IFC.IFCMEMBER).length + entities(IFC.IFCPLATE).length);
  assert(classifications.every(relation => resolve(resolve(relation.RelatingClassification).ReferencedSource).Name.value === 'NL-SfB'));
  const typeRelations = entities(IFC.IFCRELDEFINESBYTYPE);
  assert(typeRelations.some(relation => relation.RelatedObjects.some(item => item.value === stair.expressID) &&
    resolve(relation.RelatingType).type === IFC.IFCSTAIRTYPE));
  assert(typeRelations.some(relation => resolve(relation.RelatingType).type === IFC.IFCSTAIRFLIGHTTYPE));
  assert(typeRelations.some(relation => resolve(relation.RelatingType).type === IFC.IFCSLABTYPE));
  assert(typeRelations.some(relation => resolve(relation.RelatingType).type === IFC.IFCBEAMTYPE));
  assert(typeRelations.some(relation => resolve(relation.RelatingType).type === IFC.IFCMECHANICALFASTENERTYPE));
  const framePset=entities(IFC.IFCPROPERTYSET).find(item=>item.Name.value==='OSS_Bordesraam');
  const frameProps=new Map(framePset.HasProperties.map(resolve).map(item=>[item.Name.value,item.NominalValue.value]));
  assert.equal(frameProps.get('Schroeven'),8);
  assert.equal(frameProps.get('SchroeftoetsStatus'),'within-input');
  assert.equal(frameProps.get('Schroefbelasting_kN'),jointCheck.screwDemand);
  assert.equal(frameProps.get('MaxBuigbenutting'),Math.max(...jointCheck.memberChecks.map(item=>item.bendingUtilization)));

  const pset = entities(IFC.IFCRELDEFINESBYPROPERTIES)
    .filter(relation => relation.RelatedObjects.some(item => item.value === stair.expressID))
    .map(relation => resolve(relation.RelatingPropertyDefinition))
    .find(item => item.Name.value === 'OSS_NAAKT');
  const properties = new Map(pset.HasProperties.map(resolve).map(item => [item.Name.value, item.NominalValue.value]));
  assert.deepEqual([...properties], [['Naam', 'Eikenhout'], ['Kenmerk', 'massief'],
    ['Toepassing', 'trapvlucht en bordes'], ['Volledig', true]]);
  console.log('BIM materiaal en classificatie: IFC4 relaties gecontroleerd.');
} finally {
  api.CloseModel(id);
}
