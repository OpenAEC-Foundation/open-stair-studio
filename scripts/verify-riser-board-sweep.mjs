import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { buildWorkshop } from '../src/workshop.js';
import { tessellate } from '../src/ifc-tessellate.js';
import { riserFaceResults } from '../src/riser-face-cam.js';
import { compileHousingJob, writeLinuxCnc } from '../src/housing-cam.js';
import { sweptTool } from './riser-swept-tool.mjs';

const xyz = p => [p.x,p.y,p.z];
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const delta = (a,b) => a.map((v,i)=>v-b[i]);
const along = (p,n,d) => p.map((v,i)=>v+n[i]*d);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function machine(frame,p) {
  const v=delta(p,xyz(frame.origin));
  return [frame.xAxis,frame.yAxis,frame.zAxis].map(axis=>dot(v,xyz(axis)));
}

function grooveSolids(work,model,board) {
  const jobs=[];
  const hosts=new Set(board.joineryFeatures.map(f=>f.hostId));
  for (const beam of work.housings.beams.filter(b=>hosts.has(b.id))) jobs.push(compileHousingJob(beam,model.cam));
  for (const part of work.parts.filter(p=>hosts.has(p.id) && ['tread','landing'].includes(p.kind)))
    for (const result of riserFaceResults(part,model,work.riserJoinery.issues)) {
      assert(result.job,result.problem);
      jobs.push(result.job);
    }
  const tools=new Map();
  for (const job of jobs) {
    const cut=sweptTool(writeLinuxCnc(job),job.cam.toolDiameter/2);
    for(const pocket of job.stock.pockets.filter(p=>p.riserId===board.id)) {
      tools.set(pocket.id,p=>cut(...machine(job.stock.frame,p)));
    }
  }
  return tools;
}

// Check both the tongue that survived milling and the mating groove at
// the same installed XYZ. Include the tip, base, edge strips and corners.
function checkFit(board,material,grooves) {
  let probes=0;
  for(const joint of board.joineryFeatures) {
    const corners=joint.tongueWorldContour.map(xyz);
    const [a,b,,d]=corners;
    const u=delta(b,a),v=delta(d,a);
    const edgeSamples=axis=>{
      const e=Math.min(0.1,0.1/Math.hypot(...axis));
      return [e,0.25,0.5,0.75,1-e];
    };
    const cleared=grooves.get(joint.id);
    assert(cleared,joint.id+' receiving toolpath missing');
    for(const i of edgeSamples(u)) for(const j of edgeSamples(v)) for(const depth of [0.1,joint.tongueDepth/2,joint.tongueDepth-0.1]) {
      const p=along(along(along(a,u,i),v,j),xyz(joint.inward),depth);
      assert(material(p),joint.id+' tongue missing at '+p);
      assert(cleared(p),joint.id+' receiving stock still present at '+p);
      probes++;
    }
    for (const [edge,tangent] of [[u,v],[v,u]]) {
      const e=0.12/Math.hypot(...edge);
      for (const i of [-e,1+e]) for (const j of [0.03,0.5,0.97]) {
        const shoulder=along(along(a,edge,i),tangent,j);
        const p=along(shoulder,xyz(joint.inward),0.15);
        assert(!material(p),joint.id+' residue beside tongue at '+p);
        probes++;
      }
    }
  }
  return probes;
}

// Sample both sides of each finished triangle, weighting extra probes
// toward vertices to distinguish shoulder fillets from flat face centres.
function checkFaces(board,material,allowance) {
  const {coordinates,triangles}=tessellate(board,xyz);
  let probes=0;
  for(const tri of triangles) {
    const points=tri.map(i=>coordinates[i-1]);
    const n=cross(delta(points[1],points[0]),delta(points[2],points[0]));
    const normal=n.map(v=>v/Math.hypot(...n));
    for(const weights of [[1/3,1/3,1/3],[0.8,0.1,0.1],[0.1,0.8,0.1],[0.1,0.1,0.8]]) {
      const p=points[0].map((_,k)=>weights.reduce((s,w,i)=>s+w*points[i][k],0));
      assert(material(along(p,normal,-allowance)),board.id+' gouge at '+p+' normal '+normal);
      assert(!material(along(p,normal,allowance)),board.id+' residual wood at '+p+' normal '+normal);
      probes+=2;
    }
  }
  return probes;
}

