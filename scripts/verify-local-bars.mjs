import assert from 'node:assert/strict';
import {concrete} from '../src/components/concrete.js';

const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=v=>Math.hypot(...v),dist=(a,b)=>norm(sub(a,b));
const cross=([x,y,z],[u,v,w])=>[y*w-z*v,z*u-x*w,x*v-y*u];
const near=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<=tol,`${a} <> ${b}`);
const key=p=>[p.x,p.y,p.z].map(n=>Math.round(n*1e6)).join(',');
const pointAt=(p,v,t)=>({x:p.x+t*v[0],y:p.y+t*v[1],z:p.z+t*v[2]});
const form={base:'precast',layout:'return',height:3040,detailing:'engineered',localReinforcement:'detailed'};

function readSolid(part,host,cover) {
  const edges=new Map(),unique=new Map(),origin=part.faces[0][0];
  let volume=0;
  for(const face of part.faces) {
    for(let i=0;i<face.length;i++) {
      const a=key(face[i]),b=key(face[(i+1)%face.length]);
      assert.notEqual(a,b);
      const id=a<b?a+'/'+b:b+'/'+a,uses=edges.get(id)??[0,0];
      uses[a<b?0:1]++;edges.set(id,uses);unique.set(a,face[i]);
    }
    for(let j=1;j<face.length-1;j++) volume+=dot(sub(face[0],origin),cross(sub(face[j],origin),sub(face[j+1],origin)))/6;
  }
  assert([...edges.values()].every(pair=>pair[0]===1&&pair[1]===1),part.id+' open shell');
  const nominal=Math.PI*part.diameterMm**2/4*part.lengthMm;
  assert(volume/nominal>.90&&volume/nominal<1.01,part.id+' developed steel volume');
  for(const p of unique.values()) {
    const {axes,profile,width}=host.detail,v=sub(p,axes.origin);
    const x=v[0]*axes.x.x+v[1]*axes.x.y,y=v[0]*axes.y.x+v[1]*axes.y.y,z=v[2];
    assert(y>=cover-.001&&y<=width-cover+.001);
    let crosses=0,min=Infinity;
    for(let i=0;i<profile.length;i++) {
      const [a,b]=profile[i],[c,d]=profile[(i+1)%profile.length];
      if((b>z)!==(d>z)&&x<a+(c-a)*(z-b)/(d-b))crosses++;
      const dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));
      min=Math.min(min,Math.hypot(x-a-t*dx,z-b-t*dz));
    }
    assert(crosses%2===1&&min>=cover-.001,part.id+' outside the required concrete cover: '+min);
  }
}

