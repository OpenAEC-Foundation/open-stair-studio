import { effectiveLiftPlan, liftingInputFields, readLiftPlans } from './precast-plans.js';
import { localDesignFields, checkLocalSteel } from './precast-local-checks.js';
// Local dimensions in mm, forces in kN, moments in kNm and stresses in N/mm².
const gravity = 9.81;
const num = (group,key,label,value,min,max,unit) => ({group,key,label,default:value,min,max,unit,type:'number',step:'any'});
const reference = (group,key,label) => ({group,key,label,type:'text',default:'',maxLength:160});
const loads='Belastingen', steel='Betondoorsnede', bearing='Oplegging en verankering';
export const precastEngineeringFields = [
  num(loads,'finishLoad','Afwerking en extra blijvende last',1,0,50,'kN/m²'),
  num(loads,'useLoad','Verdeelde gebruiksbelasting',3,0,100,'kN/m²'),
  num(loads,'pointLoad','Alternatieve puntlast',2,0,200,'kN'),
  num(loads,'permanentFactor','UGT-factor blijvend',1.35,1,3,'–'),
  num(loads,'variableFactor','UGT-factor veranderlijk',1.5,1,3,'–'),
  num(steel,'concreteStrength','Cilindersterkte fck',30,12,50,'MPa'),
  num(steel,'barYield','Karakteristieke vloeigrens fyk',500,250,600,'MPa'),
  num(steel,'concreteFactor','Materiaalfactor beton γc',1.5,1,3,'–'),
  num(steel,'reinforcementFactor','Materiaalfactor staal γs',1.15,1,3,'–'),
  num(steel,'compressionCoefficient','Druksterktefactor αcc',0.85,0.5,1,'–'),
  num(bearing,'padResistance','Ontwerpdruk oplegstrip vlucht',0,0,100,'MPa'),
  num(bearing,'landingLineResistance','Ontwerpweerstand per zijoplegging bordes',0,0,5000,'kN'),
  num(bearing,'connectionTension','Maatgevende trek per verbinding NEd',0,0,2000,'kN'),
  num(bearing,'connectionShear','Maatgevende afschuiving per verbinding VEd',0,0,2000,'kN'),
  num(bearing,'connectionNRd','Trekweerstand per verbinding NRd',0,0,5000,'kN'),
  num(bearing,'connectionVRd','Afschuifweerstand per verbinding VRd',0,0,5000,'kN'),
  num(bearing,'requiredEmbed','Vereiste inbedding volgens detail',0,0,1500,'mm'),
  reference(bearing,'connectionReference','Referentie berekening en productspecificatie oplegging/verbinding'),
  ...liftingInputFields,
  ...localDesignFields
];
const defaults=Object.fromEntries(precastEngineeringFields.map(f=>[f.key,f.default]));
const positive=x=>Number.isFinite(x)&&x>0;
const hasText=x=>typeof x==='string'&&x.trim().length>0;
const metric=(label,value,unit)=>({label,value,unit});
const overall=items=>items.some(c=>c.status==='fail')?'fail':items.length&&items.every(c=>c.status==='pass')?'pass':'open';
function check(id,label,demand,capacity,unit,note,applicable=true,flagExcess=false) {
  const numbers=Number.isFinite(demand)&&demand>=0&&positive(capacity);
  const exceeds=numbers&&demand>capacity*(1+1e-10);
  return {id,label,demand:Number.isFinite(demand)?demand:null,capacity:positive(capacity)?capacity:null,
    unit,note,status:exceeds&&(applicable||flagExcess)?'fail':applicable&&numbers?'pass':'open'};
}

