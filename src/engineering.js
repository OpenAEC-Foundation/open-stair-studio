import { checkEscapeCapacity, escapeFields, escapeReference } from './escape-capacity.js';
import { checkResistance, resistanceFields } from './tread-resistance.js';
import { geometryErrors } from './stair-validity.js';

// These inputs describe the tread system. Supports, stringers and landings
// require their own structural design and material specification.
export const structureTypes = [
  { id: 'timber', label: 'Houten treden' },
  { id: 'glass', label: 'Glazen treden' },
  { id: 'grating', label: 'Stalen roostertreden' },
  { id: 'clt', label: 'CLT-treden' },
  { id: 'custom', label: 'Speciale constructie' }
];
export const engineeringUses = [
  { id: 'regular', label: 'Regulier gebruik' },
  { id: 'escape', label: 'Regulier gebruik en vluchtroute' },
  { id: 'escape-only', label: 'Uitsluitend voor ontvluchten' }
];
export const supportTypes = [
  { id: 'unspecified', label: 'Nog te bepalen' },
  { id: 'two-edge', label: 'Vrij opgelegd op twee evenwijdige opleglijnen' },
  { id: 'four-edge', label: 'Vierzijdig opgelegd' },
  { id: 'cantilever', label: 'Uitkragend' },
  { id: 'other', label: 'Andere oplegging' }
];

const fieldsByKey = new Map([...resistanceFields, ...escapeFields].map(field => [field.key, field]));
export const inputUnits = { spanMm: 'mm', loadArea: 'kN/m²', loadPoint: 'kN',
  ...Object.fromEntries([...fieldsByKey.values()].filter(f => f.unit).map(f => [f.key, f.unit])) };
export const materialFieldKeys = resistanceFields.map(f => f.key);
export const defaultEngineering = Object.freeze({
  structureType: 'timber', use: 'regular', support: 'unspecified',
  sourceProduct: '', productBasis: '', arrangement: '', customDescription: '', escapeBasis: '', notes: '',
  spanMm: null, loadArea: null, loadPoint: null,
  ...Object.fromEntries([...fieldsByKey.values()].map(f => [f.key, f.default ?? (f.type === 'text' ? '' : null)]))
});

const enumOptions = { structureType: structureTypes, use: engineeringUses, support: supportTypes };
const quantityNames = {
  spanMm: 'Overspanning tussen de oplegassen',
  loadArea: 'Gelijkmatig verdeelde vlaklast',
  loadPoint: 'Puntlast in het midden'
};

export function validateEngineeringField(key, value) {
  if (!Object.hasOwn(defaultEngineering, key)) throw new Error('Onbekend dossiergegeven.');
  const field = fieldsByKey.get(key);
  if (field?.type === 'select') {
    if (!field.options.some(([id]) => id === value)) throw new Error(`Ongeldige keuze voor ${field.label}.`);
  } else if (field && field.type !== 'text') {
    if (value === null) return null;
    const min = field.min ?? 0;
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (field.exclusiveMin ? value <= min : value < min) ||
      (field.max != null && value > field.max) || (field.integer && !Number.isSafeInteger(value))) {
      throw new Error(`Ongeldige waarde voor ${field.label}.`);
    }
  } else if (Object.hasOwn(enumOptions, key)) {
    if (!enumOptions[key].some(option => option.id === value)) throw new Error('Onbekende keuze voor het engineeringdossier.');
  } else if (Object.hasOwn(quantityNames, key)) {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0 || (key === 'spanMm' && value === 0) || value > Number.MAX_SAFE_INTEGER) {
      throw new Error(`${quantityNames[key]} vereist een ${key === 'spanMm' ? 'positief' : 'niet-negatief'} getal.`);
    }
  } else if (typeof value !== 'string') {
    throw new Error('Gebruik tekst voor de omschrijving in het engineeringdossier.');
  }
  return value;
}

