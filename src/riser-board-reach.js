// Check the material on the waste side of shoulders and mitres after *all*
// indexed operations. Another facet or tongue can shield a strip even when
// both its individual toolpath and the receiving groove are valid.
const eps = 0.0001;
const skin = 0.025; // distance from the nominal boundary in mm
const delta = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const clamp = v => Math.max(0,Math.min(1,v));

function distance2(x,y,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy || 1));
  return (x-a.x-t*dx)**2+(y-a.y-t*dy)**2;
}

function nearPlan(x,y,plan) {
  let inside=false;
  for(let i=0;i<plan.length;i++){
    const a=plan[i],b=plan[(i+1)%plan.length];
    if(distance2(x,y,a,b)<skin*skin) return true;
    if((a.y>y)!==(b.y>y) && x<a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y)) inside=!inside;
  }
  return inside;
}

function toolSweep(setup,parameters,boardFrame) {
  const radius=(setup.parameters??parameters).toolDiameter/2+eps;
  const paths=setup.paths.map(({z,points})=>{
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(const p of points){
      xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);
      ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);
    }
    return {z,points,xmin:xmin-radius,xmax:xmax+radius,ymin:ymin-radius,ymax:ymax+radius};
  }).reverse(); // Test finish passes first.
  const shift=delta(boardFrame.origin,setup.frame.origin);
  const fromBoard=axis=>({
    offset:dot(shift,axis),x:dot(boardFrame.xAxis,axis),y:dot(boardFrame.yAxis,axis),z:dot(boardFrame.zAxis,axis)
  });
  const axes=[setup.frame.xAxis,setup.frame.yAxis,setup.frame.zAxis].map(fromBoard);
  return (bx,by,bz)=>{
    const [x,y,z]=axes.map(a=>a.offset+a.x*bx+a.y*by+a.z*bz);
    for(const path of paths){
      if(z<path.z-eps || x<path.xmin || x>path.xmax || y<path.ymin || y>path.ymax) continue;
      for(let i=1;i<path.points.length;i++){
        if(distance2(x,y,path.points[i-1],path.points[i])<=radius*radius) return true;
      }
    }
    return false;
  };
}

export function checkShoulderReach(part,geometry,job) {
  const {blank,prisms}=geometry;
  const [low,,high]=blank.plan;
  const cuts=job.setups.map(setup=>toolSweep(setup,job.parameters,part.riserFrame));
  const levels=[...new Set(prisms.flatMap(p=>[p.z0,p.z1]))].sort((a,b)=>a-b);
  const radius=job.parameters.toolDiameter/2;
  for(let k=1;k<levels.length;k++){
    const lo=levels[k-1],hi=levels[k];
    if(hi-lo<=2*skin) continue;
    const mid=(lo+hi)/2;
    const wood=prisms.filter(p=>p.z0<mid && p.z1>mid);
    // Feature ends and the center of each constant-profile height band.
    const heights=[...new Set([mid,lo+Math.min(2*skin,(hi-lo)/2),hi-Math.min(2*skin,(hi-lo)/2)])];
    function probe(x,y,host) {
      if (x<=low.x+eps || x>=high.x-eps || y<=low.y+eps || y>=high.y-eps ||
          wood.some(p=>nearPlan(x,y,p.plan))) return;
      for(const z of heights) {
        if(!cuts.some(cut=>cut(x,y,z))){
          const location=[x,y,z].map(v=>Number(v.toFixed(2))).join(' / ');
          throw new Error(part.id+' · bij '+host+' blijft hout staan op plankmaat '+location+
            ' mm (dikte / lengte / hoogte). Controleer de freesdiameter en de toegang tot de schouder.');
        }
      }
    }
    // Include the contour of adjoining height bands. A broad tongue can
    // otherwise hide stock just below its root or immediately over its tip.
    for(const prism of prisms){
      const host=prism.feature?.hostId??'het kopvlak';
      const plan=prism.plan;
      for(let i=0;i<plan.length;i++){
        const a=plan[i],b=plan[(i+1)%plan.length];
        const length=Math.hypot(b.x-a.x,b.y-a.y);
        if(length<eps) continue;
        const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
        const stations=new Set([length/2]);
        for(const s of [2*skin,radius/2,radius,2*radius]){
          if(s<length){stations.add(s);stations.add(length-s);}
        }
        for(const s of stations) {
          for(const sign of [-1,1]) probe(a.x+s*dx-sign*2*skin*dy,a.y+s*dy+sign*2*skin*dx,host);
        }
      }
    }
  }
}
