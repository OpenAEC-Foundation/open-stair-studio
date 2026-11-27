export const twoQuarterDefaults = {
  twoQuarterLayout: 'automatic', outerLength: null, outerDepth: null, middleOffset: 0,
  firstQuarterAngles: [22.5,22.5,22.5,22.5], secondQuarterAngles: [22.5,22.5,22.5,22.5]
};

export const devriesTwoQuarterSettings = {
  type: 'two_quarter_winder', twoQuarterLayout: 'dimensioned', outerLength: 3140, outerDepth: 992, middleOffset: 20.034,
  // Measured between successive riser faces, with the final angle closing each quarter.
  firstQuarterAngles: [18.533,18.809,17.920,18.040,16.698],
  secondQuarterAngles: [17.639,17.746,16.945,18.731,18.939],
  width: 966, floorHeight: 2900, risers: 16, going: 220.513, entrySteps: 0, middleSteps: 5,
  outerShape: 'square', nosing: 0, wel: 45, treadThickness: 38, stringerThickness: 38,
  stringerLeft: 'housed', stringerRight: 'housed', riserBoards: 'closed', riserThickness: 13,
  riserJoint: 'butt', riserPosition: 'auto', railSide: 'none', wellatType: 'none', noseProfile: 'square'
};

// Local along/across coordinates mirror with the stair. Base and top use
// the lower finished floor as their vertical datum, in millimetres.
export const newelDimensions = [
  {suffix:'Width', label:'Breedte langs het tussenstuk', min:10, max:1000},
  {suffix:'Depth', label:'Diepte dwars op het tussenstuk', min:10, max:1000},
  {suffix:'OffsetAlong', label:'Hart vanaf de binnenhoek naar het tussenstuk', min:-3000, max:3000},
  {suffix:'OffsetAcross', label:'Hart vanaf hart binnenwang naar buitenwang', min:-3000, max:3000},
  {suffix:'Base', label:'Onderkant boven vertrekvloer', min:-10000, max:20000},
  {suffix:'Top', label:'Bovenkant boven vertrekvloer', min:-10000, max:20000},
  {suffix:'EndGoing', label:'Smalle aantrede bij het kopvlak', min:0.1, max:600},
  {suffix:'Housing', label:'Insteekdiepte in de spil', min:0, max:150},
  {suffix:'Clearance', label:'Totale hoogtespeling in het huis', min:0, max:3}
];

export const newelDefaults = Object.fromEntries(['lower','upper'].flatMap(corner =>
  Object.entries({Enabled:false, Width:114, Depth:66, OffsetAlong:43, OffsetAcross:0, Base:0,
    Top:corner === 'lower' ? 2900 : 3950, EndGoing:corner === 'lower' ? 20.552 : 13.892,
    Housing:0, Clearance:0}).map(([name,value]) => [corner+'Newel'+name,value])));

export const devriesNewelSettings = {
  ...devriesTwoQuarterSettings, ...newelDefaults, lowerNewelEnabled:true, upperNewelEnabled:true
};

export const devriesIfcDepth = 992.105;

export function equalQuarterAngles(count) {
  const increment = Number((90 / count).toFixed(3));
  return [...Array(count-1).fill(increment), Number((90 - (count-1)*increment).toFixed(3))];
}

export function quarterAngleError(angles) {
  if (!Array.isArray(angles) || angles.length < 2 || angles.length > 8)
    return 'Kies twee tot acht verdreven treden per kwart.';
  if (!angles.every(angle => Number.isFinite(angle) && angle > 0 && angle < 90))
    return 'Elke draaihoek moet tussen 0° en 90° liggen.';
  if (Math.abs(angles.reduce((sum, angle) => sum + angle, 0) - 90) > 1e-6)
    return 'De draaihoeken van één kwart moeten samen 90° zijn.';
  return null;
}