// Odd-even ray casting on the drawing triangles supplies a second oracle for
// dispersed stock probes, including islands separated from a finished edge.
function checkStock(board,material) {
  const {coordinates,triangles}=tessellate(board,p=>machine(board.riserFrame,xyz(p)));
  const ray=[0.87,0.113,0.323];
  const faces=triangles.flatMap(tri=>{
    const [a,b,c]=tri.map(i=>coordinates[i-1]);
    const e1=delta(b,a),e2=delta(c,a),h=cross(ray,e2),det=dot(e1,h);
    return Math.abs(det)<1e-7?[]:[{a,e1,e2,h,det}];
  });
  function inside(p) {
    const hits=[];
    for (const {a,e1,e2,h,det} of faces) {
      const s=delta(p,a),u=dot(s,h)/det;
      if(u<0 || u>1) continue;
      const q=cross(s,e1),v=dot(ray,q)/det;
      if(v<0 || u+v>1) continue;
      const t=dot(e2,q)/det;
      if(t>0 && !hits.some(d=>Math.abs(t-d)<1e-6)) hits.push(t);
    }
    return hits.length%2===1;
  }
  const f=board.riserFrame;
  const bounds=[0,1,2].map(i=>[Math.min(...coordinates.map(v=>v[i])),Math.max(...coordinates.map(v=>v[i]))]);
  let probes=0;
  // Deterministic, non-grid fractions avoid sampling exactly on coplanar faces.
  const frac=v=>v-Math.floor(v);
  for(let n=1;n<=3000;n++) {
    const p=[0.754877666,0.569840291,0.433895437].map((k,i)=>{
      const [lo,hi]=bounds[i];
      const span=hi-lo,v=frac(n*k);
      if(i===1 && n%3) return n%3===1?lo+v*Math.min(span,45):hi-v*Math.min(span,45);
      return lo+span*v;
    });
    const world=along(along(along(xyz(f.origin),xyz(f.xAxis),p[0]),xyz(f.yAxis),p[1]),xyz(f.zAxis),p[2]);
    const actual=material(world),expected=inside(p);
    if(actual!==expected) {
      // Quantized NC and finite tool tolerances are allowed only up to 0.08
      // mm from the design boundary. Require agreement away from that skin.
      const nearFace=[0,1,2].some(i=>[-0.08,0.08].some(d=>{
        const neighbour=p.slice();
        neighbour[i]+=d;
        return inside(neighbour)!==expected;
      }));
      assert(nearFace,board.id+' stock sample '+p+' expected wood='+expected+', actual='+actual);
    }
    probes++;
  }
  return probes;
}

const sampleCases=[
  ['straight','left',14,-40,1],['straight','left',24,25,1],
  ['quarter_winder','left',14,-40,7],['quarter_winder','right',24,25,7],
  ['half_winder','left',18,2,10],['half_winder','right',24,25,7],
  ['quarter_winder','left',18,25,8,'faceted'],['quarter_winder','right',24,25,8,'faceted'],
  ['half_winder','left',18,25,7,'faceted'],['half_winder','right',24,25,7,'faceted']
];
function sampleBoard([type,turnDirection,riserThickness,nosing,index,outerShape='square']) {
  const model=structuredClone(starterProject);
  Object.assign(model.stair,{type,turnDirection,riserThickness,nosing,riserBoards:'closed',riserJoint:'housed',outerShape});
  const work=buildWorkshop(generateStairGeometry(model.stair),model);
  assert.deepEqual(work.riserJoinery.issues.filter(i=>i.level==='error'),[]);
  const board=work.detailParts.filter(p=>p.role==='riser')[index];
  return {board,model,work};
}

function checkFluteReach(program,corners,cutter,id) {
  // Horizontal end fixtures have board height along machine Y. The upper
  // stock surface in machine XZ is piecewise linear. Clip its edges to
  // the width swept by the cutter, independently of the reported CAM depth.
  const radius=cutter.toolDiameter/2;
  const ys=corners.map(c=>c[1]),minY=Math.min(...ys),maxY=Math.max(...ys);
  const edges=[];
  for(let i=0;i<8;i++) for(const bit of [1,2,4])
    if((i&bit)===0) edges.push([corners[i],corners[i|bit]]);
  let previous={};
  for(const raw of program.split('\n')) {
    if(!/^G[01] /.test(raw)) continue;
    const words=Object.fromEntries([...raw.matchAll(/([XYZ])(-?[\d.]+)/g)].map(m=>[m[1],Number(m[2])]));
    const p={...previous,...words};
    if(/^G1 /.test(raw) && p.Z<0 && Math.max(p.Y,previous.Y)+radius>=minY && Math.min(p.Y,previous.Y)-radius<=maxY) {
      const lo=Math.min(p.X,previous.X)-radius,hi=Math.max(p.X,previous.X)+radius;
      let top=-Infinity;
      for(const [a,b] of edges) {
        if(a[0]>=lo && a[0]<=hi) top=Math.max(top,a[2]);
        if(b[0]>=lo && b[0]<=hi) top=Math.max(top,b[2]);
        for(const u of [lo,hi]) if((a[0]-u)*(b[0]-u)<0)
          top=Math.max(top,a[2]+(b[2]-a[2])*(u-a[0])/(b[0]-a[0]));
      }
      assert(top-Math.min(previous.Z,p.Z)<=cutter.fluteLength+0.01,id+' flute engagement '+(top-Math.min(previous.Z,p.Z))+' at '+raw);
    }
    previous=p;
  }
}

