// Preliminary equal-share demand for the four landing-frame joints. This is
// not a Eurocode timber joint design or a host-anchor verification.
export function checkLandingJoints(model,geometry) {
  const landing=geometry.landings?.[0];
  const joints=geometry.landingJoints??[];
  const fasteners=geometry.landingFasteners??[];
  if(!landing||!joints.length)return {status:'not-applicable',reasons:[],fasteners:0};
  const reasons=[];
  const areaM2=(landing.area??landing.length*landing.width)/1e6;
  const areaLoad=model.engineering?.loadArea;
  const pointLoad=model.engineering?.loadPoint;
  if(areaLoad==null||pointLoad==null)reasons.push('Vul de vlaklast en de puntlast in het Engineeringdossier in.');
  if(!fasteners.length)reasons.push('Er zijn geen schroeven met geldige boorpunten op de stuiknaden.');
  const declaredRd=Number(model.stair.landingScrewShearRd)||0;
  if(!(declaredRd>0))reasons.push('Leg de ontwerpwaarde van de schuifweerstand per schroef vast voor dit product en deze houtverbinding.');
  const elasticModulus=Number(model.stair.landingTimberE)||0;
  const bendingRd=Number(model.stair.landingTimberFmRd)||0;
  const deflectionRatio=Number(model.stair.landingDeflectionRatio)||300;
  if(!(elasticModulus>0&&bendingRd>0))reasons.push('Leg E-modulus en ontwerpbuigsterkte van de randliggers vast.');
  const totalLoad=areaLoad==null||pointLoad==null?null:areaLoad*areaM2+pointLoad;
  const jointDemand=totalLoad===null?null:totalLoad/joints.length;
  const screwDemand=jointDemand===null||!fasteners.length?null:jointDemand/(fasteners.length/joints.length);
  const utilization=screwDemand===null||!(declaredRd>0)?null:screwDemand/declaredRd;
  const memberChecks=(geometry.landingFrame??[]).map(member=>{
    const span=member.length;
    const q=areaLoad==null?null:areaLoad*areaM2*1000/(4*span);
    const p=pointLoad==null?null:pointLoad*1000/4;
    const moment=q==null||p==null?null:q*span**2/8+p*span/4;
    const sectionModulus=member.width*member.thickness**2/6;
    const inertia=member.width*member.thickness**3/12;
    const bendingStress=moment==null?null:moment/sectionModulus;
    const deflection=moment==null||!(elasticModulus>0)?null:
      5*q*span**4/(384*elasticModulus*inertia)+p*span**3/(48*elasticModulus*inertia);
    const deflectionLimit=span/deflectionRatio;
    return {id:member.id,span,q,p,moment,bendingStress,deflection,deflectionLimit,
      bendingUtilization:bendingStress==null||!(bendingRd>0)?null:bendingStress/bendingRd,
      deflectionUtilization:deflection==null?null:deflection/deflectionLimit};
  });
  const over=utilization>1||memberChecks.some(member=>member.bendingUtilization>1||member.deflectionUtilization>1);
  return {status:over?'over':reasons.length?'open':'within-input',
    reasons,areaM2,totalLoad,jointDemand,screwDemand,declaredRd,utilization,
    fasteners:fasteners.length,memberChecks,elasticModulus,bendingRd,deflectionRatio,
    scope:'Vlaklast × bordesoppervlak + puntlast, gelijk over vier eenvoudig opgelegde randliggers en de schroeven verdeeld. Liggerbuiging en doorbuiging zijn lineair elastisch berekend. Eigengewicht, plaatafdracht, excentriciteit, trek, uittrekken, verbindingstijfheid, randafstanden volgens productgoedkeuring en gebouwankers zijn niet getoetst.'};
}
