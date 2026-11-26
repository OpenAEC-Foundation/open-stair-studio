// Local model units are mm. Internally use N, N/mm and N·mm.
const basis = 'Constructie · belastingen';
const glass = 'Constructie · glas en wang';
const wood = 'Constructie · huls en koker';
const joint = 'Constructie · verbindingen';
const number = (key,label,unit,group,max,initial=0,min=0) =>
  ({key,label,unit,group,type:'number',default:initial,min,max,step:'any'});
const ref = (key,label,group) => ({key,label,group,type:'text',unit:'',default:'',maxLength:160});
const common = [
  ref('designBasis','Projectnota met revisie, lastcombinaties en toepassingsgebied',basis),
  number('designG','Gk totaal op projectie, inclusief toegerekend eigen gewicht','kN/m²',basis,100),
  number('designQ','qk veranderlijke vlaklast','kN/m²',basis,100),
  number('designP','Qk afzonderlijke vrije puntlast','kN',basis,100),
  number('designGammaG','UGT-factor ongunstige permanente last','–',basis,5,1.35,1),
  number('designGammaQ','UGT-factor veranderlijke last','–',basis,5,1.5,1),
  number('designLimit','BGT-grens per berekend onderdeel','mm',basis,100),
  ref('detailBasis','Detailrapport voor werkelijke verbinding, randafstanden en ondergrond',joint),
];
export const glassDesignFields = [...common,
  ref('glassResidualBasis','Rapport resttoestand na breuk en borging opleggingen',glass),
  number('glassResidualFd','Toelaatbare spanning overblijvende glasbladen na breuk','MPa',glass,200),
  number('glassResidualLimit','Vervormingsgrens resttoestand','mm',glass,200),
  number('glassStrip','Effectieve strook bij puntlast, ook aan rand en hoek','mm',glass,1800),
  number('glassFd','Kleinste ontwerpbuigsterkte van de dragende glasbladen','MPa',glass,200),
  number('glassCarrierMRd','Momentweerstand per volledige zaagtandwang incl. inkepingen','kNm',glass,1000),
  number('glassCarrierEI','Ondergrens equivalente verticale EI per wang op horizontale projectie','kNm²',glass,1e7),
  number('glassSeatRd','Verticale Rd per complete tredeoplegging bij randlast','kN',joint,1000),
  number('glassFootRd','Verticale drukweerstand per voetdetail incl. vloer','kN',joint,1000),
  number('glassHeadRd','Verticale Rd complete kopconsole bij getekende excentriciteit','kN',joint,1000),
  number('glassHeadLever','Aangetoonde hefboom ankeras tot drukresultante kopflens','mm',joint,22),
  number('glassHeadNRd','Trekweerstand volledige ankerrij kopflens','kN',joint,1000),
  number('glassHeadVRd','Afschuifweerstand volledige ankerrij kopflens','kN',joint,1000),
];
export const floatingDesignFields = [...common,
  ref('floatingStabilityBasis','Stabiliteitsrapport wand, verband en balustrade',wood),
  number('floatingHorizontal','Horizontale maatgevende belasting op vrije rand','kN',wood,100),
  number('floatingLateralRd','Zijdelingse weerstand complete wandverbinding','kN',wood,1000),
  number('floatingDriftLimit','Grens zijdelingse verplaatsing vrije rand','mm',wood,200),
  number('armFd','Ontwerpbuigspanning netto kokerdoorsnede','MPa',wood,700),
  number('armVRd','Dwarskrachtweerstand per netto kokerdoorsnede','kN',wood,1000),
  number('armE','E-modulus draagkoker','MPa',wood,250000,210000),
  number('skinStrip','Effectieve breedte houten bovenhuid voor randpuntlast','mm',wood,1800),
  number('skinFd','Ontwerpbuigspanning bovenhuid dwars op de kokers','MPa',wood,120),
  number('skinE','Effectieve E-modulus bovenhuid dwars op de kokers, incl. kruip','MPa',wood,40000),
  number('weldMRd','Momentweerstand kokerlas incl. plaat en kokerwand per arm','kNm',joint,100),
  number('weldVRd','Afschuifweerstand kokerlas incl. plaat en kokerwand per arm','kN',joint,1000),
  number('wallRowNRd','Trekweerstand bovenste rij van twee wandankers als groep','kN',joint,1000),
  number('wallGroupVRd','Afschuifweerstand volledige vierankergroep','kN',joint,1000),
  number('wallLever','Aangetoonde hefboom trekrij tot drukresultante wandplaat','mm',joint,150),
];

