import { tessellate } from './ifc-tessellate.js';
import * as IFC from 'web-ifc';
import { inspectStair } from './stair.js';
import { defaultEngineering, deriveEngineering } from './engineering.js';
import { buildStairDetails } from './stair-details.js';
import { profileTimberTread } from './timber-tread-profile.js';
import { checkLandingJoints } from './landing-joint-check.js';
import { buildWorkshop } from './workshop.js';

const enumValue = value => ({ type: 3, value });
const stairTypes = {
  straight: 'STRAIGHT_RUN_STAIR',
  quarter_turn: 'QUARTER_TURN_STAIR',
  landing: 'TWO_STRAIGHT_RUN_STAIR',
  half_turn: 'HALF_TURN_STAIR',
  quarter_winder: 'QUARTER_WINDING_STAIR',
  half_winder: 'HALF_WINDING_STAIR'
};

export function createIfc4WithApi(api, model, geometry) {
  const stair = model.stair;
  // An unprofiled design check admits concept designs with outstanding Bbl findings.
  const issue = inspectStair({stair,engineering:model.engineering}).find(item => item.level === 'error');
  if (issue) throw new Error(issue.detail);
  const joinedRisers = (model.engineering?.structureType ?? 'timber') === 'timber'
    && stair.riserBoards === 'closed' && stair.riserJoint === 'housed';
  if (joinedRisers && !geometry.riserJoinery) geometry = buildWorkshop(geometry, model, geometry.detailParts);
  if (joinedRisers) {
    const error = [...(geometry.housings?.issues ?? []), ...(geometry.riserJoinery?.issues ?? [])]
      .find(item => item.level === 'error');
    if (error) throw new Error(error.message ?? error.detail);
  }
  const rectangular = [...geometry.stringers, ...geometry.landings,
    ...(model.engineering?.structureType === 'timber' ? geometry.landingFrame ?? [] : [])];
  if (!geometry.dimensions.family.winder) rectangular.push(...geometry.treads);
  if (!geometry.treads.length || rectangular.some(part => [part.length, part.width, part.thickness].some(value => !Number.isFinite(value) || value <= 0))) {
    throw new Error('Elke IFC-extrusie vereist drie positieve, eindige afmetingen.');
  }
  if (geometry.dimensions.family.winder) {
    for (const tread of geometry.treads) {
      if (!Number.isFinite(tread.thickness) || tread.thickness <= 0 || !Number.isFinite(tread.elevation) ||
          tread.points.length < 3 || tread.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        throw new Error(`Ongeldige contour, hoogte of dikte voor trede ${tread.id}.`);
      }
    }
  }
  const sid = api.CreateModel({
    schema: IFC.Schemas.IFC4,
    name: `${model.project.number}-${stair.mark}.ifc`,
    description: ['Conceptuele trapcoordinatie uit Open Stair Studio'],
    authors: ['OpenAEC'], organizations: ['OpenAEC'], authorization: 'Concept geometry'
  });
  try {
    return writeModel(api, sid, model, geometry);
  } finally {
    api.CloseModel(sid);
  }
}

