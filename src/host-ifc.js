import * as IFC from 'web-ifc';
import clipping from 'polygon-clipping';
import {sectionArea,stairBodyTriangles} from './host-section.js';

const MAX_BYTES=120*1024*1024;
const MAX_ELEMENT_TRIANGLES=100000;
const MAX_TOTAL_TRIANGLES=200000;

export async function readHostIfc(bytes, filename='gebouw.ifc') {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length>MAX_BYTES)
    throw new Error('Kies een IFC-bestand tot 120 MB.');
  const api=new IFC.IfcAPI();
  if(typeof window==='undefined') await api.Init();
  else {
    const {default:wasmUrl}=await import('web-ifc/web-ifc.wasm?url');
    await api.Init(()=>wasmUrl);
  }
  const id=api.OpenModel(bytes);
  if(id<0) throw new Error('Het IFC-gebouwmodel kon niet worden geopend.');
  try {
    const idsOf=type=>{
      const ids=api.GetLineIDsWithType(id,type,true);
      return Array.from({length:ids.size()},(_,i)=>ids.get(i));
    };
    const slabIds=new Set(idsOf(IFC.IFCSLAB));
    const openingIds=new Set(idsOf(IFC.IFCOPENINGELEMENT));
    const floorOpeningIds=new Set();
    const voids=[];
    for (const relationId of idsOf(IFC.IFCRELVOIDSELEMENT)) {
      const relation=api.GetLine(id,relationId);
      const slabId=relation.RelatingBuildingElement?.value, openingId=relation.RelatedOpeningElement?.value;
      if (!slabIds.has(slabId) || !openingIds.has(openingId)) continue;
      voids.push({slabId,openingId});
      floorOpeningIds.add(openingId);
    }
    if(slabIds.size+floorOpeningIds.size>1000) throw new Error('Te veel vloeren of vloersparingen voor deze eerste hostcontrole.');
    let capturedTriangles=0;
    function meshInfo(entity) {
      const mesh=api.GetFlatMesh(id,entity.expressID,true);
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      let triangles=[];
      try {
        for(let i=0;i<mesh.geometries.size();i++) {
          const placed=mesh.geometries.get(i);
          const geometry=api.GetGeometry(id,placed.geometryExpressID);
          try {
            const vertices=api.GetVertexArray(geometry.GetVertexData(),geometry.GetVertexDataSize());
            const m=placed.flatTransformation;
            const world=[];
            for(let j=0;j<vertices.length;j+=6){
              const [x,y,z]=vertices.slice(j,j+3);
              const graphics=[m[0]*x+m[4]*y+m[8]*z+m[12],
                m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
              // web-ifc meshes use Y-up, while IFC placements and our stair use Z-up.
              const values=[graphics[0],-graphics[2],graphics[1]].map(v=>v*1000);
              world.push(values);
              for(let k=0;k<3;k++){min[k]=Math.min(min[k],values[k]);max[k]=Math.max(max[k],values[k]);}
            }
            if(triangles){
              const indices=api.GetIndexArray(geometry.GetIndexData(),geometry.GetIndexDataSize());
              if(triangles.length+indices.length/3>MAX_ELEMENT_TRIANGLES ||
                capturedTriangles+indices.length/3>MAX_TOTAL_TRIANGLES) {
                capturedTriangles-=triangles.length;
                triangles=null;
              }
              else {
                capturedTriangles+=indices.length/3;
                for(let j=0;j+2<indices.length;j+=3)
                  triangles.push([world[indices[j]],world[indices[j+1]],world[indices[j+2]]]);
              }
            }
          } finally {geometry.delete();}
        }
      } finally {mesh.delete?.();}
      return Number.isFinite(min[0])?{bounds:{min,max},triangles}:null;
    }
    const item=entity=>({id:entity.expressID,name:entity.Name?.value??'',type:entity.type,
      ...(meshInfo(entity)??{bounds:null,triangles:null})});
    // Reserve the existing mesh budget for referenced openings before retaining floor bodies.
    const openings=Array.from(floorOpeningIds,openingId=>item(api.GetLine(id,openingId)));
    const slabs=Array.from(slabIds,slabId=>item(api.GetLine(id,slabId)));
    return {filename,schema:api.GetModelSchema(id),slabs,openings,voids};
  } finally {api.CloseModel(id);}
}

