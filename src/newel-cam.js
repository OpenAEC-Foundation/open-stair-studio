import { cncIdentifier, defaultCam, validateCamField } from './housing-cam.js';

const EPS = 1e-7;
const f = value => String(Number(value.toFixed(4)));

// A newel lies on the bed. Machine X runs from foot to head, and X cross Y
// points out of the selected face. Depth is measured into the timber.
const faceAxes = [
  ['xMin', 'X−', -1, 0], ['xMax', 'X+', 1, 0],
  ['yMin', 'Y−', 0, -1], ['yMax', 'Y+', 0, 1]
];

// Split the actual plan footprint at every change in slope. Only the first
// interval open to the spindle may be cut. A pocket turning a post corner
// can have other, hidden intervals which are approached from another face.
function visibleStrips(points) {
  const cuts = [...new Set(points.map(p=>p.s))].sort((a,b)=>a-b);
  const strips = [];
  for (let i=1; i<cuts.length; i++) {
    const a=cuts[i-1], b=cuts[i], mid=(a+b)/2;
    if (b-a < EPS) continue;
    const crossings = [];
    for (const [j,p] of points.entries()) {
      const q = points[(j+1)%points.length];
      if (!(Math.min(p.s,q.s)<mid && mid<Math.max(p.s,q.s))) continue;
      const at = s => p.d+(s-p.s)*(q.d-p.d)/(q.s-p.s);
      crossings.push({mid:at(mid),a:at(a),b:at(b)});
    }
    crossings.sort((p,q)=>p.mid-q.mid);
    if (crossings.length<2 || Math.abs(crossings[0].mid)>EPS || crossings[1].mid<EPS) continue;
    strips.push({from:a,to:b,startDepth:Math.max(0,crossings[1].a),endDepth:Math.max(0,crossings[1].b)});
  }
  return strips;
}

export function newelFaceSetups(post) {
  return faceAxes.map(([id,label,nx,ny])=>{
    const normal={x:nx,y:ny,z:0}, yAxis={x:ny,y:-nx,z:0};
    const origin={
      x: nx>0 || yAxis.x<0 ? post.xMax : post.xMin,
      y: ny>0 || yAxis.y<0 ? post.yMax : post.yMin, z:post.lowerZ
    };
    const dx=post.xMax-post.xMin,dy=post.yMax-post.yMin;
    const pockets=[];
    for (const p of post.pockets) {
      const points=p.points.map(v=>({
        s:(v.x-origin.x)*yAxis.x+(v.y-origin.y)*yAxis.y,
        d:-(v.x-origin.x)*nx-(v.y-origin.y)*ny
      }));
      const strips=visibleStrips(points);
      if (strips.length) pockets.push({
        id:p.id,treadId:p.treadId,depth:p.depth,lower:p.lowerZ-post.lowerZ,upper:p.upperZ-post.lowerZ,strips
      });
    }
    return {id,label,postId:post.id,normal,yAxis,origin,length:post.upperZ-post.lowerZ,
      width:nx?dy:dx,thickness:nx?dx:dy,pockets};
  });
}

// Intersect all strips with a plane at constant cutting depth. Insetting
// the union by the cutter radius keeps its full cylinder inside the pocket
// at every shallower level. A side open to air permits lateral overtravel.
function cutterLanes(strips, depth, radius, width) {
  const spans=[];
  for (const {from,to,startDepth:a,endDepth:b} of strips) {
    if (Math.max(a,b)+EPS<depth) continue;
    let left=from,right=to;
    if (Math.min(a,b)+EPS<depth) {
      const at=from+(to-from)*(depth-a)/(b-a);
      if (a<b) left=at;
      else right=at;
    }
    if (right-left<EPS) continue;
    if (spans.length && left<=spans.at(-1).to+EPS) spans.at(-1).to=right;
    else spans.push({from:left,to:right});
  }
  return spans.map(({from,to})=>({
    from: from<EPS ? -radius : from+radius,
    to: to>width-EPS ? width+radius : to-radius
  })).filter(lane=>lane.from<=lane.to+EPS);
}

