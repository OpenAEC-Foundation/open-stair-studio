import earcut from 'earcut';
import Drawing from 'dxf-writer';

const round=n=>Number(n.toFixed(3));
const area=points=>Math.abs(points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];
  return sum+p.x*q.z-q.x*p.z;
},0))/2;
const triangleVolume=(a,b,c)=>(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;

// A keepboom has horizontal seats under the treads and a sloping underside.
// stringerDepth is the minimum vertical web below each seat corner.
export function makeCutStringer(stair,flight,side,normal,rise) {
  const going=Number(stair.going), treadThickness=Number(stair.treadThickness);
  const thickness=Number(stair.stringerThickness), depth=Number(stair.stringerDepth);
  const nose=Number(stair.nosing)||0;
  const entry=flight.index>0?1:0;
  const startX=entry?-going:-nose;
  const top=[];
  if(entry){
    const landingZ=flight.firstRiser*rise-Number(stair.landingThickness||treadThickness);
    top.push({x:startX,z:landingZ},{x:-nose,z:landingZ});
  }
  for(let step=0;step<flight.treadCount;step++){
    const z=(flight.firstRiser+step+1)*rise-treadThickness;
    top.push({x:step*going-nose,z},{x:(step+1)*going-nose,z});
  }
  const compact=top.filter((p,i)=>i===0||p.x!==top[i-1].x||p.z!==top[i-1].z);
  const slope=rise/going;
  const intercept=Math.min(...compact.map(p=>p.z-slope*(p.x-startX)))-depth;
  const endX=flight.treadCount*going-nose;
  const bottomAt=x=>intercept+slope*(x-startX);
  const section=[...compact,{x:endX,z:bottomAt(endX)},{x:startX,z:bottomAt(startX)}];
  const sectionArea=area(section);
  if(!(sectionArea>0&&depth>0&&thickness>0))throw new Error('Ongeldige keepboomdoorsnede.');
  const centerY=side*(Number(stair.width)/2-thickness/2);
  const world=(p,offset)=>({x:flight.origin.x+flight.direction.x*p.x+normal.x*(centerY+offset),
    y:flight.origin.y+flight.direction.y*p.x+normal.y*(centerY+offset),z:p.z});
  const size=section.length;
  const vertices=[...section.map(p=>world(p,-thickness/2)),...section.map(p=>world(p,thickness/2))];
  const cap=earcut(section.flatMap(p=>[p.x,p.z]));
  const faces=[];
  for(let i=0;i<cap.length;i+=3){
    faces.push([cap[i],cap[i+1],cap[i+2]]);
    faces.push([cap[i+2]+size,cap[i+1]+size,cap[i]+size]);
  }
  for(let i=0;i<size;i++){
    const next=(i+1)%size;
    faces.push([i,next,next+size,i+size]);
  }
  let signed=0;
  for(const face of faces)for(let i=1;i<face.length-1;i++)
    signed+=triangleVolume(vertices[face[0]],vertices[face[i]],vertices[face[i+1]]);
  if(signed<0)for(const face of faces)face.reverse();
  const meshFaces=faces.map(face=>face.map(i=>vertices[i]));
  const c=Math.hypot(1,slope);
  const stockPoints=section.map(p=>({x:((p.x-startX)+slope*p.z)/c,
    y:(p.z-slope*(p.x-startX))/c}));
  const minU=Math.min(...stockPoints.map(p=>p.x)),maxU=Math.max(...stockPoints.map(p=>p.x));
  const minV=Math.min(...stockPoints.map(p=>p.y)),maxV=Math.max(...stockPoints.map(p=>p.y));
  const outline=stockPoints.map(p=>({x:round(p.x-minU),y:round(p.y-minV)}));
  const stockLength=maxU-minU,stockWidth=maxV-minV;
  const center={x:flight.origin.x+flight.direction.x*(startX+endX)/2+normal.x*centerY,
    y:flight.origin.y+flight.direction.y*(startX+endX)/2+normal.y*centerY};
  const halfRun=(endX-startX)/2,halfWidth=thickness/2;
  const planPoints=[-1,1].flatMap(along=>[-1,1].map(across=>({
    x:center.x+flight.direction.x*along*halfRun+normal.x*across*halfWidth,
    y:center.y+flight.direction.y*along*halfRun+normal.y*across*halfWidth
  })));
  const points=[planPoints[0],planPoints[2],planPoints[3],planPoints[1]];
  const id=`${stair.mark}-WG${flight.index+1}-${side>0?'L':'R'}`;
  return {id,flightIndex:flight.index,side,profile:'cut',name:`Keepboom ${side>0?'links':'rechts'} · ${flight.label}`,
    length:stockLength,width:stockWidth,thickness,volume:sectionArea*thickness/1e9,
    blankVolume:stockLength*stockWidth*thickness/1e9,minWeb:depth,
    section,outline,vertices,faces,meshFaces,
    topEdge:[world(compact[0],0),world(compact.at(-1),0)],
    points,svgPoints:points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')};
}

export function cutStringerJob(beam) {
  return {id:beam.id,profile:'cut',side:beam.side>0?'left':'right',flightIndex:beam.flightIndex,
    length:beam.length,width:beam.width,thickness:beam.thickness,outline:beam.outline,
    pockets:[],issues:[],minWeb:beam.minWeb};
}

export function writeCutStringerDxf(job,metadata={}) {
  if(job.profile!=='cut'||job.outline.length<6)throw new Error('Kies een uitgewerkte keepboom.');
  const drawing=new Drawing();
  drawing.setUnits('Millimeters');
  drawing.addLayer('OSS-KEEPBOOM-CONTOUR',3,'CONTINUOUS');
  drawing.setActiveLayer('OSS-KEEPBOOM-CONTOUR');
  drawing.drawPolyline(job.outline.map(p=>[p.x,p.y]),true);
  drawing.addLayer('OSS-KEEPBOOM-INFO',7,'CONTINUOUS');
  drawing.setActiveLayer('OSS-KEEPBOOM-INFO');
  drawing.drawText(0,-18,6,0,`${metadata.number??''} ${job.id} ${job.side} min web ${round(job.minWeb)} mm`);
  return drawing.toDxfString();
}
