// Geometry, machining dimensions and material take-off all use local millimetres.
// The rail datum is the centre of its upper face. Its section remains upright
// through pitched lengths and tangent circular easing pieces.
const point=(x,y,z)=>({x,y,z});
const add=(a,b)=>point(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a,b)=>point(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a,n)=>point(a.x*n,a.y*n,a.z*n);
const at=(a,d,s)=>add(a,mul(d,s));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>point(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const norm=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>mul(a,1/norm(a));
const degrees=a=>a*180/Math.PI;
const zAxis=point(0,0,1);

function railFrame(tangent) {
  const side=unit(cross(zAxis,tangent));
  return {along:tangent,side,up:cross(tangent,side)};
}

function railProfile(style,width,depth) {
  // Right-hand half of the section, starting at the flat bearing underside.
  const right=style==='classic'?
    [[.37,-1],[.41,-.97],[.41,-.90],[.34,-.85],[.32,-.78],[.33,-.70],
     [.39,-.63],[.47,-.53],[.50,-.42],[.49,-.30],[.44,-.18],[.36,-.09],[.23,-.025],[.13,0]]:
    [[.40,-1],[.47,-.96],[.50,-.87],[.50,-.16],[.48,-.08],[.43,-.025],[.36,0]];
  return [...right,...[...right].reverse().map(([x,y])=>[-x,y])]
    .map(([x,y])=>({x:x*width,y:y*depth}));
}

function ringAt(contour,origin,frame) {
  return contour.map(({x,y})=>at(at(origin,frame.side,x),frame.up,y));
}

function loft(rings) {
  const faces=[[...rings[0]].reverse(),rings.at(-1)];
  for(let r=1;r<rings.length;r++) {
    const low=rings[r-1],high=rings[r];
    for(let i=0;i<low.length;i++) {
      const j=(i+1)%low.length;
      const a=low[i],b=low[j],c=high[j],d=high[i];
      const normal=cross(sub(b,a),sub(c,a));
      if(Math.abs(dot(normal,sub(d,a)))<=1e-7*norm(normal)) faces.push([a,b,c,d]);
      else {
        // A central fan makes the ruled patch independent of which side of
        // the stair is mirrored. A fixed diagonal changes its signed volume.
        const centre=mul(add(add(a,b),add(c,d)),.25);
        faces.push([a,b,centre],[b,c,centre],[c,d,centre],[d,a,centre]);
      }
    }
  }
  return faces;
}

function fabrication(faces,origin,axes) {
  let volume=0;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const polygon of faces) {
    const local=polygon.map(v=>sub(v,origin));
    for(const p of local) for(let i=0;i<3;i++) {
      const v=dot(p,axes[i]);
      min[i]=Math.min(min[i],v); max[i]=Math.max(max[i],v);
    }
    for(let i=1;i+1<local.length;i++) volume+=dot(local[0],cross(local[i],local[i+1]))/6;
  }
  const [stockLengthMm,stockWidthMm,stockThicknessMm]=max.map((v,i)=>v-min[i]);
  return {faces,volumeM3:volume/1e9,stockLengthMm,stockWidthMm,stockThicknessMm,
    stockVolumeM3:stockLengthMm*stockWidthMm*stockThicknessMm/1e9};
}

function easing(before,after,width,depth) {
  const cosine=Math.max(-1,Math.min(1,dot(before.t,after.t)));
  const angle=Math.acos(cosine);
  if(angle<1e-5) return null;
  const normal=unit(sub(after.t,mul(before.t,cosine)));
  const desiredRadius=Math.max(90,width*1.5,depth*1.5);
  const trim=Math.min(desiredRadius*Math.tan(angle/2),.43*before.length,.43*after.length);
  const radius=trim/Math.tan(angle/2);
  return {angle,trim,radius,normal};
}

