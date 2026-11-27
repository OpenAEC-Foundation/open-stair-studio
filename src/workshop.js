import { buildHousings } from './housings.js';
import { buildWinderSchedule, treadPart } from './winder-parts.js';
import { profileTimberTread } from './timber-tread-profile.js';
import {cutStringerJob} from './cut-stringer.js';
import { buildStairDetails } from './stair-details.js';
import { buildRiserJoinery } from './riser-joinery.js';

// Older straight-flight projects keep their grouped cutting list. Their individual
// pieces can still be opened in the workshop and machined without a housed joint.
export function individualTreads(workshop) {
  const scheduled = workshop.parts.filter(part => part.kind === 'tread');
  return scheduled.length || workshop.housings ? scheduled : workshop.treads.map(treadPart);
}

export function treadStockAllowance(treads, margin) {
  return treads.reduce((sum, p) => {
    const extraArea = (p.length + 2 * margin) * (p.width + 2 * margin) - p.length * p.width;
    return sum + extraArea * p.thickness / 1e9;
  }, 0);
}

export function referenceTreadRows(geometry) {
  const mm = value => Number(value.toFixed(2));
  return [['Trede', 'Bovenkant mm', 'Nominale dikte mm', 'Bruto contour m²'],
    ...geometry.treads.map(p => [p.id, mm(p.elevation), mm(p.thickness), Number((p.area / 1e6).toFixed(5))])];
}

function pocketVolume(pocket) {
  const twiceArea = pocket.contour.reduce((sum, a, i, points) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  return Math.abs(twiceArea) * pocket.depth / 2e9;
}

export function buildWorkshop(geometry, model, designDetails) {
  if (model.engineering && model.engineering.structureType !== 'timber') return geometry;
  const housed=model.joinery.type!=='none';
  const housedRisers=model.stair.riserBoards==='closed' && model.stair.riserJoint==='housed';
  const cutBeams=geometry.stringers.filter(beam=>beam.profile==='cut');
  if(!housed&&!housedRisers&&!cutBeams.length&&!['round','bevel'].includes(model.stair.noseProfile)) return geometry;
  const housings = housed || housedRisers ? buildHousings(geometry, model.joinery, housed) : cutBeams.length?
    {settings:model.joinery,beams:cutBeams.map(cutStringerJob),treads:geometry.treads,issues:[]}:null;
  const riserJoinery = housedRisers ? buildRiserJoinery(geometry, model.stair, housings,
    designDetails ?? buildStairDetails(model.stair,geometry)) : null;
  const byHost = Map.groupBy(riserJoinery?.pockets ?? [], pocket => pocket.hostId);
  const byRiser = Map.groupBy(riserJoinery?.pockets ?? [], pocket => pocket.riserId);
  for (const beam of housings?.beams ?? []) {
    for (const pocket of byHost.get(beam.id) ?? []) {
      beam.pockets.push({...pocket, beamId:beam.id, treadId:pocket.riserId});
    }
    if (riserJoinery) beam.issues.push(...riserJoinery.issues.filter(i=>i.level==='error'));
  }
  const treads = (housings?.treads??geometry.treads).map(tread => ({
    ...profileTimberTread(tread,model.stair),
    goingAtWalkline: tread.goingAtWalkline ?? model.stair.going,
    depthAtWalkline: tread.depthAtWalkline ?? tread.length,
    narrowDepth: tread.narrowDepth ?? tread.length
  }));
  const setups = new Map((housings?.beams??[]).map(beam => [beam.id, beam]));
  const names = new Map(geometry.parts.map(part => [part.id, part.name]));
  const beams = geometry.stringers.map(beam => {
    const pockets = setups.get(beam.id)?.pockets ?? [];
    return {
      ...beam, name: names.get(beam.id), pocketCount: pockets.length,
      volume: beam.volume - pockets.reduce((sum, pocket) => sum + pocketVolume(pocket), 0),
      blankVolume: beam.blankVolume ?? beam.volume
    };
  });
  const schedule = buildWinderSchedule(treads, beams);
  for (const landing of geometry.landings) {
    schedule.parts.push({ ...landing, name: names.get(landing.id), kind: 'landing', quantity: 1, blankVolume: landing.volume });
    schedule.volume += landing.volume;
    schedule.blankVolume += landing.volume;
  }
  for (const member of geometry.landingFrame ?? []) {
    schedule.parts.push({...member,quantity:1,blankVolume:member.volume});
    schedule.volume += member.volume;
    schedule.blankVolume += member.volume;
  }
  if (riserJoinery) {
    for (const part of schedule.parts) {
      const pockets = byHost.get(part.id);
      if (!pockets) continue;
      part.riserPockets = pockets;
      if (part.kind === 'stringer') continue; // Its total includes every pocket on the inside face.
      const removed = pockets.reduce((sum,p) => sum+p.volumeM3,0);
      part.volume -= removed;
      schedule.volume -= removed;
    }
    const detailParts = riserJoinery.parts.map(part => byRiser.has(part.id)
      ? {...part, riserPockets:byRiser.get(part.id)} : part);
    return {...geometry,...schedule,treads,housings,riserJoinery,detailParts};
  }
  return { ...geometry, ...schedule, ...(housings?{housings}:{}),
    ...(['round','bevel'].includes(model.stair.noseProfile)?{treads}:{}) };
}