// Scan both directions and compare analytic interior closest points. The
// independent clearance check also checks contact near the end of a short leg.
function segmentGap(a,b,c,d){
  const u=sub(b,a),v=sub(d,c),w=sub(a,c);
  const aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  const candidates=[[0,ee/cc],[1,(ee+bb)/cc],[-dd/aa,0],[(bb-dd)/aa,1]];
  if(aa*cc-bb*bb>1e-7) candidates.push([(bb*ee-cc*dd)/(aa*cc-bb*bb),(aa*ee-bb*dd)/(aa*cc-bb*bb)]);
  return Math.min(...candidates.map(([s,t])=>dist(pointAt(a,u,Math.max(0,Math.min(1,s))),pointAt(c,v,Math.max(0,Math.min(1,t))))));
}
function assertPieces(model,cover,gap) {
  assert.equal(new Set(model.parts.map(x=>x.id)).size,model.parts.length,'duplicate prefab part ID');
  const allIds=new Set(model.parts.map(p=>p.id));
  let total=0;
  for(const cast of model.parts.filter(p=>p.detail)){
    const related=model.parts.filter(p=>p.parentId===cast.id);
    assert.equal(new Set(related.map(p=>p.position)).size,related.length);
    const local=related.filter(p=>p.path),segments=[];
    for(const p of related.filter(p=>p.role==='mainBar'||p.role==='crossBar')) segments.push([p.start,p.end,p.diameterMm/2,p.id]);
    for(const p of related.filter(p=>p.role==='liftAnchor'||p.role==='anchorBolt')){
      const t=p.role==='liftAnchor'?Math.min(10,p.lengthMm*.12):p.diameterMm/2;
      const link=pointAt(p.end,sub(p.start,p.end),t/p.lengthMm);
      segments.push([p.start,link,p.diameterMm/2,p.id],[link,p.end,(p.role==='liftAnchor'?.85:.8)*p.diameterMm,p.id]);
    }
    for(const zone of cast.detail.localZones){
      assert(allIds.has(zone.targetId));assert.equal(zone.issue,'');
      assert.equal(zone.barIds.length,zone.requestedCount);
      const actual=local.filter(p=>p.targetId===zone.targetId);
      near(zone.providedAreaMm2,actual.reduce((s,p)=>s+Math.PI*p.diameterMm**2/4*p.activeLegs,0));
      near(zone.anchorageMm,Math.min(...actual.map(p=>p.anchorageMm)));
    }
    for(const p of local){
      assert.equal(p.activeLegs,2);assert(p.anchorageMm>0);near(p.mandrelMm+p.diameterMm,2*p.bendRadiusMm);
      assert.deepEqual(p.start,p.path[0]);assert.deepEqual(p.end,p.path.at(-1));
      let length=0;
      for(const [i,s] of p.bendSchedule.entries()){
        if(i) assert(dist(s.start,p.bendSchedule[i-1].end)<1e-7);
        if(s.type==='arc'){
          near(dist(s.start,s.center),s.radiusMm);near(dist(s.end,s.center),s.radiusMm);
          near(s.lengthMm,s.radiusMm*Math.PI*s.angleDeg/180);
          const cosine=dot(sub(s.start,s.center),sub(s.end,s.center))/s.radiusMm**2;
          near(cosine,Math.cos(s.angleDeg*Math.PI/180));
        } else near(s.lengthMm,dist(s.start,s.end));
        length+=s.lengthMm;
      }
      near(length,p.lengthMm);assert(length>dist(p.start,p.end));
      readSolid(p,cast,cover);
      for(let j=1;j<p.path.length;j++){
        for(const [a,b,r,id] of segments){
          const distance=segmentGap(p.path[j-1],p.path[j],a,b);
          assert(distance>=r+p.diameterMm/2+gap-.001,p.id+' overlaps '+id+' by '+(r+p.diameterMm/2+gap-distance));
        }
      }
      for(let j=1;j<p.path.length;j++) segments.push([p.path[j-1],p.path[j],p.diameterMm/2,p.id]);
      total++;
    }
  }
  return total;
}
const baseline=concrete.build(form);
assert.equal(assertPieces(baseline,30,2),46);
const deeper=concrete.build({...form,waist:240,nib:140,landingThickness:340,localTail:100,risers:15,anchorSide:'highY'});
assert.equal(assertPieces(deeper,30,2),46);
assert.deepEqual(baseline.parts.filter(p=>p.path).map(p=>p.id),deeper.parts.filter(p=>p.path).map(p=>p.id));
const straight=concrete.build({...form,layout:'straight',base:'host',cover:32,headShoulder:95});
assert.equal(assertPieces(straight,32,2),18);
const old=concrete.build({...form,localReinforcement:'none'});
assert(!old.parts.some(p=>p.path));
const single=concrete.build({...form,seatBarCount:1});
for(const p of single.parts.filter(p=>p.role==='bearingBar')) assert(baseline.parts.some(q=>q.id===p.id));
const invalid=concrete.build({...form,localDiameter:20,localMandrel:96,cover:39});
assert(invalid.issues.some(q=>q.level==='error'&&q.text.includes('Bijlegstaaf')));
assert(invalid.parts.filter(p=>p.detail).some(c=>c.detail.localZones.some(z=>z.issue&&z.providedAreaMm2===0)));
// Absolute station coordinates must survive unchanged on an allowed arrangement.
const flight=baseline.parts.find(p=>p.id==='vlucht-1'),[lo,,hi]=flight.detail.liftPoints;
const fixed={...form,liftLayout:'fixed',liftStationAX:lo.x,liftStationBX:hi.x,liftStationY:lo.y};
const replay=concrete.build(fixed).parts.find(p=>p.id===flight.id);
assert.deepEqual(replay.detail.liftPoints,flight.detail.liftPoints);
for(const changes of [{liftStationAX:20000},{liftStationAX:hi.x,liftStationBX:lo.x},{liftStationY:1}]) {
  const wrong=concrete.build({...fixed,...changes}).parts.find(p=>p.id===flight.id);
  assert.equal(wrong.detail.liftPoints.length,0);assert(wrong.detail.geometryIssues.some(t=>t.includes('hijsstations')));
}
console.log('110 gebogen bijlegstaven geverifieerd op maldekking, clashvrijheid, buigstaat, identiteit, positie en zonehoeveelheid. Ongeldige passing en vaste hijsstations gecontroleerd.');
