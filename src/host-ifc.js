import * as IFC from 'web-ifc';
import {sectionLoops,sectionSegments,pointInLoops,viewportTriangles} from './host-section.js';

const MAX_BYTES=120*1024*1024;
const EPS=0.01;
const MAX_OPENING_TRIANGLES=100000;
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
    const entities=type=>{
      const ids=api.GetLineIDsWithType(id,type);
      return Array.from({length:ids.size()},(_,i)=>api.GetLine(id,ids.get(i)));
    };
    const slabs=entities(IFC.IFCSLAB), openings=entities(IFC.IFCOPENINGELEMENT);
    if(slabs.length+openings.length>1000) throw new Error('Te veel vloeren of sparingen voor deze eerste hostcontrole.');
    let capturedTriangles=0;
    function meshInfo(entity, keepTriangles=false) {
      const mesh=api.GetFlatMesh(id,entity.expressID,true);
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      let triangles=keepTriangles?[]:null;
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
              if(triangles.length+indices.length/3>MAX_OPENING_TRIANGLES ||
                capturedTriangles+indices.length/3>MAX_TOTAL_TRIANGLES) triangles=null;
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
    const item=(entity,opening=false)=>({id:entity.expressID,name:entity.Name?.value??'',type:entity.type,
      ...(meshInfo(entity,opening)??{bounds:null,triangles:null})});
    const voids=entities(IFC.IFCRELVOIDSELEMENT).map(relation=>({
      slabId:relation.RelatingBuildingElement?.value,openingId:relation.RelatedOpeningElement?.value
    }));
    return {filename,schema:api.GetModelSchema(id),slabs:slabs.map(entity=>item(entity)),
      openings:openings.map(entity=>item(entity,true)),voids};
  } finally {api.CloseModel(id);}
}

// Check the stair section at the middle of each imported floor against the
// actual opening section. This remains a geometric precheck, not a load or
// headroom assessment.
export function checkHostFit(geometry,host,bim={}) {
  if(!host) return {status:'unknown',message:'Geen IFC-gebouwmodel ingelezen.'};
  const angle=Number(bim.originRotationDeg??0)*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle);
  const transform=p=>[Number(bim.originX??0)+c*p[0]-s*p[1],
    Number(bim.originY??0)+s*p[0]+c*p[1]];
  const triangles=viewportTriangles({...geometry,componentParts:geometry.landingFrame??[]});
  let checked=0;
  for(const slab of host.slabs){
    if(!slab.bounds)continue;
    const z=(slab.bounds.min[2]+slab.bounds.max[2])/2;
    const localZ=z-Number(bim.originZ??0);
    const segments=sectionSegments(triangles,localZ);
    const samples=segments.flatMap(([a,b])=>[a,b,
      [a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],
      [(a[0]+b[0])/2,(a[1]+b[1])/2],
      [a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]])
      .map(transform).filter(p=>p[0]>=slab.bounds.min[0]-EPS&&p[0]<=slab.bounds.max[0]+EPS&&
        p[1]>=slab.bounds.min[1]-EPS&&p[1]<=slab.bounds.max[1]+EPS);
    if(!samples.length)continue;
    checked++;
    const openings=host.voids.filter(r=>r.slabId===slab.id)
      .map(r=>host.openings.find(o=>o.id===r.openingId)).filter(Boolean);
    if(!openings.length)return {status:'outside',message:`De trap snijdt vloer ${slab.name||slab.id}; er is geen gekoppelde sparing.`};
    const loops=openings.map(opening=>opening.triangles?.length?sectionLoops(opening.triangles,z):[]);
    if(loops.some(item=>!item.length))return {status:'unknown',message:`De sparing in vloer ${slab.name||slab.id} heeft geen leesbare doorsnede.`};
    if(samples.some(p=>!loops.some(rings=>pointInLoops(p,rings))))
      return {status:'outside',message:`De trapdoorsnede steekt buiten de sparing in vloer ${slab.name||slab.id}. Controleer de plaatsing en de vloerhoogte.`,slabId:slab.id};
  }
  return checked?{status:'precheck',message:`De trapdoorsnede past op ${checked} vloerpeil(en) binnen de ingelezen sparingscontour. Vrije hoogte en bevestiging moeten nog worden getoetst.`}:
    {status:'unknown',message:'De trap snijdt geen ingelezen vloerpeil; controleer de projectplaatsing.'};
}
