import { compileHousingJob } from './housing-cam.js';

const xy = (x,y) => ({x,y});
const rectangle = (length,width) => [xy(0,0),xy(length,0),xy(length,width),xy(0,width)];
const dot = (p,q) => p.x*q.x+p.y*q.y+p.z*q.z;

// The top setup uses the outside-profile datum. Turning the rectangular
// blank about X keeps X stations, reverses Y and brings the underside up.
export function riserFaceSetups(part, margin=0) {
  const pockets = part?.riserPockets?.filter(p=>p.hostId===part.id && ['top','underside'].includes(p.face)) ?? [];
  if (!pockets.length) return [];
  if (!Number.isFinite(margin) || margin<0) throw new Error('Controleer de opspanrand voor de groeffrees.');
  let top = part.boardFrame, contour = part.contour, length=part.length, width=part.width;
  if(part.kind==='landing') {
    const xs=part.points.map(p=>p.x), ys=part.points.map(p=>p.y);
    const minX=Math.min(...xs), minY=Math.min(...ys);
    length=Math.max(...xs)-minX;
    width=Math.max(...ys)-minY;
    top={origin:{x:minX,y:minY,z:part.elevation},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0}};
    contour=part.points.map(p=>xy(p.x-minX,p.y-minY));
  }
  if(!top || !Array.isArray(contour)) throw new Error('Het onderdeel mist het planknulpunt voor de stootbordgroef.');
  const stockLength=length+2*margin,stockWidth=width+2*margin;
  // Finish with the top face up for the outside-profile program.
  return ['underside','top'].filter(face=>pockets.some(p=>p.face===face)).map(face=>{
    const bottom=face==='underside', sign=bottom?-1:1, y0=bottom?width+margin:-margin;
    const frame={
      origin:{x:top.origin.x-margin*top.xAxis.x+y0*top.yAxis.x,
        y:top.origin.y-margin*top.xAxis.y+y0*top.yAxis.y,z:part.elevation-(bottom?part.thickness:0)},
      xAxis:{...top.xAxis},yAxis:{x:sign*top.yAxis.x,y:sign*top.yAxis.y,z:0},zAxis:{x:0,y:0,z:sign}
    };
    function project(p) {
      const v={x:p.x-frame.origin.x,y:p.y-frame.origin.y,z:p.z-frame.origin.z};
      if(Math.abs(dot(v,frame.zAxis))>.001) throw new Error(`${part.id}: groef ligt buiten het gekozen bewerkingsvlak.`);
      return xy(dot(v,frame.xAxis),dot(v,frame.yAxis));
    }
    const machine = p => xy(p.x+margin,margin+(bottom?width-p.y:p.y));
    return {id:part.id,face,frame,margin,length:stockLength,width:stockWidth,thickness:part.thickness,
      outline:rectangle(stockLength,stockWidth),partContour:contour.map(machine),nose:part.nose?.map(machine),
      stockPlanes:[{a:-1,b:0,c:0,d:0},{a:1,b:0,c:0,d:stockLength},{a:0,b:-1,c:0,d:0},{a:0,b:1,c:0,d:stockWidth}],
      pockets:pockets.filter(p=>p.face===face).map(p=>{
        if(Math.abs(dot(p.inward,frame.zAxis)+1)>.00001) throw new Error(`${p.id}: verkeerde insteekrichting.`);
        return {...p,treadId:p.riserId,contour:p.worldContour.map(project)};
      }),issues:[]};
  });
}

export function riserFaceResults(part, model, problems=[]) {
  if(!part) return [];
  const related = problems.filter(i=>i.level==='error' && (!i.hostId || i.hostId===part.id ||
    part.riserPockets?.some(p=>p.riserId===i.riserId)));
  if(!part.riserPockets?.length) return related.map(i=>({problem:i.message}));
  try {
    const settings=model.cam;
    return riserFaceSetups(part, part.kind==='tread'?model.treadCam.stockMargin:0).map(setup=>{
      const issue=related[0];
      if(issue) return {setup,problem:issue.message};
      try {
        return {setup,job:compileHousingJob(setup,settings,{number:model.project.number, revision:model.project.revision,stairMark:model.stair.mark})};
      } catch(error) { return {setup,problem:error.message}; }
    });
  } catch(error) { return [{problem:error.message}]; }
}
