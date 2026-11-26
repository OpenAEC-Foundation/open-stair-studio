import { checkSupportDetail, supportDetailFields } from './support-detail.js';

const glass = ['glass'];
const grating = ['grating'];
const clt = ['clt'];
const plate = ['glass', 'clt'];
const number = (key, label, unit, group, systems, hint, range = {}) => ({
  key, label, unit, group, systems, hint, type: 'number', min: 0, exclusiveMin: true, ...range,
});
const reference = (key, label, group, systems, hint) => ({ key, label, group, systems, hint, unit: '', type: 'text' });
const common = 'Rekengrondslagen';
const detail = 'Oplegging en verbinding';
const lamination = 'Gelaagd glas';
const bars = 'Stalen draagstaaf';
const timber = 'CLT-plaat';

const sectionFields = [
  reference('designBasis', 'Referentie belastingen en rekenmodel', common, undefined, 'Document, revisie, norm en nationale bijlage. Inclusief combinaties, locatie en lastvlak.'),
  number('deadArea', 'Permanente belasting inclusief eigen gewicht', 'kN/m²', common),
  number('gammaG', 'UGT-factor permanente belasting', '–', common, undefined, 'Ongunstig, voor de gekozen combinatie.', { min: 1, exclusiveMin: false }),
  number('gammaQ', 'UGT-factor veranderlijke belasting', '–', common, undefined, 'Voor zowel vlaklast als puntlast.', { min: 1, exclusiveMin: false }),
  number('deflectionLimitMm', 'Toelaatbare totale doorbuiging', 'mm', common, undefined, 'Projectgrens bij karakteristieke combinatie, voor CLT inclusief eindvervorming.'),
  number('pointPatchLengthMm', 'Lastvlak langs de overspanning', 'mm', common),
  number('pointPatchWidthMm', 'Lastvlak in de looprichting', 'mm', common),
  number('patchRd', 'Lokale ontwerpweerstand opgegeven lastvlak', 'kN', common, undefined, 'Productspecifieke extra ontwerplast boven de aanwezige permanente belasting, ook aan de maatgevende rand of hoek. Inclusief lokale schade, ponsen of contact.'),
  number('assessedThicknessMm', 'Dikte van de beoordeelde tredeopbouw', 'mm', common, undefined, 'Nominale buitenmaat uit het productrapport, gelijk aan de gemodelleerde trededikte.'),
  number('effectiveWidthMm', 'Onderbouwde effectieve strookbreedte', 'mm', common, plate, 'Conservatieve breedte voor de volledige puntlast, ook bij vrije randen en hoeken. Onderbouw in het productrapport.'),
  reference('connectionBasis', 'Referentie opleg- en verbindingsdetail', detail, undefined, 'Rapport en detailnummer. Inclusief contact, excentriciteit, lokaal belasten en de zwakste volledige overdracht naar de onderbouw.'),
  number('connectionRd', 'Verticale ontwerpweerstand per oplegzijde', 'kN', detail, undefined, 'De kleinste weerstand van de complete verbinding bij de ongunstigste positie langs de opleglijn.'),
  number('glassE', 'Elasticiteitsmodulus glas', 'N/mm²', lamination, glass),
  number('glassStressThicknessMm', 'Effectieve dikte voor buigspanning', 'mm', lamination, glass, 'Kleinste waarde over alle glasbladen en beschouwde belastinggevallen. De totale pakketdikte begrenst deze conservatieve invoer. Combineer met de laagste ontwerpsterkte.'),
  number('glassDeflectionThicknessMm', 'Effectieve dikte voor doorbuiging', 'mm', lamination, glass, 'Laagste onderbouwde waarde voor G en beide veranderlijke lasten in de projecttemperaturen.'),
  number('glassFd', 'Maatgevende ontwerpbuigsterkte', 'N/mm²', lamination, glass),
  number('glassShearRd', 'Dwarskrachtweerstand effectieve strook', 'kN', lamination, glass, 'Ontwerpwaarde voor de opgegeven breedte, opbouw en rand-/oplegsituatie.'),
  reference('glassResidualBasis', 'Rapport restdraagvermogen na breuk', lamination, glass, 'Projectgebonden beoordeling van breukscenario’s, resterend draagvermogen, contactlagen en randcondities.'),
  number('barWidthMm', 'Netto dikte draagstaaf', 'mm', bars, grating),
  number('barHeightMm', 'Netto hoogte draagstaaf', 'mm', bars, grating),
  number('barPitchMm', 'Maatgevende belastingsbreedte per draagstaaf', 'mm', bars, grating, 'Grootste tributair belaste breedte bij een verdeelde last, inclusief randstaaf. Doorgaans de h.o.h.-afstand.'),
  number('steelE', 'Elasticiteitsmodulus staal', 'N/mm²', bars, grating),
  number('steelFd', 'Ontwerpbuigsterkte netto draagstaaf', 'N/mm²', bars, grating, 'Onderbouw de toepasbaarheid op netto doorsnede, inkepingen, zijdelingse stabiliteit en vrije randstaven.'),
  number('barShearRd', 'Ontwerpdwarskrachtweerstand per draagstaaf', 'kN', bars, grating),
  number('cltEI', 'Effectieve buigstijfheid per meter', 'kN·m²/m', timber, clt, 'EI uit de schuifanalogiemethode in de draagrichting, uitsluitend de buigbijdrage.'),
  number('cltGA', 'Effectieve schuifstijfheid per meter', 'kN/m', timber, clt, 'GA inclusief schuifcorrectie en rolafschuiving van de dwarslagen.'),
  number('cltMRd', 'Ontwerpbuigweerstand per meter', 'kN·m/m', timber, clt, 'Netto doorsnede in de draagrichting, voor de ongunstigste gebruiksklasse en lastduur.'),
  number('cltVRd', 'Ontwerpdwarskrachtweerstand per meter', 'kN/m', timber, clt, 'Neem de kleinste waarde inclusief rolafschuiving en de werkelijke randcondities.'),
  number('cltKdef', 'Vervormingsfactor kdef', '–', timber, clt, 'Voor de productopbouw en de gebruiksklasse.', { exclusiveMin: false }),
  number('cltPsi2', 'Quasiblijvende combinatiefactor ψ₂', '–', timber, clt, 'Voor de beschouwde veranderlijke belasting. Gebruik de ongunstigste toepasselijke waarde.', { exclusiveMin: false, max: 1 }),
];
export const resistanceFields = [...sectionFields, ...supportDetailFields];

