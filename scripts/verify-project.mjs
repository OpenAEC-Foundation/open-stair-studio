import assert from 'node:assert/strict';
import { calculateEstimate, starterProject } from '../src/stair.js';
import { draftKey, editSession, isDirty, parseInput, readProject, redoSession, restoreDraft, saveDraft, startSession, undoSession } from '../src/project.js';

const project = structuredClone(starterProject);
project.project.name = 'Renovatie ƒ · test';
project.stair.mark = 'TR-99';
project.project.designer = 'Werkplaats';
project.metadata = { reference: 'WVB-124' };
assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project);
const blank = readProject({...project, stairEnabled:false, stair:null, project:{...project.project,name:'Leeg project'}});
assert.equal(blank.stairEnabled,false);
assert.equal(blank.project.name,'Leeg project');
assert.equal(editSession(startSession(blank),'stair','type','straight').model.stairEnabled,true);
assert.throws(()=>readProject({...project,stairEnabled:'false'}));
const legacy = readProject({ project: { name: 'Archief' }, stair: project.stair });
assert.equal(legacy.building.upperLandingWidth, null);
assert.equal(legacy.regulatory.profile, 'UNSET');
assert.equal(legacy.project.number, '');
assert.equal(legacy.joinery.type, 'none');
assert.equal(project.joinery.type, 'housed');
assert.equal(readProject({ ...project, version: '0.1.0' }).version, starterProject.version);
const archive = structuredClone(project);
archive.version = '0.2.0';
archive.schema = project.schema.replace(/0\.\d+\.json$/, '0.2.json');
delete archive.joinery;
delete archive.cam;
delete archive.treadCam;
delete archive.estimate.treadStock;
for (const key of ['outerShape', 'windersPerQuarter', 'turnDirection', 'entrySteps']) delete archive.stair[key];
const migrated = readProject(archive);
assert.equal(migrated.stair.wel, null);
const twoQuarter = editSession(startSession(migrated), 'stair', 'type', 'two_quarter_winder');
const withWel = editSession(twoQuarter, 'stair', 'wel', parseInput('stair', 'wel', '45'));
const shifted = editSession(withWel, 'stair', 'nosing', parseInput('stair', 'nosing', '-15'));
const resized = editSession(shifted, 'stair', 'middleSteps', parseInput('stair', 'middleSteps', '3'));
assert.deepEqual(readProject(JSON.parse(JSON.stringify(resized.model))), resized.model);
assert.equal(undoSession(shifted).model.stair.wel, 45);
assert.equal(undoSession(shifted).model.stair.nosing, migrated.stair.nosing);
assert.equal(parseInput('stair', 'wel', '0'), 0);
assert.throws(() => parseInput('stair', 'wel', '-1'));
assert.throws(() => parseInput('stair', 'middleSteps', '1.5'));
const archivedClosed = structuredClone(archive);
archivedClosed.stair.riserBoards='closed';
delete archivedClosed.stair.riserJoint;
delete archivedClosed.stair.riserGrooveDepth;
assert.equal(readProject(archivedClosed).stair.riserJoint,'butt');
const customJoint = {...project.stair,riserJoint:'housed',riserGrooveDepth:6.5};
for (const type of ['quarter_winder','half_winder']) {
  const session = editSession(startSession({...project,stair:customJoint}), 'stair','type',type);
  assert.equal(session.model.stair.riserJoint,'housed');
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(session.model))).stair,session.model.stair);
  const legacy = {...project,stair:{...project.stair,type,riserPosition:'manual',riserJoint:'butt'}};
  assert.equal(readProject(legacy).stair.riserPosition,'auto');
  assert.equal(readProject(legacy).stair.riserJoint,'butt');
}
assert.deepEqual(readProject({...project,stair:customJoint}).stair,customJoint);
assert.equal(migrated.joinery.type, 'none');
assert.equal(readProject({ ...archive, schema: project.schema.replace(/0\.\d+\.json$/, '0.3.json'), version: '0.3.0' }).joinery.type, 'none');
const housedArchive = structuredClone(project);
housedArchive.version = '0.4.0';
housedArchive.schema = project.schema.replace(/0\.\d+\.json$/, '0.4.json');
delete housedArchive.treadCam;
delete housedArchive.estimate.treadStock;
housedArchive.cam.toolDiameter = 8;
const upgraded = readProject(housedArchive);
assert.equal(upgraded.joinery.type, 'housed');
assert.equal(upgraded.cam.toolDiameter, 8);
assert.equal(upgraded.estimate.treadStock, 'board');
assert.deepEqual(upgraded.treadCam, starterProject.treadCam);
const priorBoardModel=structuredClone(project);
delete priorBoardModel.riserCam;
delete priorBoardModel.riserDetailCam;
assert.deepEqual(readProject(priorBoardModel).riserCam,starterProject.riserCam);
assert.deepEqual(readProject(priorBoardModel).riserDetailCam,starterProject.riserDetailCam);
const boardCamChange=editSession(startSession(project),'riserCam','toolDiameter',4);
assert.equal(readProject(JSON.parse(JSON.stringify(boardCamChange.model))).riserCam.toolDiameter,4);
assert.deepEqual(boardCamChange.model.cam,project.cam);
assert.deepEqual(boardCamChange.model.riserDetailCam,project.riserDetailCam);
assert.deepEqual(undoSession(boardCamChange).model.riserCam,project.riserCam);
assert.throws(()=>parseInput('riserCam','toolDiameter','0'));
assert.equal(parseInput('treadCam', 'stockMargin', '13.5'), 13.5);
assert.throws(() => parseInput('treadCam', 'fluteLength', '-20'));
assert.throws(() => parseInput('estimate', 'treadStock', 'unknown'));
const oldEgress = structuredClone(housedArchive);
delete oldEgress.engineering;
oldEgress.regulatory.profile = 'NL_NEW_EGRESS';
assert.equal(readProject(oldEgress).engineering.use, 'escape-only');
let variant = editSession(startSession(project), 'engineering', 'structureType', 'glass');
variant = editSession(variant, 'engineering', 'productBasis', 'Testglas G-01');
variant = editSession(variant, 'engineering', 'spanMm', 950);
variant = editSession(variant, 'engineering', 'use', 'escape');
variant = editSession(variant, 'engineering', 'structureType', 'clt');
assert.equal(variant.model.engineering.productBasis, '');
assert.equal(variant.model.engineering.spanMm, null);
assert.equal(variant.model.engineering.use, 'escape');
variant = editSession(variant, 'engineering', 'productBasis', 'Testpaneel C-02');
const savedVariant = JSON.parse(JSON.stringify(variant.model));
assert.deepEqual(readProject(savedVariant), savedVariant);
variant = editSession(startSession(readProject(savedVariant)), 'engineering', 'structureType', 'glass');
assert.equal(variant.model.engineering.spanMm, 950);
assert.equal(variant.model.engineering.productBasis, 'Testglas G-01');
assert.equal(undoSession(variant).model.engineering.productBasis, 'Testpaneel C-02');
assert.throws(() => readProject({...savedVariant, engineeringVariants:{glass:{spanMm:-1}}}));
for (const [section, key, value] of [['joinery','type','unknown'], ['joinery','depth',0], ['joinery','clearance',-1], ['cam','stepoverPercent',100], ['cam','cornerMode','invalid']]) {
  assert.throws(() => readProject({ ...project, [section]: { ...project[section], [key]: value } }));
}
assert.equal(migrated.stair.outerShape, 'square');
assert.equal(migrated.stair.type, archive.stair.type);
assert.equal(migrated.project.number, archive.project.number);
const winding = structuredClone(migrated);
Object.assign(winding.stair, { type: 'half_winder', turnDirection: 'right', outerShape: 'faceted', windersPerQuarter: 5, entrySteps: 1 });
assert.deepEqual(readProject(JSON.parse(JSON.stringify(winding))), winding);
for (const [key, invalid] of [['entrySteps', '-2'], ['windersPerQuarter', '2.5'], ['turnDirection', 'reverse'], ['outerShape', 'unknown']]) {
  assert.throws(() => parseInput('stair', key, invalid));
}
for (const invalid of [
  null, { project: {}, stair: [] }, { project: {}, stair: {} },
  { ...project, units: 'm' }, { ...project, version: '99.0.0' }, { ...project, schema: 'unsupported' },
  { ...project, building: null }, { ...project, project: { name: {} } },
  { ...project, regulatory: { profile: 'UNKNOWN' } },
  ...[{ type: 'UNKNOWN' }, { going: 'abc' }, { risers: 3.5 }, { floorHeight: Infinity }].map(change => ({
    ...project, stair: { ...project.stair, ...change }
  })),
  { ...project, estimate: { marginPercent: 100 } }
]) assert.throws(() => readProject(invalid));
assert.equal(parseInput('regulatory', 'headroom', ''), null);
assert.equal(parseInput('building', 'openingWidth', ''), null);
assert.equal(parseInput('estimate', 'laborHours', '0'), 0);
assert.throws(() => parseInput('stair', 'risers', '2.5'));
assert.throws(() => parseInput('estimate', 'wasteFactor', '0.75'));
assert.throws(() => parseInput('estimate', 'timberPricePerM3', ''));
assert.throws(() => parseInput('estimate', 'marginPercent', '100'));

