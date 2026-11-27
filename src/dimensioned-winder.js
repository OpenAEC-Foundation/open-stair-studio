import { legacyFrontLip } from './timber-riser.js';
import { placeNewels, transverseCheeks } from './quarter-newels.js';

// Lay out the U in plan with X along the entrance flight and Y along the
// straight middle run. Dimensions are measured outside the finished timber.
export function usesOuterDimensions(stair) {
  return stair.type === 'two_quarter_winder' && stair.twoQuarterLayout === 'dimensioned';
}

const degrees = Math.PI / 180;

// Distances on the inner rail are negative on the approach and positive on
// departure, measured from the corner. A board is a parallel strip in plan.
// Equal residual spacing accounts for its much longer cut on an oblique side.
function distributeQuarter(increments, before, after, wel, board) {
  let sum = 0;
  const angles = increments.map((value, i) => {
    sum += value;
    return i===increments.length-1 ? Math.PI/2 : sum*degrees;
  });
  if (before+board > 0 || after-wel < 0) return null;
  const distribute = gap => {
    let nose = before-wel, back = before+board;
    return angles.map((angle,i) => {
      const cos = i===angles.length-1 ? 0 : Math.cos(angle), sin = Math.sin(angle);
      const project = chain => chain*(chain<0 ? cos : sin);
      const chainage = value => value/(value<0 ? cos : sin);
      const plane = Math.max(project(nose+gap)+wel,project(back+gap));
      nose=chainage(plane-wel);
      back=chainage(plane+board);
      return {chain:chainage(plane), angle};
    });
  };
  if (distribute(0).at(-1).chain>after+1e-8) return null;
  let low=0, high=after-before;
  for (let i=0; i<45; i++) {
    const gap=(low+high)/2;
    if (distribute(gap).at(-1).chain>after) high=gap;
    else low=gap;
  }
  const result = distribute((low+high)/2);
  result.at(-1).chain = after;
  return result;
}

// Unwrap the two outside cheeks of the rectangular newel into a straight
// measuring line. Control the narrow going at its end, then divide the
// remaining cheek length among the other riser planes.
function postQuarter(increments,post,endX,middleY,lower,wel,board) {
  const count=increments.length;
  const y=lower ? post.yMin : post.yMax;
  let turn=0;
  const angles=(lower ? increments : increments.toReversed()).map((step,i)=>{
    turn+=step*degrees;
    return i===count-1 ? Math.PI/2 : turn;
  });
  const inset=lower ? -wel : -board, outset=lower ? board : wel;
  const p1=(endX+post.endGoing-post.xMax)*Math.cos(angles[0]);
  const middleChain=(middleY-y)*(lower?1:-1);
  const project=(s,a)=>s*(s<0?Math.cos(a):Math.sin(a));
  const along=(v,a)=>v/(v<0?Math.cos(a):Math.sin(a));
  const distribute=gap=>{
    let p=p1, previous=angles[0];
    return angles.map((angle,i)=>{
      if (i) p=Math.max(project(along(p+inset,previous)+gap,angle)-inset,
        project(along(p+outset,previous)+gap,angle)-outset);
      previous=angle;
      return along(p,angle);
    });
  };
  if (distribute(0).at(-1)>middleChain+1e-6) return null;
  let lo=0, hi=Math.max(post.length+post.width,Math.abs(middleChain)*2+wel+board);
  for (let i=0;i<45;i++) {
    const mid=(lo+hi)/2;
    if (distribute(mid).at(-1)>middleChain) hi=mid;
    else lo=mid;
  }
  const chains=distribute((lo+hi)/2);
  chains[count-1]=middleChain;
  const cuts=angles.map((angle,i)=>{
    const chain=chains[i];
    return {x:post.xMax+Math.min(0,chain),
      y:y+(lower?1:-1)*Math.max(0,chain), angle:lower?angle:Math.PI-angle};
  });
  return lower ? cuts : [...cuts.slice(0,-1).reverse(),{x:endX,y,angle:Math.PI}];
}