const scope = 'Eén rechthoekige trede, éénrichtingswerking, vrije oplegging op beide kopranden. G + vlaklast en G + puntlast zijn afzonderlijke gevallen. De toets omvat verticale lastafdracht binnen het opgegeven product- en verbindingsdetail. Bordessen, wangen, gebouw, trillingen, brand en uitzonderlijke belastingen vragen een eigen beoordeling.';
const positive = value => Number.isFinite(value) && value > 0;

function assessedTread(input, model, geometry, reasons) {
  const first = geometry?.treads?.[0];
  if (!first || !['straight', 'quarter_turn', 'half_turn', 'landing'].includes(model?.stair?.type)
      || geometry.dimensions?.family?.winder || geometry.treads.some(t => t.isWinder)) {
    reasons.push('Dit rekenmodel vereist rechthoekige treden. Voor verdreven of onbekende geometrie is een tredegebonden plaat- en oplegmodel nodig.');
    return;
  }
  const same = (a, b) => Math.abs(a - b) <= 0.001;
  const clearWidth = model.stair.width - 2 * model.stair.stringerThickness;
  if (!positive(clearWidth) || !same(clearWidth, first.width)) {
    reasons.push('Controleer de trapbreedte en de wangdikten. Het model moet een positieve, vrije tredebreedte tussen de wangen hebben.');
    return;
  }
  const rectangular = tread => {
    if (![tread.width, tread.length, tread.thickness].every(positive) || tread.points?.length !== 4) return false;
    const edges = tread.points.map((p, i) => {
      const q = tread.points[(i + 1) % 4];
      return [q.x - p.x, q.y - p.y];
    });
    return edges.every(([x, y], i) => {
      const [a, b] = edges[(i + 1) % 4];
      return same(Math.hypot(x, y), i % 2 === 0 ? tread.length : tread.width)
        && Math.abs(x * a + y * b) <= 1e-7 * tread.length * tread.width;
    });
  };
  if (!geometry.treads.every(t => rectangular(t) && same(t.length, first.length) && same(t.width, first.width) && same(t.thickness, first.thickness))) {
    reasons.push('De digitale tredecontouren moeten gelijk, rechthoekig en ononderbroken zijn.');
    return;
  }
  if (positive(input.spanMm) && !same(input.spanMm, first.width)) {
    reasons.push(`De gemodelleerde tredebreedte is ${first.width} mm. Voor oplegassen met een afwijkende overspanning of belaste uitkraging is een ander rekenmodel nodig.`);
  }
  if (positive(input.assessedThicknessMm) && !same(input.assessedThicknessMm, first.thickness)) reasons.push('De beoordeelde productdikte wijkt af van de modeldikte.');
  if (input.pointPatchLengthMm > first.width || input.pointPatchWidthMm > first.length) reasons.push('Het opgegeven lastvlak past niet binnen de tredecontour.');
  if (plate.includes(input.structureType) && input.effectiveWidthMm > first.length) reasons.push('De effectieve strookbreedte overschrijdt de fysieke tredediepte, inclusief neus.');
  if (input.structureType === 'glass' && (input.glassDeflectionThicknessMm > first.thickness || input.glassStressThicknessMm > first.thickness)) {
    reasons.push('Voer effectieve glasdikten binnen de totale pakketdikte in. Gebruik voor spanning de kleinste effectieve dikte van alle bladen en lastgevallen.');
  }
  if (input.structureType === 'grating' && (input.barWidthMm > input.barPitchMm || input.barPitchMm > first.length || input.barHeightMm > first.thickness)) {
    reasons.push('Staafdikte, staafhoogte en belastingsbreedte moeten binnen de roostergeometrie passen.');
  }
  return first;
}