const loadSource = {
  title: 'Europese Commissie JRC · Eurocode 1, belastingen op constructies',
  url: 'https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-1-actions-structures'
};
const escapeSources = [
  { title: 'IPLO · trappen bij nieuwbouw', url: 'https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/trappen/' },
  escapeReference
];
const materials = {
  timber: {
    hint: 'Houtsoort, sterkteklasse, vezelrichting en netto doorsnede bij verbindingen.',
    checks: ['Toets buiging en doorbuiging van de trede. Controleer de oplegdruk en de verzwakking bij verbindingen.'],
    sources: []
  },
  glass: {
    hint: 'Glassoort en dikte per blad, type en dikte van de tussenlagen, loopoppervlak en randafwerking.',
    checks: [
      'Bereken plaatwerking en vervorming met de opgegeven glasopbouw, temperatuur, belastingsduur en werkelijke ondersteuning.',
      'Onderbouw het gedrag na glasbreuk en toets contactdruk, randbescherming en slipweerstand.'
    ],
    sources: [
      { title: 'NEN · NEN 2608:2026, bepalingsmethode voor vlakglas', url: 'https://www.nen.nl/nen-2608-2026-nl-345335' },
      { title: 'National Glass Association · Glass Floors and Stairs', url: 'https://www.glass.org/sites/default/files/2021-07/FB14-07_2020_Glass_Floors_and_Stairs_0521.pdf' }
    ]
  },
  grating: {
    hint: 'Roostertype, staalsoort, maat en richting van de draagstaven, maaswijdte en referentie van de belastingtabel.',
    checks: [
      'Vergelijk overspanning, lastvlak van de puntlast en doorbuiging met de tabel voor het gekozen rooster en de draagstaafrichting.',
      'Controleer kopplaten, bouten of lassen, opleglengte, corrosiebescherming en slipweerstand van de trede en neus.'
    ],
    sources: [
      { title: 'MEISER · productgebonden belastingtabellen voor roosters', url: 'https://www.meiser.de/nl-BE/belastingtabellen.html' },
      { title: 'Industrieverband Gitterroste · leidraad voor roosters', url: 'https://www.gitterroste-online.de/fileadmin/inhalte/igi/download/IGI_Leitfaden_NL_2020_low.pdf' }
    ]
  },
  clt: {
    hint: 'Fabrikant, productverklaring of ETA, aantal lagen, dikte en vezelrichting per laag en uitsparingen.',
    checks: [
      'Bepaal buig- en schuifstijfheid van de gekozen plaat in de overspanningsrichting en toets buiging, rolafschuiving en vervorming.',
      'Controleer randafstanden, oplegdruk en verbindingen bij de netto doorsnede. Werk de brandwerendheid voor het project uit.'
    ],
    sources: [
      { title: 'Swedish Wood · The CLT Handbook, § 3.3', url: 'https://www.swedishwood.com/siteassets/5-publikationer/pdfer/clt-handbook-2019-eng-m-svensk-standard-2019-2022.pdf' },
      { title: 'EOTA · voorbeeld van een productgebonden CLT-beoordeling, ETA 14/0349', url: 'https://www.eota.eu/etassessments/23141' }
    ]
  },
  custom: {
    hint: 'Benoem de constructiewijze, materialen, verbindingen en onderdelen die met elkaar samenwerken.',
    checks: [
      'Onderbouw het draagpad tot in de hoofddraagconstructie en kies een rekenmodel voor buiging, torsie en stabiliteit.',
      'Controleer knopen, tijdelijke ondersteuning en vervorming tijdens gebruik en montage.'
    ],
    sources: []
  }
};

// One ideal, simply supported span. Area loads refer to a 1 m wide strip.
// Point loads are carried wholly by one beam with no assumed transverse spread.
function loadCases(input) {
  if (input.support !== 'two-edge' || input.spanMm === null) return [];
  const length = input.spanMm / 1000;
  const cases = [];
  if (input.loadArea !== null) {
    cases.push({
      id: 'area', label: 'Gelijkmatig verdeelde vlaklast',
      assumption: 'Een strook van 1 m breed draagt de opgegeven vlaklast over de hele overspanning. M = qL²/8 en R = qL/2 per oplegging.',
      moment: input.loadArea * length ** 2 / 8, reaction: input.loadArea * length / 2,
      momentUnit: 'kN·m/m', reactionUnit: 'kN/m'
    });
  }
  if (input.loadPoint !== null) {
    cases.push({
      id: 'point', label: 'Puntlast midden op de overspanning',
      assumption: 'Eén ligger neemt de volledige puntlast in het midden op. M = PL/4 en R = P/2 per oplegging. De verdeling over plaatbreedte of draagstaven vraagt een apart model.',
      moment: input.loadPoint * length / 4, reaction: input.loadPoint / 2,
      momentUnit: 'kN·m', reactionUnit: 'kN'
    });
  }
  return cases;
}

