const choice = (key, label, options) => ({ key, label, type: 'select', options, default: options[0][0] });
const width = (key, label, hint) => ({ key, label, unit: 'mm', hint, min: 0 });

export const escapeFields = [
  choice('escapeFunction', 'Toepassing volgens Bbl-tabel 4.73', [
    ['unconfirmed', 'Selecteer de toepasselijke situatie'],
    ['listed', 'Gebruiksfunctie waarvoor artikel 4.80 lid 1 is aangewezen'],
    ['other', 'Woonfunctie, bouwwerk geen gebouw zijnde of andere situatie']
  ]),
  { key: 'escapePersons', label: 'Op dit gedeelte aangewezen personen', unit: 'pers.', integer: true, min: 1,
    hint: 'Neem bij samenkomende stromen het totale aantal personen na samenkomst.' },
  width('escapeWidth', 'Kleinste gemeten vrije trapbreedte', 'Meet de vrije doorgang tussen obstakels, inclusief leuningen.'),
  { ...width('escapeWinderWidth', 'Meetellende vrije breedte bij verdreven treden', 'Kleinste doorlopende vrije strook waarin de aantrede op iedere trede ten minste 170 mm is. Leg de maatvoering vast op de tekening.'), winder: true },
  choice('escapeSection', 'Mee te rekenen onderdelen met dezelfde bezetting', [
    ['stair', 'Alleen deze trap'], ['room', 'Trap en ruimte / bordes'],
    ['door', 'Trap en doorgang'], ['room-door', 'Trap, ruimte / bordes en doorgang']
  ]),
  { ...width('escapeRoomWidth', 'Vrije breedte maatgevende ruimte', 'Gebruik de kleinste breedte van de meegenomen ruimten of bordessen.'), part: 'room' },
  { ...choice('escapeDoor', 'Maatgevende doorgang', [
    ['unconfirmed', 'Selecteer het type doorgang'],
    ['double', 'Dubbele deur, maximale openingshoek kleiner dan 135°'],
    ['single', 'Enkele deur, maximale openingshoek kleiner dan 135°'],
    ['other', 'Andere doorgang, bijvoorbeeld een deur die ten minste 135° opent']
  ]), part: 'door' },
  { ...width('escapeDoorWidth', 'Vrije breedte van de doorgang', 'Meet de werkelijke vrije breedte bij geopende deur.'), part: 'door' }
];

export const escapeScope = 'Nederlandse nieuwbouw, Bbl artikel 4.80 lid 1 en tabel 4.73. De uitkomst geldt in personen voor de opgegeven trap en geselecteerde delen met dezelfde bezetting. Opvang, gefaseerde ontruiming en routeverdeling vragen een afzonderlijke beoordeling.';
export const escapeReference = { title: 'IPLO · Vluchten bij brand (nieuwbouw), hoofdstuk 4', url: 'https://iplo.nl/publish/pages/245968/vluchten-bij-brand-nieuwbouw-bbl.pdf' };

