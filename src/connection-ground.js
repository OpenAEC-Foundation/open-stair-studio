export const groundTypes=[['unknown','Nog te bepalen'],['concrete-cracked','Gescheurd beton'],['concrete-uncracked','Ongescheurd beton'],['masonry','Metselwerk'],['steel','Staal'],['timber','Hout'],['other','Andere ondergrond']];

export function readConnectionGround(value) {
  if(value==null)return {};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>500)throw new Error('Ongeldige ondergrondgegevens.');
  const result={};
  for(const [id,plan] of Object.entries(value)){
    if(!/^[A-Za-z0-9_-]{1,90}$/.test(id)||!plan||typeof plan!=='object'||Array.isArray(plan))throw new Error('Ongeldige ankergroep.');
    if(!groundTypes.some(([key])=>key===plan.type))throw new Error('Ongeldig ondergrondtype.');
    for(const key of ['reference','grade'])if(typeof plan[key]!=='string'||plan[key].length>160)throw new Error('Ongeldige ondergrondreferentie.');
    for(const key of ['edgeMm','spacingMm','tensionRd','shearRd'])if(!Number.isFinite(plan[key])||plan[key]<0||plan[key]>100000)throw new Error('Ongeldige ondergrondmaat of weerstand.');
    result[id]={type:plan.type,reference:plan.reference,grade:plan.grade,edgeMm:plan.edgeMm,
      spacingMm:plan.spacingMm,tensionRd:plan.tensionRd,shearRd:plan.shearRd};
  }
  return result;
}

export function applyConnectionGround(structural,ground={},parts=[]) {
  if(!structural)return structural;
  const checks=structural.checks.map(check=>({...check}));
  const byPart=new Map(parts.map(part=>[part.id,part]));
  const connections=structural.connections.map(connection=>{
    const plan=ground[connection.id];
    if(!connection.partIds.some(id=>id.includes('anker')&&!id.includes('ankerkop')))return connection;
    const parts=connection.partIds.filter(id=>id.includes('anker')&&!id.includes('ankerkop'));
    const centers=connection.partIds.map(id=>byPart.get(id)).filter(part=>part?.fastenerType==='ANCHORBOLT').map(part=>{
      const b=boundsOf([part]);return {x:(b.xmin+b.xmax)/2,y:(b.ymin+b.ymax)/2,z:(b.zmin+b.zmax)/2};
    });
    const distances=centers.flatMap((a,i)=>centers.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z))).filter(n=>n>0.01);
    const measured=distances.length?Math.min(...distances):null;
    const spacingMatches=measured===null||Math.abs(plan?.spacingMm-measured)<1;
    const complete=plan&&plan.type!=='unknown'&&plan.reference.trim()&&plan.grade.trim()&&plan.edgeMm>0&&plan.spacingMm>0&&plan.tensionRd>0&&plan.shearRd>0&&spacingMatches;
    const id=connection.id+'-ondergrond';
    checks.push({id,label:connection.label+' · ondergrondgegevens',phase:'Detail',status:complete?'pass':'open',
      demand:null,capacity:null,unit:'',partIds:parts,
      note:complete?'Ondergrond '+plan.type+' '+plan.grade+', randafstand '+plan.edgeMm+' mm, h.o.h. '+plan.spacingMm+' mm, groepsweerstanden N,Rd '+plan.tensionRd+' kN en V,Rd '+plan.shearRd+' kN. '+plan.reference:
        'Leg per ankergroep ondergrond, randafstand, productrapport en weerstanden vast. '+(spacingMatches?'':'De ingevoerde kleinste h.o.h. wijkt af van de getekende '+measured.toFixed(1)+' mm.')});
    const named=connection.checkIds.map(key=>checks.find(c=>c.id===key)).filter(Boolean);
    const tension=named.find(c=>/anker-trek$|wand-trek$|^kop-.*-trek$/.test(c.id));
    const shear=named.find(c=>/anker-afschuiving$|wand-afschuiving$|^kop-.*-reactie$/.test(c.id));
    const steelGroup=connection.id.includes('voet')&&(connection.id.startsWith('vlucht')||connection.id.includes('bordes-voet'));
    const extra=[];
    for(const [name,source,capacity] of [['trek',tension,plan?.tensionRd],['afschuiving',shear,plan?.shearRd]]){
      const key=connection.id+'-ondergrond-'+name;
      checks.push({id:key,label:connection.label+' · '+name+' ondergrond',phase:'UGT',
        demand:!steelGroup&&Number.isFinite(source?.demand)?source.demand:null,capacity:capacity>0?capacity:null,unit:'kN',
        status:!steelGroup&&complete&&source?.status!=='open'&&Number.isFinite(source?.demand)?source.demand<=capacity?'pass':'fail':'open',
        note:steelGroup?'Staalmodel geeft de maatgevende individuele ankerkracht. De opgegeven groepsweerstand vereist een aparte groepsvraag inclusief momenten, torsie, randrichting en beïnvloeding volgens productrapport.':
          'Groepsweerstand uit opgegeven productrapport voor de werkelijke ondergrond en configuratie.',
        partIds:parts});
      extra.push(key);
    }
    const combined=connection.id+'-ondergrond-interactie';
    const demand=Number.isFinite(tension?.demand)&&Number.isFinite(shear?.demand)&&plan?.tensionRd>0&&plan?.shearRd>0?
      tension.demand/plan.tensionRd+shear.demand/plan.shearRd:null;
    checks.push({id:combined,label:connection.label+' · trek en afschuiving ondergrond',phase:'UGT',demand:steelGroup?null:demand,
      capacity:1,unit:'–',status:!steelGroup&&complete&&tension?.status!=='open'&&shear?.status!=='open'&&demand!==null?
        demand<=1?'pass':'fail':'open',partIds:parts,
      note:'Lineaire groepsinteractie NEd/NRd + VEd/VRd. Geldigheid voor de ondergrond en het ankerproduct moet in het rapport staan.'});
    extra.push(combined);
    return {...connection,checkIds:[...connection.checkIds,id,...extra],ground:plan??null};
  });
  return {...structural,checks,connections,status:checks.some(c=>c.status==='fail')?'fail':checks.some(c=>c.status==='open')?'open':'pass'};
}
import {boundsOf} from './components/solids.js';