function railLengths(stair,segments,contour,id,sideLabel) {
  const rail=[],straights=[];
  const lines=segments.map(s=>{
    const delta=sub(s.b,s.a),length=norm(delta);
    return {...s,t:mul(delta,1/length),length};
  });
  const top=p=>at(p,zAxis,stair.railHeight);
  const corners=lines.map((line,i)=>i+1<lines.length?easing(line,lines[i+1],stair.handrailWidth,stair.handrailDepth):null);
  function make(samples,lengthMm,railPiece,extra={}) {
    const axisPath=samples.map(s=>s.p);
    const rings=samples.map(s=>ringAt(contour,s.p,railFrame(s.t)));
    const faces=loft(rings), f=railFrame(unit(sub(axisPath.at(-1),axisPath[0])));
    const profileName=stair.timberDetail==='classic'?'Kroonprofiel met holle greep':'Afgerond blokprofiel';
    return {id:id+'-G'+(rail.length+1),label:(railPiece==='straight'?'Geprofileerde leuning ':'Gebogen wrongstuk ')+sideLabel,
      role:'handrail',kind:'railing',material:'timber',profileName,railPiece,profileContour:contour,
      widthMm:stair.handrailWidth,heightMm:stair.handrailDepth,lengthMm,axisPath,
      endCuts:['begin','eind'].map(position=>({position,miterDeg:0,bevelDeg:0})),
      ...extra,...fabrication(faces,axisPath[0],[f.along,f.side,f.up])};
  }
  for(let i=0;i<lines.length;i++) {
    const l=lines[i],corner=corners[i];
    const trimA=corners[i-1]?.trim??0,trimB=corner?.trim??0;
    const a=at(top(l.a),l.t,trimA),b=at(top(l.b),l.t,-trimB);
    const piece=make([{p:a,t:l.t},{p:b,t:l.t}],l.length-trimA-trimB,'straight');
    rail.push(piece); straights.push({...l,piece,trimA,trimB});
    if(!corner) continue;
    const {angle,radius,normal}=corner;
    const divisions=Math.max(2,Math.ceil(degrees(angle)/9));
    const samples=[];
    for(let k=0;k<=divisions;k++) {
      const theta=angle*k/divisions;
      const p=at(at(b,l.t,radius*Math.sin(theta)),normal,radius*(1-Math.cos(theta)));
      const t=add(mul(l.t,Math.cos(theta)),mul(normal,Math.sin(theta)));
      samples.push({p,t});
    }
    // Use the same station and tangent as the next square-cut length.
    samples[0]={p:b,t:l.t};
    samples[divisions]={p:at(top(lines[i+1].a),lines[i+1].t,corner.trim),t:lines[i+1].t};
    // A too-tight inside return reverses the fibres nearest the bend centre.
    // Retain the two trimmed straight ends and flag the missing fitting.
    const reverses=samples.slice(1).some((s,k)=>{
      const a=samples[k],left=ringAt(contour,a.p,railFrame(a.t)),right=ringAt(contour,s.p,railFrame(s.t));
      const tangent=add(a.t,s.t);
      return left.some((v,j)=>dot(sub(right[j],v),tangent)<=1e-7);
    });
    if(reverses) piece.fabricationIssue='Wrongstuk past niet in de beschikbare binnenbocht. Vergroot de ruimte of verklein het leuningprofiel.';
    else rail.push(make(samples,radius*angle,'transition',{radiusMm:radius,bendAngleDeg:degrees(angle)}));
  }
  return {rail,straights};
}

function postContour(section,width) {
  const r=width/2;
  return Array.from({length:16},(_,i)=>{
    const a=i*Math.PI/8,cos=Math.cos(a),sin=Math.sin(a);
    let radius=r;
    if(section!=='rond') radius=r/Math.max(Math.abs(cos),Math.abs(sin));
    if(section==='afgeschuind') radius=Math.min(radius,r*1.78/(Math.abs(cos)+Math.abs(sin)));
    return {x:cos*radius,y:sin*radius};
  });
}

function postProfile(style,newel,width,topWidth,length,slope) {
  // Square blanks at the ends supply material for the scribed cuts. The inner
  // turning stations are perpendicular to the lathe axis.
  const lower=Math.max(.12*length,Math.abs(slope.bottom)*width/2+4);
  const upper=Math.max(.10*length,Math.abs(slope.top)*topWidth/2+4);
  const body=length-upper-lower;
  if(body<12) return [];
  const stations=[];
  function station(atMm,w,section,grade=0) {
    stations.push({atMm,widthMm:w,depthMm:w,section,grade,contour:postContour(section,w)});
  }
  station(0,width,'vierkant',slope.bottom);
  station(lower,width,'vierkant');
  const turning=style==='classic'?
    [[.025,.91,'afgeschuind'],[.065,.79,'rond'],[.08,.72,'rond'],[.105,.73,'rond'],
     [.125,.92,'rond'],[.155,.98,'rond'],[.185,.91,'rond'],[.21,.68,'rond'],
     [.255,.57,'rond'],[.32,.56,'rond'],[.43,.63,'rond'],[.53,.78,'rond'],[.61,.83,'rond'],
     [.68,.80,'rond'],[.76,.65,'rond'],[.81,.58,'rond'],[.84,.65,'rond'],[.865,.88,'rond'],
     [.895,.93,'rond'],[.925,.78,'rond'],[.945,.69,'rond']]:
    [[.045,.95,'afgeschuind'],[.09,.83,'afgeschuind'],[.30,.76,'afgeschuind'],
     [.68,.68,'afgeschuind'],[.86,.76,'afgeschuind'],[.93,.86,'afgeschuind']];
  for(const [t,scale,section] of turning) {
    const base=newel?width*(1-.25*t):width;
    station(lower+t*body,base*scale,section);
  }
  station(length-upper,topWidth,'vierkant');
  station(length,topWidth,'vierkant',slope.top);
  return stations;
}

