import assert from 'node:assert/strict';
import { defaultEngineering, deriveEngineering } from '../src/engineering.js';
import { generateStairGeometry, starterProject } from '../src/stair.js';

// Artificial fixtures in application units. The independent reference below uses kN and m.
const span = 0.8;
const depth = 0.275;
const common = {
  ...defaultEngineering, support: 'two-edge', spanMm: 800, loadPoint: 2, deadArea: 0.5,
  gammaG: 1.35, gammaQ: 1.5, pointPatchLengthMm: 50, pointPatchWidthMm: 50,
  assessedThicknessMm: 40, effectiveWidthMm: 100, deflectionLimitMm: 4, connectionRd: 4, patchRd: 5,
  sourceProduct: 'Testproduct', productBasis: 'Testopbouw', arrangement: 'Vrij opgelegde kopranden',
  designBasis: 'Testcombinaties', connectionBasis: 'Testdetail',
};
const systems = {
  glass: {
    input: { glassE: 70000, glassStressThicknessMm: 16, glassDeflectionThicknessMm: 20,
      glassFd: 40, glassShearRd: 10, glassResidualBasis: 'Testreferentie bij breuk' },
    width: 0.1, EI: 70e6 * 0.1 * 0.020 ** 3 / 12, GA: Infinity,
  },
  grating: {
    input: { steelE: 210000, barWidthMm: 3, barHeightMm: 40, barPitchMm: 33.3, steelFd: 230, barShearRd: 4 },
    width: 0.0333, EI: 210e6 * 0.003 * 0.040 ** 3 / 12, GA: 5 / 6 * 0.003 * 0.040 * 210e6 / 3,
  },
  clt: {
    input: { cltEI: 35, cltGA: 12500, cltMRd: 5, cltVRd: 16, cltKdef: 0.6, cltPsi2: 0.3 },
    width: 0.1, EI: 35 * 0.1, GA: 12500 * 0.1,
  },
};

// Sweep point-load positions and internal cuts. Use equilibrium at each position.
function envelope(line, point) {
  let moment = 0, reaction = 0;
  for (let i = 0; i <= 100; i++) {
    const a = span * i / 100;
    const left = line * span / 2 + point * (span - a) / span;
    reaction = Math.max(reaction, left);
    for (let j = 0; j <= 100; j++) {
      const x = span * j / 100;
      moment = Math.max(moment, left * x - line * x * x / 2 - point * Math.max(x - a, 0));
    }
  }
  return { moment, reaction };
}

// Virtual work integrals M*m/EI and V*v/GA for a unit load at midspan.
function displacement(line, point, section) {
  const left = (line * span + point) / 2;
  const intervals = 4000;
  let integral = 0;
  for (let i = 0; i < intervals; i++) {
    const x = (i + 0.5) * span / intervals;
    const pastPoint = Math.max(x - span / 2, 0);
    const moment = left * x - line * x * x / 2 - point * pastPoint;
    const shear = left - line * x - (pastPoint > 0 ? point : 0);
    const unitMoment = x / 2 - pastPoint;
    const unitShear = pastPoint > 0 ? -0.5 : 0.5;
    integral += moment * unitMoment / section.EI + shear * unitShear / section.GA;
  }
  return integral * span / intervals * 1000;
}

