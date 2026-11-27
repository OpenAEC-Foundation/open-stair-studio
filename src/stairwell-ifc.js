import { tessellate } from './ifc-tessellate.js';
import { stairMeasureProperties } from './ifc-stair-properties.js';
import * as IFC from 'web-ifc';
import { assembleWell, elevationOf, heightOn, kindNames, levelsFor, materialNames, readWell, typeOf } from './stairwell.js';
import { liftPlanFields } from './precast-plans.js';

const enumeration = value => ({ type:3, value });
const detailLabels = {
  mainBar:'Hoofdwapening',crossBar:'Verdeelwapening',liftAnchor:'Ingestort hijsanker',
  connectionPlate:'Aansluitplaat zijverbinding',anchorBolt:'Verankeringsbout',anchorNut:'Ankermoer',
  bearingBar:'Bijlegwapening oplegging',liftingBar:'Bijlegwapening hijshuls',anchorageBar:'Bijlegwapening verankering'
};
const checkLabels = {open:'Open',fail:'Overschreden',pass:'Deeltoets voldoet'};
let apiPromise;
function library() {
  if (!apiPromise) apiPromise = (async () => {
    const api = new IFC.IfcAPI();
    if (typeof window === 'undefined') await api.Init();
    else {
      const {default:url} = await import('web-ifc/web-ifc.wasm?url');
      await api.Init(() => url);
    }
    return api;
  })().catch(error => { apiPromise = undefined; throw error; });
  return apiPromise;
}

// 128 name-derived bits encoded with buildingSMART's GUID alphabet. The namespace is
// saved with the well; changing a label, dimensions, position or storey preserves part identity.
async function compressedId(name) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name))).slice(0,16);
  bytes[6] = (bytes[6] & 15) | 0x80;
  bytes[8] = (bytes[8] & 63) | 0x80;
  let n = 0n;
  for (const b of bytes) n = (n<<8n) | BigInt(b);
  let out = '';
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  for (let i = 0; i < 22; i++) { out = alphabet[Number(n & 63n)] + out; n >>= 6n; }
  return out;
}

export async function createStairwellIfc(project, input, bim = {}) {
  const well = readWell(input);
  if (!well.instances.length) throw new Error('Plaats eerst een component in het trappenhuis.');
  const assemblies = assembleWell(well);
  for (const a of assemblies) {
    const error = a.issues.find(i => i.level === 'error');
    if (error || !a.parts.length) throw new Error(a.instance.mark+' · '+(error?.text ?? 'Lege geometrie.'));
  }
  const api = await library();
  const sid = api.CreateModel({schema:IFC.Schemas.IFC4, name:(project.number || 'OSS')+'-trappenhuis.ifc',
    description:['Design coordination of staircase components'], authors:['OpenAEC'], organizations:['OpenAEC'], authorization:'Concept'});
  try { return await write(api,sid,project,well,assemblies,bim); }
  finally { api.CloseModel(sid); }
}