export function deriveEngineering(model, geometry) {
  const input = { ...defaultEngineering, ...model.engineering };
  for (const field of Object.keys(defaultEngineering)) validateEngineeringField(field, input[field]);
  const material = materials[input.structureType];
  const escape = input.use !== 'regular';
  const missing = [];
  if (!input.sourceProduct.trim()) missing.push('Leg de productspecificatie, leverancier en documentrevisie vast.');
  if (!input.productBasis.trim()) missing.push('Vul de technische opbouw van het tredesysteem in.');
  if (!input.arrangement.trim()) missing.push('Beschrijf de draagrichting en de aansluiting op de ondersteunende constructie.');
  if (input.support === 'unspecified') missing.push('Kies de werkelijke oplegging.');
  if (input.spanMm === null) missing.push('Leg de overspanning tussen de oplegassen vast in de draagrichting.');
  if (input.loadArea === null) missing.push('Bepaal de gelijkmatig verdeelde belasting voor het project.');
  if (input.loadPoint === null) missing.push('Bepaal de geconcentreerde belasting en de bijbehorende lastafmeting.');
  if (input.structureType === 'custom' && !input.customDescription.trim()) missing.push('Beschrijf het bijzondere constructieprincipe en de afwijkende geometrie.');
  if (escape && !input.escapeBasis.trim()) missing.push('Leg de gebruiksfunctie, route, bezetting per bouwlaag en brand- en rookscheidingen vast.');
  if ((input.use === 'escape-only') !== (model.regulatory?.profile === 'NL_NEW_EGRESS')) {
    missing.push('Stem het gebruik van de trap af op het gekozen Bbl-maatprofiel voor uitsluitend ontvluchten.');
  }

  const resistance = checkResistance(input, model, geometry);
  const capacity = checkEscapeCapacity(input, model, geometry);
  const remaining = {
    glass: 'Verifieer de effectieve dikten en sterkte bij de werkelijke lastduur en temperatuur. Beoordeel het breukgedrag, de randen en de stroefheid met het projectspecifieke glasrapport.',
    grating: 'Verifieer lokale neus- en randbelasting, zijdelingse stabiliteit van de staven, lasdetails, corrosiebescherming en stroefheid met het productblad.',
    clt: 'Verifieer de laagopbouw, draagrichting, gebruiksklasse, randafstanden en brandwerendheid van het paneel en de aansluiting.'
  };
  const checks = [
    ...(remaining[input.structureType] && resistance.rows.length ? [remaining[input.structureType]] : material.checks),
    'Verifieer de projectbelastingen, de gekozen combinaties en de toepasselijke normedities en nationale bijlagen.',
    'Toets de overdracht van de berekende oplegreacties naar wangen, bordessen en hoofddraagconstructie.'
  ];
  if (!['two-edge', 'unspecified'].includes(input.support)) checks.push('Maak een rekenmodel voor de gekozen oplegging en de werkelijke draagrichting.');
  if (geometry?.dimensions?.family?.winder) checks.push('Controleer bij elke verdreven trede de schuine randen, effectieve overspanning en spreiding van de krachten naar de oplegpunten.');
  if (escape) {
    checks.push('Beoordeel de routecapaciteit van de overige routedelen, eventuele samenvoeging van stromen en opvang. Leg brand- en rookbescherming over de volledige route vast.');
  }
  const labels = key => enumOptions[key].find(option => option.id === input[key]).label;
  const errors = geometry?.dimensions ? geometryErrors(model.stair, geometry.dimensions, input.structureType) : [];
  if (errors.length) {
    for (const result of [resistance, capacity]) {
      if (result.status === 'na') continue;
      result.status = 'open';
      result.rows = [];
      result.reasons = errors.map(error => error.detail);
    }
    capacity.capacity = null;
    capacity.governing = [];
  }
  return {
    structureLabel: labels('structureType'), useLabel: labels('use'), supportLabel: labels('support'),
    productHint: material.hint,
    geometry: {
      treadCount: geometry?.treads?.length ?? null,
      floorHeightMm: model.stair?.floorHeight ?? null,
      overallWidthMm: model.stair?.width ?? null
    },
    scope: 'De onderstaande basisgevallen tonen de ongewogen lastwerking van één vrij opgelegd eenrichtingsveld. De materiaaltoets combineert het eigen gewicht afzonderlijk met de veranderlijke vlaklast en met de puntlast.',
    cases: loadCases(input), resistance, escape: capacity, missing, checks,
    sources: [loadSource, ...material.sources, ...(escape ? escapeSources : [])].map(source => ({ ...source }))
  };
}
