import * as IFC from 'web-ifc';
import {v5 as uuidv5} from 'uuid';

// Alpha layer format and USD triangle meshes follow buildingSMART's Hello Wall example:
// https://github.com/buildingSMART/IFC5-development/tree/main/examples/Hello%20Wall
const ifcLayer = 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/';
const imports = [ifcLayer + 'ifc@v5a.ifcx', ifcLayer + 'prop@v5a.ifcx', 'https://ifcx.dev/@openusd.org/usd@v1.ifcx'];
const sourceData = 'openaec::ifc4';
const meshAttribute = 'usd::usdgeom::mesh';
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const quantityUnits = {VolumeValue:'VOLUMEUNIT', AreaValue:'AREAUNIT', LengthValue:'LENGTHUNIT',
  CountValue:'COUNT', WeightValue:'MASSUNIT', TimeValue:'TIMEUNIT'};

function uuid(guid) {
  if (!/^[0-3][0-9A-Za-z_$]{21}$/.test(guid)) throw new Error('Ongeldig IFC-GlobalId in IFCX-export.');
  let number = 0n;
  for (const digit of guid) number = (number << 6n) | BigInt(alphabet.indexOf(digit));
  const hex = number.toString(16).padStart(32, '0');
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}

function worldMesh(api, id, product) {
  const points = [], faceVertexIndices = [];
  const mesh = api.GetFlatMesh(id, product.expressID, true);
  try {
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const placed = mesh.geometries.get(i);
      const part = api.GetGeometry(id, placed.geometryExpressID);
      try {
        const vertices = api.GetVertexArray(part.GetVertexData(), part.GetVertexDataSize());
        const indices = api.GetIndexArray(part.GetIndexData(), part.GetIndexDataSize());
        const m = placed.flatTransformation;
        const offset = points.length;
        for (let j = 0; j < vertices.length; j += 6) {
          const x = vertices[j], y = vertices[j+1], z = vertices[j+2];
          // web-ifc gives metres in a Y-up graphics frame. IFC and the IFCX viewer use Z up.
          const point = [m[0]*x + m[4]*y + m[8]*z + m[12],
            -(m[2]*x + m[6]*y + m[10]*z + m[14]), m[1]*x + m[5]*y + m[9]*z + m[13]];
          if (!point.every(Number.isFinite)) throw new Error('Ongeldige IFCX-meshcoördinaat.');
          points.push(point);
        }
        for (const index of indices) faceVertexIndices.push(offset + index);
      } finally { part.delete(); }
    }
  } finally { mesh.delete?.(); }
  if (!faceVertexIndices.length || faceVertexIndices.length % 3) {
    throw new Error('Geen volledige IFCX-mesh voor ' + (product.Name?.value ?? product.expressID));
  }
  return {points, faceVertexIndices};
}

