const group='Bijlegwapening · rekenbasis';
const num=(key,label,max,unit)=>({key,label,group,type:'number',unit,min:0,max,step:'any',default:0});
const ref=(key,label)=>({key,label,group,type:'text',default:'',maxLength:160});
const pathField=(key,label)=>({key,label,group,type:'select',default:'unconfirmed',options:[
  ['unconfirmed','Nog te toetsen'],['verified','Geverifieerd in projectdetail']]});
export const localDesignFields=[
  num('bearingTieLever','Inwendige hefboomsarm trekband oplegnok of sponning',500,'mm'),
  num('bearingTieHorizontal','Horizontale ontwerptrek per oplegzone',1000,'kN'),
  num('bearingBarArea','Voorgeschreven minimum bijlegdoorsnede per oplegzone',15000,'mm²'),
  num('bearingBarTail','Vereiste rechte verankeringsstaart per oplegzone',3000,'mm'),
  ref('bearingBarReference','Detailreferentie trekband en verankering oplegzone'),
  pathField('bearingBarPath','Lokaal krachtenpad, drukknoop en ophanging'),
  num('anchorBarArea','Vereiste bijlegdoorsnede per kopbout volgens detail',15000,'mm²'),
  num('anchorBarTail','Vereiste rechte staartlengte bij kopbout',3000,'mm'),
  ref('anchorBarReference','Detailreferentie bijlegwapening en breukvlak kopbout'),
  {key:'anchorBarPath',label:'Krachtinleiding kopbout naar haarspeld',group,type:'select',default:'unconfirmed',options:[
    ['unconfirmed','Ligging en overdracht nog te toetsen'],['verified','Overdracht via beton en verankering over breukvlak geverifieerd'],
    ['contact','Mechanische koppeling aan boutkop vereist']]}
];

const finitePositive=n=>Number.isFinite(n)&&n>0;
const documented=s=>typeof s==='string'&&s.trim()!=='';
function comparison(id,label,demand,capacity,unit,note,evidence) {
  const known=finitePositive(demand)&&Number.isFinite(capacity)&&capacity>=0;
  const status=known&&demand>capacity+1e-8?'fail':known&&evidence?'pass':'open';
  return {id,label,status,demand:finitePositive(demand)?demand:null,capacity,unit,note};
}
const outcome=checks=>checks.some(c=>c.status==='fail')?'fail':checks.every(c=>c.status==='pass')?'pass':'open';

// At the re-entrant shoulder, credit two horizontal straight legs of each hairpin.
// An upper limit on z is the distance from its actual tensile axis to the outer
// compression face. The centre of the compressive resultant lies inside that face.
function upperLever(z,c,p,parts) {
  const flight=c.kind==='flight',head=z.targetId.endsWith('bovenstrip');
  const x=flight?(head?c.detail.supportX[1]-(p.tongue+p.joint)/2:0):p.tongue+p.joint;
  const face=flight?(head?c.detail.count*c.detail.rise:0):-p.landingThickness;
  let limit=Infinity;
  for(const id of z.barIds) {
    const bar=parts.find(item=>item.id===id);
    const legs=bar?.bendSchedule?.filter(s=>s.type==='line' &&
      Math.min(s.start.x,s.end.x)<=x && x<=Math.max(s.start.x,s.end.x) &&
      Math.abs(s.start.z-s.end.z)<.001 && Math.abs(s.start.y-s.end.y)<.001 && Math.abs(s.start.x-s.end.x)>1);
    if(legs?.length!==2) return null;
    for(const leg of legs) limit=Math.min(limit,flight?face-leg.start.z:leg.start.z-face);
  }
  return finitePositive(limit)?limit:null;
}