const positive = n => Number.isFinite(n) && n>0 ? n : NaN;
const clean = n => Number.isFinite(n) ? n : null;
const ids = (n,fn) => Array.from({length:n},(_,i)=>fn(i));
function calculation(p) {
  const checks=[],connections=[],notes=[];
  const known = typeof p.designBasis==='string' && Boolean(p.designBasis.trim());
  const documented = typeof p.detailBasis==='string' && Boolean(p.detailBasis.trim());
  function check(id,label,phase,demand,capacity,unit,note,partIds,detail=false,eligible=true) {
    const valid=Number.isFinite(demand) && Number.isFinite(capacity) && capacity>0;
    const status=eligible&&valid&&demand>capacity?'fail':eligible&&valid&&known&&(!detail||documented)?'pass':'open';
    checks.push({id,label,phase,status,demand:clean(demand),capacity:clean(positive(capacity)),unit,note,partIds});
    return id;
  }
  const open=(id,label,note,parts)=>check(id,label,'Detail',NaN,NaN,'',note,parts);
  const connect=(id,label,partIds,focusIds,checkIds,note)=>connections.push({id,label,partIds,focusIds,checkIds,note});
  function finish() {
    if(!known) notes.push('Leg projectlasten, belastingduur, combinatiefactoren en toepassingsgebied vast in de projectnota.');
    if(!documented) notes.push('Leg de weerstanden van de complete aansluitingen voor de gemodelleerde maatvoering en ondergrond vast in het detailrapport.');
    notes.push('Vlaklast en puntlast zijn afzonderlijke lastgevallen bovenop Gk. Een invoerwaarde 0 voor een belasting, weerstand, stijfheid of grens houdt de bijbehorende toets open.');
    return {status:checks.some(c=>c.status==='fail')?'fail':checks.some(c=>c.status==='open')?'open':'pass',checks,connections,notes};
  }
  return {check,open,connect,notes,finish};
}

// Positive and negative influence areas of a uniformly loaded symmetric
// overhanging beam. Use absolute bounds independently for qk and the free Qk.
function bending(q,point,span,overhang) {
  return Math.max(q*span**2/8+point*span/4,q*overhang**2/2+point*overhang);
}
// From |v''| <= Mmax / EI, with zero displacement at both support axes.
// The second expression also bounds both overhanging ends.
function deflectionBound(moment,span,overhang,EI) {
  return moment*Math.max(span**2/8,(span*overhang+overhang**2)/2)/EI;
}
const round=n=>Number(n.toFixed(2)).toLocaleString('nl-NL');

