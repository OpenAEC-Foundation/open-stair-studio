// Local piece coordinates and centre-line dimensions are in millimetres.
const group='Bijlegwapening';
const dimension=(key,label,value,min,max)=>({key,label,default:value,min,max,type:'number',step:1,unit:'mm',group});
export const localBarFields=[
  {key:'localReinforcement',label:'Bijlegwapening uitwerken',type:'select',default:'none',group,
    options:[['none','Nog niet uitgewerkt'],['detailed','Opleggingen, hijshulzen en zijankers']]},
  dimension('localDiameter','Staafdiameter bijlegwapening',8,6,25),
  dimension('localMandrel','Inwendige buigdiameter',40,20,220),
  dimension('localTail','Rechte staart voorbij de buiging',120,45,600),
  dimension('localClearance','Vrije ruimte tot overige staalstukken',2,0,40),
  {key:'seatBarCount',label:'Haarspelden per oplegstrip',type:'number',default:2,min:1,max:12,step:1,unit:'st.',group}
];
const pt=(x,y,z)=>({x,y,z}), plus=(a,b)=>pt(a.x+b.x,a.y+b.y,a.z+b.z), minus=(a,b)=>pt(a.x-b.x,a.y-b.y,a.z-b.z);
const times=(v,t)=>pt(v.x*t,v.y*t,v.z*t), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>pt(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const length=v=>Math.hypot(v.x,v.y,v.z),unit=v=>times(v,1/length(v)), at=(p,v,t)=>plus(p,times(v,t));
const X=pt(1,0,0),Y=pt(0,1,0),Z=pt(0,0,1);
const clamp=t=>Math.max(0,Math.min(1,t)), two=n=>String(n).padStart(2,'0');
function line(a,b){return {type:'line',start:a,end:b,lengthMm:length(minus(b,a))};}
function arc(a,b,center,normal,angle,radius){
  return {type:'arc',start:a,end:b,center,normal,angleDeg:angle*180/Math.PI,radiusMm:radius,lengthMm:radius*angle};
}
const reverse=s=>({...s,start:s.end,end:s.start,...(s.normal?{normal:times(s.normal,-1)}:{})});

// Two tangent legs and an exact semicircular return. The optional bend turns
// each leg into the full-depth section behind a flight's bearing shoulder.
function hairpin(center,u,v,radius,straight,tail,turnTo) {
  function leg(start) {
    if(!turnTo) return [line(start,at(start,u,straight))];
    const b=at(start,u,straight), n=unit(cross(u,turnTo)), angle=Math.acos(Math.min(1,dot(u,turnTo)));
    const o=at(b,cross(n,u),radius), end=at(o,cross(n,turnTo),-radius);
    return [line(start,b),arc(b,end,o,n,angle,radius),line(end,at(end,turnTo,tail))];
  }
  const a=at(center,v,radius),b=at(center,v,-radius);
  return [...leg(a).reverse().map(reverse),arc(a,b,center,cross(u,v),Math.PI,radius),...leg(b)];
}
function pathOf(segments){
  const path=[segments[0].start];
  for(const s of segments) {
    if(s.type==='arc'){
      const a=minus(s.start,s.center),b=cross(s.normal,a),steps=Math.ceil(s.angleDeg/12);
      for(let j=1;j<steps;j++) {
        const t=s.angleDeg*Math.PI/180*j/steps;
        path.push(plus(at(s.center,a,Math.cos(t)),times(b,Math.sin(t))));
      }
    }
    path.push(s.end);
  }
  return path;
}
function sweptBar(path,r,place) {
  let normal;
  const rings=path.map((p,i)=>{
    const a=i?unit(minus(p,path[i-1])):null,b=i+1<path.length?unit(minus(path[i+1],p)):null;
    const tangent=a&&b?unit(plus(a,b)):a??b;
    if(!normal) normal=unit(cross(tangent,Math.abs(tangent.z)<.8?Z:X));
    else normal=unit(at(normal,tangent,-dot(normal,tangent)));
    const side=cross(tangent,normal);
    return Array.from({length:10},(_,j)=>{
      const t=j*Math.PI/5;
      return place(plus(at(p,normal,r*Math.cos(t)),times(side,r*Math.sin(t))));
    });
  });
  const faces=[[...rings[0]].reverse(),rings.at(-1)];
  for(let i=1;i<rings.length;i++) for(let j=0;j<10;j++){
    const k=(j+1)%10,a=rings[i-1],b=rings[i];
    // Non-coplanar quad vertices around a compound bend are explicitly triangulated.
    faces.push([a[j],a[k],b[k]],[a[j],b[k],b[j]]);
  }
  return faces;
}
function bounds(a,b,r=0){return [Math.min(a.x,b.x)-r,Math.max(a.x,b.x)+r,Math.min(a.y,b.y)-r,Math.max(a.y,b.y)+r,Math.min(a.z,b.z)-r,Math.max(a.z,b.z)+r];}
const touching=(a,b)=>a[0]<=b[1]&&b[0]<=a[1]&&a[2]<=b[3]&&b[2]<=a[3]&&a[4]<=b[5]&&b[4]<=a[5];
const inside=(edges,x,z)=>edges.reduce((inside,{a,b})=>
  (a.z>z)!==(b.z>z)&&x<a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z)?!inside:inside,false);
