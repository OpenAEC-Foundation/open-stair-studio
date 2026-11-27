import clip from 'polygon-clipping';
import { newelDefaults, newelDimensions } from './two-quarter-settings.js';

const eps = 1e-6;
const ring = points => [points.map(p => [p.x,p.y])];
const rectangle = (x0,y0,x1,y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const area = points => points.reduce((sum,a,i) => {
  const b=points[(i+1)%points.length];
  return sum+a.x*b.y-a.y*b.x;
},0)/2;
function vertices(coords) {
  const points=coords.slice(0,-1).map(([x,y])=>({x,y}));
  return points.filter((b,i)=>{
    const a=points[(i+points.length-1)%points.length], c=points[(i+1)%points.length];
    const before=Math.hypot(b.x-a.x,b.y-a.y), after=Math.hypot(c.x-b.x,c.y-b.y);
    const turn=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    return Math.abs(turn)>eps*(before+after);
  });
}

export function transverseCheeks(stair,corner,innerX) {
  const setting=name=>stair[corner+'Newel'+name]??newelDefaults[corner+'Newel'+name];
  const cx=innerX-stair.stringerThickness/2+setting('OffsetAcross'), half=setting('Depth')/2;
  return {xMin:cx-half,xMax:cx+half};
}

export function placeNewels(stair, innerX, nearY, farY, d, minX) {
  const posts=[];
  for (const corner of ['lower','upper']) {
    const prefix=corner+'Newel';
    if (!stair[prefix+'Enabled']) continue;
    const read=key=>stair[prefix+key] ?? newelDefaults[prefix+key];
    const name=corner==='lower'?'Onderspil':'Bovenspil';
    const fail=message=>({issue:name+' · '+message});
    for (const {suffix,min,max} of newelDimensions) {
      const n=read(suffix);
      if (!Number.isFinite(n) || n<min || n>max) return fail('ongeldige spilmaat of positie.');
    }
    const length=read('Width'), width=read('Depth');
    const cy=corner==='lower'?nearY+read('OffsetAlong'):farY-read('OffsetAlong');
    const {xMin,xMax}=transverseCheeks(stair,corner,innerX),yMin=cy-length/2,yMax=cy+length/2;
    const lowerZ=read('Base'), upperZ=read('Top'), housing=read('Housing'), clearance=read('Clearance');
    if (xMin<minX-eps || xMax>=minX+stair.outerDepth-stair.stringerThickness ||
        yMin<=stair.stringerThickness || yMax>=stair.outerLength-stair.stringerThickness)
      return fail('de doorsnede valt buiten de beschikbare trapbreedte.');
    if (xMax<=innerX-stair.stringerThickness+eps || xMin>=innerX-eps)
      return fail('de spil mist de kop van de binnenwang. Wijzig de dwarspositie of de doorsnede.');
    if (upperZ<=lowerZ || housing>=width || housing*2>=length)
      return fail('controleer hoogte, insteek en resterend hout in de doorsnede.');
    const first=corner==='lower' ? d.entrySteps : d.entrySteps+d.perQuarter+d.middleSteps-1;
    const last=corner==='lower' ? d.entrySteps+d.perQuarter : first+d.upperCount;
    if (lowerZ>(first+1)*d.rise-stair.treadThickness-(housing?clearance/2:0)+eps ||
        upperZ<(last+1)*d.rise+(housing?clearance/2:0)-eps)
      return fail('de hoogte omvat niet alle aansluitende treden.');
    posts.push({id:stair.mark+(corner==='lower'?'-SP-01':'-SP-02'),name,corner,length,width,
      height:upperZ-lowerZ, lowerZ,upperZ,xMin,xMax,yMin,yMax,innerX,housing,clearance,endGoing:read('EndGoing'),
      points:rectangle(xMin,yMin,xMax,yMax),pockets:[],connectedTreadIds:[]});
  }
  if (posts.length===2 && posts[0].yMax>=posts[1].yMin-eps)
    return {issue:'De spilposities overlappen. Vergroot de vrije lengte tussen de spillen.'};
  return {posts};
}

// Clip the post to the same two inclined-in-plan cutting lines as the
// tread. The original polygon ends at the inner stringer; the inserted
// part may reach across that construction line, but only inside the post.
function cutPlane(points, plane, sign) {
  const distance=p=>sign*((p.x-plane.at.x)*plane.forward.x+(p.y-plane.at.y)*plane.forward.y);
  const result=[];
  for (let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length], da=distance(a), db=distance(b);
    if (da>=0) result.push(a);
    if ((da<0)!==(db<0)) {
      const t=da/(da-db);
      result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});
    }
  }
  return result;
}

