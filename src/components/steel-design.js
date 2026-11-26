import { boundsOf } from './solids.js';

// Geometry in mm, forces in N, stresses in N/mm². Convert only at input/output.
const E=210000;
const number=(key,label,value,max,unit,min=0,step=.01,group='Constructie')=>
  ({key,label,default:value,min,max,unit,step,type:'number',group});
const reference=(key,label,group)=>({key,label,type:'text',default:'',maxLength:160,group});
export const steelDesignFields=[
  reference('designBasis','Projectbasis lasten, combinaties en oplegschema','Constructie'),
  number('designG','Aanvullende permanente vlaklast Gk',0,100,'kN/m²'),
  number('designQ','Veranderlijke vlaklast qk',0,100,'kN/m²'),
  number('designP','Alternatieve puntlast Qk',0,200,'kN'),
  number('designGammaG','UGT-factor permanente lasten',1.35,3,'–',1),
  number('designGammaQ','UGT-factor veranderlijke lasten',1.5,3,'–',1),
  number('designLimit','Doorbuigingsgrens L/n',300,2000,'n',50,1),
  number('steelFyd','Rekenvloeigrens voor getekende diktes',0,355,'N/mm²'),
  reference('steelStabilityBasis','Rapport zijdelingse steunpunten, kip en globale stabiliteit','Constructie'),
  number('steelBracingPitch','Geverifieerde afstand tussen zijdelingse steunpunten',0,20000,'mm'),
  number('steelBucklingMRd','Momentweerstand wang met kip, knik en verbindingen',0,10000,'kNm'),
  number('steelLateralEd','Horizontale belasting complete trap inclusief hekwerk',0,1000,'kN'),
  number('steelLateralRd','Horizontale weerstand compleet stabiliteitsverband',0,1000,'kN'),
  number('steelPatch','Breedte puntlastvlak in looprichting',50,500,'mm',1,1),
  number('steelBars','Effectief aantal draagstrippen bij puntlast',1,20,'st.',1,1),
  reference('steelPanelBasis','Product/detailonderbouwing meewerkende roosterstrippen','Constructie'),
  reference('steelDetailBasis','Berekening opleghoeken, lassen, platen en bordesknopen','Verbindingen'),
  ...[['steelCleatRd','Trede-opleghoek met las · verticale Rd'],['steelHeadRd','Kopplaat met las · verticale Rd'],
    ['steelFootRd','Wangvoet incl. oplegstoel/contact · verticale Rd'],['steelColumnRd','Kolom incl. voet, knik en opleg · drukweerstand']]
    .map(([k,l])=>number(k,l,0,10000,'kN',0,.01,'Verbindingen')),
  reference('steelAnchorBasis','Ankerberekening/ETA, ondergrond en maatgevende voetlasten','Vloerankers'),
  {key:'steelBaseActions',label:'N, V en M voor alle voeten',type:'select',group:'Vloerankers',default:'unknown',
    options:[['unknown','Voetlasten nog te bepalen'],['envelope','UGT-omhullende bevestigd, inclusief opwippen']]},
  number('steelEmbed','Inbedding vloeranker M12',90,300,'mm',40,1,'Vloerankers'),
  ...[['steelBaseN','Grootste uitwendige trekkracht per groep','kN'],['steelBaseV','Grootste horizontale dwarskracht per groep','kN'],
    ['steelBaseMx','Grootste voetmoment om lokale X-as','kNm'],['steelBaseMy','Grootste voetmoment om lokale Y-as','kNm'],
    ['steelBaseMz','Grootste torsiemoment om lokale Z-as','kNm'],['steelAnchorNRd','N,Rd per effectief anker incl. groep en betondetail','kN'],
    ['steelAnchorVRd','V,Rd per effectief anker incl. groep en betondetail','kN']]
    .map(([k,l,u])=>number(k,l,0,10000,u,0,.01,'Vloerankers'))
];

function rectangle(b,h){return {I:b*h**3/12,W:b*h**2/6};}
export function foldedSection(depth,t){
  const h=35,web=depth*t,lip=t*(h-t);
  const z=(web*t/2+2*lip*(h+t)/2)/(web+2*lip);
  const I=web*(t**2/12+(z-t/2)**2)+2*lip*((h-t)**2/12+((h+t)/2-z)**2);
  return {I,W:I/Math.max(z,h-z)};
}