function supportAt(stair,line,x,newel,id,label,contour) {
  const horizontal=Math.hypot(line.t.x,line.t.y),along=point(line.t.x/horizontal,line.t.y/horizontal,0);
  const side=cross(zAxis,along),grade=line.t.z/horizontal;
  const pos=at(line.a,along,x);
  const upperZ=line.a.z+x*grade+stair.railHeight-stair.handrailDepth/horizontal;
  const lowerZ=line.landingZ??(line.a.z+x*grade);
  const start={...pos,z:lowerZ},end={...pos,z:upperZ},lengthMm=end.z-start.z;
  const width=newel?stair.newelWidth:stair.balusterWidth;
  const topWidth=Math.min(width*(newel?.67:.88),2*contour[0].x-1);
  const slope={bottom:line.landingZ==null?grade:0,top:grade};
  const profileStations=postProfile(stair.timberDetail,newel,width,topWidth,lengthMm,slope);
  if(!profileStations.length) return null;
  const rings=profileStations.map(s=>s.contour.map(p=>at(at(at(start,along,p.x),side,p.y),zAxis,s.atMm+s.grade*p.x)));
  const classic=stair.timberDetail==='classic';
  const profileName=newel?(classic?'Trappaal met gedraaide buik en kapiteel':'Verjongde trappaal met facetten'):
    (classic?'Gedraaide vaasspijl met kraal':'Verjongde facetspijl');
  return {id,label:profileName+' '+label,kind:'member',role:newel?'newel':'baluster',material:'timber',profileName,
    widthMm:width,heightMm:width,lengthMm,profileStations,axisPath:[start,end],bottomCutDeg:degrees(Math.atan(slope.bottom)),
    topCutDeg:degrees(Math.atan(grade)),supportId:line.piece.id,supportSurface:line.landingZ==null?'Bovenzijde trapboom':'Bordesvlak',
    ...fabrication(loft(rings),start,[zAxis,along,side])};
}

function spacing(lo,hi,maximum) {
  if(hi<lo) return [];
  if(hi-lo<1) return [(lo+hi)/2];
  const count=Math.ceil((hi-lo)/maximum);
  return Array.from({length:count+1},(_,i)=>lo+(hi-lo)*i/count);
}

function supportRange(stair,line,width,contactWidth) {
  const horizontal=Math.hypot(line.t.x,line.t.y),length=line.length*horizontal;
  // The lower face of a raking grip is shifted in plan from its upper datum.
  const shift=stair.handrailDepth*line.t.z;
  return [Math.max(width/2+1,line.trimA*horizontal+shift+contactWidth/2+1),
    Math.min(length-width/2-1,length-line.trimB*horizontal+shift-contactWidth/2-1)];
}

function supports(stair,straights,id,label,contour) {
  const supports=[],placed=[];
  let newels=0,balusters=0;
  for(const line of straights) {
    const h=Math.hypot(line.t.x,line.t.y),along=point(line.t.x/h,line.t.y/h,0),side=cross(zAxis,along);
    const range=w=>supportRange(stair,line,w,Math.min(w,2*contour[0].x));
    const [lo,hi]=range(stair.balusterWidth);
    if(hi<lo) continue;
    const [first,last]=range(stair.newelWidth);
    const postStations=last-first>3*stair.newelWidth?spacing(first,last,1200):[];
    const stops=[...new Set([lo,...postStations,hi])].sort((a,b)=>a-b);
    const infill=stops.flatMap((s,i)=>i?spacing(stops[i-1],s,stair.balusterPitch):[s]);
    const poss=[...postStations.map(x=>({x,newel:true})),...[...new Set(infill)].map(x=>({x,newel:false}))];
    for(const {x,newel} of poss) {
      const width=newel?stair.newelWidth:stair.balusterWidth,p=at(line.a,along,x);
      p.z+=x*line.t.z/h;
      // Separating-axis test for two square blanks at neighbouring turns.
      const hits=placed.some(q=>{
        const delta=sub(p,q.p);
        if(Math.abs(delta.z)>stair.railHeight) return false;
        return [along,side,q.along,q.side].every(axis=>
          Math.abs(dot(delta,axis))<width/2*(Math.abs(dot(along,axis))+Math.abs(dot(side,axis)))+
            q.width/2*(Math.abs(dot(q.along,axis))+Math.abs(dot(q.side,axis)))+.5);
      });
      if(hits) continue;
      const code=newel?'P'+(newels+1):'S'+(balusters+1);
      const post=supportAt(stair,line,x,newel,id+'-'+code,label,contour);
      if(!post) continue;
      placed.push({p,along,side,width});
      supports.push(post);
      if(newel) newels++; else balusters++;
    }
  }
  return supports;
}

export function buildTimberBalustrade(input,segments,side) {
  if(!segments.length) return [];
  const stair={newelWidth:75,balusterWidth:30,handrailWidth:60,handrailDepth:58,balusterPitch:125,...input};
  const label=side>0?'links':'rechts',id=stair.mark+'-LN-'+(side>0?'L':'R');
  const contour=railProfile(stair.timberDetail,stair.handrailWidth,stair.handrailDepth);
  const {rail,straights}=railLengths(stair,segments,contour,id,label);
  return [...rail,...supports(stair,straights,id,label,contour)];
}