function checkMaterials() {
  const geometry = generateStairGeometry(starterProject.stair);
  for (const [system, section] of Object.entries(systems)) {
    for (const areaLoad of [3, 300]) {
      const engineering = { ...common, ...section.input, structureType: system, loadArea: areaLoad };
      const result = deriveEngineering({ ...starterProject, engineering }, geometry).resistance;
      const area = 1.35 * 0.5 + 1.5 * areaLoad;
      const point = 1.5 * 2;
      const dead = 1.35 * 0.5;
      const q = envelope(area * section.width, 0);
      const p = envelope(dead * section.width, point);
      const gDisp = displacement(0.5 * section.width, 0, section);
      const qDisp = displacement(areaLoad * section.width, 0, section);
      const pDisp = displacement(0, 2, section);
      const creep = system === 'clt' ? 0.6 : 0;
      const expected = {
        bending: Math.max(q.moment, p.moment), shear: Math.max(q.reaction, p.reaction),
        deflection: gDisp * (1 + creep) + Math.max(qDisp, pDisp) * (1 + 0.3 * creep),
        connection: Math.max(envelope(area * depth, 0).reaction, envelope(dead * depth, point).reaction),
        patch: Math.max(1.5 * areaLoad * 0.05 ** 2, point),
      };
      for (const [id, reference] of Object.entries(expected)) {
        const actual = result.rows.find(row => row.id === id)?.demand;
        assert.ok(Math.abs(actual - reference) <= 2e-6 * Math.abs(reference),
          `${system}, q=${areaLoad}, ${id}: ${actual} versus ${reference}`);
      }
    }
  }
}

// Sample independent rays through the actual contour with zero nosing overlap.
function sampledBand(tread) {
  const [a, b] = tread.frontEdge;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const normal = tread.direction;
  const samples = 16001;
  let longest = 0, run = 0;
  for (let j = 0; j < samples; j++) {
    const fraction = (j + 0.5) / samples;
    const x = a.x + fraction * (b.x - a.x), y = a.y + fraction * (b.y - a.y);
    let exit = Infinity;
    for (let i = 0; i < tread.points.length; i++) {
      const c = tread.points[i], d = tread.points[(i + 1) % tread.points.length];
      const sx = d.x - c.x, sy = d.y - c.y;
      const determinant = normal.x * sy - normal.y * sx;
      if (Math.abs(determinant) < 1e-9) continue;
      const alongEdge = ((c.x - x) * normal.y - (c.y - y) * normal.x) / determinant;
      const alongRay = ((c.x - x) * sy - (c.y - y) * sx) / determinant;
      if (alongEdge >= -1e-9 && alongEdge <= 1 + 1e-9 && alongRay > 1e-7) exit = Math.min(exit, alongRay);
    }
    run = Number.isFinite(exit) && exit >= 170 - 1e-7 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest * length / samples;
}

function checkWinders() {
  for (const type of ['quarter_winder', 'half_winder']) {
    for (const turnDirection of ['left', 'right']) {
      for (const outerShape of ['square', 'faceted']) {
        const stair = { ...starterProject.stair, type, turnDirection, outerShape };
        const geometry = generateStairGeometry(stair);
        const noOverlap = generateStairGeometry({ ...stair, nosing: 0 });
        assert.equal(geometry.treads.length, 17);
        const measured = noOverlap.treads.map(sampledBand);
        geometry.treads.forEach((tread, i) => {
          assert.ok(Math.abs(tread.eligibleAt170Mm - measured[i]) < 0.14,
            `${type}/${turnDirection}/${outerShape}/${tread.id}: ${tread.eligibleAt170Mm} versus ${measured[i]} mm`);
        });
        const max = Math.min(...measured);
        for (const [width, status] of [[Math.floor(max), 'pass'], [Math.ceil(max), 'open'], [800, 'open']]) {
          const engineering = { ...defaultEngineering, use: 'escape', escapeFunction: 'listed',
            escapeSection: 'stair', escapePersons: 1, escapeBasis: 'Testmaat op contour', escapeWidth: 800,
            escapeWinderWidth: width };
          const model = { ...starterProject, stair, engineering, regulatory: { profile: 'NL_NEW_GENERAL', construction: 'new' } };
          assert.equal(deriveEngineering(model, geometry).escape.status, status);
        }
      }
    }
  }
}

checkMaterials();
checkWinders();
console.log('Virtual-work and reaction checks passed for 6 material/load cases; ray checks passed for 136 treads.');