export function designGlass(s,carrierWidth,footLength,headLength) {
  const {p,stations,end}=s, r=calculation(p);
  const G=positive(p.designG), Q=positive(p.designQ), P=positive(p.designP)*1000;
  const g=p.designGammaG, u=p.designGammaQ, edge=22+carrierWidth/2,L=p.width-2*edge;
  const groups=[stations.slice(0,-1),stations.slice(-1)];
  for(const group of groups) {
    const t=group[0],key=t.kind==='landing'?'bordes':'treden',label=t.kind==='landing'?'Bordes':'Treden';
    const parts=group.flatMap(st=>ids(p.layers,i=>st.prefix+'-glas-'+(i+1)));
    const b=p.glassStrip<=t.d?positive(p.glassStrip):NaN;
    // All sheets equal; ignore shear coupling and the walking (wear) ply.
    const n=p.layers-1, I=n*b*p.ply**3/12,W=n*b*p.ply**2/6;
    const envelope=(fg,fq)=>Math.max(bending((fg*G+fq*Q)*b/1000,0,L,edge),
      bending(fg*G*b/1000,fq*P,L,edge));
    const context='Oplegassen '+round(L)+' mm, uitkraging '+round(edge)+' mm. '+n+' dragende glasbladen zonder schuifkoppeling. De bovenplaat telt als slijtlaag. De effectieve puntlaststrook moet binnen de plaatdiepte van '+round(t.d)+' mm passen.';
    r.check(key+'-buiging',label+' · buigspanning per dragend glasblad','UGT',envelope(g,u)/W,p.glassFd,'MPa',context,parts);
    r.check(key+'-doorbuiging',label+' · bovengrens elastische doorbuiging','BGT',deflectionBound(envelope(1,1),L,edge,70000*I),p.designLimit,'mm',context+' E glas 70.000 MPa.',parts);
    const remaining=p.layers-2;
    const residualParts=group.flatMap(st=>ids(p.layers,i=>st.prefix+'-glas-'+(i+1)));
    const residual=remaining>0&&p.glassResidualBasis?.trim();
    r.check(key+'-rest-buiging',label+' · restbuiging na één dragend glasbladbreuk','Resttoestand',
      remaining>0?envelope(1,1)/(remaining*b*p.ply**2/6):NaN,p.glassResidualFd,'MPa',
      'Eén dragend blad uitgevallen; bovenste laag blijft slijtlaag. Losse resterende bladen zonder folieschuif. Aangenomen ongebroken draagpad en blijvende oplegging moeten in rapport worden aangetoond.',residualParts,false,residual);
    r.check(key+'-rest-doorbuiging',label+' · elastische vervorming na glasbreuk','Resttoestand',
      remaining>0?deflectionBound(envelope(1,1),L,edge,70000*remaining*b*p.ply**3/12):NaN,p.glassResidualLimit,'mm',
      'Eén dragend blad uitgevallen. Rekenkundige bovengrens bij intacte opleggingen; borging tegen loskomen afzonderlijk aantonen.',residualParts,false,residual);
    // Max reaction at an axis: dead load over full panel; variable q where
    // its transverse influence is positive, or Q at the outer free edge.
    const posWidth=p.width/2+edge**2/(2*L);
    const V=(g*G*p.width*t.d/2/1e6 + u*Math.max(Q*posWidth*t.d/1e6,P/1000*(1+edge/L)));
    const check=r.check(key+'-oplegdruk',label+' · verticale reactie per oplegstoel','UGT',V,p.glassSeatRd,'kN',
      'Groepsweerstand van glasband, stoel, onderband en wang bij de maatgevende drukverdeling en lastpositie.',group.flatMap(st=>['L','R'].map(side=>st.prefix+'-'+side+'-stoel')),true);
    for(const st of group) for(const side of ['L','R']) {
      const id=st.prefix+'-'+side, focus=[id+'-onderband',id+'-stoel',id+'-glasband'];
      const wang=p.carrier==='glass'?ids(4,i=>'wang-'+side+'-glas-'+(i+1)):['wang-'+side];
      const deck=ids(p.layers,i=>st.prefix+'-glas-'+(i+1));
      r.connect(id+'-oplegging',st.label+' · oplegstoel '+side,[...deck,...focus,...wang],focus,[check,key+'-rest-buiging',key+'-rest-doorbuiging'],
        'Oplegband '+round(carrierWidth)+' × '+round(st.d-4)+' mm op stalen stoel, hart '+round(edge)+' mm uit de zijrand.');
    }
  }
  const a=footLength/2,b=end-headLength/2,span=b-a,over=Math.max(a,end-b);
  // Absolute influence area also covers a patterned qk on the opposite
  // lateral overhang acting through a negative longitudinal influence.
  const widthQ=p.width/2+edge**2/L,Pside=P*(1+edge/L);
  const wg=G*p.width/2000,wq=Q*widthQ/1000;
  const moment=(fg,fq)=>fg*wg*Math.max(span**2/8,over**2/2)+
    fq*Math.max(wq*(span**2/8+over**2/2),Pside*Math.max(span/4,over));
  const carriers=['L','R'].flatMap(side=>p.carrier==='glass'?ids(4,i=>'wang-'+side+'-glas-'+(i+1)):['wang-'+side]);
  const body='Ligger op horizontale projectie tussen de harten van voet- en kopblok, L = '+round(span)+' mm. Rekenwaarden gelden voor de kleinste doorsnede, inkepingen en gekozen wangopbouw over het gehele traject.';
  r.check('wang-buiging','Trapwang · moment','UGT',moment(g,u)/1e6,p.glassCarrierMRd,'kNm',body,carriers,true);
  r.check('wang-doorbuiging','Trapwang · bovengrens verticale doorbuiging','BGT',deflectionBound(moment(1,1),span,over,positive(p.glassCarrierEI)*1e9),p.designLimit,'mm',body,carriers,true);
  for(const side of ['L','R']) for(const head of [false,true]) {
    const id=(head?'kop-':'voet-')+side, reach=head?end-a:b;
    // Full bounding tributary line includes the gaps between treads.
    const V=(g*wg*reach**2/(2*span)+u*Math.max(wq*(reach**2+(end-reach)**2)/(2*span),Pside*reach/span))/1000;
    const focus=head?['kopoplegging-'+side,'kopblok-'+side,'kopflens-'+side,...ids(2,i=>'kopanker-'+side+i)]:
      ['vloerplaat-'+side,'voetblok-'+side,...ids(4,i=>'voetanker-'+side+i)];
    const heads=head?ids(2,i=>'ankerkop-'+side+i):ids(4,i=>'voetankerkop-'+side+i);
    const partIds=[...focus,...heads,...carriers.filter(c=>c.startsWith('wang-'+side))];
    const desc=head?'Kopconsole '+side:'Voetplaat '+side;
    const checks=[r.check(id+'-reactie',desc+' · verticale groepsreactie','UGT',V,head?p.glassHeadRd:p.glassFootRd,'kN',
      head?'Weerstand inclusief excentrische console, flens, las, ankers en vloerrand.':'Drukreactie via voetblok en plaat naar vloer. Het anker draagt deze drukreactie niet.',focus,true)];
    if(head) {
      const ecc=headLength/2+40, N=V*ecc/positive(p.glassHeadLever);
      checks.push(r.check(id+'-trek',desc+' · trek in de ankerrij','UGT',N,p.glassHeadNRd,'kN',
        'Excentriciteit tot vloerwand '+round(ecc)+' mm. De twee ankers liggen op één hoogte. De projecthefboom tot de drukzone mag hoogstens 22 mm zijn.',focus,true));
      checks.push(r.check(id+'-interactie',desc+' · trek en afschuiving','UGT',N/positive(p.glassHeadNRd)+V/positive(p.glassHeadVRd),1,'–',
        'Lineaire interactie voor de gehele groep bij gedocumenteerde drukzone, ondergrondsterkte en randafstanden.',focus,true));
    }
    r.connect(id,desc,partIds,focus,checks,head?'Twee horizontale vloerankers Ø12, plaatgaten Ø13,2 mm, lengte in de ondergrond 100 mm.':'Vier verticale vloerankers Ø12, plaatgaten Ø13,2 mm, lengte in de ondergrond 100 mm.');
  }
  r.open('glas-resttoestand','Resttoestand · borging en fragmentretentie','Beoordeel de fragmentretentie, lokale plaat- en randspanningen, oplichten bij randlast en blijvende oplegging met het productrapport of een proef.',groups.flat().map(st=>st.prefix+'-glas-1'));
  r.open('wang-stabiliteit','Zijdelingse stabiliteit en borging','Verifieer stabiliteit van de vlucht en het bordes, trek- en schuifborging van de losse oplegbanden en de aansluiting op de hoofddraagconstructie.',carriers);
  if(p.guard!=='none') r.open('glas-balustrade','Balustradelasten en profielverbinding','Toets horizontale lijn- en puntlasten en hun overdracht via de staanders naar de wang.',s.parts.filter(q=>q.id.includes('-voet-')).map(q=>q.id));
  r.notes.push('Gk bevat per belaste projectie alle eigen gewichten, inclusief wang en leuning voor de hoofdligger. Bevestig de equivalente verdeling in de projectnota.');
  return r.finish();
}

