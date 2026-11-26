import Drawing from 'dxf-writer';

export function createTreadDxf(part) {
  const drawing = new Drawing();
  drawing.setUnits('Millimeters');
  drawing.addLayer('OSS-TREAD', Drawing.ACI.WHITE, 'CONTINUOUS');
  drawing.setActiveLayer('OSS-TREAD');
  drawing.drawPolyline(part.contour.map(p => [p.x, p.y]), true);
  return drawing.toDxfString();
}
