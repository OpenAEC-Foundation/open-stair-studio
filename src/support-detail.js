// Rmax is the envelope of the ULS reaction on one entire support of the assessed tread, in kN.
// The project supplies effective contact, force distribution and design capacities for that detail.
const systems = ['glass', 'clt', 'grating'];
const mechanicalSystems = ['clt', 'grating'];
const group = 'Lokale toets van het oplegdetail';
const modes = [
  ['whole', 'Complete aansluiting'],
  ['bearing', 'Complete aansluiting en oplegdruk'],
  ['fasteners', 'Complete aansluiting en afschuifbevestigers'],
  ['series', 'Oplegdruk en afschuifbevestigers in serie']
];
const modeOf = input => input.supportDetailMode === undefined ? 'whole' : input.supportDetailMode;
const needsBearing = input => modeOf(input) === 'bearing' || (modeOf(input) === 'series' && mechanicalSystems.includes(input.structureType));
const needsFasteners = input => mechanicalSystems.includes(input.structureType) && ['fasteners', 'series'].includes(modeOf(input));
const needsDetails = input => needsBearing(input) || needsFasteners(input);
const positive = x => Number.isFinite(x) && x > 0;
const written = x => typeof x === 'string' && x.trim().length > 0;

function text(key, label, hint, visible) {
  return { key, label, unit: '', type: 'text', systems, group, hint, visible };
}

function quantity(key, label, unit, hint, visible, range = {}) {
  return { key, label, unit, type: 'number', systems, group, hint, visible, min: 0, exclusiveMin: true, ...range };
}

export const supportDetailFields = [
  { key: 'supportDetailMode', label: 'Draagpad bij de oplegging', type: 'select', group, systems, unit: '',
    options: modes, default: 'whole',
    hint: 'Bij alle draagpaden blijft de verticale weerstand van de complete aansluiting vereist. Kies serie als dezelfde oplegreactie achtereenvolgens door beide details loopt.' },
  text('supportDetailSource', 'Bron en detailnummer', 'Berekening, testrapport of productspecificatie van het feitelijk toegepaste detail.', needsDetails),
  text('supportDetailRevision', 'Revisie van het oplegdetail', 'Revisie of gedateerde uitgave van de berekening en detailtekening.', needsDetails),
  text('supportDetailGeometry', 'Geometrie en toepasbaarheid', 'Leg per oplegzijde de maatgevende lastpositie en toleranties vast. Benoem bij druk de contactzone en eventuele drukpieken, bij bevestigers ook de hart- en randafstanden, plaatdikte en excentriciteit.', needsDetails),
  text('supportSeriesPath', 'Krachtoverdracht in serie', 'Benoem de opeenvolgende onderdelen waar de volledige reactie doorheen gaat, bijvoorbeeld trede op console en console aan wand.', input => modeOf(input) === 'series' && mechanicalSystems.includes(input.structureType)),
  quantity('bearingContactWidthMm', 'Effectieve contactbreedte in overspanningsrichting', 'mm', 'Kleinste werkelijk meewerkende breedte over beide oplegzijden, inclusief toleranties. Onderbouw deze samen met de contactlengte voor de maatgevende positie.', needsBearing),
  quantity('bearingContactLengthMm', 'Effectieve contactlengte langs de opleglijn', 'mm', 'Effectief belaste lengte op één zijde bij de ongunstigste lastpositie. Voor roosters geldt alleen het dragende contactmateriaal.', needsBearing),
  quantity('bearingPressureRd', 'Ontwerpgrens contactdruk op effectief vlak', 'N/mm²', 'Maatgevende ontwerpgrens van trede, tussenlaag en drager. De onderbouwing omvat piekdruk en randcontact bij dezelfde effectieve zone.', needsBearing),
  quantity('fastenerCount', 'Aantal meewerkende bevestigers per zijde', 'st.', 'Daadwerkelijk meewerkende stiften, schroeven of bouten van de maatgevende groep.', needsFasteners, { integer: true }),
  quantity('fastenerMaxFactor', 'Grootste afschuifkracht per bevestiger / Rmax', '–', 'Onderbouw de ongunstigste resultante voor alle lastposities en excentriciteiten. De ondergrens is 1/n; bij torsie kan de factor groter dan 1 zijn.', needsFasteners),
  quantity('fastenerShearRd', 'Ontwerpweerstand per bevestiger', 'kN', 'Laagste ontwerp-afschuifweerstand in de richting van de resultante voor de maatgevende bevestiger, inclusief materiaal- en bevestigerbezwijking en toepasselijke interacties.', needsFasteners),
  quantity('fastenerGroupRd', 'Ontwerpweerstand bevestigingsgroep per zijde', 'kN', 'Weerstand van de groep met plaatsing, rand-/hartafstanden, ondergrond en groepsreducties uit de projectonderbouwing.', needsFasteners)
];

export function supportFieldVisible(field, input) {
  return (!field.systems || field.systems.includes(input.structureType)) && (!field.visible || field.visible(input));
}