// Simple vertical reactions and exact positive-moment envelope for piecewise uniform loads.
// Replacing self-weight by its full resultant at the centroid bounds the sagging moment
// from above because the influence line for a section is concave in the load position.
function beam(span, strips, points, movable=0) {
  const total=strips.reduce((s,l)=>s+l.total,0)+points.reduce((s,l)=>s+l.total,0);
  const right=(strips.reduce((s,l)=>s+l.total*(l.start+l.end)/2,0)+points.reduce((s,l)=>s+l.total*l.x,0))/span;
  const left=total-right;
  const boundaries=[...new Set([0,span,...strips.flatMap(l=>[l.start,l.end]),...points.map(l=>l.x)])].sort((a,b)=>a-b);
  function value(x) {
    let moment=left*x+movable*x*(span-x)/span;
    for (const l of strips) {
      const to=Math.max(l.start,Math.min(l.end,x));
      moment-=l.total*(to-l.start)/(l.end-l.start)*(x-(l.start+to)/2);
    }
    for (const l of points) moment-=l.total*Math.max(0,x-l.x);
    return moment;
  }
  let max=0;
  for(let i=1;i<boundaries.length;i++) {
    const a=boundaries[i-1],b=boundaries[i],mid=(a+b)/2;
    const slope=left+movable*(1-2*mid/span)
      -strips.reduce((s,l)=>s+l.total*Math.max(0,Math.min(1,(mid-l.start)/(l.end-l.start))),0)
      -points.reduce((s,l)=>s+(mid>l.x?l.total:0),0);
    const curvature=2*movable/span+strips.reduce((s,l)=>s+(mid>l.start&&mid<l.end?l.total/(l.end-l.start):0),0);
    const peak=curvature>0?Math.min(b,Math.max(a,mid+slope/curvature)):mid;
    max=Math.max(max,value(a),value(b),value(peak));
  }
  return {left:left+movable,right:right+movable,moment:max};
}

function flightForces(c,p) {
  const d=c.detail, span=d.span/1000;
  const g=c.massKg*gravity/1000, s=d.supportX;
  if (!(positive(span)&&s?.length===2&&positive(s[1]-s[0])&&d.centroid.x>=s[0]&&d.centroid.x<=s[1])) return null;
  const gp=[{x:(d.centroid.x-s[0])/1000,total:p.permanentFactor*g}];
  const area=span*d.width/1000;
  const gd={start:0,end:span,total:p.permanentFactor*p.finishLoad*area};
  const qd={start:0,end:span,total:p.variableFactor*p.useLoad*area};
  const distributed=beam(span,[gd,qd],gp), concentrated=beam(span,[gd],gp,p.variableFactor*p.pointLoad);
  const permanent=beam(span,[gd],gp);
  return {sectionWidth:d.width,span,area,moment:Math.max(distributed.moment,concentrated.moment),
    reaction:Math.max(distributed.left,distributed.right,concentrated.left,concentrated.right),
    left:Math.max(distributed.left,concentrated.left),right:Math.max(distributed.right,concentrated.right),
    dead:[permanent.left,permanent.right],live:qd.total/2};
}

// The landings span across the width. Each flight reaction reaches its own flight-width
// lane. The individual point-load case can act on the landing or enter via one flight.
function landingForces(c,p,flights) {
  const d=c.detail,span=d.span/1000,sectionWidth=d.length,area=span*sectionWidth/1000;
  const attached=c.id==='onderbordes'?[[0,0,0]]:c.id==='tussenbordes'?[[0,1,0],[1,0,p.width+p.well]]:
    [[p.layout==='return'?1:0,1,0]];
  if (!positive(span)||attached.some(([i,,offset])=>!flights[i]||offset+p.width>d.span+.1)) return null;
  const dead=[{start:0,end:span,total:p.permanentFactor*(c.massKg*gravity/1000+p.finishLoad*area)}];
  const live=[{start:0,end:span,total:p.variableFactor*p.useLoad*area}];
  for(const [idx,end,offset] of attached){
    const lane={start:offset/1000,end:(offset+p.width)/1000};
    dead.push({...lane,total:flights[idx].dead[end]});
    live.push({...lane,total:flights[idx].live});
  }
  const dist=beam(span,[...dead,...live],[]),pt=beam(span,dead,[],p.variableFactor*p.pointLoad);
  return {sectionWidth,span,area,moment:Math.max(dist.moment,pt.moment),reaction:Math.max(dist.left,dist.right,pt.left,pt.right),
    left:Math.max(dist.left,pt.left),right:Math.max(dist.right,pt.right)};
}

