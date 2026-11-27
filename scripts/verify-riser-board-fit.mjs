import assert from 'node:assert/strict';
import { buildWorkshop } from '../src/workshop.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';
import { checkRiserBoardFit } from '../src/riser-board-fit.js';

for (const type of ['straight','quarter_turn','quarter_winder','half_winder']) {
  for (const hand of ['left','right']) {
    const model=structuredClone(starterProject);
    Object.assign(model.stair,{type,turnDirection:hand,nosing:25,riserJoint:'housed',riserBoards:'closed'});
    const workshop=buildWorkshop(generateStairGeometry(model.stair),model);
    const boards=workshop.detailParts.filter(part=>part.role==='riser');
    for (const board of boards) {
      const fit=checkRiserBoardFit(board,workshop,model);
      assert.deepEqual(fit.problems,[],board.id);
      assert.equal(fit.connections.length,board.joineryFeatures.length);
      assert(fit.connections.every(c=>Math.abs(c.endClearance-model.joinery.clearance/2)<0.0001));
    }
    // A cut board from the previous nosing position must not pass with the
    // reused CAD marks of the new job. Check on the curved run as well.
    const oldBoard=boards[Math.floor(boards.length/2)];
    model.stair.nosing=-35;
    const changed=buildWorkshop(generateStairGeometry(model.stair),model);
    assert(checkRiserBoardFit(oldBoard,changed,model).problems.length>0);
    const current=changed.detailParts.find(p=>p.id===oldBoard.id);
    assert.deepEqual(checkRiserBoardFit(current,changed,model).problems,[]);
    model.cam.toolDiameter=30;
    assert(checkRiserBoardFit(current,changed,model).problems.length>0);
  }
}
console.log('Stootbordpassing op werkplaatsmerk, actuele neuspositie en gekozen groeffrees gecontroleerd.');
