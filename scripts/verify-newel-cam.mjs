import assert from 'node:assert/strict';
import clip from 'polygon-clipping';
import {generateStairGeometry,calculateEstimate,starterProject} from '../src/stair.js';
import {devriesNewelSettings} from '../src/two-quarter-settings.js';
import {buildWorkshop,individualTreads} from '../src/workshop.js';
import {makePartsCsvRows} from '../src/winder-parts.js';
import {timberSheetParts,timberViews,timberDetailDxf} from '../src/timber-sheet.js';
import {compileTreadJob,writeTreadLinuxCnc} from '../src/tread-cam.js';
import {verifyTreadFit} from '../src/tread-fit.js';
import {newelShell} from '../src/newel-shell.js';
import {newelFaceSetups,compileNewelFaceJob,writeNewelLinuxCnc} from '../src/newel-cam.js';

const tol=.0002;
function near(a,b,label){assert(Math.abs(a-b)<tol,`${label}: ${a} / ${b}`);}
function inside(x,y,points) {
  let inside=false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j],dx=b.x-a.x,dy=b.y-a.y;
    const u=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
    if(Math.hypot(x-a.x-u*dx,y-a.y-u*dy)<tol) return true;
    if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

// Read the posted program, restore modal axis positions and probe the full
// cutter diameter at both its tip and half depth in stock/world coordinates.
function verifyProgram(post,face,job) {
  const nc=writeNewelLinuxCnc(job),radius=job.cam.toolDiameter/2;
  assert(nc.endsWith('M5\nM2\n')); assert(!/NaN|Infinity/.test(nc));
  let p,x=0,y=0,z=0,count=0,minX=Infinity,maxX=-Infinity;
  function checkHeight() {
    if(!p) return;
    near(minX-radius,p.lowerZ-post.lowerZ,p.id+' freesvloer');
    near(maxX+radius,p.upperZ-post.lowerZ,p.id+' freesdak');
  }
  for (const line of nc.split('\n')) {
    if(line.startsWith('(Pocket ')) {
      checkHeight();
      p=post.pockets.find(v=>line==='(Pocket '+v.id+' / '+v.treadId+')');
      assert(p,line); minX=Infinity; maxX=-Infinity;
    }
    if(!/^G[01] /.test(line))continue;
    const args=Object.fromEntries([...line.matchAll(/([XYZ])(-?[\d.]+)/g)].map(m=>[m[1],Number(m[2])]));
    const xx=args.X??x, yy=args.Y??y, zz=args.Z??z;
    if(line.startsWith('G0 ') && (xx!==x||yy!==y)) assert(z>0,'Vrijloop voor snelle verplaatsing');
    if(zz<0){
      assert(p); minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);
      assert(zz>=-p.depth-tol,'Insteekdiepte');
      for (const mid of [0,.5,1]) {
        const station=x+(xx-x)*mid, side=y+(yy-y)*mid;
        assert(station-radius>=p.lowerZ-post.lowerZ-tol && station+radius<=p.upperZ-post.lowerZ+tol,p.id+' hoogte');
        for(const v of [-radius,-radius/2,0,radius/2,radius]) {
          const s=side+v;
          if(s<0 || s>face.width) continue;
          for (const depth of [-zz,-zz/2]) {
            const wx=face.origin.x+face.yAxis.x*s-face.normal.x*depth;
            const wy=face.origin.y+face.yAxis.y*s-face.normal.y*depth;
            assert(inside(wx,wy,p.points),`${p.id} CNC doorbreekt huis bij ${wx}, ${wy} op vlak ${face.id}`);
          }
        }
      }
      count++;
    }
    x=xx;y=yy;z=zz;
  }
  checkHeight();assert(count>0);
}

const mark='TV',testPost={id:mark,xMin:20,xMax:134,yMin:-10,yMax:56,lowerZ:50,upperZ:3050,pockets:[
  {id:'H-01',treadId:'T-01',depth:8,lowerZ:311.3,upperZ:349.7,
    points:[[20,-10],[94,-10],[86,-2],[28,-2],[28,51],[20,55]].map(([x,y])=>({x,y}))}
]};
for(const face of newelFaceSetups(testPost).filter(f=>f.pockets.length)) {
  const job=compileNewelFaceJob(face);
  verifyProgram(testPost,face,job);
  assert.throws(()=>compileNewelFaceJob(face,{fluteLength:2,stepDown:1}),/snijlengte/i);
}
if(process.argv.includes('--synthetic'))process.exit(0);