function fromSegment(p,a,b) {
  const d=minus(b,a),den=dot(d,d);
  return length(minus(p,at(a,d,den?clamp(dot(minus(p,a),d)/den):0)));
}
function segmentDistance(a,b,c,d){
  const u=minus(b,a),v=minus(d,c),w=minus(a,c);
  const aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),den=aa*cc-bb*bb;
  if(den>1e-10){
    const s=(bb*ee-cc*dd)/den,t=(aa*ee-bb*dd)/den;
    if(s>=0&&s<=1&&t>=0&&t<=1) return length(minus(at(a,u,s),at(c,v,t)));
  }
  return Math.min(fromSegment(a,c,d),fromSegment(b,c,d),fromSegment(c,a,b),fromSegment(d,a,b));
}
function occupied(a,b,r){return {a,b,r,box:bounds(a,b,r)};}
function fitting(p,host,parts) {
  const {width,profile}=host, flat=q=>pt(q.x,0,q.z);
  const edges=profile.map(([x,z],i)=>{
    const [xx,zz]=profile[(i+1)%profile.length],a=pt(x,0,z),b=pt(xx,0,zz);
    return {a,b,box:bounds(a,b)};
  });
  const occupiedSteel=[];
  for(const q of parts.filter(q=>q.parentId===host.cast.id)) {
    const radius=q.diameterMm/2;
    if(q.kind==='rebar') occupiedSteel.push(occupied(q.start,q.end,radius));
    if(q.role==='liftAnchor') {
      const h=Math.min(10,q.lengthMm*.12),mid=at(q.end,Z,h);
      occupiedSteel.push(occupied(q.start,mid,radius),occupied(mid,q.end,1.7*radius));
    }
    if(q.role==='anchorBolt') {
      const mid=at(q.end,unit(minus(q.start,q.end)),radius);
      occupiedSteel.push(occupied(q.start,mid,radius),occupied(mid,q.end,1.6*radius));
    }
  }
  const save=(path,r)=>{for(let i=1;i<path.length;i++) occupiedSteel.push(occupied(path[i-1],path[i],r));};
  function fits(path,r,sagitta) {
    // Every circular arc lies within sagitta of its polyline. Inflate the
    // exact centre-line clearance so both the round bend and its mesh fit.
    const clearance=p.cover+r+sagitta,gap=r+sagitta+p.localClearance;
    if(path.some(q=>q.y<clearance||q.y>width-clearance)) return false;
    if(!inside(edges,path[0].x,path[0].z)) return false;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],aa=flat(a),bb=flat(b),box=bounds(aa,bb,clearance),space=bounds(a,b,gap);
      for(const e of edges) if(touching(box,e.box)&&segmentDistance(aa,bb,e.a,e.b)<clearance-1e-7) return false;
      for(const q of occupiedSteel) if(touching(space,q.box)&&segmentDistance(a,b,q.a,q.b)<gap+q.r-1e-7) return false;
    }
    return true;
  }
  return {fits,save};
}
const offsets=(step,n)=>[0,...Array.from({length:n},(_,i)=>[i+1,-i-1]).flat()].map(i=>i*step);
function* atBearing(p,h,zone,i,r) {
  const {width,count,rise,seat}=h,flight=h.cast.kind==='flight',high=zone.end==='head';
  const sense=high?-1:1,u=times(X,sense),tip=flight?(high?seat+p.tongue:-p.tongue):p.joint;
  const edge=flight?(high?seat:0):p.joint+p.tongue;
  const minCover=p.cover+p.localDiameter/2+1;
  const x=tip+sense*(minCover+r),zFace=flight?(high?count*rise:0):-p.nib-p.pad;
  const thick=flight?p.nib:p.landingThickness-p.nib-p.pad;
  const span=zone.y1-zone.y0,goal=zone.y0+span*(i+.5)/p.seatBarCount;
  const cell0=zone.y0+i*span/p.seatBarCount,cell1=cell0+span/p.seatBarCount;
  for(const dy of offsets(8,12)) {
    const y=goal+dy;
    if(y-r<cell0||y+r>cell1||y<minCover+r||y>width-minCover-r) continue;
    for(const shift of offsets(4,10)) {
      const depth=thick/2+shift;
      if(depth<minCover||depth>thick-minCover) continue;
      const center=pt(x,y,zFace-depth);
      if(!flight){
        const straight=edge-x+p.localTail;
        yield {segments:hairpin(center,u,Y,r,straight),anchorage:p.localTail};
      } else if(high) {
        for(const inset of [p.headShoulder/2-minCover-r,-22,-18,-26,-14,-10,-6,0,8,16,24]) {
          const straight=x-edge+minCover+inset;
          yield {segments:hairpin(center,u,Y,r,straight,p.localTail,times(Z,-1)),anchorage:p.localTail};
        }
      } else {
        // Follow the underside after the bar has crossed the shoulder plane.
        const direction=unit(pt(1,0,rise/p.going));
        for(const inset of [16,36,56,76,96]){
          yield {segments:hairpin(center,u,Y,r,edge-x+inset,p.localTail,direction),anchorage:p.localTail};
        }
      }
    }
  }
}
function* atSocket(p,q,r) {
  // Horizontal splitting/confinement loop near the insert. Clearance to
  // socket and anchor foot is checked against their own local diameters.
  for(const depthOffset of offsets(5,8)) {
    const depth=p.cover+p.localDiameter/2+12+depthOffset;
    if(depth<p.cover+p.localDiameter/2+1||depth>q.lengthMm-8) continue;
    const center=at(q.start,Z,-depth);
    for(const deg of [90,-90,0,180,45,135,-45,-135]) {
      const a=deg*Math.PI/180,u=pt(Math.cos(a),Math.sin(a),0),v=cross(Z,u);
      yield {segments:hairpin(center,u,v,r,p.localTail),anchorage:p.localTail};
    }
  }
}
function* atBolt(p,q,r) {
  const u=unit(minus(q.end,q.start)), clear=q.diameterMm*.8+p.localDiameter/2+p.localClearance+1;
  // The loop straddles the bolt head, with straight legs extending into the
  // concrete beyond the transverse plane through its embedded end.
  for(const deg of [0,180,90,270,45,-45,135,-135]){
    const a=deg*Math.PI/180,normal=pt(Math.sin(a),0,Math.cos(a)),v=cross(normal,u);
    for(const lift of [0,4,8,12]){
      const center=at(q.end,normal,clear+lift);
      yield {segments:hairpin(center,u,v,r,p.localTail),anchorage:p.localTail};
    }
  }
}
function bearingTargets(p,host) {
  const id=host.cast.id,width=p.width;
  if(host.cast.kind==='flight') return [['onderstrip','voet'],['bovenstrip','kop']].map(([strip,end],i)=>({
    targetId:id+'-'+strip,end:i?'head':'base',y0:0,y1:width,label:'Oplegnok '+end}));
  if(id==='tussenbordes') return [
    {targetId:'vlucht-1-bovenstrip',y0:0,y1:width,label:'Bordessponning vlucht 1'},
    {targetId:'vlucht-2-onderstrip',y0:width+p.well,y1:2*width+p.well,label:'Bordessponning vlucht 2'}];
  return [{targetId:id==='onderbordes'?'vlucht-1-onderstrip':'vlucht-'+(p.layout==='return'?2:1)+'-bovenstrip',y0:0,y1:width,label:'Bordessponning'}];
}

