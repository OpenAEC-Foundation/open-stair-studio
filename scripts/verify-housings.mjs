import assert from 'node:assert/strict';
import { generateStairGeometry, stairFamilies, starterProject } from '../src/stair.js';
import { buildHousings, pointOnHousingFrame } from '../src/housings.js';

const eps=1e-5;
const base=starterProject.stair;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const mag=a=>Math.hypot(a.x,a.y,a.z);
const near=(a,b,name='measure')=>assert(Math.abs(a-b)<eps,`${name}: ${a} vs ${b}`);
const area=p=>Math.abs(p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a.x*b.y-a.y*b.x;},0)/2);
const cross2=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

function insideStock(beam,p) {
  if (!beam.vertices) {
    // Independent projection onto the original gross prism.
    const {origin,axis,sideAxis,down}=beam.frame, d=sub(p,origin);
    assert(dot(d,axis)>=-eps && dot(d,axis)<=beam.length+eps);
    assert(Math.abs(dot(d,sideAxis))<=beam.thickness/2+eps);
    assert(Math.abs(dot(d,down))<=beam.width/2+eps);
    return;
  }
  // The winding segment has a triangulated, possibly twisted top and a
  // matching bottom. Locate actual XY in a triangle and interpolate its Z.
  const v=beam.vertices;
  for (const [i,j,k] of [[0,1,2],[0,2,3]]) {
    const denom=cross2(v[i],v[j],v[k]);
    const w=[cross2(p,v[j],v[k]),cross2(v[i],p,v[k]),cross2(v[i],v[j],p)].map(x=>x/denom);
    if (Math.min(...w)<-eps) continue;
    const top=w[0]*v[i].z+w[1]*v[j].z+w[2]*v[k].z;
    const bottom=w[0]*v[i+4].z+w[1]*v[j+4].z+w[2]*v[k+4].z;
    assert(p.z>=bottom-eps && p.z<=top+eps, beam.id+' cuts outside real material height');
    return;
  }
  assert.fail(beam.id+' cuts outside the mitred XY footprint');
}

function check(stair,settings) {
  const geometry=generateStairGeometry(stair);
  const result=buildHousings(geometry,settings);
  assert.deepEqual(result.issues,[],stair.type);
  const {depth,clearance}=result.settings;
  const allPockets=new Map();
  for (const job of result.beams) {
    const beam=geometry.stringers.find(b=>b.id===job.id);
    const {xAxis,yAxis,zAxis}=job.frame;
    near(dot(cross(xAxis,yAxis),zAxis),1,'right-handed machine frame');
    for (const axis of [xAxis,yAxis,zAxis]) near(mag(axis),1,'unit setup axis');
    assert(xAxis.z>0,'grain axis ascending');
    near(zAxis.z,0,'inside face vertical');
    for(const vertex of job.outline) {
      assert(vertex.x>=-eps && vertex.x<=job.length+eps && vertex.y>=-eps && vertex.y<=job.width+eps);
      insideStock(beam,pointOnHousingFrame(job.frame,vertex));
    }
    for (const pocket of job.pockets) {
      assert(!allPockets.has(pocket.id));
      allPockets.set(pocket.id,{pocket,job});
      assert.equal(pocket.contour.length,4);
      assert.equal(pocket.openEdge,false);
      for (let i=0;i<4;i++) {
        const point=pocket.contour[i];
        const top=pointOnHousingFrame(job.frame,point);
        near(mag(sub(top,pocket.worldContour[i])),0,'pocket setup back to world');
        for (const z of [0,-depth/2,-depth]) {
          insideStock(beam,pointOnHousingFrame(job.frame,point,z));
          for(const {a,b,c,d} of job.stockPlanes) assert(a*point.x+b*point.y+c*z<=d+eps);
        }
      }
    }
  }
  let tongues=0;
  for(const [i,t] of result.treads.entries()) {
    assert.equal(t.id,geometry.treads[i].id);
    assert.equal(new Set(t.tongues.map(x=>x.side)).size,2);
    let addedArea=0;
    for(const tongue of t.tongues) {
      tongues++;
      const {pocket,job}=allPockets.get(tongue.pocketId);
      assert.equal(pocket.treadId,t.id);
      const width=Math.hypot(tongue.points[3].x-tongue.points[0].x,tongue.points[3].y-tongue.points[0].y);
      near(area(tongue.points),width*depth,'physical tongue rectangle');
      near(area(pocket.contour),(width+clearance)*(t.thickness+clearance),'matching pocket opening incl clearance');
      const worldZ=pocket.worldContour.map(p=>p.z);
      near(Math.max(...worldZ),t.elevation+clearance/2);
      near(Math.min(...worldZ),t.elevation-t.thickness-clearance/2);
      for(const [index,p] of tongue.points.entries()) {
        near(dot(sub({...p,z:t.elevation},job.frame.origin),job.frame.zAxis),
          [1,2].includes(index)?-depth:0,'tongue inside correct face');
        insideStock(geometry.stringers.find(b=>b.id===job.id),{...p,z:t.elevation});
      }
      addedArea+=area(tongue.points);
    }
    near(area(t.points)-area(geometry.treads[i].points),addedArea,'production profile incl all tongues');
    near(t.volume,area(t.points)*t.thickness/1e9);
  }
  assert.equal(allPockets.size,tongues);
  return result;
}

let cases=0, pockets=0;
for (const family of stairFamilies) {
  for(const outerShape of family.winder?['square','faceted']:['square']) {
    for(const settings of [{depth:12,clearance:0.4,endMargin:12},{depth:9.5,clearance:0.8,endMargin:8}]) {
      const stair={...base,type:family.id,outerShape};
      const result=check(stair,settings);
      cases++;
      pockets+=result.beams.reduce((n,job)=>n+job.pockets.length,0);
      if(family.winder) {
        const mirrored=check({...stair,turnDirection:'right'},settings);
        cases++;
        pockets+=mirrored.beams.reduce((n,job)=>n+job.pockets.length,0);
        for(const [i,t] of result.treads.entries()) {
          const reflected=mirrored.treads[i];
          near(t.area,reflected.area,'mirrored production area');
          assert(t.points.every(p=>reflected.points.some(q=>Math.hypot(q.x-p.x,q.y+p.y)<eps)));
        }
      }
    }
    if(family.winder) for(const nose of [-25,25]){
      const result=check({...base,type:family.id,outerShape,nosing:nose},{depth:12,clearance:0.4,endMargin:12});
      cases++;pockets+=result.beams.reduce((n,job)=>n+job.pockets.length,0);
    }
  }
}
const straight=generateStairGeometry(base);
for(const [input,code] of [[{depth:50},'through'],[{depth:NaN},'settings'],[{clearance:-1},'settings'],[{endMargin:300},'missing-support'],[{endMargin:0},'open-edge']]) {
  assert(buildHousings(straight,input).issues.some(i=>i.code===code));
}
assert(buildHousings(generateStairGeometry({...base,type:'landing',risers:2})).issues.some(i=>i.code==='empty-stock'));
assert(buildHousings(generateStairGeometry({...base,type:'half_winder',risers:2})).issues.some(i=>i.code==='empty-stock'));
const collision=structuredClone(straight);
collision.treads.push({...collision.treads[0],id:'conflicting-tread'});
assert(buildHousings(collision).issues.some(i=>i.code==='overlap'));
console.log(`${cases} housing configurations, ${pockets} tongue/pocket pairs checked against original 3D stock, setup frames, mitres, clearances and production contours.`);