export function designFloating(s,plateT) {
  const {p,stations}=s,r=calculation(p);
  const G=positive(p.designG),Q=positive(p.designQ),P=positive(p.designP)*1000;
  const g=p.designGammaG,u=p.designGammaQ;
  const w=p.armWidth,h=p.armHeight,t=p.armWall;
  const I=(w*h**3-(w-2*t)*(h-2*t)**3)/12, W=2*I/h, EI=p.armE*I;
  const L=p.wallGap+p.width, free=['free','both'].includes(p.guard);
  const stable=Boolean(p.floatingStabilityBasis?.trim())&&p.floatingHorizontal>0;
  const lateralI=(h*w**3-(h-2*t)*(w-2*t)**3)/12;
  const allArms=stations.flatMap(st=>ids(st.armCount,i=>st.prefix+'-arm-'+(i+1)));
  r.check('boomloos-zijdelings','Boomloze trap · horizontale draagkracht','UGT',p.designGammaQ*p.floatingHorizontal,p.floatingLateralRd,'kN',
    'Horizontale last aan vrije rand. Projectweerstand moet wand, bevestiging, armkoppeling en eventuele balustrade omvatten.',allArms,false,stable);
  r.check('boomloos-zijverplaatsing','Boomloze trap · zijverplaatsing draagarmen','BGT',
    p.floatingHorizontal*1000*L**3/(3*p.armE*lateralI),p.floatingDriftLimit,'mm',
    'Conservatieve bovengrens met de volledige horizontale karakteristieke last op één arm. Wandplaatrotatie en ondergrondvervorming afzonderlijk controleren.',allArms,false,stable);
  r.open('boomloos-totaalstabiliteit','Boomloze trap · stabiliteit complete opstelling',
    'Verifieer wandstijfheid, torsie door randlast, horizontale balustradelast en gezamenlijke vervorming van plaat, ankers, wand en draagarmen.',allArms);
  const cover=free?0:p.tipCover+2, timberHeight=(p.thickness-h-2)/2;
  for(const group of [stations.slice(0,-1),stations.slice(-1)]) {
    const st=group[0],count=st.armCount,pitch=st.d/count;
    const key=st.kind==='landing'?'bordes':'treden',label=st.kind==='landing'?'Bordes':'Treden';
    const arms=group.flatMap(q=>ids(count,i=>q.prefix+'-arm-'+(i+1)));
    const shells=group.map(q=>q.prefix);
    const plates=group.flatMap(q=>ids(count/2,i=>q.prefix+'-wandplaat-'+(i+1)));
    const welds=group.flatMap(q=>ids(count,i=>q.prefix+'-las-'+(i+1)));
    // Two supports per plate at pitch/2 and 3pitch/2. On a free edge the
    // point-load reaction is 1.5 P (and -0.5 P on the other support).
    // Positive influence area under partial area load is 1.125 pitch.
    const dead=G*pitch/1000,live=Q*1.125*pitch/1000;
    const endForce=1.5*P;
    const maxArm=(distributed,point,fg,fq)=>fg*dead*distributed+fq*Math.max(live*distributed,endForce*point);
    const M=maxArm(L**2/2,L,g,u), V=maxArm(L,1,g,u);
    const note='Vaste inklemming aan de plaat, uitkraging tot looprand '+round(L)+' mm. Randpuntlast 1,5 Qk op de buitenste arm, 0,5 Qk oplichting op de volgende. Koker '+w+' × '+h+' × '+t+' mm.';
    const armM=r.check(key+'-arm-buiging',label+' · buigspanning koker','UGT',M/W,p.armFd,'MPa',note,arms);
    const armV=r.check(key+'-arm-dwarskracht',label+' · dwarskracht koker','UGT',V/1000,p.armVRd,'kN',note,arms);
    const armMV=r.check(key+'-arm-interactie',label+' · gecombineerde doorsnedetoets koker','UGT',
      M/(W*positive(p.armFd))+V/(1000*positive(p.armVRd)),1,'–',
      'Lineaire omhullende M/MRd + V/VRd voor de netto kokerdoorsnede. Onderbouw de toepasbaarheid in de projectnota.',arms);
    // Include shear displacement using two webs and conservative G >= E/3
    // for isotropic steel. Loads on the wooden tip act with their actual lever.
    // Report flexure at the end of the steel under the walking surface.
    const Aweb=2*t*(h-2*t),GA=(5/6)*Aweb*p.armE/3,La=L-cover;
    const fd=La**2*(6*L**2-4*L*La+La**2)/(24*EI)+(L*La-La**2/2)/GA;
    const fp=La**2*(3*L-La)/(6*EI)+La/GA;
    const armD=r.check(key+'-arm-vervorming',label+' · verticale verplaatsing stalen arm','BGT',maxArm(fd,fp,1,1),p.designLimit,'mm',
      note+' Elastische buig- en schuifvervorming tot het einde van de oplegstrook, exclusief plaatrotatie en houtvervorming.',arms);
    const weldMoment=r.check(key+'-las-moment',label+' · moment op kokerlas','UGT',M/1e6,p.weldMRd,'kNm',
      'Moment aan de voorzijde van de wandplaat per koker, inclusief de blinde tip.',welds,true);
    const weldShear=r.check(key+'-las-dwarskracht',label+' · afschuiving kokerlas','UGT',V/1000,p.weldVRd,'kN',
      'Verticale kracht per rondomlas inclusief de excentrische randpuntlast.',welds,true);
    const weldFit=r.check(key+'-las-plaatrand',label+' · ruimte voor las op wandplaat','Detail',p.armWeldLeg,
      Math.min((pitch-w)/2-4,(st.rowSpacing+34-h)/2),'mm',
      'Kleinste geometrische afstand tussen koker en plaatrand, inclusief de 4 mm terugliggende rand aan beide plaatuiteinden.',welds);
    const weldCheck=r.check(key+'-las',label+' · kokerlas en plaat','UGT',
      M/(positive(p.weldMRd)*1e6)+V/(positive(p.weldVRd)*1000),1,'–',
      'Rondomlas met beenlengte '+p.armWeldLeg+' mm. Lineaire interactie M/MRd + V/VRd, met projectweerstanden voor las, kokerwand en wandplaat.',welds,true);
    const timberWidth=p.skinStrip<=Math.min(p.width,st.d)?positive(p.skinStrip):NaN;
    const woodMoment=(fg,fq)=>Math.max(bending((fg*G+fq*Q)*timberWidth/1000,0,pitch,pitch/2),
      bending(fg*G*timberWidth/1000,fq*P,pitch,pitch/2));
    r.check(key+'-huls-buiging',label+' · buiging bovenhuid tussen armen','UGT',6*woodMoment(g,u)/(timberWidth*timberHeight**2),p.skinFd,'MPa',
      'Eenrichtingsstrook dwars op de kokers, h.o.h. '+round(pitch)+' mm, rand '+round(pitch/2)+' mm, netto huid '+round(timberHeight)+' mm.',shells);
    r.check(key+'-huls-doorbuiging',label+' · vervorming bovenhuid tussen armen','BGT',
      deflectionBound(woodMoment(1,1),pitch,pitch/2,positive(p.skinE)*timberWidth*timberHeight**3/12),p.designLimit,'mm',
      'Bovengrens op elastische verplaatsing ten opzichte van kokeropleggingen. E en strookbreedte zijn projectspecifiek voor deze draagrichting.',shells);
    // Group equilibrium at the back face of the plate. For a point at a
    // longitudinal edge include in-plane torsion about the group centroid.
    const width=2*pitch,area=p.width*width/1e6, yc=plateT+p.wallGap+p.width/2, ymax=plateT+L;
    const groupV=g*G*area+u*Math.max(Q*area,P/1000);
    const groupM=(g*G*area*yc+u*Math.max(Q*area*yc,P/1000*ymax))/1000;
    const lever=p.wallLever<=st.rowSpacing?positive(p.wallLever):NaN;
    const N=groupM*1000/lever;
    const boltRadius=Math.hypot(st.rowSpacing,width-44)/2;
    // Bound torque from either a half-loaded panel or an edge point.
    const torsion=u*Math.max(Q*area*width/8,P/1000*width/2);
    const Veff=groupV+torsion/boltRadius;
    const detail='Vier Ø12-ankers, plaatgaten Ø13,2 mm, horizontaal h.o.h. '+round(width-44)+' mm, verticaal '+round(st.rowSpacing)+' mm, modelinbedding '+p.anchorEmbed+' mm. Hefboom tot de drukzone moet aangetoond zijn en mag de rijafstand niet overschrijden.';
    const vCheck=r.check(key+'-wand-afschuiving',label+' · afschuiving en torsie op vier ankers','UGT',Veff,p.wallGroupVRd,'kN',
      detail+' Elastisch starre plaat. Bovengrens equivalente groepsschuif V + |T|/r voor de ongunstigste hoek.',plates,true);
    const nCheck=r.check(key+'-wand-trek',label+' · trek op de bovenste ankerrij','UGT',N,p.wallRowNRd,'kN',
      detail+' Trekrij N = M / z, beoordeel wrikken en de twee ankers als groep.',plates,true);
    const nvCheck=r.check(key+'-wand-interactie',label+' · gecombineerde wandverankering','UGT',
      N/positive(p.wallRowNRd)+Veff/positive(p.wallGroupVRd),1,'–',detail+' Lineaire omhullende, inclusief spreiding, randbreuk, montage en plaatwerking in het detailrapport.',plates,true);
    const transfer=r.open(key+'-huls-fixatie',label+' · overdracht huls naar koker',
      'Beoordeel contactdruk, oplichten, kruip, rand- en hoeklast, het blinde uiteinde en de gezamenlijke vervorming inclusief wandrotatie. Bij doorgaande bordeshulzen ook de verdeling tussen armparen.',shells);
    for(const q of group) for(let i=0;i<count;i+=2) {
      const plate=q.prefix+'-wandplaat-'+(i/2+1),anchorIds=ids(4,j=>plate+'-anker-'+j);
      const pairArms=ids(2,j=>q.prefix+'-arm-'+(i+j+1));
      const pairWelds=ids(2,j=>q.prefix+'-las-'+(i+j+1));
      const heads=ids(4,j=>plate+'-kop-'+j);
      r.connect(plate,q.label+' · wandplaat '+(i/2+1),[plate,...anchorIds,...heads,...pairWelds,...pairArms],
        [plate,...anchorIds,...pairWelds],[vCheck,nCheck,nvCheck,weldMoment,weldShear,weldCheck,weldFit],detail+' Hoeklas rondom, beenlengte '+p.armWeldLeg+' mm.');
      const shims=ids(2,j=>q.prefix+'-opleg-'+(i+j+1));
      r.connect(plate+'-huls',q.label+' · oplegging op kokerpaar '+(i/2+1),[q.prefix,...pairArms,...shims],shims,
        [armM,armV,armMV,armD,transfer],'Oplegstroken 1 mm op twee kokers. '+(free?'Doorgaande uitsparing aan de vrije zijde.':'Blinde uitsparing, houtdekking '+p.tipCover+' mm.'));
    }
  }
  if(p.guard!=='none') r.open('wand-balustrade','Leuning- en balustradelasten','Verifieer de gekozen handregel- en hekverbinding voor de horizontale en excentrische lasten met de draagwand of de vrije kokeruiteinden.',
    s.parts.filter(q=>q.id.includes('-juk')||q.id.startsWith('wandrozet-')).map(q=>q.id));
  r.notes.push('Elastische kokerdoorsnede met scherpe hoeken volgens de modelmaten. Onderbouw netto doorsnede, lokale instabiliteit, schuif en dynamisch comfort in de projectnota. Gk op het loopvlak moet ook arm, plaat en overige eigen gewichten dekken.');
  return r.finish();
}