const initial = startSession(project);
let session = editSession(initial, 'stair', 'mark', 'TR-A');
assert.equal(initial.model.stair.mark, 'TR-99');
assert.equal(isDirty(session), true);
assert.equal(editSession(session, 'stair', 'mark', 'TR-A'), session);
assert.equal(isDirty(undoSession(session)), false);
assert.equal(redoSession(undoSession(session)).model.stair.mark, 'TR-A');
assert.equal(editSession(undoSession(session), 'project', 'name', 'Ander project').future.length, 0);
for (let i = 0; i < 60; i++) session = editSession(session, 'project', 'name', `Project ${i}`);
assert.equal(session.history.length, 50);

const entries = new Map();
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
assert.equal(restoreDraft(storage), null);
saveDraft(storage, session);
assert.equal(isDirty(restoreDraft(storage)), true);
assert.equal(restoreDraft(storage).model.project.name, 'Project 59');
const opened = startSession(readProject(project));
saveDraft(storage, opened);
assert.deepEqual(restoreDraft(storage), opened);
storage.setItem(draftKey, JSON.stringify(project));
assert.equal(isDirty(restoreDraft(storage)), true);
storage.setItem(draftKey, '{');
assert.throws(() => restoreDraft(storage));
assert.equal(storage.getItem(draftKey), '{');
assert.throws(() => saveDraft({ setItem() { throw Error('quota'); } }, session));
assert.equal(session.model.project.name, 'Project 59');

const priced = calculateEstimate({ volume: 0.5 }, { timberPricePerM3: 2000, wasteFactor: 1.2, laborHours: 8, laborRate: 50, overheadPercent: 10, marginPercent: 20 });
assert.equal(priced.materials, 1200);
assert.equal(priced.labor, 400);
assert.equal(priced.overhead, 160);
assert.equal(priced.costPrice, 1760);
assert.equal(priced.indicativePrice, 2200);
assert.equal(priced.margin / priced.indicativePrice, 0.2);
console.log('Project I/O, legacy recovery, input ranges, history, autosave and estimate checks passed.');