function momentCapacity(area,width,depth,fyd,fcd) {
  if (![area,width,depth,fyd,fcd].every(positive)) return null;
  const x=area*fyd/(0.8*width*fcd);
  if (x/depth>.45 || (depth-x)*.0035/x<fyd/200000) return null;
  return area*fyd*(depth-.4*x)/1e6;
}

function steelArea(c,p,parts,layer) {
  return parts.filter(bar=>bar.parentId===c.id&&bar.role==='mainBar'&&bar.layer===layer&&
    (c.kind==='flight'||bar.start.x-bar.diameterMm/2>=p.tongue+p.joint))
    .reduce((sum,bar)=>sum+Math.PI*bar.diameterMm**2/4,0);
}

function serviceChecks(c,p,f,parts,checks,metrics) {
  const d=c.detail, isFlight=c.kind==='flight';
  const width=f?.sectionWidth;
  // The full length of a landing includes the recessed bearing shelf. Only the
  // full-depth slab strip, plus its own main bars, is credited in the section.
  const strengthWidth=isFlight?width:p.landingDepth;
  const as=steelArea(c,p,parts,'bottom');
  const fyd=p.barYield/p.reinforcementFactor,fcd=p.compressionCoefficient*p.concreteStrength/p.concreteFactor;
  const section=Boolean(f)&&positive(as)&&positive(d.d)&&positive(strengthWidth)&&p.density>=2000&&p.density<=2600;
  const flex=section?momentCapacity(as,strengthWidth,d.d,fyd,fcd):null;
  const rho=Math.min(.02,as/(strengthWidth*d.d)), k=Math.min(2,1+Math.sqrt(200/d.d));
  const shear=section?Math.max((.18/p.concreteFactor)*k*Math.cbrt(100*rho*p.concreteStrength),.035*k**1.5*Math.sqrt(p.concreteStrength))*strengthWidth*d.d/1000:null;
  const fctm=.3*p.concreteStrength**(2/3);
  const minSteel=Math.max(.26*fctm/p.barYield,.0013)*strengthWidth*d.d;
  const geomOk=!d.geometryIssues?.length;
  checks.push(check('flexure','Positief veldmoment',f?.moment,flex,'kNm',flex?
    'Eénrichtingdoorsnede met getekend hoofdstaal in de onderlaag. De benutting van de volledige effectieve breedte bij een puntlast of opgelegde vlucht vereist aantoonbare dwarsverdeling. Controleer ook staafverankering en normaalkracht.':
    'Buiten het enkelgewapende rekenmodel of ontbrekende doorsnede. Controleer drukzone, vloeirek, geometrie en betonsoort.',geomOk));
  checks.push(check('shear','Dwarskracht plaat buiten de oplegzone',f?.reaction,shear,'kN',
    'Volledige verticale reactiekracht als bovengrens. Weerstand zonder dwarskrachtwapening veronderstelt voldoende verankerd langsstaal.',geomOk&&section));
  checks.push(check('minimumSteel','Minimum langsstaal, veld',minSteel,as,'mm²',
    'Minimum voor hoofdwapening van de eenrichtingdoorsnede. Voor het bordes tellen alleen staven in het volle plaatgedeelte.',geomOk&&section));
  if (f) metrics.push(metric('Rekenspanwijdte',f.span*1000,'mm'),metric('Reactie eerste steunlijn UGT',f.left,'kN'),metric('Reactie tweede steunlijn UGT',f.right,'kN'));
  if (section) metrics.push(metric('Effectieve hoogte hoofdstaal',d.d,'mm'),metric('Getekend effectief veldstaal',as,'mm²'));
  const padWidth=p.tongue-p.joint-2*p.setback;
  checks.push(isFlight?check('bearing','Gemiddelde ontwerpdruk op de oplegstrip',f&&f.reaction*1000/(padWidth*p.width),p.padResistance,'MPa',
    'Ontwerpdruk uit het opgegeven productdetail. Rotatie, tolerantie, lokale nok- en sponningwapening afzonderlijk verifiëren.',hasText(p.connectionReference)&&geomOk,geomOk):
    check('bearing','Verticale belasting per gebouwoplegging',f?.reaction,p.landingLineResistance,'kN',
      'Twee doorgaande zijopleggingen langs X op de bouwconstructie. De weerstand geldt per volledige steunlijn inclusief aansluitconstructie.',hasText(p.connectionReference)&&geomOk,geomOk));
  const doc=hasText(p.connectionReference)&&d.anchorPoints.length>0&&geomOk;
  const action=p.connectionTension>0||p.connectionShear>0;
  checks.push(check('embed','Inbedding van het verbindingsanker',p.requiredEmbed,p.anchorEmbed,'mm',
    'Benodigde inbedding uit de productspecificatie tegenover de gemodelleerde maat. Controleer ook aansluiting en randafstanden.',doc&&positive(p.requiredEmbed),geomOk));
  const resistances=(!p.connectionShear||positive(p.connectionVRd))&&(!p.connectionTension||positive(p.connectionNRd));
  const interaction=action&&resistances?(p.connectionTension?p.connectionTension/p.connectionNRd:0)+(p.connectionShear?p.connectionShear/p.connectionVRd:0):null;
  if(action) metrics.push(metric('Trek per maatgevende verbinding',p.connectionTension,'kN'),metric('Afschuiving per maatgevende verbinding',p.connectionShear,'kN'));
  checks.push(check('restraint','Gecombineerde trek en afschuiving',interaction,1,'–',
    'Lineaire interactie per maatgevende verbinding. Gebruik de voor element én tegenconstructie geldige weerstanden en verificatie van de voorgeschreven interactie. Geef beide ontwerpacties per anker op.',doc&&action&&resistances,geomOk));
}

