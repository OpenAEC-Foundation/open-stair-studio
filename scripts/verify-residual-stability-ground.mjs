import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readProject} from '../src/project.js';
import {assembleWell,readWell} from '../src/stairwell.js';

const project=readProject(JSON.parse(readFileSync(new URL('../examples/rekenvoorbeeld-trapverbindingen.oss.json',import.meta.url))));
const well=readWell(project.stairwell);
const assemblies=assembleWell(well);
const glass=assemblies.find(a=>a.instance.type==='glass');
const residual=glass.structural.checks.find(c=>c.id==='treden-rest-buiging');
const intact=glass.structural.checks.find(c=>c.id==='treden-buiging');
assert.ok(residual.demand>intact.demand);
assert.equal(residual.status,'fail');
const noReport=structuredClone(well);
noReport.instances[0].params.glassResidualBasis='';
assert.equal(assembleWell(noReport)[0].structural.checks.find(c=>c.id===residual.id).status,'open');
const three=structuredClone(well);
three.instances[0].params.layers=2;
assert.equal(assembleWell(three)[0].structural.checks.find(c=>c.id===residual.id).status,'open');

const floating=assemblies.find(a=>a.instance.type==='cantilever');
assert.ok(floating.structural.checks.find(c=>c.id==='boomloos-zijverplaatsing').demand>0);
const noStability=structuredClone(well);
noStability.instances[1].params.floatingStabilityBasis='';
assert.equal(assembleWell(noStability)[1].structural.checks.find(c=>c.id==='boomloos-zijdelings').status,'open');
for(const family of ['steel','escape']){
  const assembly=assemblies.find(a=>a.instance.type===family);
  assert.ok(assembly.structural.checks.some(c=>c.id.endsWith('-kip')&&c.demand>0));
  assert.ok(assembly.structural.checks.find(c=>c.id==='staal-totaalstabiliteit').demand>0);
}
const glassHead=glass.structural.connections.find(c=>c.id==='kop-L');
assert.equal(glassHead.ground.grade,'C30/37');
assert.ok(glass.structural.checks.find(c=>c.id==='kop-L-ondergrond-interactie').demand>1);
const steel=assemblies.find(a=>a.instance.type==='steel');
assert.equal(steel.structural.checks.find(c=>c.id==='vlucht-1-voet-L-ondergrond-trek').status,'open');
assert.throws(()=>readWell({...well,instances:[{...well.instances[0],connectionGround:{'kop-L':{...glassHead.ground,type:'invalid'}}}]}));
console.log('Restglass, stability, per-group substrate and legacy/open cases verified.');
