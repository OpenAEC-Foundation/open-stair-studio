import assert from 'node:assert/strict';
import {steelStair} from '../src/components/steel-stair.js';
import {createSteelPlateDxf,steelPlatePattern} from '../src/steel-plate-dxf.js';

const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} ≠ ${b}`);
const area=points=>Math.abs(points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];
},0))/2;
const input={layout:'straight',stringerStyle:'openFrame',treadType:'grating',
  risers:6,height:1080,width:900,going:240,railSide:'none',supports:'building'};
for(const finish of ['steel','galvanized']) {
  const model=steelStair.build({...input,finish});
  assert.ok(model.parts.length);
  const plates=model.parts.filter(p=>p.platePattern);
  assert.equal(plates.length,2,'one open plate per side');
  for(const plate of plates) {
    const profile=steelPlatePattern(plate),dxf=createSteelPlateDxf(plate);
    const expectedVolume=(area(profile.outer)-area(profile.hole))*profile.thickness/1e9;
    near(plate.volumeM3,expectedVolume,'3D plate equals cut area');
    near(profile.netMassKg,expectedVolume*7850,'net plate mass');
    near(profile.stockMassKg,profile.stockLength*profile.stockHeight*profile.thickness*7850/1e9,'rough plate mass');
    assert.ok(profile.stockMassKg>profile.netMassKg,'real opening reduces material');
    assert.equal(profile.cleatReferences.length,input.risers-1,'one seating reference per tread');
    const [apex,high]=profile.hole;
    for(const ref of profile.cleatReferences) {
      const overlapEnd=Math.min(ref.x1,high[0]);
      if(overlapEnd>Math.max(ref.x0,apex[0])) {
        const cutAtCleat=apex[1]+(high[1]-apex[1])*(overlapEnd-apex[0])/(high[0]-apex[0]);
        assert.ok(ref.z-40-cutAtCleat>=10-1e-7,
          `triangular opening crosses 40 mm cleat attachment at tread ${ref.tread}`);
      }
    }
    const side=plate.id.at(-1);
    for(const ref of profile.cleatReferences) {
      const cleat=model.parts.find(p=>p.id===`vlucht-1-opleghoek-${String(ref.tread).padStart(2,'0')}${side}`);
      assert.ok(cleat,'referenced welded seating angle exists');
      const vertices=cleat.faces.flat();
      near(ref.x0,Math.min(...vertices.map(v=>v.x)),'cleat start from actual solid');
      near(ref.x1,Math.max(...vertices.map(v=>v.x)),'cleat end from actual solid');
      near(ref.z+plate.platePattern.datumZ,Math.max(...vertices.map(v=>v.z)),'cleat top from actual solid');
    }
    assert.ok(dxf.includes('$INSUNITS\n70\n4'),'millimetres');
    const raw=dxf.trim().split(/\r?\n/),pairs=[];
    for(let i=0;i+1<raw.length;i+=2) pairs.push([raw[i],raw[i+1]]);
    const entities=[];
    for(let i=0;i<pairs.length;i++) if(pairs[i][0]==='0'&&['LWPOLYLINE','LINE','CIRCLE'].includes(pairs[i][1])) {
      const kind=pairs[i][1],fields=[];
      for(i++;i<pairs.length&&pairs[i][0]!=='0';i++) fields.push(pairs[i]);
      entities.push({kind,fields});i--;
    }
    const field=(entity,code)=>entity.fields.find(([k])=>k===code)?.[1];
    const polylines=entities.filter(e=>e.kind==='LWPOLYLINE').map(entity=>{
      const points=[];
      for(let i=0;i<entity.fields.length-1;i++) if(entity.fields[i][0]==='10'&&entity.fields[i+1][0]==='20')
        points.push([Number(entity.fields[i][1]),Number(entity.fields[i+1][1])]);
      return {layer:field(entity,'8'),pair:points,closed:field(entity,'70')==='1'};
    });
    assert.deepEqual(polylines.map(p=>p.layer),['OSS-PLAAT-BUITEN','OSS-PLAAT-OPENING']);
    assert.deepEqual(polylines.map(p=>p.pair),[profile.outer,profile.hole],'DXF exactly reuses 3D plate profile');
    assert.ok(polylines.every(p=>p.closed),'both cut loops closed');
    const cleatLines=entities.filter(e=>e.kind==='LINE'&&field(e,'8')==='OSS-OPLEGGING-REFERENTIE');
    assert.equal(cleatLines.length,profile.cleatReferences.length,'reference lines, no guessed holes');
    assert.ok(!entities.some(e=>e.kind==='CIRCLE'),'no unmodeled tread bolt holes');
  }
}
assert.equal(steelStair.build({...input,risers:3,height:540,going:160,stringerStyle:'openFrame'}).parts.length,0,
  'an opening too small for the cleat attachments is rejected');
console.log('Open steel plate: DXF loops, 3D area, rough/net mass and five seating references agree for both sides and finishes.');
