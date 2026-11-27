import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as IFC from 'web-ifc';
import { createIfc4WithApi } from '../src/ifc-export-core.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';

const api = new IFC.IfcAPI();
await api.Init();
const fixtures = process.argv[2];
let checked = 0;
const cases = [
  ['straight','left',25], ['quarter_turn','left',-25], ['quarter_turn','right',-25], ['quarter_turn','right',35]
];
for (const type of ['quarter_winder', 'half_winder']) {
  for (const hand of ['left', 'right']) {
    for (const nose of [-60, 0, 100]) cases.push([type, hand, nose]);
  }
}
for (const [type, turnDirection, nosing] of cases) {
  const model = structuredClone(starterProject);
  Object.assign(model.stair, {type, turnDirection, nosing, riserBoards:'closed', riserJoint:'housed', railSide:'none'});
  if (nosing === 35) Object.assign(model.stair, {timberDetail:'modern',noseProfile:'round'});
  if (type.endsWith('_winder')) {
    Object.assign(model.stair, {outerShape:nosing === 0 ? 'faceted' : 'square',
      noseProfile:nosing === 100 ? 'bevel' : 'square'});
    if (turnDirection === 'right') {
      Object.assign(model.bim,{originX:15000,originY:-3600,originZ:3200,originRotationDeg:33});
      if (nosing === 100) Object.assign(model.stair,{timberDetail:'modern',noseProfile:'round'});
    }
  }
  const raw = generateStairGeometry(model.stair);
  const workshop = buildWorkshop(raw, model);
  assert.deepEqual(workshop.riserJoinery.issues.filter(i => i.level === 'error'), [], [type,turnDirection,nosing].join('/'));
  const expected = new Map(workshop.riserJoinery.pockets.map(p => [p.id,p]));
  if (type === 'quarter_turn' && nosing === -25) {
    const sign=turnDirection === 'right' ? -1 : 1;
    const foot=raw.stringers.find(b=>b.flightIndex===1 && b.side===sign);
    const pocket=workshop.riserJoinery.pockets.find(p=>p.hostKind==='landing' && p.face==='underside');
    const footStart=Math.min(...foot.vertices.map(p=>sign*p.y));
    assert(Math.abs(Math.max(...pocket.worldContour.map(p=>sign*p.y))-footStart)<1e-7);
    assert(Math.max(...pocket.tongueWorldContour.map(p=>sign*p.y))<footStart);
  }
  assert(Array.from(expected.values()).some(p => p.hostKind === 'tread'));
  assert(Array.from(expected.values()).some(p => p.hostKind === 'stringer'));
  if (raw.landings.length) assert(Array.from(expected.values()).some(p => p.hostKind === 'landing'));
  const data = createIfc4WithApi(api, model, raw);
  const sid = api.OpenModel(data.bytes);
  const line = h => api.GetLine(sid,h.value);
  const entries = ifcType => {
    const ids = api.GetLineIDsWithType(sid, ifcType);
    return Array.from({length:ids.size()}, (_,i) => api.GetLine(sid, ids.get(i)));
  };
  const volumes = Object.fromEntries(workshop.parts.map(p => [p.id,p.volume]));
  Object.assign(volumes,Object.fromEntries(workshop.detailParts.map(p => [p.id,p.volumeM3])));
  try {
    const hosts = [...entries(IFC.IFCPLATE), ...entries(IFC.IFCMEMBER), ...entries(IFC.IFCSLAB)];
    assert(hosts.every(host => Number.isFinite(volumes[host.Tag.value])));
    const connections = entries(IFC.IFCRELCONNECTSELEMENTS);
    assert.equal(connections.length, expected.size);
    for (const connection of connections) {
      const pocket = expected.get(connection.Name.value);
      assert(pocket);
      assert.equal(line(connection.RelatingElement).Tag.value, pocket.hostId);
      assert.equal(line(connection.RelatedElement).Tag.value, pocket.riserId);
    }
    for (const host of hosts) {
      const [shape] = line(host.Representation).Representations.map(line);
      let body = line(shape.Items[0]);
      while (body.type === IFC.IFCBOOLEANRESULT) {
        assert.equal(shape.RepresentationType.value,'CSG');
        assert.equal(body.Operator.value,'DIFFERENCE');
        const cut = line(body.SecondOperand), profile = line(cut.SweptArea);
        const pocket = expected.get(profile.ProfileName.value);
        if (pocket) {
          assert.equal(host.Tag.value,pocket.hostId);
          assert(Math.abs(cut.Depth.value*1000-pocket.depth) < 1e-6);
          const position = line(cut.Position);
          const origin = line(position.Location).Coordinates.map(c => c.value*1000);
          const z = line(position.Axis).DirectionRatios.map(c => c.value);
          const x = line(position.RefDirection).DirectionRatios.map(c => c.value);
          const y = z.map((_,i) => z[(i+1)%3]*x[(i+2)%3]-z[(i+2)%3]*x[(i+1)%3]);
          assert(Math.hypot(z[0]-pocket.inward.x,z[1]-pocket.inward.y,z[2]-pocket.inward.z)<1e-6);
          const points = line(profile.OuterCurve).Points.slice(0,-1).map(h => line(h).Coordinates.map(c => 1000*c.value));
          assert.equal(points.length,pocket.worldContour.length);
          for (const [i,[u,v]] of points.entries()) {
            const p = pocket.worldContour[i];
            assert(Math.hypot(...origin.map((o,j) => o+x[j]*u+y[j]*v-[p.x,p.y,p.z][j])) < 1e-5, pocket.id);
          }
          expected.delete(pocket.id);
          checked++;
        }
        body = line(body.FirstOperand);
      }
    }
    assert.deepEqual([...expected.keys()],[]);
    if (fixtures) {
      const path = join(fixtures,`${type}-${turnDirection}-${nosing}`);
      const tongueVolumes = {};
      for (const pocket of workshop.riserJoinery.pockets) {
        // Signed area projected onto the mouth normal, independent of the
        // riser mesh. The mating lip ends short of the pocket floor.
        const {inward:n, tongueWorldContour:loop} = pocket;
        const twiceArea = loop.reduce((sum,a,i) => {
          const b=loop[(i+1)%loop.length];
          return sum+n.x*(a.y*b.z-a.z*b.y)+n.y*(a.z*b.x-a.x*b.z)+n.z*(a.x*b.y-a.y*b.x);
        },0);
        tongueVolumes[pocket.id] = Math.abs(twiceArea)*pocket.tongueDepth/2e9;
      }
      writeFileSync(path+'.ifc',data.bytes);
      writeFileSync(path+'.json',JSON.stringify({volumes,tongueVolumes}));
    }
  } finally {api.CloseModel(sid);}
}
console.log(`IFC4: ${checked} stootbordgroeven in ${cases.length} trappen herlezen op merk, koppeling, freesrichting, contour en diepte.`);
