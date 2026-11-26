import { concrete } from './components/concrete.js';
import { steelStair, escapeStair } from './components/steel-stair.js';
import { glassStair, cantileverStair } from './components/glass-stair.js';
import { portableStair, ladder } from './components/access-stairs.js';
import { checkEscapeCapacity } from './escape-capacity.js';
import { spiral } from './components/spiral.js';
import { loft } from './components/loft.js';
import { boundsOf, box } from './components/solids.js';
import { motionWarnings } from './stairwell-sweep.js';
import { readLiftPlans } from './precast-plans.js';

export const componentTypes = [glassStair,cantileverStair,steelStair,escapeStair,portableStair,ladder,concrete,spiral,loft];
export const typeOf = id => componentTypes.find(type => type.id === id);
export const emptyWell = { uid:null, width:3400, length:5600, storeyHeight:2880, slabThickness:200, heights:{}, instances:[] };
export const heightOn = (well,level) => well.heights?.[level] ?? well.storeyHeight;
export function elevationOf(well,level) {
  let elevation=0;
  for(let i=0;i<level;i++) elevation+=heightOn(well,i);
  return elevation;
}
export const kindNames = {tread:'Trede',landing:'Bordes',column:'Kolom',railing:'Leuningwerk',member:'Staaf',rebar:'Wapeningsstaaf',plate:'Plaat',fastener:'Bevestiging',flight:'Trapvlucht',hatch:'Luik',frame:'Kader'};
export const materialNames = {glass:'Glas',ceramic:'Keramische zeefdruk',interlayer:'Lamineerfolie',aluminium:'Aluminium',timber:'Hout',steel:'Staal',rebar:'Betonstaal',concrete:'Beton',galvanized:'Verzinkt staal',rubber:'Elastomeer'};
export const wellFields = [
  {key:'width',label:'Schachtbreedte Y',unit:'mm',min:400,max:30000},
  {key:'length',label:'Schachtlengte X',unit:'mm',min:400,max:30000},
  {key:'storeyHeight',label:'Hoogte per bouwlaag',unit:'mm',min:500,max:10000},
  {key:'slabThickness',label:'Vloerdikte',unit:'mm',min:50,max:1200}
];
export const placementFields = [
  {key:'storey',label:'Vertrekbouwlaag',unit:'',min:0,max:39,step:1},
  {key:'x',label:'Positie X',unit:'mm',min:-50000,max:50000},
  {key:'y',label:'Positie Y',unit:'mm',min:-50000,max:50000},
  {key:'rotation',label:'Draaiing om Z',unit:'°',min:-360,max:360}
];

function validated(field, value) {
  if (field.type === 'select') {
    if (field.options.some(([id]) => id === value)) return value;
  } else if (field.type === 'text') {
    if (typeof value === 'string' && value.length <= (field.maxLength ?? 160) && !/[\u0000-\u001f]/u.test(value)) return value.trim();
  } else if (Number.isFinite(value) && value >= (field.min ?? -Infinity) && value <= (field.max ?? Infinity) &&
    (field.step !== 1 || Number.isInteger(value))) return value;
  throw new Error(`Controleer de invoer voor ${field.label}.`);
}

function fromFields(fields, object) {
  return Object.fromEntries(fields.map(f => [f.key, validated(f, object[f.key] === undefined ? f.default : object[f.key])]));
}

export function readWell(raw) {
  if (!raw || !Array.isArray(raw.instances) || raw.instances.length > 80) throw new Error('Ongeldig trappenhuis of te veel componenten.');
  const well = fromFields(wellFields, {...emptyWell,...raw});
  if (raw.uid != null && (typeof raw.uid !== 'string' || !/^[\w-]{1,64}$/.test(raw.uid))) throw new Error('Ongeldige identificatie van het trappenhuis.');
  well.uid = raw.uid ?? null;
  if (well.slabThickness >= well.storeyHeight) throw new Error('De vloerdikte moet kleiner zijn dan de verdiepingshoogte.');
  const heights=raw.heights??{};
  if (typeof heights!=='object'||Array.isArray(heights)) throw new Error('Ongeldige bouwlaaghoogten.');
  well.heights={};
  for (const [level,value] of Object.entries(heights)) {
    if (!/^(0|[1-9]\d?)$/.test(level) || Number(level)>39 || value<=well.slabThickness) throw new Error('Ongeldige bouwlaag of hoogteverschil.');
    well.heights[level]=validated(wellFields.find(f=>f.key==='storeyHeight'),value);
  }
  const ids = new Set();
  const marks = new Set();
  well.instances = raw.instances.map(item => {
    const def = typeOf(item?.type);
    if (!def || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || typeof item.mark !== 'string' || !item.mark.trim() || !item.params) throw new Error('Onvolledig of dubbel trappenhuiscomponent.');
    ids.add(item.id);
    const mark=item.mark.trim().toLocaleUpperCase('nl-NL');
    if(marks.has(mark)) throw new Error('Elk trappenhuiscomponent heeft een eigen merk nodig: '+item.mark.trim()+'.');
    marks.add(mark);
    const instance={id:item.id, type:def.id, mark:item.mark.trim(), ...fromFields(placementFields,item), params:fromFields(def.fields,item.params)};
    if (item.liftPlans!==undefined) {
      if(def.id!=='concrete') throw new Error('Elementhijsplannen horen bij een prefab betontrap.');
      const plans=readLiftPlans(item.liftPlans);
      if(Object.keys(plans).length) instance.liftPlans=plans;
    }
    if(item.connectionGround!==undefined)instance.connectionGround=readConnectionGround(item.connectionGround);
    return instance;
  });
  return well;
}

