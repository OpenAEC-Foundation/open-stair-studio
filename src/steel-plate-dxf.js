import Drawing from 'dxf-writer';

export function steelPlatePattern(part) {
  const source=part?.platePattern;
  if(!source||!Array.isArray(source.outer)||!Array.isArray(source.hole))
    throw new Error('Dit onderdeel heeft geen open plaatwangcontour.');
  const local=([x,z])=>[x,z-source.datumZ];
  return {
    id:part.id,thickness:source.thickness,
    stockLength:source.stockLength,stockHeight:source.stockHeight,
    stockMassKg:source.stockMassKg,netMassKg:part.massKg,
    outer:source.outer.map(local),hole:source.hole.map(local),
    cleatReferences:source.cleatReferences.map(ref=>({
      ...ref,z:ref.z-source.datumZ
    }))
  };
}

// Nominal cut geometry. Seating angles are reference marks, not drilling or
// welding instructions; neither machining tolerance nor holes are invented.
export function createSteelPlateDxf(part) {
  const pattern=steelPlatePattern(part),drawing=new Drawing();
  drawing.setUnits('Millimeters');
  drawing.addLayer('OSS-PLAAT-BUITEN',Drawing.ACI.WHITE,'CONTINUOUS');
  drawing.setActiveLayer('OSS-PLAAT-BUITEN');
  drawing.drawPolyline(pattern.outer,true);
  drawing.addLayer('OSS-PLAAT-OPENING',Drawing.ACI.RED,'CONTINUOUS');
  drawing.setActiveLayer('OSS-PLAAT-OPENING');
  drawing.drawPolyline(pattern.hole,true);
  drawing.addLayer('OSS-OPLEGGING-REFERENTIE',3,'CONTINUOUS');
  drawing.setActiveLayer('OSS-OPLEGGING-REFERENTIE');
  for(const ref of pattern.cleatReferences) {
    drawing.drawLine(ref.x0,ref.z,ref.x1,ref.z);
    drawing.drawText(ref.x0,ref.z+18,18,0,`TD-${String(ref.tread).padStart(2,'0')}`,'left','middle');
  }
  drawing.addLayer('OSS-TOELICHTING',7,'CONTINUOUS');
  drawing.setActiveLayer('OSS-TOELICHTING');
  drawing.drawText(0,pattern.stockHeight+65,26,0,
    `${part.id} | plaat ${pattern.thickness} mm | nominale contour | geen boorgaten of lasvrijgave`,
    'left','middle');
  return drawing.toDxfString();
}
