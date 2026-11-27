import { generateStairGeometry, ruleProfiles, stairFamilies, starterProject } from './stair.js';
import { isWinder } from './winder.js';
import { readWell } from './stairwell.js';
import { ifcModelId } from './ifc-identity.js';
import {timberDimensions, timberStyles, noseNames} from './timber-settings.js';
import {devriesIfcDepth, devriesNewelSettings, equalQuarterAngles, newelDimensions, quarterAngleError} from './two-quarter-settings.js';
import { validateCamField } from './housing-cam.js';
import { validateTreadCamField } from './tread-cam.js';
import { validateRiserCamField } from './riser-board-settings.js';
import { defaultEngineering, validateEngineeringField, materialFieldKeys, structureTypes } from './engineering.js';

export const draftKey = 'open-stair-studio:draft';
const sections = ['project', 'bim', 'stair', 'regulatory', 'building', 'estimate', 'joinery', 'cam', 'treadCam', 'riserCam', 'riserDetailCam', 'engineering'];
const systemFields = ['support', 'sourceProduct', 'productBasis', 'arrangement', 'customDescription', 'spanMm', ...materialFieldKeys];
const systemValues = engineering => Object.fromEntries(systemFields.map(key => [key, engineering[key]]));
const newelFields = ['lower','upper'].flatMap(corner => newelDimensions.map(field => ({...field, key:corner+'Newel'+field.suffix})));
const ranges = {
  ...Object.fromEntries(newelFields.map(f => [f.key,[f.min,f.max]])),
  ...Object.fromEntries(timberDimensions.map(f=>[f.key,[f.min,f.max]])), noseSize:[0.5,25],wellatWidth:[3,35],wellatHeight:[5,45],
  railHeight:[650,1350], riserThickness:[8,42], riserTopInset:[0,80], riserBottomInset:[8,100],
  depth: [0.1, 150], clearance: [0, 10], endMargin: [0, 300], riserGrooveDepth: [1, 30],
  floorHeight: [100, 10000], width: [300, 3000], going: [100, 600], risers: [2, 40],
  originX: [-1000000000, 1000000000], originY: [-1000000000, 1000000000], originZ: [-1000000000, 1000000000],
  originRotationDeg: [-360, 360],
  windersPerQuarter: [2, 8], middleSteps: [1, 35], entrySteps: [-1, 39],
  outerLength: [1, 30000], outerDepth: [1, 30000], middleOffset: [-15000,15000],
  landingLength: [300, 5000], landingRiser: [0, 39], landingThickness: [20, 300], stringerThickness: [20, 150], stringerDepth: [100, 1000], stringerOverhang:[-60,60],
  landingFrameWidth: [40, 150], landingFrameDepth: [80, 300],
  landingScrewsPerJoint: [0, 4], landingScrewDiameter: [5, 12], landingScrewLength: [40, 250],
  landingScrewShearRd: [0, 1000], fastenerUnitPrice: [0, 1000],
  landingTimberE: [0, 30000], landingTimberFmRd: [0, 100], landingDeflectionRatio: [100, 1000],
  nosing: [-60, 100], wel: [0, 100], treadThickness: [10], wasteFactor: [1, 3], marginPercent: [0, 99]
};
const labels = {
  ...Object.fromEntries(newelFields.map(f => [f.key,f.label])),
  ...Object.fromEntries(timberDimensions.map(f=>[f.key,f.label])), noseSize:'Profielmaat tredeneus',
  depth: 'Insteekdiepte', clearance: 'Totale passpeling', endMargin: 'Schoudermaat', riserGrooveDepth: 'Groefdiepte stootbord',
  floorHeight: 'Vloerhoogte', width: 'Trapbreedte', going: 'Aantrede', risers: 'Aantal optredes',
  originX: 'Projectnulpunt X', originY: 'Projectnulpunt Y', originZ: 'Projectnulpunt Z',
  originRotationDeg: 'Rotatie projectassen',
  windersPerQuarter: 'Treden per kwartslag', middleSteps: 'Rechte treden tussen de kwarten', entrySteps: 'Treden vóór de boog',
  outerLength: 'Buitenlengte', outerDepth: 'Buitendiepte', middleOffset: 'Verschuiving tussenstuk',
  landingLength: 'Bordeslengte', landingRiser:'Optrede op bordes', landingThickness: 'Bordesdikte', stringerThickness: 'Wangdikte', stringerDepth: 'Wanghoogte', stringerOverhang:'Trederand t.o.v. keepboom',
  landingFrameWidth: 'Bordesliggerbreedte', landingFrameDepth: 'Bordesliggerhoogte',
  landingScrewsPerJoint: 'Schroeven per stuiknaad', landingScrewDiameter: 'Schroefdiameter', landingScrewLength: 'Schroeflengte',
  landingScrewShearRd: 'Opgegeven schuifweerstand schroef', fastenerUnitPrice: 'Schroefprijs',
  landingTimberE: 'Elasticiteitsmodulus randligger', landingTimberFmRd: 'Buigsterkte randligger', landingDeflectionRatio: 'Doorbuigingscriterium',
  nosing: 'Tredepositie langs looplijn', wel: 'Wel', treadThickness: 'Trededikte', laneGap: 'Tussenruimte',
  riserTopInset:'Bovenaansluiting stootbord',riserBottomInset:'Onderaansluiting stootbord',
  wasteFactor: 'Zaag-/uitvalfactor', marginPercent: 'Brutomarge', laborRate: 'Uurtarief',
  overheadPercent: 'Opslag', laborHours: 'Werkuren', timberPricePerM3: 'Houtprijs',
  headroom: 'Gemeten vrije hoogte', openingWidth: 'Trapgatbreedte', openingLength: 'Trapgatlengte',
  upperLandingWidth: 'Bovenbordesbreedte', upperLandingDepth: 'Bovenbordesdiepte'
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readField(section, key, value) {
  const prototype = starterProject[section][key];
  if (section === 'stair' && (key === 'firstQuarterAngles' || key === 'secondQuarterAngles')) {
    const issue = quarterAngleError(value);
    if (issue) throw new Error(issue);
    return [...value];
  }
  if (section === 'stair' && key === 'twoQuarterLayout' && !['automatic','dimensioned'].includes(value))
    throw new Error('Kies een ontwerp op klimlijn of op buitenmaten.');
  if (key === 'profile' && !ruleProfiles.some(profile => profile.id === value)) throw new Error('Onbekend regelprofiel.');
  if (section === 'cam') return validateCamField(key, value);
  if (section === 'treadCam') return validateTreadCamField(key, value);
  if (section === 'riserCam' || section === 'riserDetailCam') return validateRiserCamField(key, value);
  if (section === 'engineering') return validateEngineeringField(key, value);
  if (section === 'estimate' && key === 'treadStock' && !['board', 'cnc'].includes(value)) throw new Error('Kies de ruwmaat of de CNC-opspanmaat voor de treden.');
  if (section === 'stair' && key === 'type' && !stairFamilies.some(family => family.id === value)) throw new Error('Onbekende trapfamilie.');
  if (section === 'stair' && key === 'landingFrame' && !['none', 'perimeter'].includes(value)) throw new Error('Onbekend bordesraam.');
  if(section==='stair'&&['nlsfbCode','nlsfbLandingCode','nlsfbRailingCode'].includes(key)&&value!==''&&!/^\d{2}\.\d{2}$/.test(value))throw new Error('Gebruik voor NL-SfB de notatie twee cijfers, punt, twee cijfers.');
  if(section==='stair'&&['materialName','materialFeature','materialApplication','nlsfbCode','nlsfbLandingCode','nlsfbRailingCode'].includes(key)&&
    (typeof value!=='string'||value.length>120||/[\u0000-\u001f]/.test(value)))throw new Error('Ongeldige BIM-materiaalomschrijving.');
  if (section==='stair' && key==='timberDetail' && !Object.hasOwn(timberStyles,value)) throw new Error('Onbekende uitvoering van de balustrade.');
  if (section==='stair' && key==='noseProfile' && !Object.hasOwn(noseNames,value)) throw new Error('Onbekend neusprofiel.');
  if (section==='stair' && key==='wellatType' && !['none','chamfered'].includes(value)) throw new Error('Onbekende wellat.');
  if (section==='stair' && key==='railSide' && !['none','left','right','both'].includes(value)) throw new Error('Kies de zijde van de leuning.');
  if (section==='stair' && key==='riserBoards' && !['none','closed'].includes(value)) throw new Error('Kies open treden of stootborden.');
  if (section==='stair' && key==='riserJoint' && !['butt','housed'].includes(value)) throw new Error('Onbekende stootbordverbinding.');
  if (section==='stair' && key==='riserPosition' && !['auto','manual'].includes(value)) throw new Error('Kies automatische of handmatige stootbordpositie.');
  if (section==='stair' && ['stringerLeft','stringerRight'].includes(key) && !['housed','cut'].includes(value)) throw new Error('Kies een ingekroosde boom of een keepboom.');
  if (section === 'joinery' && key === 'type' && !['none', 'housed'].includes(value)) throw new Error('Onbekende tredeverbinding.');
  if (key === 'turnDirection' && !['left', 'right'].includes(value)) throw new Error('Kies linksom of rechtsom.');
  if (key === 'outerShape' && !['square', 'faceted'].includes(value)) throw new Error('Kies een haakse of gefacetteerde buitenwang.');
  if (typeof prototype === 'string' || typeof prototype === 'boolean') {
    if (typeof value !== typeof prototype) throw new Error(`Ongeldige waarde voor ${section}.${key}.`);
    return value;
  }
  if (value === null && (section === 'building' || key === 'headroom' || (section === 'stair' && ['wel','outerLength','outerDepth'].includes(key)))) return null;
  const label = labels[key] ?? key;
  const integer = ['risers', 'windersPerQuarter', 'middleSteps', 'entrySteps', 'landingRiser', 'landingScrewsPerJoint'].includes(key);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} vereist een ${integer ? 'geheel' : 'geldig'} getal.`);
  }
  const [min, max = Number.MAX_SAFE_INTEGER] = ranges[key] ?? [0];
  if (value < min || value > max) {
    throw new Error(max === Number.MAX_SAFE_INTEGER ? `${label} valt buiten het geldige bereik (minimum ${min}).` : `${label} moet tussen ${min} en ${max} liggen.`);
  }
  return value;
}

export function readProject(raw) {
  if (!isRecord(raw) || !isRecord(raw.project) || (!isRecord(raw.stair) && !(raw.stairEnabled === false && raw.stair == null))) throw new Error('Projectgegevens of trap ontbreken.');
  if ((raw.app !== undefined && raw.app !== starterProject.app) || (raw.units !== undefined && raw.units !== 'mm')) {
    throw new Error('Open een Open Stair Studio-project met maten in millimeter.');
  }
  if (raw.version !== undefined && !(typeof raw.version === 'string' && /^0\.(?:[1-9]|10|11|12|13)(?:\.\d+)?$/.test(raw.version))) {
    throw new Error('Deze projectversie wordt niet ondersteund.');
  }
  const supportedSchemas = Array.from({length:13},(_,i)=>starterProject.schema.replace(/0\.\d+\.json$/, '0.'+(i+1)+'.json'));
  if (raw.schema !== undefined && !supportedSchemas.includes(raw.schema)) {
    throw new Error('Onbekend projectformaat.');
  }
  if (isRecord(raw.stair)) for (const key of ['type', 'floorHeight', 'width', 'going', 'risers']) {
    if (!Object.hasOwn(raw.stair, key)) throw new Error(`Trapgegeven ontbreekt: ${labels[key] ?? 'Trapfamilie'}.`);
  }
  const model = { ...structuredClone(raw), ...structuredClone(starterProject) };
  if (Object.hasOwn(raw, 'stairEnabled')) {
    if (typeof raw.stairEnabled !== 'boolean') throw new Error('Ongeldige trapstatus.');
    model.stairEnabled = raw.stairEnabled;
  }
  if (Object.hasOwn(raw,'stairwell')) model.stairwell = readWell(raw.stairwell);
  if (Object.hasOwn(raw, 'status')) {
    if (typeof raw.status !== 'string') throw new Error('Ongeldige projectstatus.');
    model.status = raw.status;
  }
  model.regulatory.profile = 'UNSET';
  // A saved design only gains tongues and their material costs after explicit activation.
  if (!Object.hasOwn(raw, 'joinery') || !Object.hasOwn(raw.joinery ?? {}, 'type')) model.joinery.type = 'none';
  for (const key of Object.keys(model.building)) model.building[key] = null;
  for (const key of Object.keys(model.project)) model.project[key] = '';
  for (const section of sections) {
    if (!Object.hasOwn(raw, section) || (section === 'stair' && raw.stairEnabled === false && raw.stair == null)) continue;
    if (!isRecord(raw[section])) throw new Error(`Ongeldige projectsectie: ${section}.`);
    const defaults = model[section];
    model[section] = { ...structuredClone(raw[section]), ...defaults };
    for (const key of Object.keys(defaults)) {
      if (Object.hasOwn(raw[section], key)) model[section][key] = readField(section, key, raw[section][key]);
    }
  }
  model.bim.modelId = ifcModelId(raw);
  if (!model.stairwell.uid && model.stairwell.instances.length) {
    // Migrate the namespace formerly chosen at export time before a component
    // selection, project rename or first edit can change it.
    const previousScope = model.project.number || model.stairwell.instances[0].id;
    model.stairwell.uid = /^[\w-]{1,64}$/.test(previousScope) ? previousScope : model.bim.modelId;
  }
  if (isWinder(model.stair.type)) model.stair.riserPosition = 'auto';
  if (!raw.engineering && model.regulatory.profile === 'NL_NEW_EGRESS') model.engineering.use = 'escape-only';
  if (Object.hasOwn(raw, 'engineeringVariants')) {
    if (!isRecord(raw.engineeringVariants)) throw new Error('De productdossiers zijn ongeldig.');
    model.engineeringVariants = {};
    for (const [id, detail] of Object.entries(raw.engineeringVariants)) {
      if (!structureTypes.some(type => type.id === id) || !isRecord(detail)) throw new Error('Onbekend productdossier.');
      const saved = systemValues(defaultEngineering);
      for (const key of systemFields) if (Object.hasOwn(detail, key)) saved[key] = validateEngineeringField(key, detail[key]);
      model.engineeringVariants[id] = saved;
    }
  }
  return model;
}

export function parseInput(section, key, raw) {
  const kind = typeof starterProject[section][key];
  const value = kind === 'string' || kind === 'boolean' || Array.isArray(starterProject[section][key]) ? raw : raw === '' ? null : Number(raw);
  return readField(section, key, value);
}

export function startSession(model, saved = true) {
  return { model, history: [], future: [], savedModel: saved ? JSON.stringify(model) : null };
}

export function editSession(session, section, key, value) {
  if (Object.is(session.model[section][key], value) && !(section === 'stair' && key === 'type' && !session.model.stairEnabled)) return session;
  const model = { ...session.model, [section]: { ...session.model[section], [key]: value } };
  if (section === 'stair' && key === 'type') model.stairEnabled = true;
  if (section === 'stair' && key === 'twoQuarterLayout' && value === 'dimensioned' &&
      model.stair.outerLength == null && model.stair.outerDepth == null) {
    const stair = model.stair;
    const {footprint} = generateStairGeometry(session.model.stair, {projectIsometric:false});
    stair.outerLength = Math.ceil(footprint.depth || 2*stair.width + (stair.middleSteps+1)*stair.going);
    stair.outerDepth = Math.ceil(footprint.width || stair.width + (2+Math.max(0,stair.entrySteps))*stair.going);
    stair.firstQuarterAngles = equalQuarterAngles(stair.windersPerQuarter);
    stair.secondQuarterAngles = [...stair.firstQuarterAngles];
  }
  if (section === 'stair' && key === 'type' && isWinder(value)) {
    model.stair.stringerLeft = 'housed';
    model.stair.stringerRight = 'housed';
    model.stair.riserPosition = 'auto';
  }
  if(section==='stair'&&key==='riserPosition'&&value==='manual') model.stair.riserJoint='butt';
  // Surveyed widths refer to a particular stair layout. Undo restores both
  // the geometry and the measurements for that layout together.
  if (section === 'stair' && (/^(lower|upper)Newel/.test(key) || ['width', 'stringerThickness', 'stringerLeft','stringerRight','stringerOverhang','type', 'turnDirection', 'outerShape', 'twoQuarterLayout', 'outerLength', 'outerDepth', 'middleOffset', 'firstQuarterAngles', 'secondQuarterAngles', 'laneGap', 'going', 'risers', 'windersPerQuarter', 'middleSteps', 'entrySteps', 'nosing', 'wel', 'landingLength','landingRiser'].includes(key))) {
    model.engineering = { ...model.engineering, escapeWinderWidth: null };
    if (['type', 'width', 'stringerThickness'].includes(key)) model.engineering.escapeWidth = null;
  }
  if (section === 'engineering' && key === 'structureType') {
    const previous = session.model.engineering;
    const variants = { ...session.model.engineeringVariants, [previous.structureType]: systemValues(previous) };
    Object.assign(model.engineering, variants[value] ?? systemValues(defaultEngineering));
    delete variants[value];
    model.engineeringVariants = variants;
  }
  return { ...session, model, history: [...session.history.slice(-49), session.model], future: [] };
}

export function applyTwoQuarterReference(session, size = 'nominal') {
  const model = {...session.model, stairEnabled: true,
    stair: {...session.model.stair, ...structuredClone(devriesNewelSettings),
      outerDepth:size==='ifc' ? devriesIfcDepth : devriesNewelSettings.outerDepth},
    joinery: {...session.model.joinery, type: 'none'},
    engineering: {...session.model.engineering, escapeWidth: null, escapeWinderWidth: null}};
  return {...session, model, history: [...session.history.slice(-49), session.model], future: []};
}

export function editWell(session, raw) {
  const stairwell = readWell(raw);
  if (JSON.stringify(stairwell) === JSON.stringify(session.model.stairwell)) return session;
  const previous=new Set(session.model.stairwell.instances);
  stairwell.instances=stairwell.instances.map((item,i)=>previous.has(raw.instances[i]) ? raw.instances[i] : item);
  stairwell.uid ??= crypto.randomUUID();
  return { ...session, model:{...session.model,stairwell}, history:[...session.history.slice(-49),session.model], future:[] };
}

export function undoSession(session) {
  if (!session.history.length) return session;
  return { ...session, model: session.history.at(-1), history: session.history.slice(0, -1), future: [session.model, ...session.future] };
}

export function redoSession(session) {
  if (!session.future.length) return session;
  return { ...session, model: session.future[0], history: [...session.history, session.model], future: session.future.slice(1) };
}

export const isDirty = session => JSON.stringify(session.model) !== session.savedModel;

export function saveDraft(storage, session) {
  storage.setItem(draftKey, JSON.stringify({ draftVersion: 1, model: session.model, saved: !isDirty(session) }));
}

export function restoreDraft(storage) {
  const serialized = storage.getItem(draftKey);
  if (serialized === null) return null;
  const raw = JSON.parse(serialized);
  if (raw?.draftVersion === 1) return startSession(readProject(raw.model), raw.saved === true);
  return startSession(readProject(raw), false);
}
