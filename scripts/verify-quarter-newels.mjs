import assert from 'node:assert/strict';
import clip from 'polygon-clipping';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { devriesNewelSettings } from '../src/two-quarter-settings.js';
import { winderIssues } from '../src/winder.js';
import { signedMeshVolume } from '../src/components/solids.js';

const EPS=.00001;
const near=(a,b,what)=>assert(Math.abs(a-b)<EPS,what+' · '+a+' / '+b);
const ring=points=>[points.map(({x,y})=>[x,y])];
const area=polygon=>Math.abs(polygon.reduce((s,p,i)=>{
  const q=polygon[(i+1)%polygon.length];
  return s+p[0]*q[1]-q[0]*p[1];
},0)/2);
const clippedArea=polygons=>polygons.reduce((s,poly)=>s+area(poly[0])-poly.slice(1).reduce((v,h)=>v+area(h),0),0);
const overlap=(a,b)=>clippedArea(clip.intersection(ring(a),ring(b)));
function meshVolume(post) {
  const vertices=[], faces=[];
  for (const face of post.meshFaces) faces.push(face.map(p=>vertices.push(p)-1));
  return signedMeshVolume(vertices,faces)/1e9;
}

// Global millimetres in the downloaded IFC2x3, registered by the outer
// stringers. The imported model measures 992.105 mm in the short direction.
const factoryTD15=[[78.105,2226],[25.105,2226],[25.105,3102],[387.143,3102],[78.105,2201.323]];
let variantCount=0;
for (const changes of [{}, {lowerNewelEnabled:false},{upperNewelEnabled:false},
  {lowerNewelHousing:8,upperNewelHousing:12,lowerNewelClearance:.4,upperNewelClearance:.8},
  {lowerNewelHousing:8,upperNewelHousing:8,nosing:-15},
  {nosing:-15},
  {lowerNewelHousing:8,upperNewelHousing:8,nosing:15},
  {upperNewelDepth:76,upperNewelWidth:130,upperNewelOffsetAlong:50,upperNewelOffsetAcross:3,
    upperNewelBase:-20,upperNewelTop:4100,upperNewelEndGoing:18,upperNewelHousing:11},
  {lowerNewelHousing:16,upperNewelHousing:22,wel:50},
  {firstQuarterAngles:[17,18,19,20,16],upperNewelEndGoing:25}
]) {
  let left;
  for (const turnDirection of ['left','right']) {
    const stair={...starterProject.stair,...devriesNewelSettings,...changes,turnDirection};
    assert.deepEqual(winderIssues(stair),[]);
    const geometry=generateStairGeometry(stair);
    near(geometry.footprint.width,992,'Korte buitenmaat');
    near(geometry.footprint.depth,3140,'Lange buitenmaat');
    assert.equal(geometry.treads.length,15);
    for (const post of geometry.newels) {
      const key=post.corner+'Newel';
      near(post.yMax-post.yMin,stair[key+'Width'],'Spilbreedte');
      near(post.xMax-post.xMin,stair[key+'Depth'],'Spildiepte');
      near(post.lowerZ,stair[key+'Base'],'Onderpeil');
      near(post.upperZ,stair[key+'Top'],'Bovenpeil');
      near(meshVolume(post),post.volume,'Netto spilvolume uit oppervlaktevlakken');
      const contact=geometry.treads.filter(t=>post.connectedTreadIds.includes(t.id));
      assert.deepEqual(contact.map(t=>t.step),post.corner==='lower'?[1,2,3,4,5,6]:[10,11,12,13,14,15]);
      const depths=stair[key+'Housing'];
      assert.equal(post.pockets.length,depths?contact.length:0);
      if (changes.nosing===-15 && post.corner==='lower') {
        if (depths) near(post.pockets[1].cornerLandsMm2[0],33.733000538,'Resterende hoek op TD02');
        else {
          const cheek=geometry.treads[1].points.filter(p=>Math.abs(p.x-post.xMax)<EPS);
          assert.equal(cheek.length,2);
          assert(Math.abs(cheek[0].y-cheek[1].y)>104,'Doorlopend contact langs de echte spilwang');
        }
      }
      for (const tread of geometry.treads) {
        const pocket=post.pockets.find(p=>p.treadId===tread.id);
        near(overlap(tread.points,post.points),pocket?area(ring(pocket.points)[0]):0,'Trede-insteek '+tread.id);
        if (pocket) {
          near(tread.elevation-tread.thickness-pocket.lowerZ,stair[key+'Clearance']/2,'Vloer huis');
          near(pocket.upperZ-tread.elevation,stair[key+'Clearance']/2,'Dak huis');
        }
        for (const seat of [tread.riserSeat,tread.exitRiserSeat].filter(Boolean))
          near(overlap(post.points,seat.points),0,'Stootbord tegen spil');
      }
      const sign=turnDirection==='right'?-1:1;
      const inner=geometry.stringers.filter(beam=>beam.side===sign);
      for (const beam of geometry.stringers) near(overlap(beam.points,post.points),0,'Wang tegen spil');
      const y=post.corner==='lower' ? post.yMax : post.yMin;
      const reflectedEnd=sign===1?y:post.corner==='lower'?post.yMin:post.yMax;
      assert(inner.some(beam=>beam.points.filter(p=>Math.abs(p.y-reflectedEnd)<EPS).length===2),
        'Kopvlak wang '+JSON.stringify({changes,turnDirection,corner:post.corner,reflectedEnd}));
    }
    if (!Object.keys(changes).length) {
      const pts=geometry.treads.at(-1).points;
      assert.equal(pts.length,5);
      for (const [x,y] of factoryTD15)
        assert(Math.min(...pts.map(p=>Math.hypot(p.x-x,Math.abs(p.y)-y)))<.11,'TD15 fabriekscontour');
    }
    if (left) for (const [i,tread] of geometry.treads.entries()) {
      near(tread.area,left.treads[i].area,'Handspiegeling oppervlak');
      for (const p of tread.points) assert(left.treads[i].points.some(q=>Math.hypot(q.x-p.x,q.y+p.y)<EPS));
    }
    else left=geometry;
    variantCount++;
  }
}
for (const invalid of [{lowerNewelHousing:100},{upperNewelOffsetAcross:400},{lowerNewelTop:90},{upperNewelClearance:4}]) {
  const stair={...starterProject.stair,...devriesNewelSettings,...invalid};
  assert(winderIssues(stair).length);
  assert.equal(generateStairGeometry(stair).treads.length,0);
}
console.log(variantCount+' spilvarianten: TD15 <0,11 mm, wangkoppen, stootborden, passing, netto volume en spiegeling gecontroleerd.');