// Area and projected centroid of faces that rest on a lower mould when the casting
// orientation equals its installation orientation and the side shutters are removed.
function mouldContact(d) {
  const outline=d.profile??[];
  const sign=Math.sign(outline.reduce((s,[x,z],i)=>{const n=outline[(i+1)%outline.length];return s+x*n[1]-n[0]*z;},0));
  let length=0,first=0;
  outline.forEach(([x,z],i)=>{
    const [next,top]=outline[(i+1)%outline.length];
    if((next-x)*sign<=.00001) return;
    const edge=Math.hypot(next-x,top-z);
    length+=edge;first+=edge*(x+next)/2;
  });
  return {area:length*d.width/1e6,x:first/length,y:d.width/2};
}

// Two lifting stations along local X, with two points at each. A transverse
// balance beam may split each station reaction only for the explicit equalised case.
export function liftingShares(points,centre,equalised) {
  if (points?.length!==4) return null;
  const sorted=[...points].sort((a,b)=>a.x-b.x);
  const rows=[sorted.slice(0,2),sorted.slice(2,4)].map(row=>row.sort((a,b)=>a.y-b.y));
  if(rows.some(([a,b])=>Math.abs(a.x-b.x)>.01||b.y-a.y<=.01)) return null;
  const [a,b]=rows.map(r=>r[0].x);
  if (b-a<=.01||centre.x<=a||centre.x>=b) return null;
  const t=(centre.x-a)/(b-a);
  const shares=new Map();
  for(const [i,[lo,hi]] of rows.entries()) {
    const v=(centre.y-lo.y)/(hi.y-lo.y);
    if(v<=0||v>=1) return null;
    const rowShare=i?t:1-t;
    shares.set(lo,rowShare*(equalised?1-v:1));
    shares.set(hi,rowShare*(equalised?v:1));
  }
  return points.map(pt=>shares.get(pt));
}

