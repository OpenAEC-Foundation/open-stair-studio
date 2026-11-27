import assert from 'node:assert/strict';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { devriesDistributedSettings, devriesIfcDepth } from '../src/two-quarter-settings.js';
import { buildWorkshop, individualTreads } from '../src/workshop.js';
import { makePartsCsvRows } from '../src/winder-parts.js';
import { createTreadDxf } from '../src/tread-dxf.js';
import { compileTreadJob, writeTreadCamJson, writeTreadLinuxCnc } from '../src/tread-cam.js';
import { verifyTreadFit } from '../src/tread-fit.js';

const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
function toWorld(frame, p) {
  return {x:frame.origin.x+frame.xAxis.x*p.x+frame.yAxis.x*p.y,
    y:frame.origin.y+frame.xAxis.y*p.x+frame.yAxis.y*p.y};
}
function gap(p,a,b) {
  const x=b.x-a.x,y=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y || 1)));
  return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);
}
function sameOutline(actual,expected,tolerance=.00001) {
  assert.equal(actual.length,expected.length);
  const start=expected.findIndex(p=>distance(actual[0],p)<tolerance);
  assert(start>=0);
  assert([1,-1].some(sign=>actual.every((p,i)=>
    distance(p,expected[(start+sign*i+actual.length)%actual.length])<tolerance)));
}

// Read DXF group codes and use the real CNC setup to restore both exports to
// model XY. Comparing perimeters alone would also pass a swapped or shifted board.
function dxfContour(file) {
  const lines=file.trim().split(/\r?\n/), points=[];
  let active=false,closed=false;
  for (let i=0;i<lines.length;i+=2) {
    const code=Number(lines[i]), value=lines[i+1];
    if (code===0) active=value==='LWPOLYLINE';
    if (!active) continue;
    if (code===8) assert.equal(value,'OSS-TREAD');
    if (code===70) closed=Boolean(Number(value)&1);
    if (code===10) points.push({x:Number(value)});
    if (code===20) points.at(-1).y=Number(value);
  }
  assert(closed && points.length>=3);
  return points;
}