function designBasis(z,c,p,flights,liftStations,parts) {
  const fyd=p.barYield/p.reinforcementFactor;
  if(z.kind==='bearing') {
    const match=/^vlucht-([12])-(onder|boven)strip$/.exec(z.targetId);
    const reaction=match?flights[Number(match[1])-1]?.[match[2]==='onder'?'left':'right']:null;
    const maxLeverMm=upperLever(z,c,p,parts);
    const validArm=finitePositive(p.bearingTieLever)&&p.bearingTieLever<maxLeverMm;
    const arm=(p.tongue+p.joint)/2;
    const tie=validArm&&finitePositive(reaction)?reaction*arm/p.bearingTieLever+p.bearingTieHorizontal:null;
    return {forceKN:tie,reactionKN:reaction,leverMm:p.bearingTieLever,maxLeverMm,loadArmMm:arm,requiredTailMm:p.bearingBarTail,
      requiredAreaMm2:Math.max(tie?1000*tie/fyd:0,p.bearingBarArea),reference:p.bearingBarReference,
      evidence:finitePositive(tie)&&documented(p.bearingBarReference),path:p.bearingBarPath==='verified',
      note:'Horizontale trekband uit de steunreactie maal afstand tot de inspringende hoek gedeeld door de onderbouwde hefboomsarm, plus horizontale ontwerptrek. Verifieer drukschoor, knoop, splijten en verticale ophangwapening apart.'+
        (!validArm?' De ingevoerde hefboomsarm moet kleiner zijn dan de afstand van beide horizontale, getekende trekstaven tot de uiterste drukrand op de schouderdoorsnede.':'')};
  }
  if(z.kind==='lifting') {
    const station=liftStations.find(s=>s.id===z.targetId);
    const loads=[station?.freeKN,station?.stripKN].filter(Number.isFinite);
    const forceKN=loads.length?Math.max(...loads):null;
    return {forceKN,requiredAreaMm2:p.liftBarArea,requiredTailMm:p.liftBarTail,reference:p.liftBarReference,
      evidence:finitePositive(forceKN)&&Number.isFinite(station?.stripKN)&&documented(p.liftBarReference)&&documented(p.liftingReference)&&documented(p.riggingReference),
      path:p.liftBarTransfer==='separate'&&finitePositive(p.requiredLiftingStrength)&&p.liftingStrength>=p.requiredLiftingStrength,
      note:'De strengkracht beschrijft de belasting op deze huls. Voor de krachtinleiding zijn een geverifieerd productdetail voor de werkelijke trekrichting en een aangetoonde hijssterkte vereist.'+
        (p.liftBarTransfer==='contact'?' Het vereiste rechtstreekse contact met de hulsvoet is voor de vrijliggende haarspeld niet aangetoond.':'')};
  }
  return {forceKN:p.connectionTension,requiredAreaMm2:Math.max(p.anchorBarArea,p.connectionTension*1000/fyd),requiredTailMm:p.anchorBarTail,
    reference:p.anchorBarReference,path:p.anchorBarPath==='verified',evidence:documented(p.anchorBarReference)&&documented(p.connectionReference)&&
      (p.connectionTension>0||p.connectionShear>0)&&(!p.connectionShear||p.anchorBarArea>0),
    note:'Minimum uit het ingevoerde detail en de benodigde staaldoorsnede voor axiale ontwerptrek op één bout. Bij afschuiving is de projectspecifieke bijlegeis nodig. De vrije U vereist aangetoonde overdracht via beton en verankering aan beide zijden van het breukvlak.'+
      (p.anchorBarPath==='contact'?' De vereiste mechanische koppeling aan de kopbout is in dit detail niet aangetoond.':'')};
}

export function checkLocalSteel(c,p,flights,liftStations,parts=[]) {
  if(p.localReinforcement!=='detailed') return [];
  return (c.detail.localZones??[]).map(z=>{
    const b=designBasis(z,c,p,flights,liftStations,parts);
    const present=z.barIds?.length===z.requestedCount&&z.requestedCount>0&&!z.issue;
    const ref=b.reference;
    const area=comparison('area','Bijlegdoorsnede',b.requiredAreaMm2,z.providedAreaMm2??0,'mm²',b.note,present&&b.evidence);
    const length=comparison('tail','Verankeringsstaart',b.requiredTailMm,z.anchorageMm??0,'mm',
      'Minimale rechte staart aan weerszijden van de bocht. De detailreferentie moet dezelfde meetbasis, ligging van het bezwijkvlak en hechtcondities onderbouwen.',present&&b.evidence);
    const loadPath={id:'loadPath',label:'Krachtinleiding en verankering',unit:'',demand:null,capacity:null,
      status:present&&b.path&&b.evidence?'pass':'open',note:b.note};
    const checks=[area,length,loadPath];
    return {...b,targetId:z.targetId,kind:z.kind,label:z.label,barIds:z.barIds??[],providedAreaMm2:area.capacity,
      availableTailMm:length.capacity,reference:ref,status:present?outcome(checks):'fail',checks,
      note:z.issue||b.note};
  });
}