export function liftingShare(points,centre,equalised) {
  const shares=liftingShares(points,centre,equalised);
  return shares&&Math.max(...shares);
}

// Overhanging one-way strip at the two lifting stations. Integrate the actual
// piecewise-linear thickness of the mould between its vertices in millimetres.
// Landings have constant cross-section along Y. Opposite bending faces are checked.
export function handlingMoments(c,totalLoad) {
  const d=c.detail,flight=c.kind==='flight',ax=flight?'x':'y';
  const stations=[...new Set(d.liftPoints.map(pt=>pt[ax]))].sort((a,b)=>a-b);
  if (stations.length!==2 || !positive(stations[1]-stations[0])) return null;
  const [lo,hi]=stations, cg=d.centroid[ax];
  if(cg<=lo||cg>=hi) return null;
  const breaks=flight?d.profile.map(pt=>pt[0]):[0,d.width];
  const coords=[...new Set([...breaks,...stations])].sort((a,b)=>a-b);
  function depth(x) {
    if (!flight) return 1;
    const heights=[];
    d.profile.forEach(([a,z],i)=>{
      const [b,v]=d.profile[(i+1)%d.profile.length];
      if(x>Math.min(a,b)&&x<Math.max(a,b)) heights.push(z+(v-z)*(x-a)/(b-a));
    });
    heights.sort((a,b)=>a-b);
    let sum=0;
    for(let i=0;i+1<heights.length;i+=2) sum+=heights[i+1]-heights[i];
    return sum;
  }
  const intervals=[];
  let totalArea=0;
  for(let i=1;i<coords.length;i++) {
    const a=coords[i-1],length=coords[i]-a;
    const first=depth(a+length*.25),last=depth(a+length*.75);
    const w0=(3*first-last)/2,slope=2*(last-first)/length;
    intervals.push({a,length,w0,slope});totalArea+=(first+last)*length/2;
  }
  if(!positive(totalArea)) return null;
  const scale=totalLoad/totalArea,second=totalLoad*(cg-lo)/(hi-lo);
  let shear=0,moment=0,sagging=0,hogging=0;
  for(const {a,length,w0,slope} of intervals) {
    if(a===lo) shear+=totalLoad-second;
    if(a===hi) shear+=second;
    const force=t=>scale*(w0*t+slope*t*t/2);
    const bending=t=>moment+shear*t-scale*(w0*t*t/2+slope*t*t*t/6);
    const endMoment=bending(length);
    if(shear>0&&shear<force(length)) {
      let lower=0,upper=length;
      for(let n=0;n<45;n++){const m=(lower+upper)/2;if(force(m)>shear) upper=m;else lower=m;}
      sagging=Math.max(sagging,bending((lower+upper)/2));
    }
    sagging=Math.max(sagging,endMoment);hogging=Math.max(hogging,-endMoment);
    moment=endMoment;shear-=force(length);
  }
  return {sagging:sagging/1000,hogging:hogging/1000};
}