// Interpret the posted through-cut, including the plunge position. No path
// from the in-memory job is used in the subsequent cutting-edge checks.
function readLastLap(file,thickness,breakthrough) {
  let current,lap,radius,depth;
  const laps=[];
  for (const line of file.trimEnd().split('\n')) {
    const tool=line.match(/^\(Centre-cut end mill D([.\d]+) mm/);
    if (tool) radius=Number(tool[1])/2;
    const xy=line.match(/^G([01]) X(-?[.\d]+) Y(-?[.\d]+)/);
    if (xy) {
      current={x:Number(xy[2]),y:Number(xy[3])};
      if (xy[1]==='1') lap.push(current);
    }
    const plunge=line.match(/^G1 Z(-?[.\d]+)/);
    if (plunge) {
      const nextDepth=Number(plunge[1]);
      assert(nextDepth<(depth??0));
      depth=nextDepth; lap=[current]; laps.push(lap);
    }
  }
  assert(radius>0 && laps.length>=1);
  assert(Math.abs(depth+thickness+breakthrough)<.0001);
  for(const pass of laps){
    assert.deepEqual(pass,lap);
    assert.deepEqual(pass[0],pass.at(-1));
  }
  return {lap,radius};
}

function verifyCut(edgeLoop, nc, part, job) {
  const {lap,radius}=readLastLap(nc,part.thickness,job.parameters.breakthrough);
  const local=p=>({x:p.x-job.offset.x,y:p.y-job.offset.y});
  const path=lap.map(p=>toWorld(part.boardFrame,local(p)));
  const insideCorners=job.reliefs.map(r=>toWorld(part.boardFrame,local(r.corner)));
  for (const [i,a] of edgeLoop.entries()) {
    const b=edgeLoop[(i+1)%edgeLoop.length],count=Math.max(2,Math.ceil(distance(a,b)/1.5));
    for (let j=0;j<=count;j++) {
      const t=j/count;
      const p={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};
      const d=Math.min(...path.slice(1).map((end,k)=>gap(p,path[k],end)));
      assert(d<=radius+.0002,`${part.id} leaves stock on edge ${i} at ${t}: ${d-radius} mm`);
      // An intentional dogbone trims only the region around its re-entrant corner.
      if (!insideCorners.some(c=>distance(c,p)<2*radius+.001)) {
        assert(d>=radius-.0002,`${part.id} cuts into edge ${i}: ${radius-d} mm`);
      }
    }
  }
}

let programs=0;
const toolsUsed=new Map();
function manufacture(changes) {
  const model=structuredClone(starterProject);
  Object.assign(model.stair,devriesDistributedSettings,changes);
  model.joinery.type='none';
  const geometry=generateStairGeometry(model.stair),shop=buildWorkshop(geometry,model);
  const boards=individualTreads(shop);
  assert.equal(boards.length,15);
  const [header,...rows]=makePartsCsvRows(shop,model.stair.material);
  const stationColumns=['Kwart','Trede in kwart','Correctie voorste stootbordlijn mm','Correctie achterste stootbordlijn mm'].map(label=>header.indexOf(label));
  assert(stationColumns.every(column=>column>=0));
  return boards.map((board,i)=>{
    const tread=geometry.treads[i];
    const row=rows.find(r=>r[0]===board.id);
    assert.equal(!!board.windingDistribution,tread.isWinder);
    assert.deepEqual(board.windingDistribution,tread.windingDistribution);
    const winding=tread.windingDistribution;
    assert.deepEqual(stationColumns.map(column=>row[column]),winding
      ? [winding.quarter==='lower'?'Onderkwart':'Bovenkwart',winding.index,Number(winding.frontOffsetMm.toFixed(3)),Number(winding.backOffsetMm.toFixed(3))]
      : ['','','','']);
    const outline=dxfContour(createTreadDxf(board)).map(p=>toWorld(board.boardFrame,p));
    sameOutline(outline,tread.points);
    let job;
    for (const toolDiameter of [6,4,3,2]) {
      try { job=compileTreadJob(board,{...model.treadCam,toolDiameter},model.project);break; }
      catch(error) {
        if(toolDiameter===2 || !/kleinere|contourkant/.test(error.message)) throw error;
      }
    }
    const fit=verifyTreadFit(board,shop,model.cam,job);
    assert(['pass','unconnected'].includes(fit.status),JSON.stringify(fit.issues));
    const json=JSON.parse(writeTreadCamJson(job,fit));
    sameOutline(json.contour.map(p=>toWorld(json.boardFrame,{x:p.x-json.offset.x,y:p.y-json.offset.y})),outline);
    assert.deepEqual(json.windingDistribution,board.windingDistribution);
    const nc=writeTreadLinuxCnc(job);
    assert.equal(nc.includes('(Winder '),!!board.windingDistribution);
    verifyCut(outline,nc,board,job);
    toolsUsed.set(job.parameters.toolDiameter,1+(toolsUsed.get(job.parameters.toolDiameter)??0));
    programs++;
    return {outline,nc:nc.replace(/^\(.*\)\n/gm,'')};
  });
}

const first=[...devriesDistributedSettings.firstQuarterOffsets];
first[3]+=3;  // Front of TD4, shared with the back of TD3.
const second=[...devriesDistributedSettings.secondQuarterOffsets];
second[0]-=2; // Back of TD11, shared with the front of TD12.
let reference;
for (const options of [{},{firstQuarterOffsets:first,secondQuarterOffsets:second},{outerDepth:devriesIfcDepth},
  {lowerNewelHousing:8,upperNewelHousing:8,lowerNewelClearance:.4,upperNewelClearance:.4}]) {
  const left=manufacture({...options,turnDirection:'left'});
  const right=manufacture({...options,turnDirection:'right'});
  for (let i=0;i<left.length;i++) sameOutline(left[i].outline.map(p=>({x:p.x,y:-p.y})),right[i].outline);
  if (options.firstQuarterOffsets) {
    const affected=left.flatMap((board,i)=>board.nc!==reference[i].nc?[i+1]:[]);
    assert.deepEqual(affected,[3,4,11,12],'Only the two boards on each side of a moved line receive different machine motion');
  }
  if(!reference)reference=left;
}
console.log(`${programs} tredebladen, DXF-zaagcontouren en teruggelezen CNC-programma's gecontroleerd; frees Ø in mm en aantal: ${JSON.stringify(Object.fromEntries(toolsUsed))}.`);
