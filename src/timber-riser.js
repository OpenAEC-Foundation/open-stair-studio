const signedArea = points=>points.reduce((sum,a,i)=>{
  const b=points[(i+1)%points.length];
  return sum+a.x*b.y-a.y*b.x;
},0)/2;

// Saw coordinates: X across the stair, Y from the riser face into the board.
function boardOutline(points,d) {
  const local=points.map(p=>({x:d.y*p.x-d.x*p.y,y:d.x*p.x+d.y*p.y}));
  const minX=Math.min(...local.map(p=>p.x)),minY=Math.min(...local.map(p=>p.y));
  return local.map(p=>({x:p.x-minX,y:p.y-minY}));
}

export function riserStock(points,d,height,thickness) {
  const faceContour=boardOutline(points,d);
  const length=Math.max(...faceContour.map(p=>p.x));
  return {role:'riser',profileName:'Stootbord op zijcontour',faceContour,lengthMm:length,
    stockLengthMm:length,stockWidthMm:height,stockThicknessMm:thickness,stockVolumeM3:length*height*thickness/1e9};
}

export function nosingStrip(tread,stair,clipStrip,back) {
  const width=stair.wellatWidth,height=stair.wellatHeight,bevel=Math.min(3,width/2,height/2);
  const {direction:d,frontEdge,elevation,thickness,points}=tread;
  const top=elevation-thickness,front=back-width,fold=front+bevel;
  const at=p=>(p.x-frontEdge[0].x)*d.x+(p.y-frontEdge[0].y)*d.y;
  const cut=(a,b)=>clipStrip(points,frontEdge[0],d,a,b);
  const outline=cut(front,back),faceContour=boardOutline(outline,d);
  if(outline.length<3) return null;
  const length=Math.max(...faceContour.map(p=>p.x));
  const faces=[];
  let volume=0;
  // Two planar sections share the bevel seam. Clip both on the real side of
  // the tread so a winding step receives its own compound end cuts.
  for(const [from,to] of [[front,fold],[fold,back]]) {
    const poly=cut(from,to);
    if(poly.length<3) continue;
    if(signedArea(poly)<0) poly.reverse();
    const upper=poly.map(p=>({...p,z:top}));
    const lower=poly.map(p=>({...p,z:top-height+Math.max(0,fold-at(p))}));
    faces.push(upper,[...lower].reverse());
    for(let i=0;i<poly.length;i++) {
      const j=(i+1)%poly.length;
      if(Math.abs(at(poly[i])-fold)>1e-6||Math.abs(at(poly[j])-fold)>1e-6)
        faces.push([lower[i],lower[j],upper[j],upper[i]]);
    }
    // Height varies linearly on the bevel. Triangle centroids integrate it exactly.
    for(let i=1;i+1<poly.length;i++){
      const tri=[0,i,i+1];
      volume+=signedArea(tri.map(k=>poly[k]))*tri.reduce((sum,k)=>sum+top-lower[k].z,0)/3;
    }
  }
  const centre=cut(front+width/2,back).filter(p=>Math.abs(at(p)-front-width/2)<1e-5);
  centre.sort((a,b)=>d.y*(a.x-b.x)-d.x*(a.y-b.y));
  const axisPath=centre.length>=2?[centre[0],centre.at(-1)].map(p=>({...p,z:top-height/2})):[];
  const section=[[0,height],[width,height],[width,0],[bevel,0],[0,bevel]];
  return {id:tread.id+'-WL',label:'Wellat onder trede',kind:'member',role:'nosingStrip',material:'timber',
    profileName:'Wellat met vellingkant '+bevel+' mm',profileContour:section.map(([x,y])=>({x,y})),faceContour,
    axisPath,faces,partOf:tread.id,lengthMm:axisPath.length?Math.hypot(axisPath[1].x-axisPath[0].x,axisPath[1].y-axisPath[0].y):length,
    heightMm:height,widthMm:width,stockLengthMm:length,stockWidthMm:width,stockThicknessMm:height,
    volumeM3:volume/1e9,stockVolumeM3:length*width*height/1e9};
}
