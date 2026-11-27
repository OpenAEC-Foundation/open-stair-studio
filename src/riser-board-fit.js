import { compileHousingJob } from './housing-cam.js';
import { riserFaceSetups } from './riser-face-cam.js';

const tolerance = 0.001; // millimetres, for the assembled model and four-decimal NC coordinates
const distance = (p,q) => Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);

function receivingSetup(feature,workshop,model) {
  if (feature.hostKind==='stringer') return workshop.housings?.beams.find(b=>b.id===feature.hostId);
  const part=workshop.parts.find(p=>p.id===feature.hostId && p.kind===feature.hostKind);
  return riserFaceSetups(part,part?.kind==='tread'?model.treadCam.stockMargin:0).find(s=>s.face===feature.face);
}

// Re-run the receiving cut with the tongue from this board, in the
// receiving part's own fixture. This also checks the end mill's swept
// corners and the available stock behind a mitred stringer face.
export function checkRiserBoardFit(part,workshop,model) {
  const connections=[];
  const problems=new Set((workshop.riserJoinery?.issues??[])
    .filter(issue=>issue.level==='error' && (!issue.riserId || issue.riserId===part.id))
    .map(issue=>issue.message));
  const features=part.joineryFeatures??[];
  const intended=(workshop.riserJoinery?.pockets??[]).filter(p=>p.riserId===part.id);
  if (features.length!==intended.length || intended.some(p=>!features.some(f=>f.pocketId===p.id)))
    problems.add('Het aantal lippen op dit bord komt niet overeen met de bijbehorende groeven.');
  const vertices=part.faces.flat();
  for (const f of features) {
    try {
      const setup=receivingSetup(f,workshop,model);
      const pocket=setup?.pockets.find(p=>p.id===f.pocketId && p.riserId===part.id && p.face===f.face);
      if (!pocket) throw new Error('De bijbehorende groef ontbreekt in het ontvangende onderdeel.');
      const n=setup.frame.zAxis;
      if (Math.hypot(f.inward.x+n.x,f.inward.y+n.y,f.inward.z+n.z)>1e-6)
        throw new Error('De lip wijst niet loodrecht de groef in.');
      if (!f.tongueWorldContour?.length || f.tongueWorldContour.some(p=>{
        const tip={x:p.x+f.inward.x*f.tongueDepth,y:p.y+f.inward.y*f.tongueDepth,z:p.z+f.inward.z*f.tongueDepth};
        return [p,tip].some(q=>!vertices.some(v=>distance(v,q)<tolerance));
      })) throw new Error('De lip op het stootbord wijkt af van de gemodelleerde schouder of kop.');
      const pockets=setup.pockets.map(p=>p===pocket?{...p,tongueWorldContour:f.tongueWorldContour,tongueDepth:f.tongueDepth}:p);
      const job=compileHousingJob({...setup,pockets},model.cam,{},f.pocketId);
      const grooveDepth=-Number(job.operations[0].levels.at(-1).toFixed(4));
      connections.push({hostId:f.hostId,face:f.face,grooveDepth,tongueDepth:f.tongueDepth,endClearance:grooveDepth-f.tongueDepth});
    } catch (error) {
      problems.add(f.hostId+' · '+error.message);
    }
  }
  return {connections,problems:[...problems]};
}