export function dimensionedRoute(stair, d) {
  const {outerLength:length, outerDepth:depth, stringerThickness:stock, width, going} = stair;
  const shift = stair.nosing;
  const wel = stair.wel ?? 0;
  const lip = legacyFrontLip(stair);
  const board = stair.riserBoards === 'closed' ? stair.riserThickness : 0;
  const lowerCount = stair.firstQuarterAngles.length, upperCount = stair.secondQuarterAngles.length;
  const middleRun = d.middleSteps * going;
  const middleStart = (length - middleRun) / 2 + (stair.middleOffset ?? 0) - shift;
  const middleEnd = middleStart + middleRun;
  const startX = -shift;
  const exitFaceX = board + shift;
  const nominalInner=depth-stock-d.clearWidth;
  const firstNose=stair.lowerNewelEnabled && !d.entrySteps
    ? transverseCheeks(stair,'lower',nominalInner).xMax-board-shift-wel-lip : startX-lip;
  const finalBack=stair.upperNewelEnabled && !d.exitSteps
    ? transverseCheeks(stair,'upper',nominalInner).xMin+shift : exitFaceX-board;
  const minX = Math.min(0,firstNose,finalBack);
  const outerX = minX + depth - stock, innerX = outerX - d.clearWidth;
  const nearCorner = width - stock, farCorner = length - nearCorner;
  const placement=placeNewels(stair,innerX,nearCorner,farCorner,d,minX);
  if (placement.issue) return placement;
  const posts=placement.posts;
  const lowPost=posts.find(p=>p.corner==='lower'), highPost=posts.find(p=>p.corner==='upper');
  const nearY=lowPost?.yMin ?? nearCorner, farY=highPost?.yMax ?? farCorner;
  const entryX = lowPost && !d.entrySteps ? lowPost.xMax-board-shift-minX : startX+d.entrySteps*going+wel;
  const exitX = highPost && !d.exitSteps ? highPost.xMin+board+shift-minX : exitFaceX+d.exitSteps*going;
  const lowerEnd = d.entrySteps + lowerCount, upperStart = lowerEnd + d.middleSteps;
  const extension = Math.max(length, depth) + width;
  const stages = [-extension, (d.entrySteps + lowerCount / 2) * going,
    (upperStart + upperCount / 2) * going, d.totalRun + extension];
  // The face of a compact corner may project past the straight middle
  // stringer (as at a newel cheek). Provide the width of the actual end cut,
  // then taper back to the nominal clear flight. The two corners are solved
  // independently so a moved nose at one end needn't move the opposite end.
  function cornerFace(endCut) {
    const overshoot = Math.max(0,endCut-innerX);
    return innerX + overshoot + Math.min(2*overshoot, stock/2);
  }
  const lowX = lowPost ? Math.max(innerX,lowPost.xMax,entryX+board) : cornerFace(entryX+board);
  const highX = highPost ? Math.max(innerX,highPost.xMax,exitX+wel) : cornerFace(exitX+wel);
  if (lowPost) lowPost.railX=lowX;
  if (highPost) highPost.railX=highX;
  const taper = Math.min(going,middleRun/2);
  const inner = [{x:-extension,y:nearY}, {x:lowX,y:nearY}];
  const innerStations = stages.slice(0,2);
  if (lowX>innerX) {
    if (lowPost) inner.push({x:lowX,y:nearY+lowPost.length/4},{x:innerX,y:lowPost.yMax-lowPost.length/4});
    else inner.push({x:lowX,y:middleStart}, {x:innerX,y:middleStart+taper});
    innerStations.push(lowerEnd*going,lowerEnd*going+taper);
  }
  if (highX>innerX) {
    const entry=highPost ? highPost.yMin+highPost.length/4 : middleEnd-taper;
    if (inner.at(-1).y<entry-1e-7) {
      inner.push({x:innerX,y:entry});
      innerStations.push(upperStart*going-taper);
    }
    inner.push({x:highX,y:highPost ? farY-highPost.length/4 : middleEnd});
    innerStations.push(upperStart*going);
  }
  inner.push({x:highX,y:farY},{x:-extension,y:farY});
  innerStations.push(...stages.slice(2));
  const outer = [{x:-extension,y:stock}, {x:outerX,y:stock},
    {x:outerX,y:length-stock}, {x:-extension,y:length-stock}];
  let outerStations = stages;
  if (stair.outerShape === 'faceted') {
    const bevel = d.clearWidth * (1 - Math.SQRT1_2);
    outer.splice(1, 2, {x:outerX-bevel,y:stock}, {x:outerX,y:stock+bevel},
      {x:outerX,y:length-stock-bevel}, {x:outerX-bevel,y:length-stock});
    outerStations = [stages[0], stages[1]-going/2, stages[1]+going/2,
      stages[2]-going/2, stages[2]+going/2, stages[3]];
  }
  const lower = lowPost ? postQuarter(stair.firstQuarterAngles,lowPost,entryX,middleStart,true,wel+lip,board)
    : distributeQuarter(stair.firstQuarterAngles,entryX-lowX,middleStart-nearY,wel+lip,board);
  const upper = highPost ? postQuarter(stair.secondQuarterAngles,highPost,exitX,middleEnd,false,wel,board)
    : distributeQuarter(stair.secondQuarterAngles,middleEnd-farY,highX-exitX,wel,board);
  if (!lower || !upper || innerX-minX<=stock || nearY>=farY || Math.max(lowX,highX)>=outerX-stock)
    return {invalid:true};
  const faces = [];
  function append(x, y, angle) {
    faces.push({at:{x,y}, angle:angle*degrees});
  }
  for (let i=0; i<=d.entrySteps; i++) append(entryX-(d.entrySteps-i)*going,nearY,0);
  for (const {chain,angle,x,y} of lower)
    append(x??(lowX+Math.min(0,chain)),y??(nearY+Math.max(0,chain)),angle/degrees);
  for (let i=1; i<=d.middleSteps; i++) append(innerX,middleStart+i*going,90);
  for (const {chain,angle,x,y} of upper)
    append(x??(highX-Math.max(0,chain)),y??(farY+Math.min(0,chain)),highPost?angle/degrees:90+angle/degrees);
  for (let i=1; i<=d.exitSteps; i++) append(exitX-i*going,farY,180);
  const section = s => {
    const index = Math.max(0,Math.min(faces.length-1,Math.round((s+shift)/going)));
    const face = faces[index], forward = {x:Math.cos(face.angle), y:Math.sin(face.angle)};
    return {s, angle:face.angle, forward, at:{x:face.at.x-wel*forward.x, y:face.at.y-wel*forward.y}};
  };
  return {route:{dimensioned:true,minX,posts,entrySteps:d.entrySteps,exitSteps:d.exitSteps}, sides:[inner,outer], stations:[innerStations,outerStations], section};
}