export function checkEscapeCapacity(input, model, geometry) {
  const result = { status: 'open', scope: escapeScope, reasons: [], rows: [], capacity: null, governing: [] };
  if (input.use === 'regular') return { ...result, status: 'na' };
  if (model.regulatory?.profile === 'NL_NEW_HOME' || input.escapeFunction === 'other') {
    return { ...result, status: 'na', reasons: ['Voor deze gebruikscontext volgt geen getalsmatige uitkomst uit artikel 4.80 lid 1. Beoordeel de aangewezen voorschriften voor het project.'] };
  }
  if (!['NL_NEW_EGRESS', 'NL_NEW_GENERAL'].includes(model.regulatory?.profile) || model.regulatory?.construction !== 'new' || input.escapeFunction !== 'listed') {
    result.reasons.push('Selecteer het Nederlandse nieuwbouwprofiel en leg vast dat tabel 4.73 voor de gebruiksfunctie artikel 4.80 lid 1 aanwijst.');
    return result;
  }
  if ((input.use === 'escape-only') !== (model.regulatory.profile === 'NL_NEW_EGRESS')) {
    result.reasons.push('Stem het gebruik van de trap en het maatprofiel voor uitsluitend ontvluchten op elkaar af.');
    return result;
  }
  const { width: overall, stringerThickness, going, floorHeight } = model.stair;
  const betweenStringers = overall - 2 * stringerThickness;
  const winder = geometry?.dimensions?.family?.winder === true;
  const people = input.escapePersons;
  const widths = winder ? geometry.treads.map(t => t.eligibleAt170Mm) : [];
  const modelBand = widths.length && widths.every(Number.isFinite) ? Math.min(betweenStringers, ...widths) : null;
  result.modelBandLimitMm = modelBand;
  if (!Number.isInteger(people) || people < 1) result.reasons.push('Vul de bezetting van dit gedeelte in.');
  if (!input.escapeBasis?.trim()) result.reasons.push('Leg de bezettingsstaat, gebruiksfunctie en gemeten route vast bij Uitgangspunten vluchtroute.');
  if (!(betweenStringers > 0 && floorHeight > 0 && geometry?.treads?.length)) result.reasons.push('Voltooi eerst de geometrie van de trap.');
  function component(id, label, mm, rate) {
    const capacity = Math.floor(mm * rate / 1000);
    result.rows.push({ id, label, widthMm: mm, rate, capacity, persons: people, status: people == null ? 'open' : people <= capacity ? 'pass' : 'fail' });
  }
  if (input.escapeWidth == null || input.escapeWidth > betweenStringers) {
    result.reasons.push('Geef de kleinste vrije trapbreedte op, maximaal de afstand tussen de binnenzijden van de gemodelleerde wangen.');
  } else if (winder && (input.escapeWinderWidth == null || input.escapeWinderWidth > input.escapeWidth || modelBand == null || input.escapeWinderWidth > modelBand + 1e-7)) {
    result.reasons.push('Meet bij de verdreven treden de vrije strook met minstens 170 mm aantrede. Deze kan de gemeten vrije trapbreedte niet overschrijden.');
    if (modelBand != null) result.reasons.push(`Volgens de tredecontouren is op de maatgevende neus ten hoogste ${Math.floor(modelBand + 1e-7)} mm beschikbaar op hele millimeters.`);
  } else if (geometry?.treads?.length && floorHeight > 0) {
    // The polygon test already includes the straight portions of winding
    // stairs. Straight-flight models have an exact nominal going.
    const eligible = winder ? input.escapeWinderWidth : going < 170 ? 0 : input.escapeWidth;
    component('stair', 'Trap · hoogteverschil ' + floorHeight + ' mm', eligible, floorHeight > 1000 ? 45 : 90);
  }
  if (input.escapeSection.includes('room')) {
    if (input.escapeRoomWidth == null) result.reasons.push('Vul de vrije breedte van de geselecteerde ruimte in.');
    else component('room', 'Ruimte / bordes', input.escapeRoomWidth, 90);
  }
  if (input.escapeSection.includes('door')) {
    const rate = { double: 90, single: 110, other: 135 }[input.escapeDoor];
    if (!rate || input.escapeDoorWidth == null) result.reasons.push('Geef het type en de vrije breedte van de geselecteerde doorgang op.');
    else component('door', 'Doorgang', input.escapeDoorWidth, rate);
  }
  if (result.rows.some(r => r.status === 'fail')) result.status = 'fail';
  if (result.reasons.length || !result.rows.length) return result;
  result.capacity = Math.min(...result.rows.map(r => r.capacity));
  result.governing = result.rows.filter(r => r.capacity === result.capacity).map(r => r.id);
  result.status = people <= result.capacity ? 'pass' : 'fail';
  return result;
}
