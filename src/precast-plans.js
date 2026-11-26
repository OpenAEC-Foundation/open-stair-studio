import { precastDetailFields } from './components/precast-detail.js';

const lift='Hijsen';
const num = (group,key,label,value,min,max,unit) => ({group,key,label,default:value,min,max,unit,type:'number',step:'any'});
const choice = (group,key,label,value,options) => ({group,key,label,default:value,type:'select',options});
const reference = (group,key,label) => ({group,key,label,type:'text',default:'',maxLength:160});
export const liftingInputFields = [
  choice(lift,'liftLayout','Positie hijsstations','auto',[['auto','Automatisch tussen de staven'],['fixed','Vaste lokale X- en Y-maten']]),
  num(lift,'liftStationAX','X eerste hijsstation',400,-500,25000,'mm'),
  num(lift,'liftStationBX','X tweede hijsstation',1100,-500,25000,'mm'),
  num(lift,'liftStationY','Y eerste rij vanaf lokale zijrand',240,1,4000,'mm'),
  choice(lift,'liftingAssembly','Toestand tijdens hijsen', 'unconfirmed', [['unconfirmed','Massa en opbouw nog te bevestigen'],['bare','Kaal prefab, bulkdichtheid inclusief instortstaal'],['assembled','Met aangebouwde delen of tijdelijke uitrusting']]),
  choice(lift,'stationResultants','Krachtinleiding per hijsstation', 'unconfirmed', [['unconfirmed','Nog te bevestigen in het hijsplan'],['vertical','Verticale stationresultanten via hijsframe'],['inclined','Schuine stationresultanten of directe haak']]),
  choice(lift,'rigging','Lastverdeling', 'two', [['two','Twee effectief dragende strengen'],['equalised','Vierpunten met vereffening per richting']]),
  num(lift,'slingAngle','Grootste strenghoek uit verticaal',30,0,75,'°'),
  num(lift,'hoistFactor','Dynamische hijsfactor transport',1.3,1,5,'–'),
  choice(lift,'stripping','Ontkistwijze', 'unknown', [['unknown','Nog vast te stellen'],['released','Volledig vrijgezet vóór hijsen'],['soffit','Onderzijde op mal, zijkisten verwijderd']]),
  num(lift,'adhesionPressure','Malhechting op onderzijde',0,0,100,'kN/m²'),
  num(lift,'liftingWLL','Toelaatbare last per hijspunt bij deze hoek',0,0,2000,'kN'),
  num(lift,'liftingStrength','Aangetoonde kubusdruksterkte bij hijsen',0,0,150,'MPa'),
  num(lift,'requiredLiftingStrength','Vereiste kubusdruksterkte voor deze WLL',0,0,150,'MPa'),
  num(lift,'earlyCylinderStrength','Cilinderrekenbasis fck bij hijsen',0,0,50,'MPa'),
  num(lift,'handlingFactor','UGT-lastfactor voor buiging bij hijsen',1.35,1,3,'–'),
  reference(lift,'liftingReference','Referentie hijsanker, koppeling en productblad'),
  reference(lift,'riggingReference','Referentie hijsplan en aangetoonde lastverdeling'),
  num(lift,'liftBarArea','Vereiste bijlegdoorsnede per huls volgens productdetail',0,0,15000,'mm²'),
  num(lift,'liftBarTail','Vereiste rechte staartlengte bij hijshuls',0,0,3000,'mm'),
  choice(lift,'liftBarTransfer','Krachtinleiding bijlegstaaf volgens hulsdetail','unconfirmed',[
    ['unconfirmed','Krachtinleiding nog te toetsen'],['separate','Detail met vrijliggende haarspeld geverifieerd'],['contact','Direct staalcontact met hulsvoet vereist']]),
  reference(lift,'liftBarReference','Detailreferentie bijlegwapening hijshuls voor deze trekrichting')
];

const liftGeometryKeys=new Set(['liftDiameter','liftEmbed','liftInset']);
export const liftPlanFields=[...precastDetailFields.filter(f=>liftGeometryKeys.has(f.key)),...liftingInputFields];
const fieldsByKey=new Map(liftPlanFields.map(f=>[f.key,f]));
const elementIds=new Set(['vlucht-1','vlucht-2','onderbordes','tussenbordes','bovenbordes']);
const record=x=>x!=null&&typeof x==='object'&&!Array.isArray(x);

function valueFor(key,value) {
  const f=fieldsByKey.get(key);
  if(!f) throw new Error('Onbekend hijsplangegeven: '+key+'.');
  if(f.type==='select' && f.options.some(([id])=>id===value)) return value;
  if(f.type==='text' && typeof value==='string' && value.length<=f.maxLength && !/[\u0000-\u001f]/u.test(value)) return value.trim();
  if(f.type==='number' && Number.isFinite(value) && value>=f.min && value<=f.max && (f.step!==1||Number.isInteger(value))) return value;
  throw new Error('Controleer de invoer voor '+f.label+'.');
}

// Only explicit differences are serialized. Retain a temporarily absent cast's
// overrides when the stair switches from return to straight or loses its base landing.
export function readLiftPlans(raw) {
  if(raw===undefined) return {};
  if(!record(raw)) throw new Error('Ongeldige hijsplannen van prefabelementen.');
  const plans={};
  for(const [id,source] of Object.entries(raw)) {
    if(!elementIds.has(id)||!record(source)) throw new Error('Onbekend prefabelement of ongeldig hijsplan: '+id+'.');
    const fields=Object.entries(source).map(([key,value])=>[key,valueFor(key,value)]);
    if(fields.length) plans[id]=Object.fromEntries(fields);
  }
  return plans;
}

export function effectiveLiftPlan(params,plans,id) {
  const source={...params,...plans?.[id]};
  return Object.fromEntries(liftPlanFields.map(f=>[f.key,source[f.key]??f.default]));
}

export function editLiftPlanFields(plans,id,changes) {
  if(!elementIds.has(id)) throw new Error('Onbekend prefabelement: '+id+'.');
  const next={...plans},override={...next[id]};
  if(changes==null) {delete next[id];return next;}
  for(const [key,value] of Object.entries(changes)) {
    if(!fieldsByKey.has(key)) throw new Error('Onbekend hijsplangegeven: '+key+'.');
    if(value==null) delete override[key];
    else override[key]=valueFor(key,value);
  }
  if(Object.keys(override).length) next[id]=override;
  else delete next[id];
  return next;
}

export function editLiftPlan(plans,id,key,value) {
  return editLiftPlanFields(plans,id,key==null?null:{[key]:value});
}

export function drawnLiftStations(points) {
  if(points?.length!==4) return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {liftStationAX:Math.min(...xs),liftStationBX:Math.max(...xs),liftStationY:Math.min(...ys)};
}

export function fixedLiftLayout(stations,overrides) {
  const changes={liftLayout:'fixed'};
  for(const [key,value] of Object.entries(stations??{})) {
    if(!Object.hasOwn(overrides,key)) changes[key]=value;
  }
  return changes;
}