// Reopen the final through pass. All timber remaining on the workpiece
// side of the cutter centre path must clear the actual post at TD15 height.
function inspectMachinedNotch(post,part,job,nc) {
  let position,path=[];
  for(const line of nc.split('\n')) {
    const xy=line.match(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/);
    if(xy){position={x:Number(xy[1]),y:Number(xy[2])};path.push(position);}
    if(line.startsWith('G1 Z'))path=[position];
  }
  assert(path.length>4);assert.deepEqual(path.at(-1),path[0]);
  const frame=part.boardFrame,r=job.parameters.toolDiameter/2;
  const pocket=post.pockets.find(p=>p.treadId===part.id);
  const dist=(p,a,b)=>{
    const x=b.x-a.x,y=b.y-a.y;
    const s=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));
    return Math.hypot(p.x-a.x-s*x,p.y-a.y-s*y);
  };
  let interfaceSamples=0;
  for(let x=post.xMin;x<=post.xMax+tol;x+=1)for(let y=post.yMin;y<=post.yMax+tol;y+=1){
    if(pocket && inside(x,y,pocket.points))continue;
    const dx=x-frame.origin.x,dy=y-frame.origin.y;
    const p={x:job.offset.x+dx*frame.xAxis.x+dy*frame.xAxis.y,y:job.offset.y+dx*frame.yAxis.x+dy*frame.yAxis.y};
    if(!inside(p.x,p.y,path))continue;
    assert(path.slice(1).some((b,i)=>dist(p,path[i],b)<=r+tol),part.id+' laat hout staan in de spil');
    interfaceSamples++;
  }
  assert(interfaceSamples>0,part.id+' CNC tegen werkelijk spilvlak getoetst');
  assert.equal(job.reliefs.length,1);
  assert(path.slice(1).some((b,i)=>dist(job.reliefs[0].corner,path[i],b)<=r+tol),'Scherpe binnenhoek bereikt door geschreven NC');
  const noRelief=job.path.filter(p=>Math.hypot(job.reliefs[0].center.x-p.x,job.reliefs[0].center.y-p.y)>.001);
  assert.equal(verifyTreadFit(part,{newels:[post],treads:[]},null,{...job,path:noRelief}).status,'blocked','Gemiste binnenhoek moet de passing blokkeren');
}