// Simply supported Euler–Bernoulli beam. qG/qQ are vertical N/mm along the
// member axis. P and Gsingle move to the adverse station for each effect.
export function steelBeam(p,L,section,qG,qQ,P,Gsingle=0,cos=1) {
  const {I,W}=section,g=p.designGammaG,q=p.designGammaQ;
  const permanent=qG*L**2/8+Gsingle*L/4;
  const variable=Math.max(qQ*L**2/8,P*L/4);
  const M=cos*(g*permanent+q*variable);
  const f=(line,point)=>cos*(5*line*L**4/384+point*L**3/48)/(E*I);
  return {M,stress:M/W,delta:f(qG,Gsingle)+Math.max(f(qQ,0),f(0,P)),
    reaction:g*(qG*L/2+Gsingle)+q*Math.max(qQ*L/2,P),
    permanentReaction:qG*L/2+Gsingle, areaReaction:qQ*L/2, pointReaction:P,
    capacity:L/p.designLimit};
}

// Loads act at their stations along a simply supported inclined beam. Lumping
// an object's weight at its mesh centroid preserves reactions and conservatively
// bounds positive bending/deflection (their influence lines are concave).
function stringerResponse(p,L,cos,section,loads) {
  const ordered=loads.slice().sort((a,b)=>a.x-b.x);
  const left=(key)=>sum(ordered,v=>v[key]*(L-v.x)/L);
  const right=(key)=>sum(ordered,v=>v[key]*v.x/L);
  const bottom={G:left('G'),Q:left('Q')},top={G:right('G'),Q:right('Q')};
  const P=p.designP*1000;
  function moment(area) {
    const point=area?0:p.designGammaQ*P;
    let shear=p.designGammaG*bottom.G+(area?p.designGammaQ*bottom.Q:0),prev=0,mPrev=0,peak=0;
    for(const load of [...ordered,{x:L,G:0,Q:0}]) {
      // For a moving point, its maximum moment at x occurs with the load at x.
      const at=x=>mPrev+shear*(x-prev)+point*x*(L-x)/L;
      peak=Math.max(peak,at(prev),at(load.x));
      if(point) {
        const vertex=L*(shear+point)/(2*point);
        if(vertex>prev&&vertex<load.x) peak=Math.max(peak,at(vertex));
      }
      mPrev+=shear*(load.x-prev);
      shear-=p.designGammaG*load.G+(area?p.designGammaQ*load.Q:0);
      prev=load.x;
    }
    return peak*cos;
  }
  function sag(area) {
    const value=(x,derivative)=>sum(ordered,load=>{
      const mirrored=x>load.x,u=mirrored?L-x:x,b=mirrored?load.x:L-load.x;
      const scale=(load.G+(area?load.Q:0))*cos*b/(6*L*E*section.I);
      return derivative?scale*(L*L-b*b-3*u*u)*(mirrored?-1:1):scale*u*(L*L-b*b-u*u);
    });
    // Curvature has one sign on the full span. Bisect the zero slope.
    let lo=0,hi=L;
    for(let i=0;i<40;i++) {
      const mid=(lo+hi)/2;
      if(value(mid,true)>0) lo=mid; else hi=mid;
    }
    return value((lo+hi)/2,false);
  }
  const M=Math.max(moment(true),moment(false));
  const delta=Math.max(sag(true),sag(false)+cos*P*L**3/(48*E*section.I));
  return {stress:M/section.W,delta,capacity:L/p.designLimit,bottom,top};
}

const sum=(items,get)=>items.reduce((s,v)=>s+get(v),0);
const weight=parts=>sum(parts,v=>v.massKg)*9.81;
const two=i=>String(i).padStart(2,'0');
const spec=s=>typeof s==='string'&&s.trim().length>0;

