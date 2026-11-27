import Drawing from 'dxf-writer';

export function createPlanDxf({ treads, landings, stringers, newels = [], walkline }) {
  const drawing = new Drawing();
  drawing.setUnits('Millimeters');
  for (const [layer, parts] of [
    ['OSS-TREAD', treads],
    ['OSS-LANDING', landings],
    ['OSS-STRINGER', stringers],
    ['OSS-NEWEL', newels]
  ]) {
    drawing.addLayer(layer, Drawing.ACI.WHITE, 'CONTINUOUS');
    drawing.setActiveLayer(layer);
    for (const part of parts) {
      drawing.drawPolyline(part.points.map(point => [point.x, point.y]), true);
    }
  }
  if (walkline?.length) {
    drawing.addLayer('OSS-WALKLINE', 3, 'DASHED');
    drawing.setActiveLayer('OSS-WALKLINE');
    drawing.drawPolyline(walkline.map(p => [p.x, p.y]));
    drawing.addLayer('OSS-MARK', 7, 'CONTINUOUS');
    drawing.setActiveLayer('OSS-MARK');
    for (const tread of treads) {
      drawing.drawText(tread.center.x, tread.center.y, 45, 0, String(tread.level), 'center', 'middle');
    }
  }
  return drawing.toDxfString();
}