let facesTested=0,postsTested=0,profiles=0,smallTools=0,unreachable=0;
for(const options of [
  {},{lowerNewelHousing:8,upperNewelHousing:8,lowerNewelClearance:.4,upperNewelClearance:.4},
  {lowerNewelHousing:6,upperNewelHousing:7,nosing:8,noseProfile:'bevel'},
  {lowerNewelHousing:8,upperNewelHousing:8,nosing:-15},
  {lowerNewelEnabled:false,upperNewelHousing:8}
]){
  let leftEstimate;
  for(const turnDirection of ['left','right']){
    const model=structuredClone(starterProject);
    Object.assign(model.stair,devriesNewelSettings,options,{turnDirection});
    model.joinery.type='none';
    const geometry=generateStairGeometry(model.stair),shop=buildWorkshop(geometry,model);
    const posts=shop.newels;
    assert.equal(posts.length,options.lowerNewelEnabled===false?1:2);
    const rows=timberSheetParts(shop,[]);
    assert.equal(rows.filter(r=>r.type==='quarterNewel').length,posts.length);
    const [header,...csv]=makePartsCsvRows(shop,model.stair.material);
    const depthIndex=header.indexOf('Insteek in spil mm');assert(depthIndex>0);
    for (const post of posts) {
      const mesh=newelShell(post);
      const incidence=new Map();
      let volume=0;
      for(const tri of mesh.triangles) {
        assert(tri.every(i=>Number.isInteger(i)&&i>0&&i<=mesh.coordinates.length));
        const [a,b,c]=tri.map(i=>mesh.coordinates[i-1]);
        // Signed flux through the XY projection, z above a local datum.
        volume+=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*
          ((a[2]+b[2]+c[2])/3-post.lowerZ)/2;
        for(const [i,v] of tri.entries()){
          const w=tri[(i+1)%3],key=[Math.min(v,w),Math.max(v,w)].join(',');
          const use=incidence.get(key)??[0,0];use[v<w?0:1]++;incidence.set(key,use);
        }
      }
      assert([...incidence.values()].every(([cw,ccw])=>cw===1&&ccw===1));
      // An oblique tread can reach two adjacent outside faces, leaving
      // a triangular corner bridge attached to the timber above and below.
      // Each such through-channel creates one topological handle.
      const ring=points=>[points.map(q=>[q.x,q.y])];
      const channels=post.pockets.reduce((sum,p)=>sum+clip.difference(ring(post.points),ring(p.points)).length-1,0);
      assert.equal(mesh.coordinates.length-incidence.size+mesh.triangles.length,2-2*channels,'Topologie van de doorsneden in de spil');
      assert(Math.abs(volume-post.volume*1e9)<.12,'Meshvolume mm³');
      assert.throws(()=>newelShell({...post,meshFaces:post.meshFaces.slice(1)}),/gesloten volume/);
      assert.throws(()=>newelShell({...post,volume:post.volume+.01}),/houtstaat/);
      const part=shop.parts.find(p=>p.id===post.id);
      assert.equal(part.quantity,1);assert.equal(part.kind,'quarterNewel');
      assert.deepEqual([part.length,part.width,part.thickness],[post.upperZ-post.lowerZ,114,66]);
      near(part.blankVolume,(post.xMax-post.xMin)*(post.yMax-post.yMin)*(post.upperZ-post.lowerZ)/1e9,'Spilinkoop');
      near(part.volume,post.volume,'Spilvolume');
      const row=rows.find(r=>r.id===post.id),views=timberViews(row);
      assert.equal(views.length,4+post.pockets.length);
      const dxf=timberDetailDxf(row,views);
      assert(dxf.includes('OSS-SPILHUIS'));assert(dxf.includes(post.id));
      if(post.pockets.length)assert(part.volume<part.blankVolume);
      const machined=new Set();
      for(const face of newelFaceSetups(post).filter(f=>f.pockets.length)){
        const job=compileNewelFaceJob(face,model.cam);
        verifyProgram(post,face,job);
        for(const op of job.operations)machined.add(op.id);
        facesTested++;
      }
      assert(!post.pockets.some(p=>!machined.has(p.id)),'Onbereikbaar tredehuis');
      for(const p of post.pockets){
        const t=geometry.treads.find(t=>t.id===p.treadId);
        near(p.upperZ-t.elevation,(model.stair[post.corner+'NewelClearance']??0)/2,'Bovenspeling');
        near(t.elevation-t.thickness-p.lowerZ,(model.stair[post.corner+'NewelClearance']??0)/2,'Onderspeling');
      }
      postsTested++;
    }
    const boards=individualTreads(shop);
    function chooseTool(board){
      for(const toolDiameter of [model.treadCam.toolDiameter,4,3,2,1]) {
        try{return compileTreadJob(board,{...model.treadCam,toolDiameter});}
        catch(error){assert.match(error.message,/raakt een aangrenzende contourkant/);}
      }
    }
    for(const board of boards.filter(p=>p.newelJoints?.length)) {
      const cut=chooseTool(board);
      if(!cut){
        assert(options.nosing===-15 && board.level===11,'Onverwachte onbewerkbare trede '+board.id);
        unreachable++; continue;
      }
      if(cut.parameters.toolDiameter<model.treadCam.toolDiameter)smallTools++;
      assert.equal(verifyTreadFit(board,shop,model.cam,cut).status,'pass',board.id);
    }
    const last=boards.find(p=>p.level===15);
    assert(last.newelJoints.some(j=>j.postId===posts.find(p=>p.corner==='upper').id));
    const treadJob=chooseTool(last);assert(treadJob,'Trede 15 moet een uitvoerbaar programma hebben.');
    const treadNc=writeTreadLinuxCnc(treadJob);
    assert(treadNc.includes('outline includes newel'));assert(treadNc.includes('M2\n'));
    assert.equal(verifyTreadFit(last,shop,model.cam,treadJob).status,'pass');
    inspectMachinedNotch(posts.find(p=>p.corner==='upper'),last,treadJob,treadNc);
    near(Number(csv.find(r=>r[0]===last.id)[depthIndex]),model.stair.upperNewelHousing,'CSV trede-insteek');
    assert.equal(treadJob.contour.length,last.contour.length);
    profiles++;
    near(shop.blankVolume,shop.parts.reduce((s,p)=>s+p.blankVolume,0),'Bruto hout');
    near(shop.volume,shop.parts.reduce((s,p)=>s+p.volume,0),'Netto hout');
    const estimate=calculateEstimate(shop,model.estimate);
    near(estimate.materialVolume,shop.blankVolume*model.estimate.wasteFactor,'Inkoop met uitval');
    if(leftEstimate)near(estimate.materialVolume,leftEstimate.materialVolume,'Spiegeling calculatie');
    leftEstimate=estimate;
  }
}
console.log(`Spil-CNC: ${postsTested} spilbladen, ${facesTested} vlakprogramma’s en ${profiles} TD15-contouren links en rechts gecontroleerd. ${smallTools} kleinere tredefrezen en ${unreachable} geblokkeerde smalle contouren.`);