function withinFloorBounds(stairAreas,{min,max}) {
  const plan=[[min[0],min[1]],[max[0],min[1]],[max[0],max[1]],[min[0],max[1]]];
  return clipping.intersection(clipping.union(...stairAreas),[plan]);
}

// Positive-area overlap denotes interference. Shared edges and vertices are allowed.
// Openings of one floor form a union, while inner rings of one opening represent islands.
function fitAtLevel(bodies,slab,openings,bim,transform) {
  const z=(slab.bounds.min[2]+slab.bounds.max[2])/2;
  const sections=bodies.map(body=>sectionArea(body,z-Number(bim.originZ??0),transform));
  if(sections.some(area=>area===null))return 'unknown';
  const stairAreas=sections.filter(area=>area.length);
  if(!stairAreas.length)return 'separate';
  const within=withinFloorBounds(stairAreas,slab.bounds);
  if(!within.length)return 'separate';
  let incomplete=false;
  const voidAreas=[];
  for(const opening of openings){
    if(opening.bounds&&(z<opening.bounds.min[2]||z>opening.bounds.max[2]))continue;
    const area=opening.triangles?.length ? sectionArea(opening.triangles,z) : null;
    if(area===null)incomplete=true;
    else if(area.length)voidAreas.push(area);
  }
  const uncovered=clipping.difference(within,...voidAreas);
  if(!uncovered.length)return 'precheck';
  // The box limits the search. Its interior outside a concave slab is empty space.
  if(!slab.triangles?.length)return 'unknown';
  const material=sectionArea(slab.triangles,z);
  if(material===null)return 'unknown';
  if(material.length&&clipping.intersection(uncovered,material).length)return incomplete?'unknown':'outside';
  if(voidAreas.some(area=>clipping.intersection(within,area).length))return 'precheck';
  return incomplete?'unknown':'separate';
}

// Compare the actual planar sections at the middle elevation of each imported floor.
export function checkHostFit(geometry,host,bim={}) {
  if(!host) return {status:'unknown',message:'Geen IFC-gebouwmodel ingelezen.'};
  const angle=Number(bim.originRotationDeg??0)*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle);
  const transform=p=>[Number(bim.originX??0)+c*p[0]-s*p[1],
    Number(bim.originY??0)+s*p[0]+c*p[1]];
  const bodies=stairBodyTriangles({...geometry,componentParts:geometry.componentParts??geometry.landingFrame??[]});
  let checked=0,unresolved;
  for(const slab of host.slabs){
    if(!slab.bounds){unresolved=slab;continue;}
    const openings=host.voids.filter(r=>r.slabId===slab.id)
      .map(r=>host.openings.find(o=>o.id===r.openingId)??{});
    let result;
    try {
      result=fitAtLevel(bodies,slab,openings,bim,transform);
    } catch {
      // A section for which polygon operations fail cannot establish clearance.
      result='unknown';
    }
    if(result==='outside')return {status:result,slabId:slab.id,
      message:`De trapdoorsnede snijdt vloermateriaal buiten de gekoppelde sparingen in vloer ${slab.name||slab.id}.`};
    if(result==='unknown')unresolved=slab;
    if(result==='precheck')checked++;
  }
  if(unresolved)return {status:'unknown',slabId:unresolved.id,
    message:`De beschikbare vloer- en sparingsdoorsneden bij ${unresolved.name||unresolved.id} zijn onvoldoende om de passing vast te stellen.`};
  return checked?{status:'precheck',message:`De trapdoorsnede past op ${checked} vloerpeil(en) binnen de ingelezen sparingscontour. Vrije hoogte en bevestiging moeten nog worden getoetst.`}:
    {status:'unknown',message:'De trap snijdt geen ingelezen vloerdoorsnede of gekoppelde sparing; controleer de projectplaatsing.'};
}
