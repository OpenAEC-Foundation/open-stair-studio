import assert from 'node:assert/strict';
import { starterProject } from '../src/stair.js';
import { generateWinderGeometry, winderIssues } from '../src/winder.js';
import { buildStairDetails } from '../src/stair-details.js';

const base = starterProject.stair;
const close = (a,b,reason,tolerance = 1e-6) => assert(Math.abs(a-b) <= tolerance, `${reason}: ${a} ≠ ${b}`);
const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
function verifySimple(points) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i+1) % points.length];
    assert(distance(a,b) > 1e-6, 'duplicate contour vertex');
    for (let j=i+2; j<points.length && !(i===0 && j===points.length-1); j++) {
      const c = points[j], d = points[(j+1) % points.length];
      assert(!(cross(a,b,c)*cross(a,b,d) < -1e-6 && cross(c,d,a)*cross(c,d,b) < -1e-6), 'self-intersecting board');
    }
  }
}
function exactSectorArea(stair, d) {
  const q = stair.windersPerQuarter;
  const r = d.radius;
  const h = d.clearWidth / 2;
  const halfSteps = d.turnSteps / 2;
  const outer = stair.outerShape === 'square' ? (d.turnSteps/q)*(r+h)**2 : halfSteps*(r+h)**2*Math.sin(Math.PI/(2*q));
  const inner = halfSteps*(r-h)**2*Math.sin(Math.PI/(2*q));
  return outer - inner + (d.treadCount - d.turnSteps) * stair.going * d.clearWidth;
}

function verifyMitres(stair, stringers) {
  for (let k=0; k<stringers.length; k++) {
    const beam=stringers[k];
    const previous=stringers[k-1];
    const vertices=beam.vertices;
    if (previous?.side===beam.side) {
      // The complete vertical cut plane is identical on adjoining boards.
      for (const [i,j] of [[1,0],[2,3],[5,4],[6,7]]) assert.deepEqual(previous.vertices[i],vertices[j]);
    }
    for (let i=0; i<4; i++) {
      close(vertices[i+4].z,Math.max(0,vertices[i].z-stair.stringerDepth),'floor-cut soffit');
      close(distance(vertices[i],vertices[i+4]),0,'vertical edges');
      const [a,b,c] = [0,1,2].map(offset=>beam.points[(i+offset)%4]);
      assert(cross(a,b,c)>0,'convex mitred footprint with positive rail lengths');
    }
    const directed=new Map();
    let sum = 0;
    for (const face of beam.faces) {
      for (let i=0; i<face.length; i++) {
        const key = face[i] + '/' + face[(i+1)%face.length];
        directed.set(key,(directed.get(key)??0)+1);
      }
      const a=vertices[face[0]];
      for (let i=1; i<face.length-1; i++) {
        const b=vertices[face[i]], c=vertices[face[i+1]];
        sum += a.x*(b.y*c.z-b.z*c.y) + a.y*(b.z*c.x-b.x*c.z) + a.z*(b.x*c.y-b.y*c.x);
      }
    }
    for (const [edge,count] of directed) {
      assert.equal(count,1);
      assert.equal(directed.get(edge.split('/').reverse().join('/')),1,'watertight opposing edge');
    }
    close(sum/6e9,beam.volume,'signed mesh and net stock volume',1e-9);
    assert(beam.blankVolume>=beam.volume-1e-10);
    close(beam.blankVolume,beam.length*beam.width*beam.thickness/1e9,'gross stock from oriented bounds');
  }
}