// Input is an IFC4 model produced by either of the Studio's exporters. Keep the same
// physical products and evaluate their final bodies, including IFC boolean differences.
export function createIfcxWithApi(api, bytes) {
  const id = api.OpenModel(bytes, {COORDINATE_TO_ORIGIN:false});
  if (id < 0) throw new Error('Het bronmodel voor de IFCX-export kan niet worden geopend.');
  try {
    const read = handle => api.GetLine(id, handle.value);
    const lines = type => {
      const ids = api.GetLineIDsWithType(id, type);
      return Array.from({length:ids.size()}, (_,i) => api.GetLine(id, ids.get(i)));
    };
    const [project] = lines(IFC.IFCPROJECT);
    const nodes = new Map();
    function node(line) {
      if (nodes.has(line.expressID)) return nodes.get(line.expressID);
      const code = api.GetNameFromTypeCode(line.type);
      const guid = line.GlobalId.value;
      const source = {globalId:guid};
      for (const key of ['Name','Tag','Description','ObjectType','PredefinedType','NumberOfRisers','NumberOfTreads','RiserHeight','TreadLength'])
        if (line[key]?.value != null) source[key] = line[key].value;
      const attributes = {
        'bsi::ifc::class': {code, uri:'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/' + code},
        [sourceData]:source
      };
      for (const key of ['Name','Description']) if (source[key]) attributes['bsi::ifc::prop::'+key] = source[key];
      if (line.Representation) attributes[meshAttribute] = worldMesh(api, id, line);
      const result = {path:uuid(guid), attributes};
      nodes.set(line.expressID, result);
      return result;
    }
    function attach(parentHandle, childHandles) {
      const parent = node(read(parentHandle));
      parent.children ??= Object.create(null);
      for (const handle of childHandles) {
        const child = read(handle);
        const target = node(child);
        const label = String(child.Name?.value || api.GetNameFromTypeCode(child.type))
          .normalize('NFKD').replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,'') || 'Object';
        const name = Object.hasOwn(parent.children,label) ? label + '_' + target.path.replaceAll('-','') : label;
        parent.children[name] = target.path;
      }
    }
    if (!project) throw new Error('IFC-project ontbreekt.');
    const root = node(project);
    function unitName(unit) {
      if (!unit.Elements) return [unit.Prefix?.value,unit.Name?.value].filter(Boolean).join('');
      return unit.Elements.map(read).map(element =>
        unitName(read(element.Unit)) + (element.Exponent.value === 1 ? '' : '^' + element.Exponent.value)).join('·');
    }
    root.attributes[sourceData].units = Object.fromEntries(read(project.UnitsInContext).Units.map(read)
      .map(unit => [unit.UnitType.value,unitName(unit)]));
    for (const rel of lines(IFC.IFCRELAGGREGATES)) attach(rel.RelatingObject, rel.RelatedObjects);
    for (const rel of lines(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) attach(rel.RelatingStructure, rel.RelatedElements);
    // Connection groups have their own engineering properties. Reference the occurrences
    // from the group, so each visible part still appears exactly once in the scene.
    const groups = lines(IFC.IFCGROUP);
    if (groups.length) attach({value:project.expressID}, groups.map(group => ({value:group.expressID})));
    for (const [type,parent] of [[IFC.IFCRELASSIGNSTOGROUP,'RelatingGroup'],[IFC.IFCRELASSIGNSTOPRODUCT,'RelatingProduct']]) {
      for (const rel of lines(type)) {
        const owner = nodes.get(rel[parent].value);
        if (!owner) continue;
        const targets = rel.RelatedObjects.map(ref => nodes.get(ref.value)?.path).filter(Boolean);
        (owner.attributes[sourceData].assignments ??= []).push({type:api.GetNameFromTypeCode(type),name:rel.Name?.value,targets});
      }
    }
    function assign(type, apply) {
      for (const rel of lines(type)) {
        for (const target of rel.RelatedObjects) {
          const attributes = nodes.get(target.value)?.attributes;
          if (attributes) apply(rel, attributes, attributes[sourceData]);
        }
      }
    }
    assign(IFC.IFCRELDEFINESBYTYPE, (rel, attributes, source) => {
      const type = read(rel.RelatingType);
      source.type = {globalId:type.GlobalId.value,code:api.GetNameFromTypeCode(type.type),predefinedType:type.PredefinedType?.value};
      if (type.Name?.value) attributes['bsi::ifc::prop::TypeName'] = type.Name.value;
    });
    assign(IFC.IFCRELASSOCIATESMATERIAL, (rel, attributes, source) => {
      const material = read(rel.RelatingMaterial);
      if (material.Name?.value) source.material = material.Name.value;
    });
    assign(IFC.IFCRELASSOCIATESCLASSIFICATION, (rel, attributes, source) => {
      const ref = read(rel.RelatingClassification);
      (source.classifications ??= []).push({code:ref.Identification?.value,
        system:ref.ReferencedSource ? read(ref.ReferencedSource).Name?.value : ref.Name?.value,
        uri:ref.Location?.value});
    });
    assign(IFC.IFCRELDEFINESBYPROPERTIES, (rel, attributes, source) => {
      const set = read(rel.RelatingPropertyDefinition);
      if (set.Quantities) {
        const values = {};
        for (const quantity of set.Quantities.map(read)) {
          const key = Object.keys(quantityUnits).find(key => quantity[key] != null);
          if (!key) throw new Error('Onbekende IFC-hoeveelheid ' + quantity.Name.value);
          const baseUnit = quantityUnits[key];
          const unit = quantity.Unit ? unitName(read(quantity.Unit)) :
            root.attributes[sourceData].units[baseUnit] ?? baseUnit;
          const name = quantity.Name.value, value = quantity[key].value;
          values[name] = {value,unit,type:api.GetNameFromTypeCode(quantity.type)};
          if (name==='NetVolume' && unit==='CUBIC_METRE') attributes['bsi::ifc::prop::NetVolume'] = value;
        }
        (source.quantitySets ??= {})[set.Name.value] = values;
        return;
      }
      if (!set.HasProperties) return;
      const properties = {};
      for (const prop of set.HasProperties.map(read)) {
        if (!prop.NominalValue) continue;
        properties[prop.Name.value] = {value:prop.NominalValue.value, type:prop.NominalValue.name,
          unit:prop.Unit ? unitName(read(prop.Unit)) : undefined};
      }
      (source.propertySets ??= {})[set.Name.value] = properties;
    });
    for (const rel of lines(IFC.IFCRELCONNECTSELEMENTS)) {
      const host = nodes.get(rel.RelatingElement.value), related = nodes.get(rel.RelatedElement.value);
      if (host && related) (host.attributes[sourceData].connections ??= []).push({name:rel.Name?.value, target:related.path});
    }
    // Single-instance and whole-project layers may have the same IfcProject GUID.
    const contained = lines(IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
      .flatMap(rel => rel.RelatedElements.map(ref => nodes.get(ref.value).path)).sort().join('/');
    return {
      header:{id:'urn:uuid:' + uuidv5(contained,root.path), ifcxVersion:'ifcx_alpha', dataVersion:'1.0.0',
        author:'Open Stair Studio', timestamp:new Date().toISOString()},
      imports:imports.map(uri => ({uri})),
      schemas:{[sourceData]:{value:{dataType:'Object'}}},
      data:[...nodes.values()]
    };
  } finally { api.CloseModel(id); }
}