export function compileNewelFaceJob(face, parameters=defaultCam, metadata={}) {
  const cam={};
  for (const key of Object.keys(defaultCam)) cam[key]=validateCamField(key,parameters[key]??defaultCam[key]);
  if (![face.length,face.width,face.thickness].every(v=>Number.isFinite(v)&&v>0)) throw new Error('De spil mist geldige ruwmaten.');
  if (cam.plungeFeed>cam.cutFeed || cam.stepDown>cam.fluteLength) throw new Error('Controleer insteekvoeding en diepte per gang.');
  const radius=cam.toolDiameter/2,operations=[],skipped=[];
  for (const p of face.pockets) {
    const deepest=Math.max(...p.strips.flatMap(strip=>[strip.startDepth,strip.endDepth]));
    if (![p.lower,p.upper,deepest].every(Number.isFinite) || p.lower<-EPS || p.upper>face.length+EPS ||
        p.upper<=p.lower || deepest>face.thickness+EPS || deepest<=0) throw new Error('Spilhuis '+p.id+' valt buiten het hout.');
    // An L-shaped notch can expose the full length of its other leg when
    // viewed edge-on. Machine that leg from its own face with a second setup.
    const workingDepth=Math.min(deepest,p.depth);
    if (!Number.isFinite(workingDepth) || workingDepth<=0) throw new Error('Ongeldige insteekdiepte voor '+p.id+'.');
    if (workingDepth>cam.fluteLength+EPS) throw new Error('De snijlengte is te kort voor spilhuis '+p.id+'.');
    const firstX=p.lower+radius,lastX=p.upper-radius;
    if (firstX>lastX+EPS) { skipped.push(p.id); continue; }
    const tapered=p.strips.some(s=>Math.abs(s.startDepth-s.endDepth)>EPS);
    // Respect shallow ledges at their exact depth and leave at most 0.5 mm
    // between depth planes on an inclined back wall, before hand finishing.
    const stops=[...new Set(p.strips.flatMap(s=>[s.startDepth,s.endDepth]).map(d=>Math.min(d,workingDepth)).filter(d=>d>EPS))].sort((a,b)=>a-b);
    const step=tapered?Math.min(cam.stepDown,.5):cam.stepDown;
    const levels=[];
    let previous=0;
    for (const stop of stops) {
      const n=Math.ceil((stop-previous)/step);
      for (let i=1;i<=n;i++) {
        const depth=previous+(stop-previous)*i/n;
        const lanes=cutterLanes(p.strips,depth,radius,face.width);
        if (lanes.length) levels.push({depth,lanes});
      }
      previous=stop;
    }
    if (!levels.length) { skipped.push(p.id); continue; }
    const intervals=Math.ceil(Math.max(0,lastX-firstX)/(cam.toolDiameter*cam.stepoverPercent/100));
    const xRows=Array.from({length:intervals+1},(_,i)=>intervals?firstX+(lastX-firstX)*i/intervals:firstX);
    operations.push({id:p.id,treadId:p.treadId,lower:p.lower,upper:p.upper,levels,xRows,tapered});
  }
  if (!operations.length) throw new Error(face.pockets.length?'De frees past niet in de open huiscontour op dit vlak.':'Dit spilvlak heeft geen open tredehuizen.');
  const fileStem=[cncIdentifier(metadata.number,32,true),metadata.revision&&'rev-'+cncIdentifier(metadata.revision,16,true),
    cncIdentifier(metadata.stairMark,32,true),cncIdentifier(face.postId,48,true),face.id,'spilhuizen'].filter(Boolean).join('_');
  return {cam,face,operations,skipped,fileStem};
}

export function writeNewelLinuxCnc(job) {
  const {cam,face}=job;
  const lines=['(Open Stair Studio - LinuxCNC - rough newel pockets)',
    '(File '+job.fileStem+')',
    '(Mount '+cncIdentifier(face.postId)+' with '+face.id+' face up. G54: X0 at foot, X+ to head. Z0 on face.)',
    '(Y0 at world XY '+f(face.origin.x)+' '+f(face.origin.y)+'; Y+ direction '+f(face.yAxis.x)+' '+f(face.yAxis.y)+'.)',
    '(Centre-cut end mill D'+f(cam.toolDiameter)+'. Clamp clear: allow one tool diameter beyond both face sides.)',
    '(Machine other open faces too. Square blind corners and finish tapered walls to the dimensioned plan.)',
    'G21 G17 G90 G94 G97 G40 G49 G80 G61 G54','G0 Z'+f(cam.safeZ),'M3 S'+f(cam.spindleSpeed)];
  for (const op of job.operations) {
    lines.push('(Pocket '+cncIdentifier(op.id)+' / '+cncIdentifier(op.treadId)+')');
    for (const {depth,lanes} of op.levels) for (const {from,to} of lanes) {
      lines.push('G0 Z'+f(cam.safeZ),'G0 X'+f(op.xRows[0])+' Y'+f(from),'G1 Z-'+f(depth)+' F'+f(cam.plungeFeed));
      for (const [i,x] of op.xRows.entries()) {
        if (i) lines.push('G1 X'+f(x)+' F'+f(cam.cutFeed));
        lines.push('G1 Y'+f(i%2?from:to)+' F'+f(cam.cutFeed));
      }
      // Finish the two lateral walls between the ends of adjacent raster rows.
      lines.push('G1 X'+f(op.xRows[0]),'G1 Y'+f(op.xRows.length%2?from:to),'G1 X'+f(op.xRows.at(-1)));
    }
  }
  for (const id of job.skipped) lines.push('(Tool cannot enter pocket '+cncIdentifier(id)+' from this face; finish separately.)');
  lines.push('G0 Z'+f(cam.safeZ),'M5','M2');
  return lines.join('\n')+'\n';
}