export function newInstance(type, well, storey = 0, previous) {
  const def = typeOf(type);
  const params = previous ? {...previous.params} : Object.fromEntries(def.fields.map(f => [f.key, f.default]));
  if (!previous && ['glass','cantilever','portable'].includes(type)) params.guard='none';
  if (!previous && type==='steel') params.railSide='none';
  if (!previous && type==='spiral') params.guard='none';
  if (!previous && type==='concrete') params.guards='none';
  if (!previous && type==='loft') params.grip='none';
  if (type==='loft' && !previous) params.slabThickness = Math.max(60,Math.min(500,well.slabThickness));
  const liftPlans=previous?.liftPlans ? structuredClone(previous.liftPlans) : undefined;
  const connectionGround=previous?.connectionGround ? structuredClone(previous.connectionGround) : undefined;
  const bounds = boundsOf(def.build({...params,liftPlans,height:heightOn(well,storey)}).parts);
  const stem = {concrete:'BT',spiral:'SP',loft:'VZ',glass:'GL',cantilever:'BL',steel:'ST',escape:'VT',portable:'LP',ladder:'LD'}[type];
  let n=1;
  const mark = n => stem+'-'+String(n).padStart(2,'0');
  while (well.instances.some(i => i.mark.toLocaleUpperCase('nl-NL') === mark(n))) n++;
  const item={id:crypto.randomUUID(),mark:mark(n),type,storey,
    x:previous?.x ?? (bounds ? Math.round((well.length-bounds.xmax-bounds.xmin)/2) : 0),
    y:previous?.y ?? (bounds ? Math.round((well.width-bounds.ymax-bounds.ymin)/2) : 0),
    rotation:previous?.rotation ?? 0,params,...(liftPlans?{liftPlans}:{}),...(connectionGround?{connectionGround}:{})};
  if (!previous && bounds) {
    const occupied=well.instances.filter(i=>i.storey===storey).map(i=>cachedAssembly(i,well).bounds).filter(Boolean);
    const xs=[item.x, -bounds.xmin, well.length-bounds.xmax, ...occupied.flatMap(b=>[b.xmax+100-bounds.xmin,b.xmin-100-bounds.xmax])];
    const ys=[item.y, -bounds.ymin, well.width-bounds.ymax, ...occupied.flatMap(b=>[b.ymax+100-bounds.ymin,b.ymin-100-bounds.ymax])];
    for(const x of xs) for(const y of ys) {
      const x0=x+bounds.xmin,x1=x+bounds.xmax,y0=y+bounds.ymin,y1=y+bounds.ymax;
      if(x0>=-.001 && y0>=-.001 && x1<=well.length+.001 && y1<=well.width+.001 &&
        !occupied.some(b=>x0<b.xmax && x1>b.xmin && y0<b.ymax && y1>b.ymin)) return {...item,x,y};
    }
  }
  return item;
}

export function pointTransform(instance, well) {
  const angle = instance.rotation*Math.PI/180, c = Math.cos(angle), s = Math.sin(angle);
  const datum=elevationOf(well,instance.storey);
  return ({x,y,z}) => ({x:instance.x+c*x-s*y, y:instance.y+s*x+c*y, z:z+datum});
}

