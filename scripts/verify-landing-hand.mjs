import assert from 'node:assert/strict';
import {starterProject,deriveStair,generateStairGeometry} from '../src/stair.js';

for(const type of ['quarter_turn','half_turn','landing']){
  for(const landingRiser of [0,5,11]){
    const left={...starterProject.stair,type,landingRiser,turnDirection:'left'};
    const right={...left,turnDirection:'right'};
    const a=generateStairGeometry(left),b=generateStairGeometry(right);
    assert.equal(a.landings[0].elevation,b.landings[0].elevation);
    assert.equal(a.landings[0].elevation,deriveStair(left).flightRisers[0]*deriveStair(left).rise);
    assert.equal(a.stringers.length,b.stringers.length);
    for(const [i,t] of a.treads.entries()){
      assert.equal(t.elevation,b.treads[i].elevation);
      const sort=points=>points.map(p=>[p.x,p.y]).sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
      const actual=sort(b.treads[i].points),expected=sort(t.points.map(p=>({x:p.x,y:type==='landing'?p.y:-p.y})));
      for(let j=0;j<actual.length;j++)for(let k=0;k<2;k++)assert.ok(Math.abs(actual[j][k]-expected[j][k])<1e-8);
    }
    for(const [i,beam] of a.stringers.entries()){
      assert.ok(Math.abs(beam.length-b.stringers[i].length)<1e-8);
      if(beam.flightIndex===1)assert.ok(beam.frame.origin.z< b.dimensions.risers*b.dimensions.rise);
    }
    if(type!=='landing')for(const [i,p] of a.landings[0].points.entries())
      assert.ok(Math.abs(p.y+b.landings[0].points[i].y)<1e-8);
  }
}
console.log('Bordespeilen, vluchtbomen en links/rechts gespiegeld voor drie bordestrappen.');