function writeModel(api, sid, model, geometry) {
  const stair = model.stair;
  const d = geometry.dimensions;
  const naakt = [stair.materialName, stair.materialFeature, stair.materialApplication].map(value => (value ?? '').trim());
  const specifiedTimber = naakt.every(Boolean) ? naakt.join(' - ') : stair.material;
  const engineering = { ...defaultEngineering, ...model.engineering };
  const detailParts = engineering.structureType === 'timber' ? geometry.detailParts ?? buildStairDetails(stair, geometry) : [];
  const dossier = deriveEngineering(model, geometry);
  const landingJointCheck = checkLandingJoints(model, geometry);
  const separateTreads = engineering.structureType !== 'timber';
  const joined = !separateTreads && Boolean(geometry.riserJoinery?.pockets.length);
  const surfaceTreads = ['grating', 'custom'].includes(engineering.structureType);
  const profiledTimber=!separateTreads&&['round','bevel'].includes(stair.noseProfile);
  let profiledTreadBrepCount=0;
  const mm = value => Number(value) / 1000;
  const e = (type, ...args) => api.CreateIfcEntity(sid, type, ...args);
  const label = value => api.CreateIfcType(sid, IFC.IFCLABEL, String(value ?? ''));
  const text = value => api.CreateIfcType(sid, IFC.IFCTEXT, String(value ?? ''));
  const identifier = value => api.CreateIfcType(sid, IFC.IFCIDENTIFIER, String(value ?? ''));
  const length = value => api.CreateIfcType(sid, IFC.IFCLENGTHMEASURE, mm(value));
  const real = value => api.CreateIfcType(sid, IFC.IFCREAL, Number(value));
  const point = xyz => e(IFC.IFCCARTESIANPOINT, xyz.map(value => length(value * 1000)));
  const direction = xyz => e(IFC.IFCDIRECTION, xyz.map(real));
  const axis3 = (xyz = [0, 0, 0], z = [0, 0, 1], x = [1, 0, 0]) => e(IFC.IFCAXIS2PLACEMENT3D, point(xyz), direction(z), direction(x));
  const localPlacement = (parent = null, xyz = [0, 0, 0]) => e(IFC.IFCLOCALPLACEMENT, parent, axis3(xyz));
  const placementAlong = (xyz, zAxis, xAxis) => axis3(xyz, zAxis, xAxis);
  const unit = (kind, prefix, name) => e(IFC.IFCSIUNIT, enumValue(kind), prefix ? enumValue(prefix) : null, enumValue(name));
  const unitAssignment = e(IFC.IFCUNITASSIGNMENT, [
    unit('LENGTHUNIT', null, 'METRE'), unit('AREAUNIT', null, 'SQUARE_METRE'),
    unit('VOLUMEUNIT', null, 'CUBIC_METRE'), unit('PLANEANGLEUNIT', null, 'RADIAN')
  ]);
  const world = axis3();
  const context = e(IFC.IFCGEOMETRICREPRESENTATIONCONTEXT, null, label('Model'), api.CreateIfcType(sid, IFC.IFCINTEGER, 3), real(1e-5), world, null);
  const project = e(IFC.IFCPROJECT, api.CreateIFCGloballyUniqueId(sid), null, label(model.project.name), text(model.project.number), null, label(model.project.revision), null, [context], unitAssignment);

  const bim = model.bim ?? { originX: 0, originY: 0, originZ: 0, originRotationDeg: 0, originAgreed: false };
  const rotation = Number(bim.originRotationDeg ?? 0) * Math.PI / 180;
  const sitePlacement = e(IFC.IFCLOCALPLACEMENT, null,
    axis3([mm(bim.originX), mm(bim.originY), mm(bim.originZ)], [0,0,1], [Math.cos(rotation),Math.sin(rotation),0]));
  const site = e(IFC.IFCSITE, api.CreateIFCGloballyUniqueId(sid), null, label(model.project.location || 'Projectlocatie'), null, null, sitePlacement, null, null, enumValue('ELEMENT'), null, null, null, null, null);
  const buildingPlacement = localPlacement(sitePlacement);
  const building = e(IFC.IFCBUILDING, api.CreateIFCGloballyUniqueId(sid), null, label(model.project.name), null, null, buildingPlacement, null, null, enumValue('ELEMENT'), null, null, null);
  const storeyPlacement = localPlacement(buildingPlacement);
  const storey = e(IFC.IFCBUILDINGSTOREY, api.CreateIFCGloballyUniqueId(sid), null, label('Verdieping 01'), null, null, storeyPlacement, null, null, enumValue('ELEMENT'), length(0));
  const stairPlacement = localPlacement(storeyPlacement);
  const stairType = stairTypes[stair.type] ?? 'NOTDEFINED';
  const windingFlight = d.family.winder === true;
  const stairElement = e(IFC.IFCSTAIR, api.CreateIFCGloballyUniqueId(sid), null, label(`${stair.mark} · ${stair.name}`), text('Open Stair Studio · conceptmodel; niet voor productie of vergunningstoets'), label(stair.type), stairPlacement, null, identifier(stair.mark), enumValue(stairType));
  const millimetre = unit('LENGTHUNIT', 'MILLI', 'METRE');
  const singleProperty = ([name, type, value, propertyUnit]) => e(IFC.IFCPROPERTYSINGLEVALUE, identifier(name), null,
    api.CreateIfcType(sid, type, value), propertyUnit ?? (type === IFC.IFCLENGTHMEASURE ? millimetre : null));
  const technicalProperties = [
    ['TreadSystem', IFC.IFCLABEL, dossier.structureLabel],
    ['SupportArrangement', IFC.IFCLABEL, dossier.supportLabel],
    ['SourceProduct', IFC.IFCTEXT, engineering.sourceProduct],
    ['ProductBuildUp', IFC.IFCTEXT, engineering.productBasis],
    ['LoadDirectionAndConnections', IFC.IFCTEXT, engineering.arrangement],
    ['CustomConstruction', IFC.IFCTEXT, engineering.structureType === 'custom' ? engineering.customDescription : ''],
    ['DeclaredSpan_mm', IFC.IFCLENGTHMEASURE, engineering.spanMm],
    ['DeclaredAreaLoad_kNPerM2', IFC.IFCPRESSUREMEASURE, engineering.loadArea, unit('PRESSUREUNIT', 'KILO', 'PASCAL')],
    ['DeclaredPointLoad_kN', IFC.IFCFORCEMEASURE, engineering.loadPoint, unit('FORCEUNIT', 'KILO', 'NEWTON')]
  ].filter(([, , value]) => value != null && value !== '');
  const stairProperties = [
    ['StairFamily', IFC.IFCLABEL, d.family.label], ['DesignStatus', IFC.IFCLABEL, 'Concept'],
    ['EngineeringUse', IFC.IFCLABEL, dossier.useLabel],
    ...(['glass', 'grating', 'clt'].includes(engineering.structureType) ? [
      ['TreadStructuralCheckStatus', IFC.IFCLABEL, dossier.resistance.status],
      ['TreadStructuralCheckScope', IFC.IFCTEXT, dossier.resistance.scope]
    ] : []),
    ...(engineering.use !== 'regular' ? [
      ['EscapeCapacityCheckStatus', IFC.IFCLABEL, dossier.escape.status],
      ['EscapeCapacityCheckScope', IFC.IFCTEXT, dossier.escape.scope],
      ...(dossier.escape.capacity != null ? [['EscapeCapacityPersons', IFC.IFCINTEGER, dossier.escape.capacity]] : []),
      ...(engineering.escapePersons != null ? [['AssignedPersons', IFC.IFCINTEGER, engineering.escapePersons]] : [])
    ] : []),
    ...(engineering.use !== 'regular' && engineering.escapeBasis ? [['EscapeRouteBasis', IFC.IFCTEXT, engineering.escapeBasis]] : []),
    ...(engineering.notes ? [['EngineeringNotes', IFC.IFCTEXT, engineering.notes]] : []),
    ...(separateTreads ? [
      ['TreadSystem', IFC.IFCLABEL, dossier.structureLabel],
      ['GeometryScope', IFC.IFCTEXT, 'Treden volgens nominale ontwerpcontour. Ruimte voor wangen en bordessen is gereserveerd.']
    ] : [['Material', IFC.IFCLABEL, stair.material], ...technicalProperties]),
    ['FloorToFloorHeight_mm', IFC.IFCLENGTHMEASURE, stair.floorHeight],
    ['OverallWidth_mm', IFC.IFCLENGTHMEASURE, stair.width], ['ClearTreadWidth_mm', IFC.IFCLENGTHMEASURE, d.clearWidth ?? geometry.treads[0].width], ['RiserCount', IFC.IFCINTEGER, d.risers],
    ['RiserHeight_mm', IFC.IFCLENGTHMEASURE, d.rise], ['Going_mm', IFC.IFCLENGTHMEASURE, stair.going],
    ['TreadCount', IFC.IFCINTEGER, d.treadCount],
    ...(joined ? [
      ['RiserJoint', IFC.IFCLABEL, 'Stootbord met gefreesde aansluiting'],
      ['RiserGrooveDepth_mm', IFC.IFCLENGTHMEASURE, stair.riserGrooveDepth],
      ['RiserPocketCount', IFC.IFCINTEGER, geometry.riserJoinery.pockets.length]
    ] : []),
    ...(profiledTimber?[
      ['NosingProfile', IFC.IFCLABEL, stair.noseProfile==='round'?'Upper quarter round':'Upper 45 degree bevel'],
      ['NosingSize_mm', IFC.IFCLENGTHMEASURE, stair.noseSize]
    ]:[]),
    ...(separateTreads ? [] : [
      ['StringerType', IFC.IFCLABEL, windingFlight ? 'Gesegmenteerde ingekroosde boom met verstek' : 'Zijbomen per zijde'],
      ['StringerLeft', IFC.IFCLABEL, stair.stringerLeft==='cut'?'Uitgezaagde keepboom':'Ingekroosde boom'],
      ['StringerRight', IFC.IFCLABEL, stair.stringerRight==='cut'?'Uitgezaagde keepboom':'Ingekroosde boom']]),
    ['Revision', IFC.IFCLABEL, model.project.revision],
    ...(!separateTreads && model.joinery?.type === 'housed' ? [
      ['TreadJoint', IFC.IFCLABEL, 'Housed tread with shouldered tongues'],
      ['HousingDepth_mm', IFC.IFCLENGTHMEASURE, model.joinery.depth],
      ['HousingTotalClearance_mm', IFC.IFCLENGTHMEASURE, model.joinery.clearance],
      ['HousingShoulder_mm', IFC.IFCLENGTHMEASURE, model.joinery.endMargin],
      ['GeometryScope', IFC.IFCLABEL, joined ? 'Treden met lippen en uitgefreesde stootbord- en tredehuizen' :
        'Nominal coordination solids. Joint geometry in workshop drawings and CAM.']
    ] : []),
    ...(windingFlight ? [
      ['TurnDirection', IFC.IFCLABEL, stair.turnDirection ?? 'left'],
      ['OuterShape', IFC.IFCLABEL, stair.outerShape ?? 'square'],
      ['WindersPerQuarter', IFC.IFCINTEGER, d.perQuarter],
      ['EntryTreads', IFC.IFCINTEGER, d.entrySteps],
      ['ExitTreads', IFC.IFCINTEGER, d.exitSteps]
    ] : [])
  ].map(singleProperty);
  const stairPset = e(IFC.IFCPROPERTYSET, api.CreateIFCGloballyUniqueId(sid), null, label('Pset_OpenStairStudio_Design'), text('Open Stair Studio design parameters; dimensions are nominal millimetres'), stairProperties);
  const relationship = (type, from, to) => e(type, api.CreateIFCGloballyUniqueId(sid), null, null, null, from, to);
  const stairPsetRelation = relationship(IFC.IFCRELDEFINESBYPROPERTIES, [stairElement], stairPset);
  const originPset = e(IFC.IFCPROPERTYSET, api.CreateIFCGloballyUniqueId(sid), null,
    label('OSS_ProjectOrigin'), text('IFC Site plaatsing ten opzichte van het afgesproken projectnulpunt'), [
      ['OriginX_mm', IFC.IFCLENGTHMEASURE, bim.originX],
      ['OriginY_mm', IFC.IFCLENGTHMEASURE, bim.originY],
      ['OriginZ_mm', IFC.IFCLENGTHMEASURE, bim.originZ],
      ['RotationDegrees', IFC.IFCREAL, bim.originRotationDeg ?? 0],
      ['OriginAgreed', IFC.IFCBOOLEAN, bim.originAgreed]
    ].map(singleProperty));
  const originRelation = relationship(IFC.IFCRELDEFINESBYPROPERTIES, [site], originPset);
  const classificationRelations = [];
  if (naakt.some(Boolean)) {
    const pset = e(IFC.IFCPROPERTYSET, api.CreateIFCGloballyUniqueId(sid), null, label('OSS_NAAKT'),
      text('Projectopgave materiaalbenaming. Alle drie velden zijn nodig voor een volledige NAA.K.T.-naam.'),
      [['Naam', IFC.IFCLABEL, naakt[0]], ['Kenmerk', IFC.IFCLABEL, naakt[1]],
        ['Toepassing', IFC.IFCLABEL, naakt[2]], ['Volledig', IFC.IFCBOOLEAN, naakt.every(Boolean)]]
        .map(singleProperty));
    classificationRelations.push(relationship(IFC.IFCRELDEFINESBYPROPERTIES, [stairElement], pset));
  }

  const axis2 = e(IFC.IFCAXIS2PLACEMENT2D, e(IFC.IFCCARTESIANPOINT, [api.CreateIfcType(sid, IFC.IFCLENGTHMEASURE, 0), api.CreateIfcType(sid, IFC.IFCLENGTHMEASURE, 0)]), null);
  function boxSolid(center, xDirection, xLength, yWidth, zThickness, lowerZ) {
    const profile = e(IFC.IFCRECTANGLEPROFILEDEF, enumValue('AREA'), null, axis2, length(xLength), length(yWidth));
    const base = placementAlong([mm(center.x), mm(center.y), mm(lowerZ)], [0, 0, 1], [xDirection.x, xDirection.y, 0]);
    return e(IFC.IFCEXTRUDEDAREASOLID, profile, base, direction([0, 0, 1]), length(zThickness));
  }
  function treadSolid(tread) {
    const baseZ = tread.elevation - tread.thickness;
    if(profiledTimber) {
      // Coordination bodies stop at the inner stringer face. The workshop
      // contour also includes housed tongues, whose sockets are machined in CAM.
      const body=tread.noseDetail ? tread : profileTimberTread(tread,stair);
      if(!body.noseDetail) throw new Error('Ongeldige profielmaat aan de voorrand van '+tread.id+'.');
      const vertices=new Map();
      const faces=body.meshFaces.map(polygon=>{
        const loop=polygon.map(v=>{
          if(!vertices.has(v)) vertices.set(v,e(IFC.IFCCARTESIANPOINT,[length(v.x),length(v.y),length(v.z)]));
          return vertices.get(v);
        });
        return e(IFC.IFCFACE,[e(IFC.IFCFACEOUTERBOUND,e(IFC.IFCPOLYLOOP,loop),enumValue('T'))]);
      });
      profiledTreadBrepCount++;
      return e(IFC.IFCFACETEDBREP,e(IFC.IFCCLOSEDSHELL,faces));
    }
    if (!windingFlight && !joined) {
      return boxSolid(tread.center, tread.direction, tread.length, tread.width, tread.thickness, baseZ);
    }
    const vertices = tread.points.map(p => e(IFC.IFCCARTESIANPOINT, [length(p.x), length(p.y)]));
    const contour = e(IFC.IFCPOLYLINE, [...vertices, vertices[0]]);
    const profile = e(IFC.IFCARBITRARYCLOSEDPROFILEDEF, enumValue('AREA'), label(tread.id), contour);
    return e(IFC.IFCEXTRUDEDAREASOLID, profile, axis3([0, 0, mm(baseZ)]), direction([0, 0, 1]), length(tread.thickness));
  }
  function slopedBeamSolid(beam) {
    const { origin, axis, sideAxis } = beam.frame;
    const profile = e(IFC.IFCRECTANGLEPROFILEDEF, enumValue('AREA'), null, axis2, length(beam.thickness), length(beam.width));
    const frame = placementAlong([mm(origin.x), mm(origin.y), mm(origin.z)], [axis.x, axis.y, axis.z], [sideAxis.x, sideAxis.y, sideAxis.z]);
    return e(IFC.IFCEXTRUDEDAREASOLID, profile, frame, direction([0, 0, 1]), length(beam.length));
  }
  function mitredBeamSolid(beam) {
    const vertices = beam.vertices.map(({ x, y, z }) => e(IFC.IFCCARTESIANPOINT, [length(x), length(y), length(z)]));
    const faces = beam.faces.map(indices => {
      const loop = e(IFC.IFCPOLYLOOP, indices.map(index => vertices[index]));
      const boundary = e(IFC.IFCFACEOUTERBOUND, loop, enumValue('T'));
      return e(IFC.IFCFACE, [boundary]);
    });
    return e(IFC.IFCFACETEDBREP, e(IFC.IFCCLOSEDSHELL, faces));
  }
  function representation(solids, explicitType) {
    if (!solids.length) return null;
    // SolidModel admits both swept solids and boundary representations in one Body.
    const type = explicitType ?? (solids.some(item => item.type === IFC.IFCFACETEDBREP) ? 'SolidModel' : 'SweptSolid');
    const shape = e(IFC.IFCSHAPEREPRESENTATION, context, label('Body'), label(type), solids);
    return e(IFC.IFCPRODUCTDEFINITIONSHAPE, null, null, [shape]);
  }
  // IFC uses metres and local 2D profile coordinates. Each cutter keeps the
  // workshop pocket ID, so the actual host and machining feature can be traced.
  const cutsByHost = new Map();
  function registerCut(hostId, pocket, inward) {
    if (!cutsByHost.has(hostId)) cutsByHost.set(hostId, []);
    cutsByHost.get(hostId).push({pocket, inward});
  }
  if (joined) {
    for (const pocket of geometry.riserJoinery.pockets) registerCut(pocket.hostId, pocket, pocket.inward);
    const riserIds = new Set(geometry.riserJoinery.pockets.map(p => p.id));
    for (const job of geometry.housings?.beams ?? []) {
      for (const pocket of job.pockets) {
        if (riserIds.has(pocket.id)) continue;
        const n = job.frame.zAxis;
        registerCut(job.id, pocket, {x:-n.x, y:-n.y, z:-n.z});
      }
    }
  }
  function finishedBody(hostId, blank) {
    const cuts = cutsByHost.get(hostId);
    if (!cuts?.length) return representation([blank]);
    let solid = blank;
    for (const {pocket, inward:n} of cuts) {
      const [o, b] = pocket.worldContour;
      const edgeLength = Math.hypot(b.x-o.x, b.y-o.y, b.z-o.z);
      const x = [(b.x-o.x)/edgeLength, (b.y-o.y)/edgeLength, (b.z-o.z)/edgeLength];
      const y = [n.y*x[2]-n.z*x[1], n.z*x[0]-n.x*x[2], n.x*x[1]-n.y*x[0]];
      const project = (p, axis) => length((p.x-o.x)*axis[0] + (p.y-o.y)*axis[1] + (p.z-o.z)*axis[2]);
      const points = pocket.worldContour.map(p => e(IFC.IFCCARTESIANPOINT, [project(p,x),project(p,y)]));
      const contour = e(IFC.IFCPOLYLINE, [...points,points[0]]);
      const profile = e(IFC.IFCARBITRARYCLOSEDPROFILEDEF, enumValue('AREA'), label(pocket.id), contour);
      const frame = axis3([mm(o.x),mm(o.y),mm(o.z)], [n.x,n.y,n.z], x);
      const cutter = e(IFC.IFCEXTRUDEDAREASOLID, profile, frame, direction([0,0,1]), length(pocket.depth));
      solid = e(IFC.IFCBOOLEANRESULT, enumValue('DIFFERENCE'), solid, cutter);
    }
    return representation([solid], 'CSG');
  }
  const stairChildren = [];
  const timberObjects = separateTreads ? [] : [stairElement];
  const flightObjects = [];
  const landingObjects = [];
  const frameObjects = [];
  const screwObjects = [];
  const reservedObjects = [];
  const railingObjects = [];
  const typedDetails = new Map();
  const treadObjects = [];
  const joinedStrings = [];
  const joinedSteps = [];
  const partRelations = [];
  function reservation(id, role, solid, parentPlacement) {
    const object = e(IFC.IFCBUILDINGELEMENTPROXY, api.CreateIFCGloballyUniqueId(sid), null,
      label(id), text('Ruimtelijke reservering voor ' + role + '. Constructiedetail en materiaal volgen uit de projectuitwerking.'),
      label('Ruimtereservering ' + role), localPlacement(parentPlacement), representation([solid]),
      identifier(id), enumValue('PROVISIONFORSPACE'));
    reservedObjects.push(object);
    return object;
  }
  function engineeringTread(tread, flightPlacement) {
    let shape;
    if (surfaceTreads) {
      // An open walking surface preserves the full winder outline without creating
      // a fictitious steel volume or assuming a solid custom construction.
      const loop = e(IFC.IFCPOLYLOOP, tread.points.map(p => point([mm(p.x), mm(p.y), mm(tread.elevation)])));
      const face = e(IFC.IFCFACE, [e(IFC.IFCFACEOUTERBOUND, loop, enumValue('T'))]);
      shape = representation([e(IFC.IFCFACEBASEDSURFACEMODEL, [e(IFC.IFCCONNECTEDFACESET, [face])])], 'SurfaceModel');
    } else {
      shape = representation([treadSolid(tread)]);
    }
    return e(IFC.IFCPLATE, api.CreateIFCGloballyUniqueId(sid), null, label(tread.id),
      text(surfaceTreads ? 'Nominaal bovenvlak van de trede.' : 'Nominale buitencontour en inbouwdikte van de trede.'),
      label(dossier.structureLabel), localPlacement(flightPlacement), shape, identifier(tread.id), enumValue('USERDEFINED'));
  }
  for (const flight of geometry.flights) {
    const treads = geometry.treads.filter(tread => tread.flightIndex === flight.index);
    const flightPlacement = localPlacement(stairPlacement);
    const plates = separateTreads ? treads.map(tread => engineeringTread(tread, flightPlacement)) : [];
    const parts = [...plates];
    const solids = separateTreads || joined ? [] : treads.map(treadSolid);
    if (joined) {
      for (const tread of treads) {
        const object = e(IFC.IFCPLATE, api.CreateIFCGloballyUniqueId(sid), null, label(tread.id), null,
          label('Houten trede'), localPlacement(flightPlacement), finishedBody(tread.id, treadSolid(tread)),
          identifier(tread.id), enumValue('USERDEFINED'));
        parts.push(object);
        joinedSteps.push(object);
      }
    }
    for (const beam of geometry.stringers.filter(item => item.flightIndex === flight.index)) {
      const solid = beam.faces ? mitredBeamSolid(beam) : slopedBeamSolid(beam);
      if (separateTreads) parts.push(reservation(beam.id, 'wang', solid, flightPlacement));
      else if (joined) {
        const object = e(IFC.IFCMEMBER, api.CreateIFCGloballyUniqueId(sid), null, label(beam.id), null,
          label('Houten trapboom'), localPlacement(flightPlacement), finishedBody(beam.id, solid),
          identifier(beam.id), enumValue('STRINGER'));
        joinedStrings.push(object);
        parts.push(object);
      }
      else solids.push(solid);
    }
    const flightRep = representation(solids);
    const flightObject = e(IFC.IFCSTAIRFLIGHT, api.CreateIFCGloballyUniqueId(sid), null,
      label(flight.label), text(`Trapvlucht ${flight.index + 1} · ${separateTreads ? dossier.structureLabel : stair.material}`),
      label(separateTreads ? 'Trapvlucht met afzonderlijke treden' : 'Timber stair flight'),
      flightPlacement, flightRep, identifier(`${stair.mark}-V${flight.index + 1}`),
      api.CreateIfcType(sid, IFC.IFCINTEGER, flight.risers), api.CreateIfcType(sid, IFC.IFCINTEGER, flight.treadCount),
      api.CreateIfcType(sid, IFC.IFCPOSITIVELENGTHMEASURE, mm(d.rise)),
      windingFlight ? null : api.CreateIfcType(sid, IFC.IFCPOSITIVELENGTHMEASURE, mm(stair.going)),
      enumValue(windingFlight ? 'WINDER' : 'STRAIGHT'));
    stairChildren.push(flightObject);
    flightObjects.push(flightObject);
    if (!separateTreads) timberObjects.push(flightObject);
    if (parts.length) {
      partRelations.push(relationship(IFC.IFCRELAGGREGATES, flightObject, parts));
      treadObjects.push(...plates);
    }
  }
  if (treadObjects.length) {
    const scope = surfaceTreads ? 'Loopvlak met nominale inbouwdikte als eigenschap.' : 'Nominale uitwendige plaatafmetingen.';
    const pset = e(IFC.IFCPROPERTYSET, api.CreateIFCGloballyUniqueId(sid), null, label('OSS_TreadSystem'),
      text('Opgegeven projectgegevens van de treden voor ontwerpcoördinatie.'), [
        ...technicalProperties, ['GeometryScope', IFC.IFCTEXT, scope],
        ['NominalTreadThickness_mm', IFC.IFCLENGTHMEASURE, geometry.treads[0].thickness]
      ].map(singleProperty));
    partRelations.push(relationship(IFC.IFCRELDEFINESBYPROPERTIES, treadObjects, pset));
    const materialSpec = { glass: ['Glas', 'glass'], grating: ['Staal', 'steel'], clt: ['Kruislaaghout (CLT)', 'wood'] }[engineering.structureType];
    if (materialSpec) {
      const [name, category] = materialSpec;
      const material = e(IFC.IFCMATERIAL, label(name), null, label(category));
      partRelations.push(relationship(IFC.IFCRELASSOCIATESMATERIAL, treadObjects, material));
    }
  }
  for (const landing of geometry.landings) {
    const minX = Math.min(...landing.points.map(p => p.x)), maxX = Math.max(...landing.points.map(p => p.x));
    const minY = Math.min(...landing.points.map(p => p.y)), maxY = Math.max(...landing.points.map(p => p.y));
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const solid = boxSolid(center, { x: 1, y: 0 }, maxX - minX, maxY - minY, landing.thickness, landing.elevation - landing.thickness);
    const slab = separateTreads ? reservation(landing.id, 'bordes', solid, stairPlacement) :
      e(IFC.IFCSLAB, api.CreateIFCGloballyUniqueId(sid), null, label(landing.id), text('Trapbordes · conceptplaat'), label('Landing'),
      localPlacement(stairPlacement), finishedBody(landing.id, solid), identifier(landing.id), enumValue('LANDING'));
    stairChildren.push(slab);
    landingObjects.push(slab);
    if (!separateTreads) timberObjects.push(slab);
  }
  if (!separateTreads) {
    for (const member of geometry.landingFrame ?? []) {
      const solid = boxSolid(member.center, member.direction, member.length, member.width,
        member.thickness, member.elevation-member.thickness);
      const object = e(IFC.IFCBEAM, api.CreateIFCGloballyUniqueId(sid), null,
        label(member.id), text('Houten bordesrandligger; gebouwankers projectmatig uit te werken'),
        label('Bordesrandligger'), localPlacement(stairPlacement), representation([solid]),
        identifier(member.id), enumValue('BEAM'));
      stairChildren.push(object);
      frameObjects.push(object);
      timberObjects.push(object);
    }
    if (frameObjects.length) {
      const pset = e(IFC.IFCPROPERTYSET, api.CreateIFCGloballyUniqueId(sid), null,
        label('OSS_Bordesraam'), text('Randliggers en stuiknaden; bevestiging constructief uit te werken'), [
          ['Randliggerbreedte_mm', IFC.IFCLENGTHMEASURE, stair.landingFrameWidth],
          ['Randliggerhoogte_mm', IFC.IFCLENGTHMEASURE, stair.landingFrameDepth],
          ['Stuiknaden', IFC.IFCINTEGER, geometry.landingJoints?.length ?? 0],
          ['Schroeven', IFC.IFCINTEGER, geometry.landingFasteners?.length ?? 0],
          ['SchroeftoetsStatus', IFC.IFCLABEL, landingJointCheck.status],
          ['SchroeftoetsScope', IFC.IFCTEXT, landingJointCheck.scope],
          ...(landingJointCheck.screwDemand==null?[]:[['Schroefbelasting_kN',IFC.IFCREAL,landingJointCheck.screwDemand]]),
          ...(landingJointCheck.utilization==null?[]:[['Benutting',IFC.IFCREAL,landingJointCheck.utilization]]),
          ...(landingJointCheck.memberChecks?.some(item=>item.bendingUtilization!=null)?[
            ['MaxBuigbenutting',IFC.IFCREAL,Math.max(...landingJointCheck.memberChecks.map(item=>item.bendingUtilization??0))],
            ['MaxDoorbuigingsbenutting',IFC.IFCREAL,Math.max(...landingJointCheck.memberChecks.map(item=>item.deflectionUtilization??0))]
          ]:[]),
          ['Gebouwankers', IFC.IFCLABEL, 'Projectdetail ontbreekt']
        ].map(singleProperty));
      partRelations.push(relationship(IFC.IFCRELDEFINESBYPROPERTIES, frameObjects, pset));
    }
  }

  const detailMaterials = new Map();
  const indexedDetail=p=>p.stockVolumeM3>0 && (stair.timberDetail && stair.timberDetail!=='basic' || stair.wellatType==='chamfered');
  const indexedDetailCount=detailParts.filter(indexedDetail).length;
  function detailSolid(part){
    if(indexedDetail(part)){
      const {coordinates,triangles}=tessellate(part,p=>[p.x,p.y,p.z]);
      const coords=e(IFC.IFCCARTESIANPOINTLIST3D,coordinates.map(v=>v.map(length)));
      const indices=triangles.map(t=>t.map(n=>api.CreateIfcType(sid,IFC.IFCPOSITIVEINTEGER,n)));
      return representation([e(IFC.IFCTRIANGULATEDFACESET,coords,null,enumValue('T'),indices,null)],'Tessellation');
    }
    const vertices=new Map();
    const faces=part.faces.map(polygon=>{
      const loop=polygon.map(v=>{
        const key=[v.x,v.y,v.z].join(',');
        if(!vertices.has(key)) vertices.set(key,e(IFC.IFCCARTESIANPOINT,[length(v.x),length(v.y),length(v.z)]));
        return vertices.get(key);
      });
      return e(IFC.IFCFACE,[e(IFC.IFCFACEOUTERBOUND,e(IFC.IFCPOLYLOOP,loop),enumValue('T'))]);
    });
    return representation([e(IFC.IFCFACETEDBREP,e(IFC.IFCCLOSEDSHELL,faces))],'Brep');
  }
  for (const detail of detailParts) {
    const [entityType, predefined] = {railing:[IFC.IFCRAILING,'HANDRAIL'], member:[IFC.IFCMEMBER,'POST'], plate:[IFC.IFCPLATE,'USERDEFINED']}[detail.kind];
    const obj = e(entityType, api.CreateIFCGloballyUniqueId(sid), null, label(detail.label),
      text('Ontwerpcoördinatie van leuning of stootbord.'), label(detail.label),
      localPlacement(stairPlacement), detailSolid(detail), identifier(detail.id), enumValue(detail.role==='nosingStrip'?'MEMBER':predefined));
    stairChildren.push(obj);
    const typeKey = `${detail.kind}:${detail.role}`;
    if (!typedDetails.has(typeKey)) typedDetails.set(typeKey, []);
    typedDetails.get(typeKey).push(obj);
    if (detail.kind === 'railing' || (detail.kind === 'member' && detail.role !== 'nosingStrip')) railingObjects.push(obj);
    if(indexedDetail(detail)){
      const properties=[
        ['Profiel',IFC.IFCLABEL,detail.profileName],['Merk',IFC.IFCIDENTIFIER,detail.id],
        ['Aslengte',IFC.IFCLENGTHMEASURE,detail.lengthMm],['Ruwlengte',IFC.IFCLENGTHMEASURE,detail.stockLengthMm],
        ['Ruwbreedte',IFC.IFCLENGTHMEASURE,detail.stockWidthMm],['Ruwdikte',IFC.IFCLENGTHMEASURE,detail.stockThicknessMm],
        ['Netto hout',IFC.IFCVOLUMEMEASURE,detail.volumeM3],['Bruto hout',IFC.IFCVOLUMEMEASURE,detail.stockVolumeM3],
        ['Traponderdeel',IFC.IFCLABEL,detail.partOf],['Fabricagebevinding',IFC.IFCTEXT,detail.fabricationIssue]
      ].filter(([, ,value])=>value!=null).map(singleProperty);
      const pset=e(IFC.IFCPROPERTYSET,api.CreateIFCGloballyUniqueId(sid),null,label('OSS_Houtdetail'),null,properties);
      partRelations.push(relationship(IFC.IFCRELDEFINESBYPROPERTIES,[obj],pset));
    }
    if (!detailMaterials.has(detail.material)) detailMaterials.set(detail.material, []);
    detailMaterials.get(detail.material).push(obj);
  }
  for (const [id,objects] of detailMaterials) {
    const wood = id === 'timber';
    if (wood) timberObjects.push(...objects);
    else {
      const material = e(IFC.IFCMATERIAL, label('Verzinkt staal'), null, label('steel'));
      partRelations.push(relationship(IFC.IFCRELASSOCIATESMATERIAL, objects, material));
    }
  }
  if(!separateTreads)for(const screw of geometry.landingFasteners??[]) {
    const object=e(IFC.IFCMECHANICALFASTENER,api.CreateIFCGloballyUniqueId(sid),null,
      label(screw.id),text(`Bordesraamschroef bij ${screw.jointId}; constructieve weerstand te toetsen`),
      label('Schroef'),localPlacement(stairPlacement),detailSolid(screw),identifier(screw.id),
      api.CreateIfcType(sid,IFC.IFCPOSITIVELENGTHMEASURE,mm(screw.diameter)),
      api.CreateIfcType(sid,IFC.IFCPOSITIVELENGTHMEASURE,mm(screw.length)),enumValue('SCREW'));
    stairChildren.push(object);
    screwObjects.push(object);
  }
  if(screwObjects.length){
    const material=e(IFC.IFCMATERIAL,label('Verzinkt staal'),null,label('steel'));
    partRelations.push(relationship(IFC.IFCRELASSOCIATESMATERIAL,screwObjects,material));
  }
  if (timberObjects.length) {
    timberObjects.push(...joinedStrings, ...joinedSteps);
    const material = e(IFC.IFCMATERIAL, label(specifiedTimber), null, label('wood'));
    partRelations.push(relationship(IFC.IFCRELASSOCIATESMATERIAL, timberObjects, material));
  }

  const typeRelations = [];
  function assignType(objects, entity, name, predefined) {
    if (!objects.length) return;
    const type = e(entity, api.CreateIFCGloballyUniqueId(sid), null, label(name),
      text('Open Stair Studio producttype voor ontwerpcoordinatie'), null, null, null, null,
      label(name), enumValue(predefined));
    typeRelations.push(relationship(IFC.IFCRELDEFINESBYTYPE, objects, type));
  }
  assignType([stairElement], IFC.IFCSTAIRTYPE, `${d.family.label} · ${dossier.structureLabel}`, stairType);
  assignType(flightObjects, IFC.IFCSTAIRFLIGHTTYPE, `${d.family.label} · vlucht`, windingFlight ? 'WINDER' : 'STRAIGHT');
  assignType(landingObjects.filter(o => o.type === IFC.IFCSLAB), IFC.IFCSLABTYPE, 'Trapbordes', 'LANDING');
  assignType(frameObjects, IFC.IFCBEAMTYPE, 'Houten bordesrandligger', 'BEAM');
  if(screwObjects.length){
    const type=e(IFC.IFCMECHANICALFASTENERTYPE,api.CreateIFCGloballyUniqueId(sid),null,
      label('Bordesraamschroef'),null,null,null,null,null,label('Schroef'),enumValue('SCREW'),
      api.CreateIfcType(sid,IFC.IFCPOSITIVELENGTHMEASURE,mm(stair.landingScrewDiameter)),
      api.CreateIfcType(sid,IFC.IFCPOSITIVELENGTHMEASURE,mm(stair.landingScrewLength)));
    typeRelations.push(relationship(IFC.IFCRELDEFINESBYTYPE,screwObjects,type));
  }
  assignType(treadObjects, IFC.IFCPLATETYPE, `${dossier.structureLabel} · trede`, 'USERDEFINED');
  assignType(joinedSteps, IFC.IFCPLATETYPE, 'Houten trede', 'USERDEFINED');
  assignType(joinedStrings, IFC.IFCMEMBERTYPE, 'Houten trapboom', 'STRINGER');
  assignType(reservedObjects, IFC.IFCBUILDINGELEMENTPROXYTYPE, 'Ruimtereservering trapconstructie', 'PROVISIONFORSPACE');
  for (const [key, objects] of typedDetails) {
    const [kind, role] = key.split(':');
    const entity = { railing: IFC.IFCRAILINGTYPE, member: IFC.IFCMEMBERTYPE, plate: IFC.IFCPLATETYPE }[kind];
    const predefined = kind === 'railing' ? 'HANDRAIL' : kind === 'member' ? (role === 'nosingStrip' ? 'MEMBER' : 'POST') : 'USERDEFINED';
    assignType(objects, entity, `Traponderdeel · ${role}`, predefined);
  }

  if (stair.nlsfbCode) {
    const system = e(IFC.IFCCLASSIFICATION, null, null, null, label('NL-SfB'), null, null, null);
    const groups = new Map();
    const codeFor = object => (landingObjects.includes(object) || frameObjects.includes(object) || screwObjects.includes(object)) ? stair.nlsfbLandingCode || stair.nlsfbCode :
      railingObjects.includes(object) ? stair.nlsfbRailingCode || stair.nlsfbCode : stair.nlsfbCode;
    for (const object of [stairElement, ...stairChildren, ...treadObjects, ...joinedSteps, ...joinedStrings]) {
      const code = codeFor(object);
      if (!groups.has(code)) groups.set(code, []);
      if (!groups.get(code).includes(object)) groups.get(code).push(object);
    }
    for (const [code, objects] of groups) {
      const reference = e(IFC.IFCCLASSIFICATIONREFERENCE, null, identifier(code), label('NL-SfB-elementcode'), system, null, null);
      classificationRelations.push(relationship(IFC.IFCRELASSOCIATESCLASSIFICATION, objects, reference));
    }
  }

  const aggregates = [
    relationship(IFC.IFCRELAGGREGATES, project, [site]),
    relationship(IFC.IFCRELAGGREGATES, site, [building]),
    relationship(IFC.IFCRELAGGREGATES, building, [storey]),
    relationship(IFC.IFCRELAGGREGATES, stairElement, stairChildren),
    relationship(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, [stairElement], storey),
    stairPsetRelation, originRelation, ...classificationRelations, ...typeRelations, ...partRelations
  ];
  for (const relation of aggregates) api.WriteLine(sid, relation);
  api.WriteLine(sid, project);
  const bytes = api.SaveModel(sid);
  const validationId = api.OpenModel(bytes);
  if (validationId < 0) throw new Error('De IFC4-export kon niet opnieuw worden geopend.');
  try {
    const schema = api.GetModelSchema(validationId);
    const count = type => api.GetLineIDsWithType(validationId, type).size();
    const stairCount = count(IFC.IFCSTAIR);
    const flightCount = count(IFC.IFCSTAIRFLIGHT);
    const proxyIds = api.GetLineIDsWithType(validationId, IFC.IFCBUILDINGELEMENTPROXY);
    const landingCount = separateTreads ? Array.from({length:proxyIds.size()}, (_, i) =>
      api.GetLine(validationId, proxyIds.get(i))).filter(proxy => proxy.ObjectType?.value === 'Ruimtereservering bordes').length : count(IFC.IFCSLAB);
    const brepCount = count(IFC.IFCFACETEDBREP);
    // Each pocket uses one extrusion as the second operand of a difference.
    const cutterCount = [...cutsByHost.values()].reduce((sum, cuts) => sum + cuts.length, 0);
    const solidCount = count(IFC.IFCEXTRUDEDAREASOLID) - cutterCount + brepCount + count(IFC.IFCTRIANGULATEDFACESET);
    const surfaceCount = count(IFC.IFCFACEBASEDSURFACEMODEL);
    const expectedBreps = geometry.stringers.filter(beam=>!!beam.faces).length + detailParts.length - indexedDetailCount + profiledTreadBrepCount + screwObjects.length;
    const expectedSolids = (surfaceTreads ? 0 : geometry.treads.length) + geometry.landings.length + geometry.stringers.length + detailParts.length + frameObjects.length + screwObjects.length;
    if (schema !== IFC.Schemas.IFC4 || stairCount !== 1 || flightCount !== geometry.flights.length ||
        count(IFC.IFCBOOLEANRESULT) !== cutterCount ||
        count(IFC.IFCPLATE) !== (separateTreads ? geometry.treads.length : joinedSteps.length) + detailParts.filter(p=>p.kind==='plate').length ||
        count(IFC.IFCRAILING) !== detailParts.filter(p=>p.kind==='railing').length ||
        count(IFC.IFCMEMBER) !== joinedStrings.length + detailParts.filter(p=>p.kind==='member').length ||
        count(IFC.IFCBUILDINGELEMENTPROXY) !== (separateTreads ? geometry.stringers.length + geometry.landings.length : 0) ||
        surfaceCount !== (surfaceTreads ? geometry.treads.length : 0) ||
        landingCount !== geometry.landings.length || count(IFC.IFCBEAM) !== frameObjects.length ||
        count(IFC.IFCMECHANICALFASTENER) !== screwObjects.length ||
        solidCount !== expectedSolids || brepCount !== expectedBreps) {
      throw new Error('In de opnieuw geopende IFC4-export ontbreken verwachte traponderdelen.');
    }

    // STEP entity counts alone cannot detect references written to the wrong attribute.
    for (const relation of aggregates) {
      const reopened = api.GetLine(validationId, relation.expressID);
      if (!reopened || reopened.Description !== null) throw new Error('Ongeldige relatie in de IFC4-export.');
      for (const key of Object.keys(relation).filter(key => key.startsWith('Relating') || key.startsWith('Related'))) {
        const expected = relation[key];
        const actual = reopened[key];
        const matches = Array.isArray(expected)
          ? Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => actual[i]?.value === (item.value ?? item.expressID))
          : actual?.value === (expected.value ?? expected.expressID);
        if (!matches) throw new Error('Een IFC4-relatie verwijst niet naar de verwachte objecten.');
      }
    }
    return { bytes, schema, stairCount, flightCount, landingCount, solidCount, surfaceCount };
  } finally {
    api.CloseModel(validationId);
  }
}