async function write(api, sid, project, well, assemblies, bim) {
  const e = (type,...args) => api.CreateIfcEntity(sid,type,...args);
  const typed = (type,v) => api.CreateIfcType(sid,type,v);
  const label = s => typed(IFC.IFCLABEL,s), text = s => typed(IFC.IFCTEXT,s);
  const length = n => typed(IFC.IFCLENGTHMEASURE,n), count = n => typed(IFC.IFCINTEGER,n);
  const scope = well.uid || project.number || well.instances[0].id;
  const guidRequests = [];
  const guid = keys => {
    const token = typed(IFC.IFCGLOBALLYUNIQUEID,'');
    guidRequests.push({name:JSON.stringify(['Open Stair Studio','trappenhuis',scope,...keys]),token});
    return token;
  };
  const relation = (type,keys,a,b) => e(type,guid(keys),null,null,null,a,b);
  const aggregate = (keys, parent, children) => relation(IFC.IFCRELAGGREGATES,keys,parent,children);
  const vec = xyz => e(IFC.IFCDIRECTION,xyz.map(v => typed(IFC.IFCREAL,v)));
  const axis = (x=0,y=0,z=0,deg=0) => e(IFC.IFCAXIS2PLACEMENT3D,e(IFC.IFCCARTESIANPOINT,[x,y,z].map(length)),
    deg ? vec([0,0,1]) : null,deg ? vec([Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180),0]) : null);
  const origin = axis();
  const placement = (parent=null,orientation=origin) => e(IFC.IFCLOCALPLACEMENT,parent,orientation);
  const unit = (kind,prefix,name) => e(IFC.IFCSIUNIT,enumeration(kind),prefix ? enumeration(prefix) : null,enumeration(name));
  const kg = unit('MASSUNIT','KILO','GRAM');
  const metre = unit('LENGTHUNIT',null,'METRE'), kilonewton = unit('FORCEUNIT','KILO','NEWTON');
  const megapascal = unit('PRESSUREUNIT','MEGA','PASCAL');
  const derived = (kind,components) => e(IFC.IFCDERIVEDUNIT,
    components.map(([base,power])=>e(IFC.IFCDERIVEDUNITELEMENT,base,count(power))),enumeration(kind),null);
  const densityUnit = derived('MASSDENSITYUNIT',[[kg,1],[metre,-3]]);
  const torqueUnit = derived('TORQUEUNIT',[[kilonewton,1],[metre,1]]);
  const bendingUnit = e(IFC.IFCDERIVEDUNIT,[[kilonewton,1],[metre,2]].map(([u,p])=>
    e(IFC.IFCDERIVEDUNITELEMENT,u,count(p))),enumeration('USERDEFINED'),label('Buigstijfheid kN m2'));
  const surfaceLoadUnit = derived('PLANARFORCEUNIT',[[kilonewton,1],[metre,-2]]);
  const units = e(IFC.IFCUNITASSIGNMENT,[unit('LENGTHUNIT','MILLI','METRE'), unit('AREAUNIT',null,'SQUARE_METRE'),
    unit('VOLUMEUNIT',null,'CUBIC_METRE'), unit('PLANEANGLEUNIT',null,'RADIAN'),kg,densityUnit]);
  const context = e(IFC.IFCGEOMETRICREPRESENTATIONCONTEXT,null,label('Model'),count(3),typed(IFC.IFCREAL,1e-5),origin,null);
  const projectObject = e(IFC.IFCPROJECT,guid(['project']),null,label(project.name || 'Trappenhuis'),text(project.number || ''),null,
    null,label(project.revision || ''),[context],units);
  const sitePos = placement(null,axis(bim.originX,bim.originY,bim.originZ,bim.originRotationDeg));
  const buildingPos = placement(sitePos);
  const site = e(IFC.IFCSITE,guid(['site']),null,label(project.location || 'Projectlocatie'),null,null,sitePos,null,null,enumeration('ELEMENT'),null,null,null,null,null);
  const building = e(IFC.IFCBUILDING,guid(['building']),null,label('Trappenhuis'),null,null,buildingPos,null,null,enumeration('ELEMENT'),null,null,null);
  const links = [aggregate(['project-site'],projectObject,[site]),aggregate(['site-building'],site,[building])];
  const byLevel = new Map();
  for (const n of levelsFor(well.instances)) {
    const z = elevationOf(well,n), pos = placement(buildingPos,axis(0,0,z));
    const obj = e(IFC.IFCBUILDINGSTOREY,guid(['storey',n]),null,label('Bouwlaag '+n),null,null,pos,null,null,enumeration('ELEMENT'),length(z));
    byLevel.set(n,{obj,pos,stairs:[]});
  }
  links.push(aggregate(['building-storeys'],building,[...byLevel.values()].map(v=>v.obj)));
  function property(name,v,unitName,description) {
    let value, explicitUnit = null;
    if (typeof v === 'string') value = text(v);
    else if (typeof v === 'boolean') value = typed(IFC.IFCBOOLEAN,v);
    else if (unitName === 'mm') value = length(v);
    else if (unitName === '°') value = typed(IFC.IFCPLANEANGLEMEASURE,v*Math.PI/180);
    else if (unitName === 'm³') value = typed(IFC.IFCVOLUMEMEASURE,v);
    else if (unitName === 'm²') value = typed(IFC.IFCAREAMEASURE,v);
    else if (unitName === 'mm²') value = typed(IFC.IFCAREAMEASURE,v/1e6);
    else if (unitName === 'kg') value = typed(IFC.IFCMASSMEASURE,v);
    else if (unitName === 'kg/m³') value = typed(IFC.IFCMASSDENSITYMEASURE,v);
    else if (unitName === 'kN') {value = typed(IFC.IFCFORCEMEASURE,v); explicitUnit = kilonewton;}
    else if (unitName === 'kNm²') {value = typed(IFC.IFCREAL,v); explicitUnit = bendingUnit;}
    else if (['kNm','kN·m','kN m'].includes(unitName)) {value = typed(IFC.IFCTORQUEMEASURE,v); explicitUnit = torqueUnit;}
    else if (unitName === 'kN/m²') {value = typed(IFC.IFCPLANARFORCEMEASURE,v); explicitUnit = surfaceLoadUnit;}
    else if (unitName === 'MPa' || unitName === 'N/mm²') {value = typed(IFC.IFCPRESSUREMEASURE,v); explicitUnit = megapascal;}
    else if (unitName === '–') value = typed(IFC.IFCRATIOMEASURE,v);
    else if (Number.isInteger(v)) value = count(v);
    else value = typed(IFC.IFCREAL,v);
    return e(IFC.IFCPROPERTYSINGLEVALUE,label(name),description ? text(description) : null,value,explicitUnit);
  }
  function addSet(keys,obj,name,props) {
    const set = e(IFC.IFCPROPERTYSET,guid([...keys,'set',name]),null,label(name),null,props);
    links.push(relation(IFC.IFCRELDEFINESBYPROPERTIES,[...keys,'defines',name],Array.isArray(obj)?obj:[obj],set));
  }
  function addMeasures(keys, object, name, measures) {
    const properties = stairMeasureProperties(measures).map(([key, type, value]) =>
      e(IFC.IFCPROPERTYSINGLEVALUE, label(key), null, typed(type, value), null));
    if (properties.length) addSet(keys, object, name, properties);
  }
  addSet(['site'],site,'OSS_ProjectOrigin',[
    property('OriginX_mm',bim.originX ?? 0,'mm'), property('OriginY_mm',bim.originY ?? 0,'mm'),
    property('OriginZ_mm',bim.originZ ?? 0,'mm'),
    e(IFC.IFCPROPERTYSINGLEVALUE,label('RotationDegrees'),null,typed(IFC.IFCREAL,bim.originRotationDeg ?? 0),null),
    property('OriginAgreed',bim.originAgreed === true)
  ]);
  function addStructural(keys,stair,products,result,i) {
    const {checks,connections,notes,status}=result;
    const byCheck=new Map(checks.map(check=>[check.id,[]]));
    const part=id=>{
      if(!products.has(id))throw new Error(i.mark+' · constructief onderdeel ontbreekt: '+id);
      return products.get(id);
    };
    addSet(keys,stair,'OSS_ConstructieveBerekening',[
      property('Status',checkLabels[status]),property('Project',project.number||''),property('Revisie',project.revision||''),
      property('Grondslag',i.params.designBasis?.trim()||'Open'),
      ...notes.map((note,n)=>property('Uitgangspunt '+(n+1),note))
    ]);
    for(const c of connections) {
      const groupKeys=[...keys,'verbinding',c.id];
      const group=e(IFC.IFCGROUP,guid(groupKeys),null,label(i.mark+'/'+c.id),text(c.label),label('Trapverbinding'));
      const members=[...new Set(c.partIds)].map(part);
      links.push(e(IFC.IFCRELASSIGNSTOGROUP,guid([...groupKeys,'leden']),null,label(c.label),null,members,null,group));
      const states=c.checkIds.map(id=>{
        if(!byCheck.has(id))throw new Error(i.mark+' · onbekende verbindingstoets: '+id);
        byCheck.get(id).push(group);
        return checks.find(check=>check.id===id).status;
      });
      addSet(groupKeys,group,'OSS_Verbinding',[
        property('Merk',i.mark),property('Verbinding',c.id),property('Omschrijving',c.label),
        property('Status',checkLabels[states.includes('fail')?'fail':!states.length||states.includes('open')?'open':'pass']),
        property('Onderdeelmerken',c.partIds.join(', ')),property('Toetsen',c.checkIds.join(', ')),
        ...(c.note?[property('Detail',c.note)]:[])
        ,...(c.ground?[property('Ondergrond',c.ground.type),property('Sterkteklasse',c.ground.grade),property('Productrapport',c.ground.reference),
          property('Randafstand',c.ground.edgeMm,'mm'),property('Kleinste h.o.h.',c.ground.spacingMm,'mm'),
          property('Groepstrek Rd',c.ground.tensionRd,'kN'),property('Groepsafschuiving Rd',c.ground.shearRd,'kN')]:[])
      ]);
    }
    for(const c of checks) {
      const targets=[...new Set([stair,...c.partIds.map(part),...byCheck.get(c.id)])];
      addSet(keys,targets,'OSS_ConstructieveToets_'+c.id,[
        property('Deeltoets',c.label),property('Status',checkLabels[c.status]),property('Fase',c.phase||''),
        ...(Number.isFinite(c.demand)?[property('Rekenwaarde',c.demand,c.unit)]:[]),
        ...(Number.isFinite(c.capacity)?[property('Grenswaarde',c.capacity,c.unit)]:[]),
        ...(c.unit?[property('Eenheid',c.unit)]:[]),...(c.note?[property('Toelichting',c.note)]:[])
      ]);
    }
  }
  function addChecks(keys,element,result) {
    const metrics = result.metrics.filter(m=>Number.isFinite(m.value) || typeof m.value==='string');
    addSet(keys,element,'OSS_PrefabElement',[
      property('Element',result.label),property('Status',checkLabels[result.status]),
      ...metrics.map(m=>property(m.label,m.value,m.unit))
    ]);
    for (const check of result.checks) {
      const props=[property('Deeltoets',check.label),property('Status',checkLabels[check.status])];
      if (Number.isFinite(check.demand)) props.push(property('Rekenwaarde',check.demand,check.unit));
      if (Number.isFinite(check.capacity)) props.push(property('Grenswaarde',check.capacity,check.unit));
      if (check.note) props.push(property('Toelichting',check.note));
      addSet(keys,element,'OSS_Toets_'+check.id,props);
    }
    if (result.liftPlan) {
      const changed=result.liftPlanOverrides??[];
      addSet(keys,element,'OSS_Elementhijsplan',[
        property('Element',result.id),property('Elementwaarden',changed.join(', ')||'Trapwaarden'),
        ...liftPlanFields.map(f=>{
          const v=result.liftPlan[f.key];
          return property(f.key,f.type==='select'?f.options.find(([id])=>id===v)?.[1]??v:v,f.unit,f.label);
        })
      ]);
    }
    for(const z of result.localDetails??[]) {
      const props=[property('Doelvoorziening',z.targetId),property('Status',checkLabels[z.status]??'Open'),
        property('Detailreferentie',z.reference||'Open')];
      for(const [key,name,unit] of [['providedAreaMm2','Getekende doorsnede','mm²'],['requiredAreaMm2','Benodigde doorsnede','mm²'],
        ['availableTailMm','Getekende staartlengte','mm'],['requiredTailMm','Vereiste staartlengte','mm'],['forceKN','Lokale kracht','kN']]) {
        if(Number.isFinite(z[key])&&(!key.startsWith('required')||z[key]>0))props.push(property(name,z[key],unit));
      }
      for(const [key,name,u] of [['reactionKN','Steunreactie','kN'],['loadArmMm','Arm uitwendige kracht','mm'],['leverMm','Hefboomsarm trekband','mm'],['maxLeverMm','Geometrische bovengrens hefboomsarm','mm']]){
        if(Number.isFinite(z[key])&&z[key]>0)props.push(property(name,z[key],u));
      }
      for(const check of z.checks??[]) {
        props.push(property(check.label+' · toets',checkLabels[check.status]??'Open'));
        if(check.note) props.push(property(check.label+' · toelichting',check.note));
      }
      if(z.note) props.push(property('Uitgangspunt',z.note));
      addSet(keys,element,'OSS_Bijlegzone_'+z.targetId,props);
    }
  }
  addSet(['building'],building,'OSS_Trappenhuis',[
    property('Schachtlengte',well.length,'mm'),property('Schachtbreedte',well.width,'mm'),
    property('Verdiepingshoogte',well.storeyHeight,'mm'),property('Vloerdikte',well.slabThickness,'mm')
  ]);

  const materials = new Map(), glassStyles=new Map();
  const barTypes = new Map();
  let partCount = 0;
  for (const {instance:i,parts,issues,metrics,precast,escape,structural} of assemblies) {
    const def = typeOf(i.type), level = byLevel.get(i.storey), keys = ['instance',i.id];
    const loc = placement(level.pos,axis(i.x,i.y,0,i.rotation)), relLoc = placement(loc);
    const railPos = placement(loc), railPartPos = placement(railPos), flightPos = placement(loc), treadPos = placement(flightPos);
    const height = i.params.accessHeight??heightOn(well,i.storey), elevation = elevationOf(well,i.storey);
    const form = i.type === 'spiral' ? 'SPIRAL_STAIR' : ['loft','ladder','portable'].includes(i.type) ? 'USERDEFINED' :
      i.params.layout === 'return' ? 'HALF_TURN_STAIR' : 'STRAIGHT_RUN_STAIR';
    const stair = e(IFC.IFCSTAIR,guid(keys),null,label(i.mark+' · '+def.label),null,label(def.label),loc,null,typed(IFC.IFCIDENTIFIER,i.mark),enumeration(form));
    level.stairs.push(stair);
    const props = [property('Component',def.label),property('Vertrekbouwlaag',i.storey),...(i.params.accessHeight?[]:[property('Aankomstbouwlaag',i.storey+1)]),
      property('Hoogte',height,'mm'),property('PositieX',i.x,'mm'),property('PositieY',i.y,'mm'),property('Rotatie',i.rotation,'°')];
    for (const f of def.fields) {
      if (i.type==='concrete' && i.params.detailing!=='engineered' && f.group && f.key!=='detailing') continue;
      const value = i.params[f.key];
      props.push(property(f.key,f.type === 'select' ? f.options.find(([key])=>key===value)[1] : value,f.unit,f.label));
    }
    const warnings = issues.filter(q => q.level === 'warning').map(q=>q.text);
    if (warnings.length) props.push(property('Coördinatiebevindingen',warnings.join('\n')));
    addSet(keys,stair,'OSS_Trapcomponent',props);
    if (metrics.length) addSet(keys,stair,'OSS_Componentmaten',metrics.map(m=>property(m.label,m.value,m.unit)));
    if (escape) addSet(keys,stair,'OSS_Vluchtroute',[
      property('Toepassingsgebied',escape.scope),property('Status',escape.status),...(escape.capacity==null?[]:[property('Capaciteit',escape.capacity)]),
      ...(escape.reasons.length?[property('Bevindingen',escape.reasons.join(' '))]:[])
    ]);
    if (precast) {
      addSet(keys,stair,'OSS_PrefabEngineering',[property('Status',checkLabels[precast.status]),
        property('Toepassing','Elementberekening voor ontwerp en werkvoorbereiding'),
        ...precast.notes.map((note,index)=>property('Uitgangspunt '+(index+1),note))]);
    }
    const children = [], railing = [], treadFlights=new Map();
    const flightMeasures = [];
    function recordFlight(flightKeys, flight, measures) {
      addMeasures(flightKeys, flight, 'Pset_StairFlightCommon', measures);
      flightMeasures.push(measures);
    }
    const c = Math.cos(i.rotation*Math.PI/180), s = Math.sin(i.rotation*Math.PI/180);
    const toLocal = p => [(p.x-i.x)*c+(p.y-i.y)*s,-(p.x-i.x)*s+(p.y-i.y)*c,p.z-elevation];
    const castFrames = new Map(), castObjects = new Map(), detailChildren = new Map();
    const products=new Map(), barsByTarget=new Map();
    const calculations = new Map(precast?.elements.map(r=>[r.id,r]));
    for (const cast of parts.filter(p=>p.detail?.axes)) {
      const {origin:o,x,y} = cast.detail.axes;
      const pos = placement(loc,axis(o.x,o.y,o.z,Math.atan2(x.y,x.x)*180/Math.PI));
      castFrames.set(cast.id,{pos,childPos:placement(pos),toElement:p=>{
        const [px,py,pz] = toLocal(p), dx=px-o.x,dy=py-o.y;
        return [dx*x.x+dy*x.y,dx*y.x+dy*y.y,pz-o.z];
      }});
    }
    for (const part of parts) {
      const frame = castFrames.get(part.parentId ?? part.id);
      const {coordinates,triangles} = tessellate(part,frame ? frame.toElement : toLocal);
      const coords = e(IFC.IFCCARTESIANPOINTLIST3D,coordinates.map(p=>p.map(length)));
      const mesh = e(IFC.IFCTRIANGULATEDFACESET,coords,null,enumeration('T'),triangles.map(t=>t.map(n=>typed(IFC.IFCPOSITIVEINTEGER,n))),null);
      if(['glass','interlayer'].includes(part.material)){
        if(!glassStyles.has(part.material)){
          const ratio=v=>typed(IFC.IFCNORMALISEDRATIOMEASURE,v);
          const color=e(IFC.IFCCOLOURRGB,null,ratio(.56),ratio(.81),ratio(.84));
          const shading=e(IFC.IFCSURFACESTYLESHADING,color,ratio(part.material==='glass'?.75:.88));
          glassStyles.set(part.material,e(IFC.IFCSURFACESTYLE,label(materialNames[part.material]),enumeration('BOTH'),[shading]));
        }
        api.WriteLine(sid,e(IFC.IFCSTYLEDITEM,mesh,[glassStyles.get(part.material)],null));
      }
      const representations=[e(IFC.IFCSHAPEREPRESENTATION,context,label('Body'),label('Tessellation'),[mesh])];
      if(part.path?.length>1){
        const curve=e(IFC.IFCPOLYLINE,part.path.map(p=>e(IFC.IFCCARTESIANPOINT,[p.x,p.y,p.z].map(length))));
        representations.push(e(IFC.IFCSHAPEREPRESENTATION,context,label('Axis'),label('Curve3D'),[curve]));
      }
      const rep = e(IFC.IFCPRODUCTDEFINITIONSHAPE,null,null,representations);
      const partPos = frame ? (part.parentId ? frame.childPos : frame.pos) : part.kind === 'railing' ? railPartPos : part.kind === 'tread' && i.type !== 'concrete' ? treadPos : relLoc;
      const partKeys=[...keys,'part',part.id];
      const args = [guid(partKeys),null,label(part.label),null,label(detailLabels[part.role] || kindNames[part.kind] || part.kind),partPos,rep,typed(IFC.IFCIDENTIFIER,i.mark+'/'+part.id)];
      let element;
      switch (i.type==='concrete'?(part.role??part.kind):part.kind) {
        case 'mainBar': case 'crossBar': case 'bearingBar': case 'liftingBar': case 'anchorageBar': {
          const isMain = part.role === 'mainBar', role = enumeration(isMain?'MAIN':'USERDEFINED');
          element = e(IFC.IFCREINFORCINGBAR,...args,null,null,null,null,role,null);
          const shapeKey=part.bendSchedule?.map(s=>[s.type,s.lengthMm.toFixed(4),s.angleDeg?.toFixed(3),s.radiusMm].join(':')).join('/')??'';
          const typeKey = [part.role,part.diameterMm,part.lengthMm.toFixed(6),...(shapeKey?[shapeKey]:[])].join('/');
          let barType = barTypes.get(typeKey);
          if (!barType) {
            const typeName = detailLabels[part.role]+' Ø'+part.diameterMm+' · '+Number(part.lengthMm.toFixed(2))+' mm';
            const type = e(IFC.IFCREINFORCINGBARTYPE,guid(['bar-type',typeKey]),null,label(typeName),null,null,null,null,null,label(detailLabels[part.role]),
              role,typed(IFC.IFCPOSITIVELENGTHMEASURE,part.diameterMm),typed(IFC.IFCAREAMEASURE,Math.PI*part.diameterMm**2/4e6),
              typed(IFC.IFCPOSITIVELENGTHMEASURE,part.lengthMm),null,null,null);
            barType={type,objects:[]}; barTypes.set(typeKey,barType);
          }
          barType.objects.push(element);
          break;
        }
        case 'liftAnchor': element = e(IFC.IFCDISCRETEACCESSORY,...args,enumeration('USERDEFINED')); break;
        case 'connectionPlate': element = e(IFC.IFCPLATE,...args,enumeration('USERDEFINED')); break;
        case 'anchorBolt': element = e(IFC.IFCMECHANICALFASTENER,...args,typed(IFC.IFCPOSITIVELENGTHMEASURE,part.diameterMm),
          typed(IFC.IFCPOSITIVELENGTHMEASURE,part.lengthMm),enumeration('ANCHORBOLT')); break;
        case 'anchorNut': element = e(IFC.IFCMECHANICALFASTENER,...args,typed(IFC.IFCPOSITIVELENGTHMEASURE,part.diameterMm),
          typed(IFC.IFCPOSITIVELENGTHMEASURE,part.lengthMm),enumeration('USERDEFINED')); break;
        case 'landing': element = e(IFC.IFCSLAB,...args,enumeration('LANDING')); break;
        case 'column': element = e(IFC.IFCCOLUMN,...args,enumeration('COLUMN')); break;
        case 'flight':
          element = e(IFC.IFCSTAIRFLIGHT,...args,
            part.risers == null ? null : count(part.risers),
            part.treadCount == null ? null : count(part.treadCount),
            part.rise == null ? null : typed(IFC.IFCPOSITIVELENGTHMEASURE,part.rise),
            part.going == null ? null : typed(IFC.IFCPOSITIVELENGTHMEASURE,part.going),enumeration('STRAIGHT'));
          recordFlight(partKeys, element, {risers:part.risers, treads:part.treadCount, rise:part.rise, going:part.going});
          break;
        case 'fastener':
          if(part.fastenerType==='WELD') element=e(IFC.IFCFASTENER,...args,enumeration('WELD'));
          else if(part.fastenerType==='ANCHORBOLT') element=e(IFC.IFCMECHANICALFASTENER,...args,
            typed(IFC.IFCPOSITIVELENGTHMEASURE,part.diameterMm),typed(IFC.IFCPOSITIVELENGTHMEASURE,part.lengthMm),enumeration('ANCHORBOLT'));
          else element=e(IFC.IFCMECHANICALFASTENER,...args,null,null,enumeration('USERDEFINED'));
          break;
        case 'hatch': element = e(IFC.IFCDOOR,...args,null,null,enumeration('TRAPDOOR'),null,null); break;
        case 'plate': case 'tread': element = e(IFC.IFCPLATE,...args,enumeration('USERDEFINED')); break;
        default: element = e(IFC.IFCMEMBER,...args,enumeration('USERDEFINED'));
      }
      partCount++;
      if(products.has(part.id))throw new Error('Dubbel onderdeelmerk binnen '+i.mark+': '+part.id);
      products.set(part.id,element);
      if (part.material === 'concrete' && ['flight','landing'].includes(part.kind)) {
        const name = part.kind === 'flight' ? 'Qto_StairFlightBaseQuantities' : 'Qto_SlabBaseQuantities';
        const volume = e(IFC.IFCQUANTITYVOLUME, label('GrossVolume'), null, null, typed(IFC.IFCVOLUMEMEASURE, part.volumeM3), null);
        const quantities = e(IFC.IFCELEMENTQUANTITY, guid([...partKeys, name]), null, label(name), null, label('BaseQuantities'), [volume]);
        links.push(relation(IFC.IFCRELDEFINESBYPROPERTIES, [...partKeys, 'defines', name], [element], quantities));
      }
      if(part.fastenerType==='ANCHORBOLT')addSet(partKeys,element,'OSS_Anker',[
        property('Nominale diameter',part.diameterMm,'mm'),property('Schachtlengte',part.lengthMm,'mm'),
        property('Inbedding in ondergrond',part.embedMm,'mm')
      ]);
      if(part.targetId){
        if(!barsByTarget.has(part.targetId)) barsByTarget.set(part.targetId,[]);
        barsByTarget.get(part.targetId).push(element);
      }
      if (!materials.has(part.material)) materials.set(part.material,[]);
      materials.get(part.material).push(element);
      if(part.materialGrade) addSet(partKeys,element,'OSS_Staalonderdeel',[
        property('Onderdeel',part.label),property('Staalkwaliteit',part.materialGrade),property('Afwerking',i.params.finish),
        property('Nettovolume',part.volumeM3,'m³'),property('Massa',part.massKg,'kg')]);
      if (calculations.has(part.id)) addChecks(partKeys,element,calculations.get(part.id));
      if (castFrames.has(part.id)) {
        castObjects.set(part.id,element);
        const data=part.detail;
        addSet(partKeys,element,'OSS_PrefabGeometrie',[
          property('Betonvolume',part.volumeM3,'m³'),property('Elementmassa',part.massKg,'kg','Buitenvolume maal opgegeven volumieke massa'),
          property('Lengte X',data.length,'mm'),property('Breedte Y',data.width,'mm'),property('Plaatdikte',data.thickness,'mm'),
          property('Zwaartepunt X',data.centroid.x,'mm'),property('Zwaartepunt Y',data.centroid.y,'mm'),property('Zwaartepunt Z',data.centroid.z,'mm'),
          property('Datum','Lokaal nulpunt van dit prefab element'),property('Hijsposities',data.liftPoints.length),
          property('Verankeringsposities',data.anchorPoints.length)
        ]);
      }
      if (part.parentId) {
        if (!frame) throw new Error('Betonelement ontbreekt bij '+part.label+'.');
        if (!detailChildren.has(part.parentId)) detailChildren.set(part.parentId,[]);
        detailChildren.get(part.parentId).push(element);
        const props = [property('Betonelement',i.mark+'/'+part.parentId),property('Positiemerk',part.position),
          property('Functie',detailLabels[part.role] || part.role)];
        if (part.role==='liftAnchor') {
          const result=calculations.get(part.parentId),plan=result?.liftPlan??i.params;
          props.push(property('Productreferentie',plan.liftingReference?.trim() || 'Open'),
            property('Hijsplanreferentie',plan.riggingReference?.trim() || 'Open'));
          const station=result?.liftStations?.find(s=>s.id===part.id);
          if(station) for(const [k,n,u] of [['share','Aandeel verticale reactie','–'],['freeKN','Strengkracht vrij hijsen','kN'],['stripKN','Strengkracht ontkisten','kN']]){
            if(Number.isFinite(station[k])) props.push(property(n,station[k],u));
          }
        } else if (['anchorBolt','anchorNut','connectionPlate'].includes(part.role)) {
          props.push(property('Verbindingsreferentie',i.params.connectionReference?.trim() || 'Open'));
        }
        if (part.layer) props.push(property('Wapeningslaag',part.targetId?'Lokaal':part.layer==='top'?'Boven':'Onder'));
        if(part.targetId) {
          props.push(property('Doelvoorziening',i.mark+'/'+part.targetId),
            property('Buigsegmenten',JSON.stringify(part.bendSchedule),'','Raakpunten en boogcentra in elementlokale mm, hoek in graden.'));
          for(const [k,n] of [['mandrelMm','Doorndiameter'],['bendRadiusMm','Buigstraal hartlijn'],['anchorageMm','Rechte verankeringsstaart']]){
            if(Number.isFinite(part[k]))props.push(property(n,part[k],'mm'));
          }
        }
        for (const [field,title] of [['diameterMm','Diameter'],['lengthMm','Lengte'],['widthMm','Breedte'],['heightMm','Hoogte'],['thicknessMm','Dikte'],
          ['boreMm','Gatdiameter'],['embedMm','Inbedding']]) {
          if (Number.isFinite(part[field])) props.push(property(title,part[field],'mm'));
        }
        for (const [field,title] of [['start','Begin'],['end','Einde']]) if (part[field]) {
          for (const key of ['x','y','z']) props.push(property(title+key.toUpperCase(),part[field][key],'mm','Lokale coördinaat van het betonelement'));
        }
        addSet(partKeys,element,'OSS_PrefabDetail',props);
      } else if (part.kind === 'railing') railing.push(element);
      else if (part.kind === 'tread' && i.type !== 'concrete') {
        const group=/^vlucht-(\d+)-/.exec(part.id)?.[1]??'1';
        if(!treadFlights.has(group))treadFlights.set(group,[]);
        treadFlights.get(group).push(element);
      }
      else children.push(element);
    }
    if(structural)addStructural(keys,stair,products,structural,i);
    for(const [id,bars] of barsByTarget) {
      const target=products.get(id);
      if(!target)throw new Error('Doelvoorziening ontbreekt voor bijlegwapening: '+id);
      links.push(e(IFC.IFCRELASSIGNSTOPRODUCT,guid([...keys,'bijlegwapening',id]),null,label('Bijlegwapening bij voorziening'),null,bars,null,target));
    }
    for (const [id,members] of detailChildren) links.push(aggregate([...keys,'cast-details',id],castObjects.get(id),members));
    for(const [group,treads] of treadFlights){
      const spiral=i.type==='spiral',ladder=['ladder','loft'].includes(i.type),second=group!=='1';
      const riseCount=ladder?null:spiral?i.params.risers:treads.length+1;
      const flight = e(IFC.IFCSTAIRFLIGHT,guid([...keys,second?'flight-'+group:'flight']),null,label(spiral?'Spiltrapvlucht':ladder?'Ladderdelen':'Vlucht '+group),null,label(def.label),
        flightPos,null,null,riseCount?count(riseCount):null,count(treads.length),riseCount?typed(IFC.IFCPOSITIVELENGTHMEASURE,height/(i.params.risers??riseCount)):null,
        i.params.going?typed(IFC.IFCPOSITIVELENGTHMEASURE,i.params.going):null,enumeration(spiral?'SPIRAL':ladder?'USERDEFINED':'STRAIGHT'));
      children.push(flight);
      if (!ladder) recordFlight([...keys, 'flight', group], flight, {
        risers:riseCount, treads:treads.length, rise:height/(i.params.risers??riseCount), going:i.params.going
      });
      links.push(aggregate([...keys,second?'flight-treads-'+group:'flight-treads'],flight,treads));
    }
    if (flightMeasures.length) {
      const constant = key => flightMeasures.every(f => f[key] === flightMeasures[0][key]) ? flightMeasures[0][key] : null;
      addMeasures(keys, stair, 'Pset_StairCommon', {
        risers:flightMeasures.reduce((sum, f) => sum + f.risers, 0),
        treads:flightMeasures.reduce((sum, f) => sum + f.treads, 0),
        rise:constant('rise'), going:constant('going')
      });
    }
    if (railing.length) {
      const rail = e(IFC.IFCRAILING,guid([...keys,'railing']),null,label(i.type==='loft'?'Handgreep':'Leuningwerk'),null,null,railPos,null,null,
        enumeration(i.type==='loft'?'HANDRAIL':'BALUSTRADE'));
      children.push(rail);
      links.push(aggregate([...keys,'rail-parts'],rail,railing));
    }
    links.push(aggregate([...keys,'children'],stair,children));
  }
  for (const [n,level] of byLevel) if (level.stairs.length) links.push(relation(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,['contained',n],level.stairs,level.obj));
  for (const [mat,objects] of materials) {
    const ifcMaterial = e(IFC.IFCMATERIAL,label(materialNames[mat] ?? mat),null,label(mat));
    links.push(relation(IFC.IFCRELASSOCIATESMATERIAL,['material',mat],objects,ifcMaterial));
  }
  for (const [id,group] of barTypes) links.push(relation(IFC.IFCRELDEFINESBYTYPE,['bar-type-members',id],group.objects,group.type));
  for (let j = 0; j < guidRequests.length; j+=256) {
    await Promise.all(guidRequests.slice(j,j+256).map(async r => {r.token.value = await compressedId(r.name);}));
  }
  for (const link of links) api.WriteLine(sid,link);
  const bytes = api.SaveModel(sid), reopened = api.OpenModel(bytes);
  if (reopened < 0) throw new Error('Het IFC4-trappenhuis kon niet opnieuw worden geopend.');
  try {
    if (api.GetModelSchema(reopened) !== 'IFC4' || api.GetLineIDsWithType(reopened,IFC.IFCSTAIR).size() !== assemblies.length ||
      api.GetLineIDsWithType(reopened,IFC.IFCTRIANGULATEDFACESET).size() !== partCount) throw new Error('Het aantal trappen of componentvolumes in IFC wijkt af.');
  } finally { api.CloseModel(reopened); }
  return bytes;
}