function transportChecks(c,p,parts,checks,metrics) {
  const d=c.detail,G=c.massKg*gravity/1000,angle=p.slingAngle*Math.PI/180;
  const shares=liftingShares(d.liftPoints,d.centroid,p.rigging==='equalised'),share=shares&&Math.max(...shares),contact=mouldContact(d);
  const vertical=p.slingAngle===0||p.stationResultants==='vertical';
  const correct=positive(share)&&!d.geometryIssues?.length&&p.liftingAssembly==='bare'&&vertical;
  const evidence=correct&&hasText(p.riggingReference)&&hasText(p.liftingReference)&&
    positive(p.liftingStrength)&&positive(p.requiredLiftingStrength)&&p.liftingStrength>=p.requiredLiftingStrength;
  const dynamic=correct?G*p.hoistFactor*share/Math.cos(angle):null;
  let adhesion=null, stripping=null, stripForces=null;
  if(p.stripping==='released'){
    adhesion=0;
    stripForces=correct?shares.map(v=>G*v/Math.cos(angle)):null;
  }
  if(p.stripping==='soffit'&&positive(p.adhesionPressure)&&positive(contact.area)&&correct){
    adhesion=p.adhesionPressure*contact.area;
    const weight=G+adhesion;
    const resultant={x:(G*d.centroid.x+adhesion*contact.x)/weight,y:(G*d.centroid.y+adhesion*contact.y)/weight};
    const sharesStrip=liftingShares(d.liftPoints,resultant,p.rigging==='equalised');
    if(sharesStrip) stripForces=sharesStrip.map(v=>weight*v/Math.cos(angle));
  }
  if(stripForces) stripping=Math.max(...stripForces);
  checks.push(check('hoistStrength','Betonsterkte op hijsmoment',p.requiredLiftingStrength,p.liftingStrength,'MPa',
    'Vereiste en aangetoonde kubusdruksterkte moeten dezelfde proefbasis en hijsfase betreffen.',positive(p.requiredLiftingStrength)&&hasText(p.liftingReference),positive(p.requiredLiftingStrength)));
  const assumptions=p.liftingAssembly!=='bare'?'Bevestig de massa van het kale prefab met ingestort staal. Met aangebouwde delen zijn het totale hijsgewicht en het gezamenlijke zwaartepunt in het hijsplan vereist.':
    !vertical?'Bereken de schuine stationresultanten met haakpositie, aanpikhoeken, hoogteverschil tussen stations en bijbehorende horizontale krachten in het projectspecifieke hijsplan.':
    'Kaal prefab inclusief instortstaal. Het hijsplan borgt verticale stationresultanten. Gebruik de gezamenlijke WLL van inzetstuk en koppeling bij deze hijssterkte en hoek.';
  checks.push(check('liftFree','Strengkracht tijdens vrij hijsen',dynamic,p.liftingWLL,'kN',assumptions,evidence,correct));
  checks.push(check('demould','Strengkracht bij ontkisten',stripping,p.liftingWLL,'kN',
    p.stripping==='unknown'?'Kies de werkelijke ontkistwijze en leg de malhechting vast.':assumptions,evidence,correct));
  const moments=correct?handlingMoments(c,G*p.hoistFactor*p.handlingFactor):null;
  for(const [key,layer,label] of [['sagging','bottom','Positief hijsmoment · ondernet'],['hogging','top','Negatief hijsmoment · bovennet']]) {
    const cap=correct&&p.density>=2000&&p.density<=2600?momentCapacity(steelArea(c,p,parts,layer),c.kind==='flight'?d.width:p.landingDepth,d.d,
      p.barYield/p.reinforcementFactor,p.compressionCoefficient*p.earlyCylinderStrength/p.concreteFactor):null;
    checks.push(check('handling-'+key,label,moments?.[key],cap,'kNm',assumptions+
      ' Vrije hijsfase in inbouwstand met de eigengewichtsverdeling uit de mal. De jonge karakteristieke cilindersterkte voor de doorsnede moet voor de hijsfase zijn onderbouwd.',
      correct&&hasText(p.riggingReference),correct));
  }
  metrics.push(metric('Zwaartepunt kaal prefab lokaal X',d.centroid.x,'mm'),metric('Zwaartepunt kaal prefab lokaal Y',d.centroid.y,'mm'),metric('Zwaartepunt kaal prefab lokaal Z',d.centroid.z,'mm'));
  if(correct)metrics.push(metric('Grootste verticale gewichtsaandeel per hijspunt',share,'–'));
  if(positive(contact.area))metrics.push(metric('Onderzijdig maloppervlak',contact.area,'m²'));
  if(Number.isFinite(adhesion))metrics.push(metric('Totale malhechting',adhesion,'kN'));
  return d.liftPoints.map((point,i)=>({id:c.id+'-H-'+String(i+1).padStart(2,'0'),point,
    share:correct?shares[i]:null,freeKN:correct?G*p.hoistFactor*shares[i]/Math.cos(angle):null,
    stripKN:stripForces?.[i]??null}));
}

