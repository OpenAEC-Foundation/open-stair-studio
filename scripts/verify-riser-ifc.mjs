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
for (const [type, turnDirection, nosing] of [
  ['straight','left',25], ['quarter_turn','left',-25], ['quarter_turn','right',35]
]) {
  const model = structuredClone(starterProject);
  Object.assign(model.stair, {type, turnDirection, nosing, riserBoards:'closed', riserJoint:'housed', railSide:'none'});
  if (nosing === 35) Object.assign(model.stair, {timberDetail:'modern',noseProfile:'round'});
  const raw = generateStairGeometry(model.stair);
  const workshop = buildWorkshop(raw, model);
  assert.deepEqual(workshop.riserJoinery.issues.filter(i => i.level === 'error'), []);
  const expected = new Map(workshop.riserJoinery.pockets.map(p => [p.id,p]));
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
      writeFileSync(path+'.ifc',data.bytes);
      writeFileSync(path+'.json',JSON.stringify(volumes));
    }
  } finally {api.CloseModel(sid);}
}
console.log(`IFC4: ${checked} stootbordgroeven herlezen op merk, freesrichting, contour en diepte bij drie neusstanden.`);