function sectionProperties(input) {
  const b = input.effectiveWidthMm;
  if (input.structureType === 'glass') return {
    width: b, EI: input.glassE * b * input.glassDeflectionThicknessMm ** 3 / 12,
    MRd: input.glassFd * b * input.glassStressThicknessMm ** 2 / 6, VRd: input.glassShearRd * 1000,
    description: 'glasstrook', sectionFormula: 'MRd = fd · b · hσ² / 6, EI = E · b · hw³ / 12',
  };
  if (input.structureType === 'grating') return {
    width: input.barPitchMm, EI: input.steelE * input.barWidthMm * input.barHeightMm ** 3 / 12,
    // Stable, isotropic elasticity gives G = E / (2(1+ν)) ≥ E/3. Rectangular shear area = 5A/6.
    GA: (5 / 6) * input.barWidthMm * input.barHeightMm * (input.steelE / 3),
    MRd: input.steelFd * input.barWidthMm * input.barHeightMm ** 2 / 6, VRd: input.barShearRd * 1000,
    description: 'enkele draagstaaf', sectionFormula: 'MRd = fd · t · h² / 6, EI = E · t · h³ / 12, volledige P op één staaf',
  };
  return {
    width: b, EI: input.cltEI * 1e9 * b / 1000, GA: input.cltGA * b,
    MRd: input.cltMRd * 1e6 * b / 1000, VRd: input.cltVRd * b,
    description: 'CLT-strook', sectionFormula: 'EI, GA, MRd en VRd per meter × effectieve strookbreedte in m',
  };
}

