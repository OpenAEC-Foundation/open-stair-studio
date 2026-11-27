import {individualTreads} from './workshop.js';

// The cutting list uses the entire blank, including long points at compound
// ends. The finished volume follows the separate, physically modelled pieces.
export function addTimberTakeoff(workshop,stair,details) {
  const detailed = (stair.timberDetail && stair.timberDetail!=='basic') || stair.wellatType==='chamfered';
  if(!detailed && !workshop.riserJoinery) return workshop;
  const items=details.filter(p=>p.material==='timber'&&p.stockVolumeM3>0 && (detailed || p.role==='riser')).map(p=>({
    id:p.id,name:p.label,kind:p.role,quantity:1,profile:p.profileName,
    length:p.stockLengthMm,width:p.stockWidthMm,thickness:p.stockThicknessMm,
    volume:p.volumeM3,blankVolume:p.stockVolumeM3
  }));
  if(!items.length) return workshop;
  const base=workshop.blankVolume===undefined?
    [...individualTreads(workshop),...workshop.parts.slice(1).map(p=>({...p,blankVolume:p.volume}))]:workshop.parts;
  const parts=[...base,...items];
  return {...workshop,parts,volume:parts.reduce((n,p)=>n+p.volume,0),
    blankVolume:parts.reduce((n,p)=>n+p.blankVolume,0),
    detailTakeoff:{count:items.length,net:items.reduce((n,p)=>n+p.volume,0),stock:items.reduce((n,p)=>n+p.blankVolume,0)}};
}