export function calculatePrecast(params,parts) {
  const p={...defaults,...params,liftPlans:readLiftPlans(params.liftPlans)};
  const casts=parts.filter(c=>c.material==='concrete'&&c.detail);
  const flights=[1,2].map(n=>{const c=casts.find(item=>item.id==='vlucht-'+n);return c&&flightForces(c,p);});
  const notes=[
    'Voorlopige doorsnede- en productvergelijking. Controleer gegevens en lastcombinaties voor het project en de toepasselijke normeditie met nationale bijlage.',
    'Werk nokken, steunwapening, ontwikkelingslengte, vervorming, scheurvorming, brand en de lokale lastspreiding uit. Toets bij het hijsplan dwarsbuiging, lokale invoer, ontkistbuiging, transportsteunen en montagevolgorde.',
    'De bordessen vragen twee doorgaande zijopleggingen. De berekening omvat de aansluitende vluchten van dit trapcomponent. Voeg omliggende bouwdelen en eventuele vluchten van andere componenten toe aan het gebouwmodel.'
  ];
  const elements=casts.map(c=>{
    const checks=[],metrics=[metric('Massa betonelement',c.massKg,'kg'),metric('Gewicht betonelement',c.massKg*gravity/1000,'kN')];
    const f=c.kind==='flight'?flights[c.id==='vlucht-1'?0:1]:landingForces(c,p,flights);
    serviceChecks(c,p,f,parts,checks,metrics);
    const liftPlan=effectiveLiftPlan(p,p.liftPlans,c.id);
    const localParams={...p,...liftPlan};
    const liftStations=transportChecks(c,localParams,parts,checks,metrics);
    const localDetails=checkLocalSteel(c,localParams,flights,liftStations,parts);
    if(p.localReinforcement==='detailed') {
      const liftZones=localDetails.filter(z=>z.kind==='lifting');
      if(liftZones.length!==4 || liftZones.some(z=>z.status!=='pass')) {
        for(const test of checks.filter(t=>t.id==='liftFree'||t.id==='demould')) {
          if(test.status==='pass') test.status='open';
          test.note+=' De product-WLL vereist ook de passende en gedocumenteerde bijlegwapening bij alle vier de hijshulzen.';
        }
      }
    }
    for(const [kind,label] of [['bearing','Oplegzone'],['lifting','Hijshuls'],['anchorage','Kopbout']]) {
      const zones=localDetails.filter(z=>z.kind===kind);
      if(!zones.length) continue;
      for(const criterion of ['area','tail']) {
        const priority={fail:0,open:1,pass:2};
        const rows=zones.map(z=>({z,test:z.checks.find(t=>t.id===criterion)}));
        rows.sort((a,b)=>priority[a.test.status]-priority[b.test.status]||
          (b.test.demand??0)/(b.test.capacity||1e-9)-(a.test.demand??0)/(a.test.capacity||1e-9));
        const {z,test}=rows[0];
        checks.push({...test,id:'local-'+kind+'-'+criterion,label:label+' · '+test.label.toLowerCase(),
          note:z.targetId+' · '+test.note});
      }
    }
    for(const [i,note] of (c.detail.geometryIssues??[]).entries())checks.push({id:'geometry-'+i,label:'Inpassing instortdelen',status:'fail',demand:null,capacity:null,unit:'',note});
    checks.push(check('engineering','Aanvullende element- en montageberekening',null,null,'',notes[1]));
    const status=overall([...checks,...localDetails]);
    return {id:c.id,label:c.label,status,checks,metrics,liftPlan,liftPlanOverrides:Object.keys(p.liftPlans?.[c.id]??{}),liftStations,localDetails};
  });
  return {elements,status:overall(elements),notes};
}
