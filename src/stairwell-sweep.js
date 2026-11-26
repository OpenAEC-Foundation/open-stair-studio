import { boundsOf } from './components/solids.js';

const tolerance = .01;

function placeZone({instance, sweepZone}, well) {
  if (!sweepZone) return null;
  const angle = instance.rotation * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  let datum = 0;
  for (let level = 0; level < instance.storey; level++)
    datum += well.heights?.[level] ?? well.storeyHeight;
  const polygon = sweepZone.polygon.map(({x,y}) => ({
    x:instance.x+c*x-s*y, y:instance.y+s*x+c*y
  }));
  return {polygon,zmin:sweepZone.zmin+datum,zmax:sweepZone.zmax+datum};
}

function rectangle(bounds) {
  return [{x:bounds.xmin,y:bounds.ymin},{x:bounds.xmax,y:bounds.ymin},
    {x:bounds.xmax,y:bounds.ymax},{x:bounds.xmin,y:bounds.ymax}];
}

function range(polygon, x, y) {
  const projection = polygon.map(p => p.x*x+p.y*y);
  return [Math.min(...projection),Math.max(...projection)];
}

// Separating-axis test on the true oriented footprint, with Z checked
// independently. A mere shared edge or face is within the drawing tolerance.
function overlap(zone, other) {
  if (!other || zone.zmax <= other.zmin+tolerance || other.zmax <= zone.zmin+tolerance) return false;
  const a = zone.polygon, b = other.polygon ?? rectangle(other);
  for (const poly of [a,b]) {
    for (let i=0;i<poly.length;i++) {
      const from=poly[i], to=poly[(i+1)%poly.length];
      const dx=to.x-from.x, dy=to.y-from.y, length=Math.hypot(dx,dy);
      if (length === 0) continue;
      const [amin,amax]=range(a,-dy/length,dx/length);
      const [bmin,bmax]=range(b,-dy/length,dx/length);
      if (amax <= bmin+tolerance || bmax <= amin+tolerance) return false;
    }
  }
  return true;
}

function partHit(moving, zone, target, targetZone) {
  if (!zone || !overlap(zone,target.bounds)) return null;
  for (let i=0;i<target.parts.length;i++) {
    const part=target.parts[i];
    // Two folding ladders reserve their whole movements separately. Here
    // test the fixed casing/anchors of the other one in every displayed pose.
    if (targetZone && part.moves) continue;
    if (overlap(zone,target.partBounds?.[i] ?? boundsOf([part])))
      return `De bedieningsomhullende van ${moving.instance.mark} overlapt mogelijk met ${target.instance.mark} (${part.label}). Controleer de vrije ruimte tijdens openen en ontvouwen.`;
  }
  return null;
}

export function motionWarnings(assemblies, well) {
  const zones=assemblies.map(a=>placeZone(a,well));
  for (let i=0;i<assemblies.length;i++) for (let j=i+1;j<assemblies.length;j++) {
    const a=assemblies[i], b=assemblies[j], za=zones[i], zb=zones[j];
    if (!za && !zb) continue;
    let text=partHit(a,za,b,zb) ?? partHit(b,zb,a,za);
    if (!text && za && zb && overlap(za,zb))
      text=`De bedieningsomhullenden van ${a.instance.mark} en ${b.instance.mark} overlappen mogelijk. Controleer de vrije ruimte bij gelijktijdige bediening.`;
    if (text) {
      a.issues.push({level:'warning',text});
      b.issues.push({level:'warning',text});
    }
  }
}
