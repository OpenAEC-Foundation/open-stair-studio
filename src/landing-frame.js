import { housedRisers, riserPlaneOffset } from './timber-riser.js';

// An optional rectangular timber rim under a landing plate. The members meet
// at four butt joints; host anchors require a separate project detail.
const rectangle = (x0, y0, x1, y1) => [
  {x:x0,y:y0}, {x:x1,y:y0}, {x:x1,y:y1}, {x:x0,y:y1}
];

export function buildLandingFrame(landing, stair) {
  if (stair.landingFrame !== 'perimeter') return {members:[], joints:[], fasteners:[]};
  // The half-turn landing can have a stepped front edge. Keep the entire
  // rectangular frame under both lanes.
  const maxX = Math.max(...landing.points.map(p=>p.x));
  const plateMinX = Math.max(...landing.points.filter(p=>p.x<maxX).map(p=>p.x));
  // The incoming flight of each straight/quarter/return landing climbs in
  // +X. Carry the two side rails and the front cross member behind the riser
  // as one rectangular frame, so the same butt joints and screws still fit.
  const behindRiser = housedRisers(stair) || (stair.wel!=null && stair.riserBoards==='closed');
  const riserBack = (landing.level-1)*Number(stair.going)-(Number(stair.nosing)||0)+riserPlaneOffset(stair)+Number(stair.riserThickness);
  const minX = behindRiser ? Math.max(plateMinX,riserBack) : plateMinX;
  const minY = Math.min(...landing.points.map(p=>p.y));
  const maxY = Math.max(...landing.points.map(p=>p.y));
  const w = Number(stair.landingFrameWidth);
  const h = Number(stair.landingFrameDepth);
  if (!(w>0 && h>0 && 2*w<Math.min(maxX-minX,maxY-minY))) {
    return {members:[],joints:[],fasteners:[]};
  }
  const top = landing.elevation - landing.thickness;
  const profiles = [
    [minX,minY,maxX,minY+w,'A'], [minX,maxY-w,maxX,maxY,'B'],
    [minX,minY+w,minX+w,maxY-w,'C'], [maxX-w,minY+w,maxX,maxY-w,'D']
  ];
  const members = profiles.map(([x0,y0,x1,y1,suffix])=>{
    const points=rectangle(x0,y0,x1,y1);
    const lower=points.map(p=>({...p,z:top-h}));
    const upper=points.map(p=>({...p,z:top}));
    const horizontal=(x1-x0)>=(y1-y0);
    return {
      id:`${landing.id}-RG-${suffix}`, landingId:landing.id, kind:'landingRim',
      material:'timber', name:`Bordesrandligger ${suffix}`,
      length:horizontal?x1-x0:y1-y0, width:w, thickness:h,
      direction:horizontal?{x:1,y:0}:{x:0,y:1},
      center:{x:(x0+x1)/2,y:(y0+y1)/2}, elevation:top,
      volume:(x1-x0)*(y1-y0)*h/1e9, points,
      svgPoints:points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
      faces:[upper,[...lower].reverse(),
        ...points.map((_,i)=>[lower[i],lower[(i+1)%4],upper[(i+1)%4],upper[i]])]
    };
  });
  const joints = [
    [minX+w/2,minY+w,'A','C'], [maxX-w/2,minY+w,'A','D'],
    [minX+w/2,maxY-w,'B','C'], [maxX-w/2,maxY-w,'B','D']
  ].map(([x,y,a,b],i)=>({id:`${landing.id}-J${i+1}`,landingId:landing.id,
    position:{x,y,z:top-h/2},members:[`${landing.id}-RG-${a}`,`${landing.id}-RG-${b}`],
    joint:'stuikverbinding',fastenerCount:Number(stair.landingScrewsPerJoint)||0,
    status:'schroefpositie bepaald; draagkracht en gebouwoplegging te toetsen'}));
  const count=Number(stair.landingScrewsPerJoint)||0;
  const diameter=Number(stair.landingScrewDiameter)||8;
  const length=Number(stair.landingScrewLength)||120;
  const fits=count>=0&&count<=4&&length>w+2*diameter&&length<maxY-minY-w&&
    (count<=1||h-50>=(count-1)*3*diameter);
  const fasteners=[];
  if(fits)for(const [index,joint] of joints.entries())for(let number=0;number<count;number++) {
    const z=top-(count===1?h/2:25+number*(h-50)/(count-1));
    const head={x:joint.position.x,y:index<2?minY:maxY,z};
    const tip={...head,y:head.y+(index<2?length:-length)};
    const sign=index<2?1:-1;
    const ring=center=>Array.from({length:8},(_,i)=>{
      const a=i*Math.PI/4;
      return {x:center.x+Math.cos(a)*diameter/2,y:center.y,z:center.z-sign*Math.sin(a)*diameter/2};
    });
    const a=ring(head),b=ring(tip);
    fasteners.push({id:`${joint.id}-S${number+1}`,jointId:joint.id,landingId:landing.id,
      kind:'mechanicalFastener',role:'landingJointScrew',material:'galvanized',
      diameter,length,head,tip,faces:[[...a].reverse(),b,
        ...a.map((_,i)=>[a[i],a[(i+1)%8],b[(i+1)%8],b[i]])]});
  }
  return {members,joints,fasteners};
}