export function checkResistance(input, model, geometry) {
  const reasons = [];
  const rows = [];
  const result = status => ({ status, scope, reasons, rows });
  if (!['glass', 'grating', 'clt'].includes(input?.structureType)) return result('na');
  const system = input.structureType;
  if (input.support !== 'two-edge') reasons.push('Kies en onderbouw twee evenwijdige opleglijnen aan de kopranden.');
  if (![input.spanMm, input.loadArea, input.loadPoint].every(positive)) reasons.push('Vul de werkelijke overspanning en positieve karakteristieke veranderlijke vlaklast en puntlast in.');
  const tread = assessedTread(input, model, geometry, reasons);
  const fields = sectionFields.filter(f => !f.systems || f.systems.includes(system));
  for (const f of fields.filter(f => f.type === 'number')) {
    const v = input[f.key];
    if (!Number.isFinite(v) || (f.exclusiveMin ? v <= f.min : v < f.min) || (f.max !== undefined && v > f.max)) reasons.push(`Vul een geldige waarde in voor ‘${f.label}’.`);
  }
  const cannotCalculate = reasons.length > 0;
  for (const [key, label] of [
    ['sourceProduct', 'Productspecificatie, revisie en fabrikant'], ['productBasis', 'Opbouw en productbeoordeling voor deze maten en dit lastvlak'],
    ['arrangement', 'Draagrichting en werkelijk oplegdetail'], ...fields.filter(f => f.type === 'text').map(f => [f.key, f.label]),
  ]) if (typeof input[key] !== 'string' || !input[key].trim()) reasons.push(`Leg vast: ${label}.`);
  if (cannotCalculate) return result('open');

  // N and mm internally. q [kN/m²] × width [mm] / 1000 = line load [N/mm].
  const section = sectionProperties(input);
  if (![section.width, section.EI, section.MRd, section.VRd, ...(system === 'glass' ? [] : [section.GA])].every(positive)) {
    reasons.push('De doorsnede-eigenschappen vallen buiten het numerieke bereik. Controleer waarden en eenheden.');
    return result('open');
  }
  const L = input.spanMm;
  const G = input.deadArea * section.width / 1000, q = input.loadArea * section.width / 1000, P = input.loadPoint * 1000;
  const gDesign = input.gammaG * G, qDesign = input.gammaQ * q, pDesign = input.gammaQ * P;
  const areaCase = 'G + verdeelde vlaklast q';
  const midCase = 'G + puntlast P op veldmidden';
  const endCase = 'G + puntlast P bij opleglijn';
  function govern(id, label, a, p, limit, unit, casePoint, formula) {
    const demand = Math.max(a, p), ratio = demand / limit;
    const valid = [a, p, ratio, limit].every(Number.isFinite) && demand > 0 && limit > 0;
    rows.push({ id, label, demand: valid ? demand : null, limit: valid ? limit : null, unit,
      status: valid ? (ratio <= 1 ? 'pass' : 'fail') : 'open', ratio: valid ? ratio : null,
      caseLabel: p > a ? casePoint : areaCase, formula });
  }
  govern('bending', 'UGT · buiging ' + section.description,
    (gDesign + qDesign) * L ** 2 / 8e6, (gDesign * L ** 2 / 8 + pDesign * L / 4) / 1e6,
    section.MRd / 1e6, 'kN·m', midCase, 'M = wL²/8 + PL/4. ' + section.sectionFormula);
  govern('shear', 'UGT · dwarskracht ' + section.description,
    (gDesign + qDesign) * L / 2000, (gDesign * L / 2 + pDesign) / 1000,
    section.VRd / 1000, 'kN', endCase, 'V = wL/2 + P met de volledige puntlast nabij één oplegging.');
  const udlDeflection = w => 5 * w * L ** 4 / (384 * section.EI) + (section.GA ? w * L ** 2 / (8 * section.GA) : 0);
  const pointDeflection = P * L ** 3 / (48 * section.EI) + (section.GA ? P * L / (4 * section.GA) : 0);
  const creep = system === 'clt' ? input.cltKdef : 0;
  const variable = system === 'clt' ? 1 + input.cltPsi2 * creep : 1;
  govern('deflection', (system === 'clt' ? 'BGT · einddoorbuiging ' : 'BGT · doorbuiging ') + section.description,
    udlDeflection(G) * (1 + creep) + udlDeflection(q) * variable,
    udlDeflection(G) * (1 + creep) + pointDeflection * variable,
    input.deflectionLimitMm, 'mm', midCase, {
      clt: 'uG(1+kdef) + uQ(1+ψ₂kdef). uq = 5wL⁴/(384EI) + wL²/(8GA), uP = PL³/(48EI) + PL/(4GA).',
      grating: 'uq = 5wL⁴/(384EI) + wL²/(8GA), uP = PL³/(48EI) + PL/(4GA). Netto rechthoek: GA = (5/6)th · E/3 als conservatieve schuifstijfheid.',
      glass: 'uq = 5wL⁴/(384EI), uP = PL³/(48EI). Permanente en veranderlijke bijdragen opgeteld met de onderbouwde vervormingseffectieve dikte.',
    }[system]);
  const fullG = input.gammaG * input.deadArea * tread.length / 1000;
  const fullQ = input.gammaQ * input.loadArea * tread.length / 1000;
  govern('connection', 'UGT · verticale verbinding per oplegzijde',
    (fullG + fullQ) * L / 2000, (fullG * L / 2 + pDesign) / 1000, input.connectionRd, 'kN', endCase,
    'R = wL/2 + P met w over de volledige fysieke tredediepte. Vergelijk met Rd van de zwakste complete aansluiting.');
  const patchArea = input.pointPatchLengthMm * input.pointPatchWidthMm / 1e6;
  govern('patch', 'UGT · lokale belasting bij rand of hoek', input.gammaQ * input.loadArea * patchArea,
    pDesign / 1000, input.patchRd, 'kN', 'G + puntlast P bij rand of hoek',
    'max(γQ · qk · Alastvlak, γQ · Pk). Rd geldt als extra lokale last boven de aanwezige γG · Gk.');
  if (rows.some(r => r.status === 'open')) reasons.push('Numeriek bereik overschreden. Controleer eenheden en invoer.');
  const connection = rows.find(r => r.id === 'connection');
  const local = checkSupportDetail(input, connection.demand, tread);
  for (const item of local.rows) rows.push({ ...item, caseLabel: connection.caseLabel });
  reasons.push(...local.reasons);
  if (rows.some(r => r.status === 'fail')) return result('fail');
  return result(reasons.length || rows.some(r => r.status === 'open') ? 'open' : 'pass');
}