export function calculateSteel(p,parts,stations) {
  const checks=[],connections=[],byId=new Map(parts.map(v=>[v.id,v]));
  const model=spec(p.designBasis)&&p.designQ>0&&p.designP>0;
  const detail=spec(p.steelDetailBasis);
  const notes=[
    'Verticale gebruikscombinaties γG·G + max(γQ·q, γQ·Q). Eigengewicht uit netto staalgeometrie, 7850 kg/m³. Voor BGT gelden karakteristieke lasten en E = 210000 N/mm².',
    'Rekenmodel met scharnierende neerwaartse opleggingen. Afzonderlijke controles op kip, plooien, lokale belasting, horizontale stabiliteit en dynamica staan bij de betreffende onderdelen.',
    'De ankerinvoer is een UGT-omhullende voor alle voeten in lokale plaatassen. N is externe trek na bepaling van de oplegreacties. Geef momenten en horizontale kracht als absolute waarden op.'
  ];
  if(spec(p.designBasis)) notes.push('Lastbasis: '+p.designBasis);
  if(detail) notes.push('Verbindingsbasis: '+p.steelDetailBasis);
  if(spec(p.steelAnchorBasis)) notes.push('Ankerbasis: '+p.steelAnchorBasis);
  function check(id,label,phase,value,limit,unit,note,partIds,basis=model) {
    const demand=Number.isFinite(value)?value:null,capacity=Number.isFinite(limit)&&limit>0?limit:null;
    const status=basis&&demand!==null&&capacity!==null?(demand<=capacity?'pass':'fail'):'open';
    checks.push({id,label,status,phase,demand,capacity,unit,note,partIds});
    return id;
  }
  const unresolved=(id,label,note,ids)=>check(id,label,'Project',null,null,'',note,ids,false);
  function connection(id,label,partIds,focusIds,checkIds,note) {
    connections.push({id,label,partIds,focusIds,checkIds,note});
  }
  const grate=p.treadType==='grating',solidStringer=p.stringerStyle!=='openFrame',
    byPrefix=id=>parts.filter(v=>v.id.startsWith(id+'-'));
  const ids=v=>v.map(x=>x.id);
  const stressLimit=t=>Math.min(p.steelFyd,p.steelGrade==='S235'?(t>16?225:235):(t>16?345:355));
  function beamChecks(id,label,beam,t,group,note,basis=model) {
    check(id+'-buiging',label+' · elastische buiging','UGT',model?beam.stress:null,stressLimit(t),'N/mm²',note,group,basis);
    check(id+'-doorbuiging',label+' · doorbuiging','BGT',model?beam.delta:null,beam.capacity,'mm',note,group,basis);
  }
  function panel(id,label,length,tributary,fullWidth,span,group,landing) {
    const self=byId.get(group[0]).massKg*9.81/(length*fullWidth);
    const stripWidth=grate?(length-(landing?8:36))/Math.ceil((length-(landing?8:36))/p.bearingPitch):
      landing?Math.min(p.steelPatch,length):length;
    const section=grate?rectangle(3,p.gratingDepth):landing?rectangle(stripWidth,p.plateThickness):foldedSection(length,p.plateThickness);
    const t=grate?3:p.plateThickness;
    // Geometry has 3 mm load bars between nose and rear bands. Ignore crossbar
    // stiffness. A spread to >1 strip requires evidence for this actual panel.
    const stripCount=grate?p.steelBars:1;
    const sufficient=!grate||stripCount===1||(spec(p.steelPanelBasis)&&stripCount<=Math.ceil((length-(landing?8:36))/p.bearingPitch)-1);
    const note=grate?'Draagstrip 3 × '+p.gratingDepth+' mm; steek '+stripWidth.toFixed(1)+' mm; Q verdeeld over '+stripCount+' strip(pen). '+
      (p.steelPanelBasis||(stripCount===1?'Eén strip zonder productverdeling.':'Onderbouwing lastverdeling ontbreekt.')):'Getekende '+(landing?'vlakke plaatstrip '+stripWidth+' mm':'gezette doorsnede met twee lippen van 35 mm')+'.';
    const loadWidth=stripWidth*tributary/length;
    const response=steelBeam(p,span,section,self*stripWidth+p.designG*loadWidth/1000,p.designQ*loadWidth/1000,p.designP*1000/stripCount);
    beamChecks(id,label,response,t,group,note+' Oplegafstand '+span.toFixed(1)+' mm.',model&&sufficient);
    return response;
  }
  const n1=p.layout==='return'?Math.floor(p.risers/2):p.risers;
  const flights=p.layout==='return'?[n1,p.risers-n1]:[n1];
  const floorGroups=[],flightReactions=[];
  function adjacentBeams(plateId,platform) {
    const seat=boundsOf([byId.get(plateId)]);
    return ids(byPrefix(platform).filter(v=>{
      if(v.role!=='landingBeam') return false;
      const b=boundsOf([v]);
      return ['x','y','z'].every(axis=>seat[axis+'max']>=b[axis+'min']-.001&&seat[axis+'min']<=b[axis+'max']+.001);
    }));
  }
  for(const [index,count] of flights.entries()) {
    const name='vlucht-'+(index+1),items=byPrefix(name),treads=items.filter(v=>v.kind==='tread');
    const length=p.going-7,run=(count-1)*p.going,rise=p.height/p.risers;
    const cos=p.going/Math.hypot(p.going,rise),L=run/cos;
    panel(name+'-trede','Trede '+name,length,p.going,p.width,p.width,ids(treads),false);
    unresolved(name+'-lokaal','Lokale trede-inleiding en stabiliteit',grate?
      'Producttoets op randstrip, oplegging en dwarsstaaflassen bij het opgegeven puntlastvlak.':
      'Lokale plaatbuiging, plooi en excentrische belasting van de open gezette doorsnede vragen een detailtoets.',ids(treads));
    const totalTread=weight([treads[0]])+p.designG*p.going*p.width/1000;
    const loadedPlatform=(index===0&&flights.length===2)?'keerbordes':'bovenbordes';
    const ends={bottom:{G:0,Q:0},top:{G:0,Q:0}};
    for(const side of ['L','R']) {
      const treadIds=ids(treads),wang=name+'-wang-'+side,voet=name+'-voet-'+side,kop=name+'-kopplaat-'+side;
      const cleats=items.filter(v=>v.role==='treadCleat'&&v.id.endsWith(side));
      const seatV=(p.designGammaG*(totalTread/2+weight([cleats[0]]))+
        p.designGammaQ*Math.max(p.designQ*p.going*p.width/2000,p.designP*1000))/1000;
      const guard=items.filter(v=>v.id.startsWith(name+'-hek-'+side+'-'));
      // Each tread transfers half its dead load to each side. The point load
      // can lie immediately over a single stringer. Keep the individual rail.
      const section=rectangle(p.stringerThickness,p.stringerDepth*cos);
      const own=[byId.get(wang),byId.get(kop),byId.get(voet),...guard,...cleats];
      if(index) own.push(byId.get(name+'-zetel-'+side));
      const station=id=>Math.min(L,Math.max(0,stations.get(id)/cos));
      const loads=own.map(part=>({x:station(part.id),G:part.massKg*9.81,Q:0}));
      const tributary=p.going*p.width/2;
      for(const [i,tread] of treads.entries()){
        loads.push({x:station(tread.id),G:tread.massKg*9.81/2,Q:0});
        loads.push({x:(i*p.going+length/2)/cos,G:p.designG*tributary/1000,Q:p.designQ*tributary/1000});
      }
      const response=stringerResponse(p,L,cos,section,loads);
      const note='Vlaklast per trede en staalmassa per onderdeel op het zwaartepunt. Horizontale lengte '+run+
        ' mm; loodrechte lijfhoogte '+(p.stringerDepth*cos).toFixed(1)+' mm. Eén wang draagt de volledige randpuntlast.';
      beamChecks(wang,'Plaatwang '+name+' '+side,response,p.stringerThickness,[wang],
        solidStringer?note:'Open driehoekframe: doorsnede, knooppuntstijfheid en stabiliteit projectmatig bepalen. '+note,
        model&&solidStringer);
      const stability=spec(p.steelStabilityBasis)&&p.steelBracingPitch>0&&p.steelBracingPitch<=L;
      check(wang+'-kip','Plaatwang '+name+' '+side+' · kipweerstand','UGT',response.stress*section.W/1e6,p.steelBucklingMRd,'kNm',
        'Projectweerstand voor getekende plaatwang bij zijdelings gesteunde lengte '+p.steelBracingPitch+' mm; onderbouw werkelijk steunpunt, torsiebeperking en verbinding.',[wang],model&&stability&&solidStringer);
      const verticalV=Math.max(...['bottom','top'].map(key=>p.designGammaG*response[key].G+
        p.designGammaQ*Math.max(response[key].Q,p.designP*1000)));
      const area=p.stringerThickness*p.stringerDepth*cos;
      const normal=verticalV*Math.sqrt(1-cos*cos)/area,tau=1.5*verticalV*cos/area;
      check(wang+'-doorsnede','Plaatwang '+name+' '+side+' · N/M/V','UGT',
        model?Math.hypot(response.stress+normal,Math.sqrt(3)*tau):null,stressLimit(p.stringerThickness),'N/mm²',
        'Omhullende elastische vergelijkspanning op de volle rechthoek. Verticale reacties, één horizontaal vrije oplegging. σ = |M|/W + |N|/A; τ = 1,5 |V|/A. Open driehoekframe vereist een eigen doorsnedemodel.',[wang],model&&solidStringer);
      unresolved(wang+'-stabiliteit','Wang '+side+' · stabiliteit en voetdoorsnede',
        'Kip, knik onder normaalkracht, torsie en lijf bij de uitgekepte voet vereisen de zijdelingse steunpunten en het uitvoeringsdetail.',[wang,voet,kop]);
      const seatCheck=check(name+'-opleghoek-'+side,'Trede-opleghoek en las '+side,'UGT',model?seatV:null,p.steelCleatRd,'kN',
        'Complete hoek met las, lokale plaat en excentriciteit. Randpuntlast volledig op één hoek.',ids(cleats),model&&detail);
      for(const [j,cleat] of cleats.entries()){
        const idx=name+'-oplegging-'+two(j+1)+side;
        connection(idx,'Opleghoek '+two(j+1)+side,[treadIds[j],cleat.id,wang],[cleat.id],[seatCheck],
          'L 40 × 40 × 4; lengte '+(length-36)+' mm. Verticale last naar plaatwang via projectlas.');
      }
      const chair=name+'-zetel-'+side;
      const interfaces=[[voet,'Wangvoet',p.steelFootRd,index===0?[]:[chair,...adjacentBeams(chair,'keerbordes')]],
        [kop,'Wangkop',p.steelHeadRd,adjacentBeams(kop,loadedPlatform)]];
      for(const [id,label,rd,others] of interfaces) {
        const end=response[id===voet?'bottom':'top'];
        const reaction=p.designGammaG*end.G+p.designGammaQ*Math.max(end.Q,p.designP*1000);
        const linked=[id,wang,...others],checkId=check(id+'-reactie',label+' '+name+' '+side,'UGT',model?reaction/1000:null,rd,'kN',
          'Verticale eindreactie incl. randpuntlast. Rd geldt voor volledige oplegging met las, plaat en excentriciteit.',linked,model&&detail);
        const fasteners=ids(byPrefix(id).filter(v=>v.role==='floorAnchor'));
        connection(id,label+' '+side,[...linked,...fasteners],[id,...fasteners],[checkId,...(fasteners.length?[id+'-anker-trek',id+'-anker-afschuiving',id+'-ankers']:[])],
          fasteners.length?'Voetplaat 100 × 90 × 10; patroon 64 × 54 mm, 4 × Ø14, vier vloerankers M12.':
            index>0&&id===voet?'Voetplaat op gelaste stoel van het keerbordes.':'Gelaste kopplaat naar het bordesframe.');
        if(fasteners.length) floorGroups.push({id,fasteners,sx:64,sy:54});
      }
      for(const k of ['bottom','top']) {
        ends[k].G+=response[k].G;
        ends[k].Q+=response[k].Q;
      }
    }
    flightReactions.push(ends);
  }
  const platforms=flights.length===2?[['keerbordes',2*p.width+p.laneGap+2*p.stringerThickness,[[0,'top'],[1,'bottom']]],['bovenbordes',p.width,[[1,'top']]]]:
    [['bovenbordes',p.width,[[0,'top']]]];
  for(const [name,width,adjacent] of platforms) {
    const items=byPrefix(name),deck=name+'-vloer',d=p.landingDepth,half=width>1500;
    const span=half?width/2-35:width-70;
    panel(deck,'Bordesdek '+name,d,d,width,span,[deck],true);
    const beams=items.filter(v=>v.role==='landingBeam');
    const frameIds=ids(beams),supports=p.supports==='columns';
    const frameCheck=unresolved(name+'-raamwerk','Bordesraamwerk '+name,
      supports?'Controleer hoekknopen en eindoverstekken, verdeling vluchtreacties, torsie, windverband, dekcontinuïteit, lokale puntlast en dynamica.':
        'De steunpunten, stijfheden en excentriciteiten van de gebouwaansluiting zijn nog te detailleren. Controleer ook de lokale puntlast op het dek.',[deck,...frameIds]);
    const incoming=adjacent.map(([i,end])=>flightReactions[i][end]);
    const G=weight(items)+p.designG*d*width/1000+sum(incoming,v=>v.G);
    const Q=p.designQ*d*width/1000+sum(incoming,v=>v.Q);
    // No quarter-share assumption. All connected flights may be loaded; Qk
    // point acts once in this variable-load alternative. The column axes lie
    // 45 mm inside both edges. Bound the near reaction of an overhanging beam
    // by the outermost load lever in each of the two plan directions.
    const amp=(1+(45+p.stringerThickness)/(width-90))*(1+45/(d-90));
    const UGT=(p.designGammaG*G+p.designGammaQ*Math.max(Q,p.designP*1000))*amp/1000;
    for(const beam of beams){
      const longitudinal=!beam.id.includes('raveel'),L=longitudinal?d:width;
      const I=(70*120**3-60*110**3)/12,section={I,W:I/60};
      const response=steelBeam(p,L,section,0,0,Math.max(Q,p.designP*1000)*amp,G*amp);
      beamChecks(beam.id,beam.label+' '+name,response,5,[beam.id],
        'Referentieschema twee opleggingen; volledige zwaartekrachtomhullende bordes en aansluitende vluchten op één ligger. Staaflengte bovengrens '+L+' mm; knoop- en overstekwerking afzonderlijk.',model&&supports);
    }
    if(supports) for(let i=1;i<=4;i++){
      const id=name+'-voet-'+i,column=name+'-kolom-'+i,fasteners=ids(byPrefix(id).filter(v=>v.role==='floorAnchor'));
      const c=check(column+'-druk','Kolom en voet '+name+' '+i,'UGT',model?UGT:null,p.steelColumnRd,'kN',
        'Bovengrens per kolom met alle aangrenzende vluchtlasten en overstek; project-Rd inclusief werkelijke kniklengte en voetdetail.',[column,id],model&&detail);
      connection(id,'Kolomvoet '+i,[id,column,...fasteners],[id,...fasteners],[c,id+'-anker-trek',id+'-anker-afschuiving',id+'-ankers'],
        'Voet 130 × 130 × 12; patroon 94 × 94 mm; 4 × Ø14, vier vloerankers M12.');
      floorGroups.push({id,fasteners,sx:94,sy:94});
    } else connection(name+'-gebouw','Aansluiting bordes op gebouw',frameIds,frameIds,[frameCheck],
      'Ondersteuning door het gebouw. Voeg het exacte oplegdetail en de gebouwberekening toe.');
  }
  for(const {id,fasteners,sx,sy} of floorGroups) {
    // Conservative single-effective-anchor tension/shear. No favourable
    // compression, friction or beneficial shear sharing. Torsion uses nearest
    // opposite row. Requires verified rigid base/contact load path.
    const N=p.steelBaseN+1000*(p.steelBaseMx/sy+p.steelBaseMy/sx);
    const V=p.steelBaseV+1000*p.steelBaseMz/Math.min(sx,sy);
    const anchorBasis=spec(p.steelAnchorBasis)&&p.steelBaseActions==='envelope',linked=[id,...fasteners];
    const design=model&&anchorBasis;
    check(id+'-anker-trek','Ankertrek '+id,'UGT',anchorBasis?N:null,p.steelAnchorNRd,'kN',
      'Maatgevend effectief anker. N + |Mx|/sy + |My|/sx bij vier getekende ankers en stijve voetplaat.',linked,design);
    check(id+'-anker-afschuiving','Ankerafschuiving '+id,'UGT',anchorBasis?V:null,p.steelAnchorVRd,'kN',
      'Volledige V op één effectief anker, vermeerderd met |Mz|/min(sx,sy).',linked,design);
    check(id+'-ankers','Vloerverankering '+id,'UGT',anchorBasis&&p.steelAnchorNRd>0&&p.steelAnchorVRd>0?
      N/p.steelAnchorNRd+V/p.steelAnchorVRd:null,1,'–',
      'M12, h='+p.steelEmbed+' mm. Lineaire interactie. Projectbasis vereist voor groep, componentdikte, randafstanden, betonscheur, ondergieting, plaat/prying en de uitwendige voetlasten.',linked,design);
  }
  const stabilityParts=parts.filter(v=>['landingBeam','column','basePlate'].includes(v.role)).map(v=>v.id);
  check('staal-totaalstabiliteit','Complete stalen trap · horizontale stabiliteit','UGT',
    p.steelLateralEd,p.steelLateralRd,'kN',
    'Projectweerstand inclusief hekwerk, schoren, bordesframe, knopen, vloeraansluiting en gebouwconstructie.',
    stabilityParts,model&&spec(p.steelStabilityBasis)&&p.steelLateralEd>0);
  return {status:checks.some(v=>v.status==='fail')?'fail':checks.some(v=>v.status==='open')?'open':'pass',checks,connections,notes};
}
