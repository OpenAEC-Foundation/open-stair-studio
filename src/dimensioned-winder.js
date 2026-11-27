import { legacyFrontLip } from './timber-riser.js';

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
  const minX = Math.min(startX-lip, exitFaceX-board);
  const outerX = minX + depth - stock, innerX = outerX - d.clearWidth;
  const nearY = width - stock, farY = length - nearY;
  const entryX = startX + d.entrySteps * going + wel;
  const exitX = exitFaceX + d.exitSteps * going;
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
  const lowX = cornerFace(entryX+board);
  const highX = cornerFace(exitX+wel);
  const taper = Math.min(going,middleRun/2);
  const inner = [{x:-extension,y:nearY}, {x:lowX,y:nearY}];
  const innerStations = stages.slice(0,2);
  if (lowX>innerX) {
    inner.push({x:lowX,y:middleStart}, {x:innerX,y:middleStart+taper});
    innerStations.push(lowerEnd*going,lowerEnd*going+taper);
  }
  if (highX>innerX) {
    if (inner.at(-1).y<middleEnd-taper-1e-7) {
      inner.push({x:innerX,y:middleEnd-taper});
      innerStations.push(upperStart*going-taper);
    }
    inner.push({x:highX,y:middleEnd});
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
  const lower = distributeQuarter(stair.firstQuarterAngles,entryX-lowX,middleStart-nearY,wel+lip,board);
  const upper = distributeQuarter(stair.secondQuarterAngles,middleEnd-farY,highX-exitX,wel,board);
  if (!lower || !upper || innerX-minX<=stock || nearY>=farY || Math.max(lowX,highX)>=outerX-stock)
    return {invalid:true};
  const faces = [];
  function append(x, y, angle) {
    faces.push({at:{x,y}, angle:angle*degrees});
  }
  for (let i=0; i<=d.entrySteps; i++) append(startX+wel+i*going,nearY,0);
  for (const {chain,angle} of lower)
    append(lowX+Math.min(0,chain),nearY+Math.max(0,chain),angle/degrees);
  for (let i=1; i<=d.middleSteps; i++) append(innerX,middleStart+i*going,90);
  for (const {chain,angle} of upper)
    append(highX-Math.max(0,chain),farY+Math.min(0,chain),90+angle/degrees);
  for (let i=1; i<=d.exitSteps; i++) append(exitX-i*going,farY,180);
  const section = s => {
    const index = Math.max(0,Math.min(faces.length-1,Math.round((s+shift)/going)));
    const face = faces[index], forward = {x:Math.cos(face.angle), y:Math.sin(face.angle)};
    return {s, angle:face.angle, forward, at:{x:face.at.x-wel*forward.x, y:face.at.y-wel*forward.y}};
  };
  return {route:{dimensioned:true,minX}, sides:[inner,outer], stations:[innerStations,outerStations], section};
}