function boardMaterial(board,job) {
  // The operator starts from a rectangular finished-size blank in board
  // coordinates. Derive extents from the drawing, independent of CAM.
  const vertices=board.faces.flat().map(p=>machine(board.riserFrame,xyz(p)));
  const bounds=[0,1,2].map(i=>[Math.min(...vertices.map(v=>v[i])),Math.max(...vertices.map(v=>v[i]))]);
  for(const [i,dimension] of ['thickness','length','height'].entries()) {
    const drawn=bounds[i][1]-bounds[i][0];
    assert(Math.abs(job.stock[dimension]-drawn)<0.01,board.id+' stock '+dimension);
  }
  const tools=job.setups.map(setup=>{
    const {xAxis,yAxis,zAxis}=setup.frame;
    assert(Math.abs(dot(cross(xyz(xAxis),xyz(yAxis)),xyz(zAxis))-1)<1e-6,board.id+' fixture axes');
    const corners=[];
    for(const x of bounds[0]) for(const y of bounds[1]) for(const z of bounds[2]) {
      const f=board.riserFrame;
      corners.push(machine(setup.frame,along(along(along(xyz(f.origin),xyz(f.xAxis),x),xyz(f.yAxis),y),xyz(f.zAxis),z)));
    }
    const origins=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[2]))];
    assert(origins.every(v=>Math.abs(v)<0.001),board.id+' stock datum '+origins);
    const program=writeRiserBoardLinuxCnc(job,setup);
    const cutter=setup.parameters??job.parameters;
    const declared=program.match(/end mill D([\d.]+) mm/i);
    assert(Math.abs(Number(declared?.[1])-cutter.toolDiameter)<0.0001,board.id+' tool on setup sheet and NC must agree');
    checkFluteReach(program,corners,cutter,board.id);
    const cut=sweptTool(program,Number(declared[1])/2);
    return p=>cut(...machine(setup.frame,p));
  });
  return p=>{
    if(machine(board.riserFrame,p).some((v,i)=>v<bounds[i][0]-1e-6 || v>bounds[i][1]+1e-6)) return false;
    return !tools.some(cut=>cut(p));
  };
}

const {compileRiserBoardJob,writeRiserBoardLinuxCnc}=await import('../src/riser-board-cam.js');
let surfaceProbes=0,fitProbes=0,stockProbes=0,programs=0;
const fixtures=sampleCases.flatMap(variant=>{
  if(variant[0]==='straight' || variant[5]==='faceted') return [variant];
  const {work}=sampleBoard(variant);
  return work.detailParts.filter(p=>p.role==='riser').map((_,i)=>[...variant.slice(0,4),i]);
});
for(const type of ['quarter_winder','half_winder']) for(const hand of ['left','right'])
  for(const nosing of [-60,0,25,100]) for(const index of [8,type==='half_winder'?10:7])
    fixtures.push([type,hand,18,nosing,index]);

let mixedTools=0;
for(const fixture of fixtures) {
  const {board,work,model}=sampleBoard(fixture);
  const grooves=grooveSolids(work,model,board);
  const cutters=fixture[0]==='straight'?[fixture[2]===14?4:6]:[2,fixture[2]===14?4:6];
  for(const toolDiameter of cutters) {
    const parameters={...model.riserCam,toolDiameter};
    const detailParameters={...model.riserDetailCam,toolDiameter:2};
    const job=compileRiserBoardJob(board,parameters,{},[],detailParameters);
    if(new Set(job.setups.map(s=>(s.parameters??job.parameters).toolDiameter)).size>1) mixedTools++;
    assert.throws(()=>compileRiserBoardJob(board,{...parameters,stepDown:1,fluteLength:1}),/snijlengte/i,'Unreachable shoulder depth must block NC export');
    const material=boardMaterial(board,job);
    stockProbes+=checkStock(board,material);
    surfaceProbes+=checkFaces(board,material,0.08);
    fitProbes+=checkFit(board,material,grooves);
    programs++;
  }
}
const hard=sampleBoard(['half_winder','right',24,25,7]);
const oversize={...hard.model.riserCam,toolDiameter:6};
assert.throws(()=>compileRiserBoardJob(hard.board,oversize,{},[],oversize),/diameter|frees|schouder/i,'Oversize detail cutter must block export');
assert(mixedTools>0,'No physical job combined two cutter diameters');
console.log(fixtures.length+' CNC-planken, '+mixedTools+' met twee frezen, '+programs+' uitvoerbare NC-sets, te grote detailfrees geweigerd, '+
  stockProbes+' materiaalpunten, '+surfaceProbes+' grenspunten en '+fitProbes+' insteek- en schouderpunten gecontroleerd.');