export function trimAtNewels(contour,posts,front,back,insert) {
  let result=contour;
  for (const post of posts) {
    const {xMin,xMax,yMin,yMax}=post;
    if (result.every(p=>p.y<yMin-eps) || result.every(p=>p.y>yMax+eps) ||
        result.every(p=>p.x>post.railX+eps)) continue;
    const depth=insert ? post.housing : 0;
    let gross=ring(result);
    if (post.railX>xMax+eps) {
      // The end board can move beyond the outside cheek. Its extended
      // reference rail only locates cutting planes; restore the tread
      // between that rail and the real timber before making the notch.
      const strip=rectangle(xMax,yMin,post.railX,yMax);
      const fill=cutPlane(cutPlane(strip,front,1),back,-1);
      if (fill.length>=3 && Math.abs(area(fill))>eps) gross=clip.union(gross,ring(fill));
    }
    let stock=gross;
    if (depth) {
      const overlap=cutPlane(cutPlane(post.points,front,1),back,-1);
      if (overlap.length>=3 && Math.abs(area(overlap))>eps) {
        // At the return cheek only the tread width up to the middle
        // stringer is present. Extending the tongue across the entire
        // rear of the post would leave an unsupported hook in the blank.
        const outerEnd=post.corner==='lower'?yMin:yMax-depth;
        const innerEnd=post.corner==='lower'?yMax-depth:yMin;
        const strips=[rectangle(xMax-depth,yMin,xMax,yMax),
          rectangle(xMin,outerEnd,xMax,outerEnd+depth)];
        if (post.innerX<xMax) strips.push(rectangle(Math.max(xMin,post.innerX),innerEnd,xMax,innerEnd+depth));
        const allowed=clip.union(...strips.map(ring));
        stock=clip.union(gross,clip.intersection(allowed,ring(overlap)));
      }
    }
    const core=rectangle(xMin,yMin+depth,xMax-depth,yMax-depth);
    const pieces=clip.difference(stock,ring(core));
    // A strip beyond an outside cheek can be cut loose. It has no
    // connection to the stair; retain the sawn tread containing the run.
    if (pieces.length) result=pieces.map(p=>vertices(p[0])).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)))[0];
  }
  return result;
}

function touches(points,post) {
  return points.some((a,i)=>{
    const b=points[(i+1)%points.length];
    return [['x','y','xMin','yMin','yMax'],['x','y','xMax','yMin','yMax'],
      ['y','x','yMin','xMin','xMax'],['y','x','yMax','xMin','xMax']].some(([axis,other,face,low,high])=>
      Math.abs(a[axis]-post[face])<eps && Math.abs(b[axis]-post[face])<eps &&
      Math.min(post[high],Math.max(a[other],b[other]))-Math.max(post[low],Math.min(a[other],b[other]))>eps);
  });
}

function postFaces(post) {
  const horizontal=(points,z,up)=> (up ? points : points.toReversed()).map(p=>({...p,z}));
  const faces=[horizontal(post.points,post.lowerZ,false),horizontal(post.points,post.upperZ,true)];
  const walls=(loops,bottom,top)=>{
    if (top<=bottom+eps) return;
    for (const loop of loops) for (let i=0;i<loop.length;i++) {
      const a=loop[i], b=loop[(i+1)%loop.length];
      faces.push([{...a,z:bottom},{...b,z:bottom},{...b,z:top},{...a,z:top}]);
    }
  };
  let z=post.lowerZ;
  for (const pocket of post.pockets) {
    walls([post.points],z,pocket.lowerZ);
    const remaining=clip.difference(ring(post.points),ring(pocket.points));
    if (remaining.length>1) {
      const lands=remaining.map(poly=>poly.reduce((s,r)=>s+area(vertices(r)),0)).sort((a,b)=>a-b);
      pocket.cornerLandsMm2=lands.slice(0,-1);
    }
    walls(remaining.flatMap(p=>p.map(vertices)),pocket.lowerZ,pocket.upperZ);
    faces.push(horizontal(pocket.points,pocket.lowerZ,true),horizontal(pocket.points,pocket.upperZ,false));
    z=pocket.upperZ;
  }
  walls([post.points],z,post.upperZ);
  return faces;
}

export function finishNewels(posts,treads,reflect) {
  return posts.map(source=>{
    const pts=source.points.map(reflect), points=area(pts)>0 ? pts : pts.toReversed();
    const ys=points.map(p=>p.y);
    const post={...source,points,yMin:Math.min(...ys),yMax:Math.max(...ys),connectedTreadIds:[],pockets:[]};
    let removed=0;
    for (const tread of treads) {
      const cuts=post.housing ? clip.intersection(ring(post.points),ring(tread.points)) : [];
      if (!cuts.length && !touches(tread.points,post)) continue;
      post.connectedTreadIds.push(tread.id);
      (tread.newelConnections??=[]).push({newelId:post.id,depth:post.housing});
      for (const [index,polygon] of cuts.entries()) {
        const profile=vertices(polygon[0]);
        const lowerZ=tread.elevation-tread.thickness-post.clearance/2, upperZ=tread.elevation+post.clearance/2;
        post.pockets.push({id:post.id+'-H-'+tread.step+(index?'-'+(index+1):''),treadId:tread.id,
          points:profile,lowerZ,upperZ,depth:post.housing});
        removed+=Math.abs(area(profile))*(upperZ-lowerZ);
      }
    }
    post.blankVolume=post.length*post.width*post.height/1e9;
    post.volume=post.blankVolume-removed/1e9;
    post.meshFaces=postFaces(post);
    post.svgPoints=post.points.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ');
    return post;
  });
}
