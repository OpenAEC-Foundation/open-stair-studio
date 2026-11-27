// Independent flat-end cutter reconstruction from absolute machine motion (mm).
// The index only narrows candidates. Final membership uses the swept cylinder.
import assert from 'node:assert/strict';

export function sweptTool(program, radius) {
  const cells = new Map(), cell = Math.max(10, radius * 3);
  let x, y, z, cutting = false, moves = 0;
  for (const raw of program.split('\n')) {
    const line = raw.replace(/\([^)]*\)/g, '').trim();
    if (/\bM0?3\b/.test(line)) cutting = true;
    if (/\bM0?5\b/.test(line)) cutting = false;
    if (!/[XYZ][-+.\d]/.test(line)) continue;
    assert.match(line, /^G0?[01]\s/, 'Unsupported machine move '+line);
    const words = Object.fromEntries([...line.matchAll(/([XYZ])([-+.\d]+)/g)].map(m => [m[1], Number(m[2])]));
    const a = words.X ?? x, b = words.Y ?? y, c = words.Z ?? z;
    if (Math.min(c,z) < 0 && [a,b,c,x,y,z].every(Number.isFinite)) {
      if (/^G0?0\s/.test(line)) {
        assert(a === x && b === y && c >= z, 'Rapid inside material '+line);
      } else {
        assert(cutting, 'Feed move with spindle stopped '+line);
        const segment = {x,y,z,a,b,c};
        for (let i=Math.floor((Math.min(a,x)-radius)/cell); i<=Math.floor((Math.max(a,x)+radius)/cell); i++)
          for (let j=Math.floor((Math.min(b,y)-radius)/cell); j<=Math.floor((Math.max(b,y)+radius)/cell); j++) {
            const key=i+','+j;
            if (!cells.has(key)) cells.set(key,[]);
            cells.get(key).push(segment);
          }
        moves++;
      }
    }
    [x,y,z]=[a,b,c];
  }
  assert(moves>0,'No cutting moves');
  return (u,v,w) => {
    for (const s of cells.get(Math.floor(u/cell)+','+Math.floor(v/cell)) ?? []) {
      if (Math.min(s.z,s.c)>w+1e-6) continue;
      const dx=s.a-s.x, dy=s.b-s.y, dz=s.c-s.z;
      let lo=0, hi=1;
      if (dz>0) hi=Math.min(hi,(w-s.z)/dz);
      if (dz<0) lo=Math.max(lo,(w-s.z)/dz);
      const t=Math.max(lo, Math.min(hi, ((u-s.x)*dx+(v-s.y)*dy)/(dx*dx+dy*dy || 1)));
      if ((s.x+t*dx-u)**2+(s.y+t*dy-v)**2 <= radius**2+1e-8) return true;
    }
    return false;
  };
}
