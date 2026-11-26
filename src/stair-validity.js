import { isWinder, winderIssues } from './winder.js';

export function treadClearanceIssue(stair, d, system='timber') {
  const free=d.rise-stair.treadThickness;
  const mm=n=>n.toLocaleString('nl-NL',{maximumFractionDigits:3})+' mm';
  if (!(Number.isFinite(free) && d.rise>0)) return null;
  if (system==='timber' && stair.riserBoards==='closed' && free<=0) {
    return { title:'Geen ruimte voor gesloten stootborden',
      detail:`De optrede is ${mm(d.rise)} en de trede is ${mm(stair.treadThickness)} dik. De vrije stootbordhoogte is ${mm(free)}. Verlaag de trededikte of vergroot de optrede.` };
  }
  if (free<0 && stair.nosing>0 && d.treadCount>1) {
    return { title:'Overlappende treden',
      detail:`Bij het neusoverstek van ${mm(stair.nosing)} overlappen opeenvolgende tredecontouren verticaal met ${mm(-free)}. Verklein de trededikte, vergroot de optrede of pas het neusoverstek aan.` };
  }
  return null;
}

export function geometryErrors(stair, d, system='timber') {
  const findings = [];
  const add = (title, detail) => findings.push({ level: 'error', title, detail, reference: 'Geometrische invoer' });
  const clearance=treadClearanceIssue(stair,d,system);
  if(clearance) add(clearance.title,clearance.detail);
  if(system==='timber' && stair.riserBoards==='closed' && stair.wellatType==='chamfered' &&
    (stair.wellatWidth>stair.nosing-stair.riserThickness || stair.wellatHeight>d.rise-stair.treadThickness))
    add('Wellat past niet onder de trede','Controleer de breedte onder de vrije neus (overstek min stootborddikte) en de hoogte tussen de treden.');
  if(system==='timber' && ['round','bevel'].includes(stair.noseProfile) && !(stair.noseSize>0 && stair.noseSize<stair.treadThickness))
    add('Neusprofiel past niet in de trede','Kies een profielmaat tussen nul en de trededikte zodat er een rechte voorzijde onder het profiel blijft.');
  if (![stair.floorHeight, stair.width, stair.going, stair.risers].every(value => Number.isFinite(Number(value)) && Number(value) > 0)) {
    add('Ongeldige of ontbrekende maat', 'Hoogte, breedte, aantrede en aantal optredes moeten geldige positieve getallen zijn.');
  }
  if (!Number.isInteger(Number(stair.risers)) || Number(stair.risers) < d.flightCount * 2) {
    add('Te weinig optredes voor deze trapfamilie', `Deze trap heeft minimaal ${d.flightCount * 2} optredes nodig om alle vluchten op te bouwen.`);
  }
  if (Number(stair.width) <= 2 * Number(stair.stringerThickness)) {
    add('Geen ruimte voor de treden', 'De buitenwerkse breedte moet groter zijn dan de som van beide trapboomdiktes.');
  }
  if (Number(stair.going)+Number(stair.nosing)<50)
    add('Trede te kort','De terugliggende neus laat minder dan 50 mm tredevlak over. Verklein de terugligging of vergroot de aantrede.');
  if((stair.stringerLeft==='cut'||stair.stringerRight==='cut') &&
    Number(stair.stringerThickness)+Number(stair.stringerOverhang)<10)
    add('Trede mist keepboom','De trederand ligt te ver binnen de boom: er blijft minder dan 10 mm oplegvlak op de keep over.');
  if(isWinder(stair.type)&&(stair.stringerLeft==='cut'||stair.stringerRight==='cut'))
    add('Keepboom bij verdreven treden','De keepverdeling van een verdreven trede vraagt een afzonderlijke raildoorsnede. Kies voor deze trap twee ingekroosde segmentbomen.');
  if (d.flightCount > 1 && Number(stair.landingLength) < Number(stair.width)) {
    add('Bordeslengte te klein voor deze trapfamilie', 'Voor dit model moet de bordeslengte minstens gelijk zijn aan de buitenwerkse trapbreedte.');
  }
  if(d.flightCount>1 && stair.landingRiser && (stair.landingRiser<2 || stair.landingRiser>stair.risers-2)){
    add('Bordespeil buiten vluchtbereik','Kies minstens twee optredes onder en boven het bordes.');
  }
  if(d.flightCount>1 && stair.landingFrame==='perimeter' &&
    2*Number(stair.landingFrameWidth)>=Math.min(Number(stair.width),Number(stair.landingLength))){
    add('Bordesraam past niet','Kies een smallere randligger of vergroot het bordes.');
  }
  if(d.flightCount>1&&stair.landingFrame==='perimeter'&&stair.landingScrewsPerJoint>0&&
    (!(stair.landingScrewLength>stair.landingFrameWidth+2*stair.landingScrewDiameter) ||
      !(stair.landingScrewLength<stair.width-stair.landingFrameWidth) ||
      stair.landingFrameDepth-50<(stair.landingScrewsPerJoint-1)*3*stair.landingScrewDiameter)){
    add('Bordesschroeven passen niet','Controleer schroeflengte, indringing, onderlinge afstand en randafstand van de randliggers.');
  }
  if (isWinder(stair.type)) {
    for (const message of winderIssues(stair)) add('Verdrijving aanpassen', message);
  }
  return findings;
}
