import Drawing from 'dxf-writer';

export function createLandingFrameDxf(landing, members, joints, fasteners=[]) {
  const drawing=new Drawing();
  drawing.setUnits('Millimeters');
  const minX=Math.min(...landing.points.map(p=>p.x));
  const minY=Math.min(...landing.points.map(p=>p.y));
  const maxY=Math.max(...landing.points.map(p=>p.y));
  const local=p=>[p.x-minX,p.y-minY];
  drawing.addLayer('OSS-BORDESPLAAT',Drawing.ACI.WHITE,'CONTINUOUS');
  drawing.setActiveLayer('OSS-BORDESPLAAT');
  drawing.drawPolyline(landing.points.map(local),true);
  drawing.addLayer('OSS-RANDLIGGERS',3,'CONTINUOUS');
  drawing.setActiveLayer('OSS-RANDLIGGERS');
  for(const member of members) drawing.drawPolyline(member.points.map(local),true);
  drawing.addLayer('OSS-STUIKNADEN',2,'CONTINUOUS');
  drawing.setActiveLayer('OSS-STUIKNADEN');
  for(const joint of joints){
    const [x,y]=local(joint.position);
    drawing.drawLine(x-15,y,x+15,y);
    drawing.drawLine(x,y-15,x,y+15);
    drawing.drawText(x+20,y+20,30,0,joint.id,'left','middle');
  }
  drawing.addLayer('OSS-MERKEN',7,'CONTINUOUS');
  drawing.setActiveLayer('OSS-MERKEN');
  for(const member of members){
    const [x,y]=local(member.center);
    drawing.drawText(x,y,35,0,member.id,'center','middle');
  }
  drawing.addLayer('OSS-BOORPUNTEN-BUITENZIJDE',1,'CONTINUOUS');
  drawing.setActiveLayer('OSS-BOORPUNTEN-BUITENZIJDE');
  const sectionY=maxY-minY+250;
  const bottom=landing.elevation-landing.thickness-(members[0]?.thickness??0);
  for(const screw of fasteners){
    const x=screw.head.x-minX,y=sectionY+screw.head.z-bottom;
    drawing.drawLine(x-8,y,x+8,y);
    drawing.drawLine(x,y-8,x,y+8);
    drawing.drawText(x+12,y+12,22,0,screw.id,'left','middle');
  }
  drawing.drawText(0,sectionY-45,30,0,'Boorpunten buitenzijde randliggers A/B; hoogte vanaf onderkant raam.','left','middle');
  drawing.setActiveLayer('OSS-MERKEN');
  drawing.drawText(0,maxY-minY+120,40,0,
    `Bordespeil +${landing.elevation} mm; plaat ${landing.thickness} mm; bevestiging gebouw projectmatig.`,'left','middle');
  return drawing.toDxfString();
}
