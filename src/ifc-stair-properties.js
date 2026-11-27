import * as IFC from 'web-ifc';

// IFC4 ADD2 TC1 property templates use the singular NumberOfRiser. Length
// values here must already be in the file's declared project length unit.
export function stairMeasureProperties({risers, treads, rise, going}) {
  return [
    ['NumberOfRiser', IFC.IFCCOUNTMEASURE, risers],
    ['NumberOfTreads', IFC.IFCCOUNTMEASURE, treads],
    ['RiserHeight', IFC.IFCPOSITIVELENGTHMEASURE, rise],
    ['TreadLength', IFC.IFCPOSITIVELENGTHMEASURE, going]
  ].filter(([, , value]) => Number.isFinite(value) && value > 0);
}
