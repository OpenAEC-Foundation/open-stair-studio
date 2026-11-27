import { defaultCam, validateCamField } from './housing-cam.js';

// The end mill used for a riser's shoulders can differ from the groove
// cutter. Both use the same machine parameters and validation ranges.
const fields=['toolDiameter','fluteLength','stepDown','stepoverPercent','safeZ','cutFeed','plungeFeed','spindleSpeed'];
export const defaultRiserCam=Object.fromEntries(fields.map(key=>[key,defaultCam[key]]));
export const defaultRiserDetailCam={...defaultRiserCam,toolDiameter:2,stepDown:1,stepoverPercent:35,cutFeed:450,plungeFeed:90};

export function validateRiserCamField(key,value) {
  if (!Object.hasOwn(defaultRiserCam,key)) throw new Error('Onbekende freesinstelling voor het stootbord.');
  return validateCamField(key,value);
}
