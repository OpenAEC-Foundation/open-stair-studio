import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterProject, generateStairGeometry, stairFamilies } from '../src/stair.js';
import { buildHousings } from '../src/housings.js';
import { defaultCam, compileHousingJob, writeLinuxCnc, writeHousingDxf, housingFileStem } from '../src/housing-cam.js';

const dirIndex = process.argv.indexOf('--fixtures');
const fixtureDir = dirIndex >= 0 ? process.argv[dirIndex+1] : undefined;
if (fixtureDir) mkdirSync(fixtureDir,{recursive:true});
let jobCount = 0, pocketCount = 0;
const examples = [];
for (const family of stairFamilies) {
  const hands = family.winder ? ['left','right'] : ['left'];
  const outlines = family.winder ? ['square','faceted'] : ['square'];
  for (const turnDirection of hands) for (const outerShape of outlines) {
    const geometry = generateStairGeometry({...starterProject.stair,type:family.id,turnDirection,outerShape});
    const housings = buildHousings(geometry);
    assert.equal(housings.issues.length,0);
    for (const beam of housings.beams.filter(b=>b.pockets.length)) {
      for (const cornerMode of ['rounded','dogbone']) {
        const cam = {...defaultCam,cornerMode};
        assert(beam.frame.xAxis.z >= -1e-8,'stock X+ runs uphill from the low stair end');
        const job = compileHousingJob(beam,cam);
        const nc = writeLinuxCnc(job);
        assert(nc.endsWith('M5\nM2\n'));
        assert.match(nc,/^G21 G17 G90 G94 G97 G40 G49 G80 G61 G54\nG0 Z[\d.]+\nM3 S\d+/m);
        assert.equal(job.blocks,nc.trimEnd().split('\n').length);
        assert.equal(job.operations.length,beam.pockets.length);
        let x, y, z, spindle = false, opIndex = -1;
        const plungeDepths = job.operations.map(()=>[]);
        for (const line of nc.split('\n')) {
          if (line.startsWith('(')) {
            if (opIndex+1 < job.operations.length && line.startsWith('(Pocket '+job.operations[opIndex+1].id+' /')) opIndex++;
            continue;
          }
          if (line.startsWith('M3 ')) spindle=true;
          if (line==='M5') spindle=false;
          if (!/^G[01] /.test(line)) continue;
          const words = Object.fromEntries([...line.matchAll(/([A-Z])(-?[\d.]+)/g)].map(m=>[m[1],Number(m[2])]));
          const rapid = words.G===0;
          if ('X' in words || 'Y' in words) {
            assert(!('Z' in words));
            if (rapid) assert.equal(z,cam.safeZ,'all rapids clear the fixture');
            x=words.X??x; y=words.Y??y;
            assert(Number.isFinite(x) && Number.isFinite(y));
            if (!rapid) {
              assert(spindle && z<0 && opIndex>=0);
              // Check emitted coordinates, with the radius of the physical cutter.
              for (const plane of beam.stockPlanes) {
                const { a,b,c,d } = plane;
                const reach = Math.hypot(a,b)*cam.toolDiameter/2+Math.max(0,c*z);
                assert(a*x+b*y+reach <= d+.0002,'tool stays inside the physical mitre and side faces');
              }
            }
          } else if ('Z' in words) {
            if (rapid) assert.equal(words.Z,cam.safeZ);
            else {
              assert(spindle && opIndex>=0 && words.Z<0 && z===cam.safeZ);
              assert.equal(words.F,cam.plungeFeed);
              plungeDepths[opIndex].push(words.Z);
            }
            z=words.Z;
          }
        }
        assert.equal(z,cam.safeZ);
        for (const [i,depths] of plungeDepths.entries()) {
          assert(depths.length>0);
          assert.equal(depths.at(-1), -beam.pockets[i].depth);
          assert(depths.every((z,n)=>(depths[n-1]??0)-z <= cam.stepDown+.0001));
        }
        if (fixtureDir) {
          const stem = [family.id,turnDirection,outerShape,beam.id,cornerMode].join('-');
          writeFileSync(join(fixtureDir,stem+'.ngc'),nc);
          writeFileSync(join(fixtureDir,stem+'.json'),JSON.stringify({beam,cam}));
        }
        if (!examples.length) examples.push(beam);
        jobCount++; pocketCount+=beam.pockets.length;
      }
    }
  }
}
const beam = examples[0];
assert.match(writeHousingDxf(beam),/OSS-POCKET-D12p000/);
assert.match(writeHousingDxf(beam,{number:'P99',revision:'A',stairMark:'T1'}),/P99_rev-A_T1_/);
assert.throws(()=>writeHousingDxf({...beam,pockets:[]}),/met infrezingen/);
assert.throws(()=>writeHousingDxf({...beam,issues:[{level:'error',message:'onvolledige geometrie'}]}),/onvolledige geometrie/);
// Read O-word definitions and their calls independently, check the modal Z
// for every expanded cut and compare each sub's coordinates to an explicit
// single-pass program. No multi-million-line expanded string is allocated.
const fineCam = {...defaultCam,toolDiameter:1,stepoverPercent:10,stepDown:0.1};
const fine = compileHousingJob(beam,fineCam);
assert(fine.expandedBlocks > 1e6 && fine.blocks <= 100000 && fine.subroutines);
const lines = writeLinuxCnc(fine).trimEnd().split('\n');
assert.equal(lines.length,fine.blocks);
const definitions = new Map();
let defining = null, machining = -1, z = null, safe = false, positioned = false, calls = 0;
for (const line of lines) {
  const o = line.match(/^o(\d+) (sub|endsub|call)$/);
  if (o) {
    const [,label,action] = o;
    if (action==='sub') {
      assert(!definitions.has(label) && !defining);
      defining = label;
      definitions.set(label,[]);
    } else if (action==='endsub') {
      assert.equal(label,defining);
      defining=null;
    } else {
      assert(!defining && machining >= 0 && positioned && Math.abs(z - fine.operations[machining].levels[calls]) < .00006);
      assert.equal(label,String(1000+machining));
      calls++;
      positioned=false;
    }
  } else if (defining) {
    assert(/^G1 X[\d.-]+ Y[\d.-]+( F[\d.]+)?$/.test(line));
    definitions.get(defining).push(line);
  } else if (line.startsWith('(Pocket ')) {
    if (machining >= 0) assert.equal(calls,fine.operations[machining].levels.length);
    machining++; calls=0;
    const op = fine.operations[machining];
    const one = compileHousingJob(beam,{...fineCam,stepDown:15},{},op.id);
    assert(!one.subroutines);
    const explicitPath = writeLinuxCnc(one).split('\n').filter(l=>l.startsWith('G1 X'));
    assert.deepEqual(definitions.get(String(1000+machining)),explicitPath);
  } else if (line.startsWith('G0 Z')) {
    safe = Number(line.slice(4)) === fineCam.safeZ;
  } else if (line.startsWith('G0 X')) {
    assert(safe);
    positioned=true;
  } else if (line.startsWith('G1 Z')) {
    assert(safe && positioned);
    z=Number(line.slice(4).split(' ')[0]);
    safe=false;
  }
}
assert.equal(machining+1,beam.pockets.length);
assert.equal(calls,fine.operations[machining].levels.length);
const rect = (x,y,width,height)=>[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
const large = {...beam,outline:rect(0,0,1000,1100),stockPlanes:[{a:0,b:0,c:-1,d:40}],
  pockets:Array.from({length:7},(_,i)=>({id:'p-'+i,treadId:'t-'+i,depth:12,contour:rect(10+i*100,10,40,1000)}))};
assert.throws(()=>compileHousingJob(large,fineCam),/bestandsregels.*Alleen geselecteerd huis/);
const partial = compileHousingJob(large,fineCam,{},'p-3');
assert.deepEqual(partial.operations.map(p=>p.id),['p-3']);
assert.equal(partial.blocks,writeLinuxCnc(partial).trimEnd().split('\n').length);
const badNeighbours = structuredClone(large);
badNeighbours.pockets[0].contour = badNeighbours.pockets[1].contour;
assert.throws(()=>compileHousingJob(badNeighbours,fineCam,{},'p-3'),/raken elkaar/);
const long = 'Z'.repeat(300);
const wholeFile = housingFileStem({id:long+'-BL-01'},{number:long,revision:long,stairMark:long});
const oneFile = housingFileStem({id:long+'-BL-01'},{number:long,revision:long,stairMark:long},long+'-TD-11');
assert(wholeFile !== oneFile && oneFile.length < 240 && oneFile.includes('-BL-01_') && oneFile.endsWith('-TD-11'));
for (const cam of [{toolDiameter:41},{fluteLength:4},{cutFeed:50,plungeFeed:100},{stepDown:NaN}]) {
  assert.throws(()=>compileHousingJob(beam,{...defaultCam,...cam}));
}
const synthetic = {
  ...beam, stockPlanes:[{a:1,b:0,c:-.3,d:110}],
  outline:[{x:0,y:0},{x:120,y:0},{x:120,y:120},{x:0,y:120}],
  pockets:[{id:'corner',treadId:'A',depth:12,contour:[{x:10,y:10},{x:107,y:10},{x:107,y:90},{x:10,y:90}]}]
};
assert.throws(()=>compileHousingJob(synthetic),/verstek/);
const narrow = structuredClone(synthetic);
narrow.pockets[0].contour[2].y = narrow.pockets[0].contour[3].y = 14;
assert.throws(()=>compileHousingJob(narrow),/past niet/);
const malicious = {number:'test)\nM30\n('};
assert(!writeLinuxCnc(compileHousingJob(beam, defaultCam, malicious)).includes('\nM30\n'));
const injected = structuredClone(beam);
injected.pockets[0].id = 'DEBUG,#1)\r\nM5\n(LOGOPEN,path)';
const protectedNc = writeLinuxCnc(compileHousingJob(injected,defaultCam,{number:'PRINT,test'+long}));
assert.equal(protectedNc.split('\n').filter(l=>l === 'M5').length,1);
for (const line of protectedNc.split('\n')) {
  assert(line.length < 250);
  if (line.startsWith('(')) {
    assert(/^\([^()]*\)$/.test(line));
    assert(!/^\((debug|print|msg|log|abort|probe)/i.test(line));
  }
}
console.log(`Compacte LinuxCNC-baan: ${fine.expandedBlocks} geëxpandeerde blokken in ${fine.blocks} regels. Afzonderlijk huis na volledige wangcontrole: ${partial.blocks} regels.`);
console.log(`CAM: ${jobCount} opspanningen, ${pocketCount} huizen; 12 trapvarianten met ronde hoeken en dogbones gecontroleerd.`);
