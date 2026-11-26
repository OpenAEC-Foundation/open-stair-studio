import assert from 'node:assert/strict';
import { starterProject, generateStairGeometry } from '../src/stair.js';
import { buildStairDetails } from '../src/stair-details.js';
import { buildWorkshop } from '../src/workshop.js';
import { timberDefaults } from '../src/timber-settings.js';
import { timberSheetParts, timberViews, viewBounds, layoutTimberView, timberDetailDxf } from '../src/timber-sheet.js';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,a+' differs from '+b);
let count=0;
for(const [noseProfile,timberDetail,turnDirection] of [['round','classic','left'],['bevel','modern','right'],['square','basic','left']]){
  const model=structuredClone(starterProject);
  Object.assign(model.stair,timberDefaults,{type:'half_winder',timberDetail,noseProfile,noseSize:8,turnDirection,
    wellatType:'chamfered',riserBoards:'closed',railSide:'both'});
  model.joinery.type='housed';
  const geometry=generateStairGeometry(model.stair,{projectIsometric:false});
  const workshop=buildWorkshop(geometry,model);
  const details=buildStairDetails(model.stair,geometry);
  const rows=timberSheetParts(workshop,details);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  for (const row of rows){
    assert.ok(row.stock.every(n=>n>0)&&row.netVolume>0,row.id+' stock');
    for(const i of new Set([0,Math.max(0,(row.part.profileStations?.length??1)-1)])){
      const views=timberViews(row,i);
      assert.equal(views.length,2);
      for(const view of views){
        const b=viewBounds(view),layout=layoutTimberView(view);
        near(layout.spanX,(layout.b.x-layout.a.x)*layout.denominator);
        near(layout.spanY,(layout.a.y-layout.b.y)*layout.denominator);
        assert.ok(b.x0<=b.x1&&b.y0<=b.y1,row.id+' projection');
        assert.ok(layout.a.x>=0&&layout.a.y<layout.height&&layout.b.x<layout.width&&layout.b.y>=0);
        assert.ok(view.paths.every(s=>s.points.length>=(s.closed?3:2)&&s.points.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y))));
      }
      if(row.part.profileStations?.length) assert.deepEqual(views[1].paths[0].points,row.part.profileStations[i].contour);
    }
    count++;
  }
  const tread=rows.find(r=>r.type==='tread'&&r.part.isWinder);
  assert.ok(tread&&tread.part.tongues.length===2);
  const views=timberViews(tread),file=timberDetailDxf(tread,views);
  assert.ok(file.includes('LWPOLYLINE')&&file.includes(tread.id)&&file.includes('OSS-PROFIEL')&&file.includes('$INSUNITS\n70\n4'));
  assert.deepEqual(views[0].paths.filter(s=>s.mode==='joint').map(s=>s.points),tread.part.tongues.map(t=>t.points));
  const bulges=[...file.matchAll(/\n42\n(-?[.\d]+)\n/g)].map(m=>Number(m[1])).filter(n=>Math.abs(n)>1e-10);
  if(noseProfile==='round') assert.ok(bulges.some(n=>Math.abs(n+Math.tan(Math.PI/8))<1e-12));
  else assert.ok(!bulges.some(n=>Math.abs(n+Math.tan(Math.PI/8))<1e-12));
  if(timberDetail!=='basic') for(const type of ['newel','baluster','handrail']) assert.ok(rows.some(r=>r.type===type),type);
  for(const type of ['riser','nosingStrip']) assert.ok(rows.some(r=>r.type===type),type);
}
console.log(count+' houten onderdeelbladen gecontroleerd op profielvorm, insteeklippen, schaal, ruwmaten en DXF-eenheden.');