export function supportModeOptions(input) {
  return input.structureType === 'glass' ? modes.filter(([id]) => id === 'whole' || id === 'bearing') : modes;
}

export function checkSupportDetail(input, reactionKn, tread) {
  const rows = [], reasons = [];
  const result = { rows, reasons };
  const mode = modeOf(input);
  if (mode === 'whole') return result;
  if (!systems.includes(input.structureType) || !modes.some(([id]) => id === mode)) {
    reasons.push('Kies een lokaal draagpad dat bij het tredemateriaal past.');
    return result;
  }
  if (!supportModeOptions(input).some(([id]) => id === mode)) {
    reasons.push('Voor een mechanische bevestiging aan glas is een projectspecifieke berekening van de bevestiging en het glas rond de aansluiting nodig.');
    return result;
  }

  const textFields = supportDetailFields.filter(f => f.type === 'text' && supportFieldVisible(f, input));
  for (const field of textFields) if (!written(input[field.key])) reasons.push('Leg vast hoe het detail is onderbouwd bij ‘' + field.label + '’.');
  const documented = reasons.length === 0;
  const validReaction = Number.isFinite(reactionKn) && reactionKn >= 0;
  const validTread = input.support === 'two-edge' && tread?.isWinder !== true && positive(tread?.width) && positive(tread?.length);
  if (!validReaction) reasons.push('Een eindige maatgevende ontwerpoplegreactie per zijde is vereist.');
  if (!validTread) reasons.push('Een gevalideerde rechthoekige trede met breedte, diepte en twee evenwijdige opleglijnen is vereist.');

  function compare(id, label, demand, limit, unit, formula, valid) {
    const ratio = demand / limit;
    const calculable = valid && validReaction && validTread && Number.isFinite(demand) && demand >= 0 && positive(limit) && Number.isFinite(ratio);
    if (valid && validReaction && validTread && !calculable) reasons.push('Controleer het numerieke bereik van ‘' + label + '’.');
    let status = 'open';
    if (calculable) status = ratio > 1 ? 'fail' : documented ? 'pass' : 'open';
    rows.push({ id, label, demand: calculable ? demand : null, limit: calculable ? limit : null,
      unit, ratio: calculable ? ratio : null, status, caseLabel: 'Maatgevende ontwerpoplegreactie per zijde', formula });
  }

  if (needsBearing(input)) {
    const { bearingContactWidthMm: width, bearingContactLengthMm: length, bearingPressureRd: limit } = input;
    const within = validTread && width <= tread.width / 2 && length <= tread.length;
    const area = width * length;
    const valid = [width, length, area, limit].every(positive) && within;
    if (![width, length, area, limit].every(positive)) reasons.push('Vul een positieve effectieve contactbreedte, contactlengte en ontwerpgrens voor druk in.');
    if (validTread && positive(width) && positive(length) && !within) reasons.push('De effectieve contactlengte moet binnen de tredediepte passen. De gemeenschappelijke contactbreedte per zijde mag geen overlap tussen beide oplegzones geven.');
    compare('bearing-pressure', 'UGT · druk op de effectieve contactzone', (reactionKn / area) * 1000, limit, 'N/mm²',
      'pEd = 1000 · Rmax [kN] / (beff · leff [mm²]). De kleinste onderbouwde effectieve zone geldt voor de ongunstigste lastpositie aan beide zijden.', valid);
  }

  if (needsFasteners(input)) {
    const { fastenerCount: count, fastenerMaxFactor: factor, fastenerShearRd: single, fastenerGroupRd: groupRd } = input;
    const validCount = Number.isSafeInteger(count) && count >= 1;
    const validDistribution = validCount && positive(factor) && factor >= 1 / count;
    if (!validCount) reasons.push('Vul een positief geheel aantal meewerkende bevestigers per oplegzijde in.');
    if (!positive(factor) || (validCount && factor < 1 / count)) reasons.push('De grootste afschuifkrachtfactor moet onderbouwd, positief en ten minste 1/n zijn.');
    if (!positive(single)) reasons.push('Vul de ontwerpweerstand in van de zwakste meewerkende bevestiger.');
    if (!positive(groupRd)) reasons.push('Vul de ontwerpweerstand van de hele bevestigingsgroep per zijde in.');
    compare('fastener-shear', 'UGT · zwaarst belaste afschuifbevestiger', reactionKn * factor, single, 'kN',
      'VEd,max = Rmax · projectfactor voor de grootste resultante per bevestiger. De krachtverdeling omvat de excentrische lastposities.', validDistribution && positive(single));
    compare('fastener-group', 'UGT · bevestigingsgroep', reactionKn, groupRd, 'kN',
      'VEd,groep = Rmax. De ontwerpgroepsweerstand geldt voor het gedocumenteerde patroon en de maatgevende excentriciteit.', validCount && positive(groupRd));
  }
  return result;
}