let checked = 0;
for (const type of ['quarter_winder', 'half_winder']) {
  for (const windersPerQuarter of [2,3,4,5,6,7,8]) {
    const turnSteps = windersPerQuarter * (type === 'half_winder' ? 2 : 1);
    // A narrower layout exercises the two-tread-per-quarter option with a
    // positive inside radius. Other cases include 0, 1 and 5 straight steps.
    const width = windersPerQuarter === 2 ? 580 : 900;
    for (const straight of [0,1,5]) for (const entrySteps of new Set([-1,0,straight])) {
      for (const outerShape of ['square','faceted']) for (const nosing of [-25,0,25,100]) {
        const stair = { ...base, type, windersPerQuarter, entrySteps, outerShape, width, nosing, risers: 1 + turnSteps + straight };
        const issues = winderIssues(stair);
        if (issues.length) {
          assert(nosing !== 0 && windersPerQuarter <= 3, issues.join(' '));
          continue;
        }
        const g = generateWinderGeometry(stair);
        const mirror = generateWinderGeometry({ ...stair, turnDirection:'right' });
        assert.equal(g.flights.length,1);
        assert.equal(g.landings.length,0);
        assert.equal(g.treads.length,stair.risers - 1);
        assert(g.dimensions.walklineClearance > 0);
        assert.equal(g.stringers.length, mirror.stringers.length);
        verifyMitres(stair,g.stringers);
        verifyMitres(stair,mirror.stringers);
        assert(g.stringers.every(b => b.length > 1 && Number.isFinite(b.volume)));
        close(g.volume,mirror.volume,'mirrored volume');
        close(g.blankVolume,mirror.blankVolume,'mirrored blank allowance');
        const area = g.treads.reduce((sum,t) => sum + t.area,0);
        const coverage = exactSectorArea(stair,g.dimensions);
        if(nosing===0) close(area,coverage,'nominal tread footprint',1e-5);
        else assert(area>0,'translated tread footprint has positive area');
        for (let i=0; i<g.treads.length; i++) {
          const t = g.treads[i], reflected = mirror.treads[i], part = g.parts[i];
          verifySimple(t.points);
          assert(t.points.every(p => reflected.points.some(v => distance(p,{ x:v.x,y:-v.y }) < 1e-7)));
          close(t.elevation,(i+1)*stair.floorHeight/stair.risers,'level');
          close(t.volume, t.area*stair.treadThickness/1e9,'board volume');
          close(t.volume,part.volume,'part volume');
          assert(t.goingAtWalkline > 0 && Number.isFinite(t.goingAtWalkline));
          assert(t.depthAtWalkline >= t.goingAtWalkline-1e-6 && Number.isFinite(t.depthAtWalkline));
          assert(t.narrowDepth > 0 && Number.isFinite(t.narrowDepth));
          assert(part.blankVolume >= part.volume - 1e-9);
          if (!nosing && i+1<g.treads.length) {
            for (const p of g.treads[i+1].frontEdge) assert(t.points.some(q=>distance(p,q)<1e-7),'edge fits next tread');
          }
        }
        checked += 2;
      }
    }
  }
}
const sample = { ...base, type:'quarter_winder', windersPerQuarter:4, entrySteps:5, outerShape:'square' };
const g = generateWinderGeometry(sample);
const beforeArc = g.treads[sample.entrySteps-1], afterArc = g.treads[sample.entrySteps+4];
assert(beforeArc.isWinder && afterArc.isWinder,'balanced sections continue into the straight runs');
assert(Math.abs(beforeArc.frontEdge[0].x - beforeArc.frontEdge[1].x)>1,'entry edge skewed away from radial construction');
const odd = generateWinderGeometry({ ...sample, windersPerQuarter:5, nosing:0 });
assert(odd.treads.some(t=>t.points.length>4),'actual square wall corner is present in a tread profile');
const slim = { ...sample, width:300, stringerThickness:149, going:600, windersPerQuarter:2, outerShape:'faceted' };
assert(winderIssues(slim).some(issue => issue.includes('klimlijn')), 'reject walking line outside narrow faceted board');
const tight = { ...sample, width:635, going:250, windersPerQuarter:2, stringerThickness:150 };
assert(winderIssues(tight).some(issue => issue.includes('verstekken')), 'reject inverted inside mitres');
for (const bad of [{entrySteps:80},{risers:3},{width:3500},{turnDirection:'up'},{windersPerQuarter:2.5}]) {
  assert(winderIssues({...sample,...bad}).length);
  assert.equal(generateWinderGeometry({...sample,...bad}).treads.length,0);
}
// Winder plan contours may have a concave inner mitre. Check the complete
// body, including each intervening rail vertex, on both supporting treads.
function contains(loop,p) {
  let inside=false;
  for(let i=0;i<loop.length;i++){
    const a=loop[i],b=loop[(i+1)%loop.length];
    if(Math.abs(cross(a,b,p))<=1e-6*distance(a,b) &&
        (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<=1e-6) return true;
    if((a.y>p.y)!==(b.y>p.y) && p.x<a.x+(b.x-a.x)*(p.y-a.y)/(b.y-a.y)) inside=!inside;
  }
  return inside;
}
let grooved=0;
for(const type of ['quarter_winder','half_winder']) for(const turnDirection of ['left','right'])
for(const outerShape of ['square','faceted']) for(const nosing of [-60,-25,0,25,100])
for(const wellatType of ['none','chamfered']){
  const s={...base,type,turnDirection,outerShape,nosing,wellatType,riserJoint:'housed',riserBoards:'closed'};
  const family={winder:true}, g=generateWinderGeometry(s,family);
  const nominal=generateWinderGeometry({...s,riserJoint:'butt'},family);
  const details=buildStairDetails(s,g), boards=details.filter(p=>p.role==='riser');
  assert.equal(boards.length,s.risers);
  const lip=wellatType==='chamfered'?s.wellatWidth:0;
  for(const [i,board] of boards.entries()){
    const upper=g.treads[i],lower=g.treads[i-1],d=board.direction;
    verifySimple(board.planPoints);
    const dot=p=>p.x*d.x+p.y*d.y;
    const run=board.planPoints.map(dot);
    close(Math.max(...run)-Math.min(...run),s.riserThickness,'two parallel faces of winding riser');
    for(const [k,a] of board.planPoints.entries()){
      const b=board.planPoints[(k+1)%run.length];
      for(const fraction of [0,.25,.5,.75]) {
        const point={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
        for(const host of [upper,lower].filter(Boolean)) assert(contains(host.points,point),board.id+' body misses '+host.id);
      }
    }
    if(!upper) continue;
    close(upper.goingAtWalkline,nominal.treads[i].goingAtWalkline,'machining keeps nominal going');
    close(upper.eligibleAt170Mm,nominal.treads[i].eligibleAt170Mm,'machining keeps effective going band');
    close(dot(upper.frontEdge[0])+lip,Math.min(...run),'leading edge tracks actual riser and nosing strip');
    const strip=details.find(part=>part.id===upper.id+'-WL');
    assert.equal(!!strip,!!lip);
    if(strip) close(Math.max(...strip.faces.flat().map(dot)),Math.min(...run),'strip terminates on riser');
  }
  grooved++;
}
console.log(`${grooved} gesloten varianten gecontroleerd op de volledige stootbordoplegging, neus, wellat en klimlijn.`);
console.log(`${checked} verdreven trapvarianten gecontroleerd op spiegeling, vereffening, hoekpunten, sluitende contouren, maatvoering en materiaal.`);