export function assembleComponent(instance, well) {
  const local = typeOf(instance.type).build({...instance.params,liftPlans:instance.liftPlans,height:heightOn(well,instance.storey)});
  const toWorld = pointTransform(instance,well);
  const parts = local.parts.map(p => ({...p,instanceId:instance.id,faces:p.faces.map(f => f.map(toWorld))}));
  const bounds = boundsOf(parts);
  const issues = [...local.issues];
  if (instance.type==='loft' && instance.params.slabThickness !== well.slabThickness)
    issues.push({level:'warning',text:'Het lokale vloerpakket bij de luikkast wijkt af van de referentievloer van het trappenhuis. Controleer de aansluiting op het plafond.'});
  if (bounds && (bounds.xmin < -0.01 || bounds.ymin < -0.01 || bounds.xmax > well.length+.01 || bounds.ymax > well.width+.01))
    issues.push({level:'warning',text:'De omhullende ligt buiten de vrije schacht. Controleer de aansluiting van luikkast, bordes en leuning op de vloer.'});
  let escape;
  if(instance.type==='escape'){
    const p=instance.params;
    const clear=local.metrics.find(m=>m.label==='Vrije doorgangsbreedte tussen hekwerk of wangen')?.value;
    escape=checkEscapeCapacity({use:'escape-only',escapeFunction:p.escapeFunction,escapePersons:p.escapePersons||null,escapeBasis:p.escapeBasis,
      escapeWidth:p.escapeWidth||null,escapeSection:'stair'}, {regulatory:{profile:'NL_NEW_EGRESS',construction:'new'},
      stair:{width:clear??0,stringerThickness:0,going:p.going,floorHeight:heightOn(well,instance.storey)}},
      {dimensions:{family:{winder:false}},treads:parts.filter(p=>p.kind==='tread')});
  }
  return {instance, parts, bounds, escape, structural:applyConnectionGround(local.structural,instance.connectionGround,local.parts), metrics:local.metrics, issues, sweepZone:local.sweepZone, precast:local.precast,
    guides:(local.guides??[]).map(g => ({...g,points:g.points.map(toWorld)}))};
}

const geometryCache=new WeakMap();
function cachedAssembly(instance,well) {
  const key=[heightOn(well,instance.storey),elevationOf(well,instance.storey),well.length,well.width,well.slabThickness].join('/');
  const cached=geometryCache.get(instance);
  if(cached?.key===key) return cached.value;
  const value=assembleComponent(instance,well);
  value.partBounds=value.parts.map(part=>boundsOf([part]));
  geometryCache.set(instance,{key,value});
  return value;
}
const intersects = (a,b) => a && b && a.xmax>b.xmin+.01 && b.xmax>a.xmin+.01 && a.ymax>b.ymin+.01 && b.ymax>a.ymin+.01 && a.zmax>b.zmin+.01 && b.zmax>a.zmin+.01;

export function assembleWell(well) {
  const result=well.instances.map(i=>{const a=cachedAssembly(i,well);return {...a,issues:[...a.issues]};});
  for (let i=0;i<result.length;i++) for (let j=i+1;j<result.length;j++) {
    const a=result[i], b=result[j];
    if(!intersects(a.bounds,b.bounds)) continue;
    let overlap;
    for(let k=0;k<a.parts.length && !overlap;k++) {
      const match=b.partBounds.findIndex(bounds=>intersects(a.partBounds[k],bounds));
      if(match>=0) overlap=[a.parts[k].label,b.parts[match].label];
    }
    if(overlap) {
      const text=`Onderdeelomhullenden overlappen bij ${a.instance.mark} (${overlap[0]}) en ${b.instance.mark} (${overlap[1]}). Controleer de aansluiting of verplaats het component.`;
      a.issues.push({level:'warning',text}); b.issues.push({level:'warning',text});
    }
  }
  motionWarnings(result,well);
  return result;
}

export function floorParts(well, levels) {
  const parts=[], w=well.length, h=well.width, rim=240;
  for (const level of [...new Set(levels)].sort((a,b)=>a-b)) {
    const top=elevationOf(well,level);
    const strips = [[-rim,-rim,w+rim,0],[-rim,h,w+rim,h+rim],[-rim,0,0,h],[w,0,w+rim,h]];
    strips.forEach(([x,y,x1,y1],i) => parts.push({id:`vloer-${level}-${i}`,label:'Referentievloer',kind:'plate',material:'context',
      faces:box(x,y,top-well.slabThickness,x1,y1,top)}));
  }
  return parts;
}

export function levelsFor(instances) {
  return [...new Set(instances.flatMap(i => [i.storey,i.storey+1]))].sort((a,b)=>a-b);
}
import {applyConnectionGround,readConnectionGround} from './connection-ground.js';