export function addLocalBars(p,host,parts) {
  const data=host.cast.detail;
  data.localZones=[];
  const tool=fitting(p,host,parts),r=(p.localMandrel+p.localDiameter)/2,rod=p.localDiameter/2;
  const sagitta=r*(1-Math.cos(6*Math.PI/180));
  function zone(kind,target,label,prefix,count,create) {
    const zone={kind,targetId:target,label,requestedCount:count,barIds:[],providedAreaMm2:0,anchorageMm:0,issue:''};
    data.localZones.push(zone);
    for(let i=0;i<count;i++){
      let placed=false;
      for(const candidate of create(i)) {
        const {segments,anchorage}=candidate,path=pathOf(segments);
        if(!tool.fits(path,rod,sagitta)) continue;
        const position=kind==='bearing'?prefix+'-'+two(i+1):prefix;
        const role={bearing:'bearingBar',lifting:'liftingBar',anchorage:'anchorageBar'}[kind];
        const part={id:host.cast.id+'-'+position,position,parentId:host.cast.id,targetId:target,
          kind:'rebar',material:'rebar',role,label:label+' · haarspeld',layer:'local',
          shapeCode:segments.length>3?'U met twee omgezette benen':'U met rechte benen',
          path,bendSchedule:segments,start:path[0],end:path.at(-1),lengthMm:segments.reduce((s,v)=>s+v.lengthMm,0),
          diameterMm:p.localDiameter,mandrelMm:p.localMandrel,bendRadiusMm:r,activeLegs:2,anchorageMm:anchorage,
          faces:sweptBar(path,rod,host.place)};
        parts.push(part);zone.barIds.push(part.id);zone.providedAreaMm2+=2*Math.PI*rod*rod;
        zone.anchorageMm=zone.barIds.length===1?anchorage:Math.min(zone.anchorageMm,anchorage);
        tool.save(path,rod+sagitta);placed=true;break;
      }
      if(!placed) zone.issue='Bijlegstaaf '+(i+1)+' past niet bij '+label.toLowerCase()+' met de gekozen mal, dekking, buigvorm en vrije staalafstand.';
    }
    if(zone.issue) data.geometryIssues.push(zone.issue);
  }
  bearingTargets(p,host).forEach((b,i)=>zone('bearing',b.targetId,b.label,'BN'+(i+1),p.seatBarCount,j=>atBearing(p,host,b,j,r)));
  const inserts=parts.filter(q=>q.parentId===host.cast.id);
  for(const q of inserts) {
    if(q.role==='liftAnchor') zone('lifting',q.id,'Bijlegwapening hijshuls '+q.position,'LH-'+q.position.slice(2),1,()=>atSocket(p,q,r));
    if(q.role==='anchorBolt') zone('anchorage',q.id,'Bijlegwapening kopbout '+q.position,'BA-'+q.position.slice(2),1,()=>atBolt(p,q,r));
  }
}
