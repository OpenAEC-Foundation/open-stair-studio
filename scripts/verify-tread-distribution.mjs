import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { devriesDistributedSettings, devriesIfcDepth, devriesNewelSettings } from '../src/two-quarter-settings.js';
import { winderIssues } from '../src/winder.js';

const fixture = JSON.parse(readFileSync(new URL('./testdata/devries-tweekwart-contours.json', import.meta.url)));
const stair = {...starterProject.stair, ...devriesDistributedSettings};
const make = settings => {
  assert.deepEqual(winderIssues(settings), []);
  return generateStairGeometry(settings);
};
const near = (a,b,limit=1e-6) => assert(Math.abs(a-b) <= limit, a+' / '+b);
const dot = (p,d) => p.x*d.x+p.y*d.y;
const project = (points,normal) => points.map(p=>dot(p,normal));

// Compare ordered edges, including all corners of each post notch. Accept
// only an alternative start vertex and a reversal of the perimeter.
function boundaryError(points,reference) {
  assert.equal(points.length,reference.length);
  const n=points.length;
  return Math.min(...reference.flatMap((_,j)=>[1,-1].map(s=>Math.max(...points.map((p,i)=>{
    const [x,y]=reference[(j+s*i+n)%n];
    return Math.hypot(p.x-x,Math.abs(p.y)-y);
  })))));
}

for (const turnDirection of ['left','right']) {
  for (const outerDepth of [992,devriesIfcDepth]) {
    const geometry=make({...stair,turnDirection,outerDepth});
    near(geometry.footprint.width,outerDepth);
    near(geometry.footprint.depth,3140);
    assert.equal(geometry.treads.length,15);
    assert.equal(geometry.newels.length,2);
    for (const [i,tread] of geometry.treads.entries()) {
      const delta=boundaryError(tread.points,fixture.treads[i]);
      const tolerance=outerDepth===992 ? .106 : i===3 ? .00004 : .00061;
      assert(delta<tolerance,tread.id+' · '+delta+' mm');
      const quarter=i<5?'lower':i>=10?'upper':null;
      if (quarter) {
        const j=i%5, lower=quarter==='lower', offsets=lower?stair.firstQuarterOffsets:stair.secondQuarterOffsets;
        assert.deepEqual(tread.windingDistribution,{quarter,index:j+1,
          frontOffsetMm:lower?offsets[j]:offsets[j-1]??0,backOffsetMm:lower?offsets[j+1]??0:offsets[j]});
      } else assert.equal(tread.windingDistribution,undefined);
    }
  }

  // Fronts in the lower quarter and backs in the upper quarter are the
  // same physical kind of partition. Move one of each in both directions.
  // Includes a straight tread outside each quarter to test both end faces.
  for (const withLead of [false,true]) {
    const settings={...stair,turnDirection,...(withLead?{entrySteps:1,risers:18,outerDepth:1220}:{})};
    const baseline=make(settings);
    for (const [field,j] of [['firstQuarterOffsets',0],['firstQuarterOffsets',3],
                             ['secondQuarterOffsets',0],['secondQuarterOffsets',4]]) {
      const lower=field==='firstQuarterOffsets';
      const cutIndex=(withLead?1:0)+(lower ? j : 11+j);
      for (const delta of [-1.25,2.5]) {
        const offsets=settings[field].map((offset,i)=>offset+(i===j?delta:0));
        const changed=make({...settings,[field]:offsets});
        for (const [i,tread] of changed.treads.entries()) {
          const previous=baseline.treads[i];
          if (i!==cutIndex && i!==cutIndex-1) {
            const unchanged=previous.points.map(p=>[p.x,Math.abs(p.y)]);
            near(boundaryError(tread.points,unchanged),0);
            continue;
          }
          assert.notDeepEqual(tread.points,previous.points);
          if (i!==cutIndex) continue;
          const normal=tread.direction;
          const first=Math.min(...project(previous.frontEdge,normal));
          for (const value of project(tread.frontEdge,normal)) near(value,first+delta);
          for (const board of [tread, previous]) {
            const face=Math.min(...project(board.riserSeat.points,normal));
            for (const p of board.frontEdge) near(face-dot(p,normal),settings.wel);
          }
        }
      }
    }
  }
  for (const nosing of [-15,0,15]) {
    const geometry=make({...stair,nosing,turnDirection,lowerNewelHousing:8,upperNewelHousing:8});
    assert.deepEqual(geometry.newels.map(p=>p.pockets.length),[6,6]);
  }
}

const old={...starterProject.stair,...devriesNewelSettings};
delete old.firstQuarterOffsets;
delete old.secondQuarterOffsets;
assert.deepEqual(make(old).treads,make({...old,firstQuarterOffsets:[],secondQuarterOffsets:[]}).treads);
for (const firstQuarterOffsets of [[2,3], [1,2,3,4,NaN], stair.firstQuarterOffsets.map((x,i)=>x+(i===1?60:0))]) {
  const invalid={...stair,firstQuarterOffsets};
  assert.ok(winderIssues(invalid).length);
  assert.equal(generateStairGeometry(invalid).treads.length,0);
}
console.log('Alle vijftien De Vries-contouren binnen 0,001 mm op de bronmaat. Onafhankelijke grensverschuivingen, spiegeling, neusposities en spilhuizen gecontroleerd.');
