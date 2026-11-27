import assert from 'node:assert/strict';
import { steelStair, escapeStair } from '../src/components/steel-stair.js';

const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} vs ${b}`);
const key=p=>[p.x,p.y,p.z].map(v=>Math.round(v*1e6)).join(',');
const metric=(g,k)=>g.metrics.find(m=>m.label.startsWith(k)).value;
function closedVolume(part) {
  const edges=new Map();
  let volume=0;
  for(const f of part.faces) {
    for(let i=0;i<f.length;i++) {
      const a=key(f[i]),b=key(f[(i+1)%f.length]);assert.notEqual(a,b,part.id);
      const edge=a<b?a+'|'+b:b+'|'+a,uses=edges.get(edge)??[0,0];
      uses[a<b?0:1]++;edges.set(edge,uses);
    }
    const a=f[0];
    for(let i=1;i+1<f.length;i++) {
      const b=f[i],c=f[i+1];
      volume+=a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x);
    }
  }
  assert([...edges.values()].every(([a,b])=>a===1&&b===1),part.id+' open mesh');
  near(volume/6e9,part.volumeM3,1e-8);
  near(part.massKg,7850*part.volumeM3);
}
let count=0;
for(const type of [steelStair,escapeStair]) for(const layout of ['straight','return']) for(const treadType of ['plate','grating']) {
  const input={layout,treadType,risers:17,width:1200,going:260,height:3060};
  const g=type.build(input);
  assert(g.parts.length&&g.issues.every(i=>i.level==='info'));
  assert.equal(new Set(g.parts.map(p=>p.id)).size,g.parts.length);
  const n=layout==='return'?2:1, treads=g.parts.filter(p=>p.kind==='tread'), platforms=g.parts.filter(p=>p.kind==='landing');
  assert.equal(treads.length,17-n);assert.equal(platforms.length,n);
  const zTop=q=>Math.max(...q.faces.flat().map(v=>v.z));
  const heights=[...treads,...platforms].map(zTop).sort((a,b)=>a-b);
  heights.forEach((h,i)=>near(h,(i+1)*180));
  assert.equal(g.parts.filter(p=>p.role==='stringer').length,2*n);
  assert.equal(g.parts.filter(p=>p.role==='treadCleat').length,2*treads.length);
  for(const p of g.parts) {closedVolume(p);count++;}
  for(const m of g.parts.filter(p=>p.role==='guardRail')) {
    const index=Number(m.id.slice(-2)),prefix=m.id.replace(/mid-\d+$/,'post-');
    const posts=[index,index+1].map(i=>g.parts.find(p=>p.id===prefix+String(i).padStart(2,'0')));
    const range=(part,k)=>{const a=part.faces.flat().map(v=>v[k]);return [Math.min(...a),Math.max(...a)];};
    const xy=['x','y'].map(k=>range(m,k)),axis=xy[0][1]-xy[0][0]>xy[1][1]-xy[1][0]?'x':'y';
    const [left,right]=posts.map(p=>range(p,axis)).sort((a,b)=>a[0]-b[0]);
    const [lo,hi]=range(m,axis);near(lo,left[1]);near(hi,right[0]);
  }
  near(metric(g,'Netto staalmassa'),g.parts.reduce((sum,p)=>sum+p.massKg,0));
  const tread=treads[0],L=253,w=1200,t=5;
  if(treadType==='plate') near(tread.volumeM3,(L*t+2*t*(35-t))*w/1e9);
  else {
    // Independent area-by-layers integration of the open welded panel.
    const xBands=32+4+(Math.ceil((L-32-4)/34)-1)*3;
    const yBands=10+(Math.ceil((w-10)/100)-1)*5;
    const base=xBands*w+(L-xBands)*10,upper=xBands*w+(L-xBands)*yBands;
    near(tread.volumeM3,(base*(30-8)+upper*8)/1e9);
    assert(tread.volumeM3<L*w*30/1e9*.45);
  }
}
for(const railSide of ['left','right','none','both']) {
  const g=escapeStair.build({railSide,supports:'building'});
  assert(!g.parts.some(p=>p.kind==='column'));
  for(const p of g.parts.filter(p=>p.id.startsWith('vlucht')&&['handrail','guardRail','guardPost'].includes(p.role))) {
    assert(railSide==='both'||p.id.includes('-hek-'+(railSide==='left'?'L':'R')+'-'));
  }
  if(railSide==='none') assert(!g.parts.some(p=>p.kind==='railing'||p.role==='guardPost')&&g.issues.some(i=>i.level==='warning'));
  const sides=railSide==='both'?2:railSide==='none'?0:1;
  near(metric(g,'Vrije doorgangsbreedte'),1200-sides*(22+42.4/2));
}
const short={layout:'straight',treadType:'grating',risers:6,height:1080,width:900,going:240,railSide:'none'};
const open=steelStair.build({...short,stringerStyle:'openFrame'});
const closed=steelStair.build({...short,stringerStyle:'solid'});
assert.equal(open.parts.filter(p=>p.role==='gratingTread').length,5,'five grating treads');
assert(!open.parts.some(p=>p.kind==='railing'||p.role==='guardPost'));
for(const p of open.parts) closedVolume(p);
for(const side of ['L','R']) {
  const id='vlucht-1-wang-'+side;
  const frame=open.parts.find(p=>p.id===id),plate=closed.parts.find(p=>p.id===id);
  assert(frame.faces.length>plate.faces.length,'triangular opening is modeled in the side plate');
  assert(frame.volumeM3<frame.platePattern.stockMassKg/7850,'open frame uses less than its rectangular plate blank');
  assert(open.structural.checks.filter(c=>c.id.startsWith(id+'-')&&
    ['-buiging','-doorbuiging','-kip','-doorsnede'].some(s=>c.id.endsWith(s)))
    .every(c=>c.status==='open'),'solid plate checks cannot certify the perforated frame');
}
assert.equal(steelStair.build({...short,stringerStyle:'openFrame',layout:'return'}).parts.length,0);
for(const invalid of [{railSide:'maybe'},{going:-5},{risers:16.2},{height:600,risers:36},{escapeBasis:31}])
  assert.equal(escapeStair.build(invalid).parts.length,0);
console.log(`Staal- en vluchttrappen: ${count} gesloten onderdelen, bordes- en tredepeilen, open roostermaat/massa, kokerprofielen, opleghoeken, vier hekwerkstanden en ongeldige invoer gecontroleerd.`);
