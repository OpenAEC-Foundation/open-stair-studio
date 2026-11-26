import assert from 'node:assert/strict';
import { generateStairGeometry, stairFamilies, starterProject } from '../src/stair.js';
import { buildStairDetails, newDesignDetails } from '../src/stair-details.js';

const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<=e,`${a} vs ${b}`);
const key=p=>[p.x,p.y,p.z].map(n=>Math.round(n*1e6)).join(',');
const geometry=(type,timberDetail,extra={})=>{
  const s={...starterProject.stair,...newDesignDetails,type,timberDetail,riserBoards:'none',...extra};
  return buildStairDetails(s,generateStairGeometry(s,{projectIsometric:false}));
};
let pieces=0;
for(const {id} of stairFamilies.filter(f=>!f.component)) for(const style of ['classic','modern']) {
  const parts=geometry(id,style);
  assert.deepEqual(new Set(parts.map(p=>p.role)),new Set(['newel','handrail','baluster']));
  assert.equal(parts.length,new Set(parts.map(p=>p.id)).size);
  for(const p of parts) {
    assert(!p.fabricationIssue,p.id);
    const edges=new Map(),origin=p.faces[0][0];
    let volume=0;
    for(const f of p.faces) {
      for(let i=0;i<f.length;i++) {
        const a=key(f[i]),b=key(f[(i+1)%f.length]);
        assert.notEqual(a,b);
        const edge=a<b?a+';'+b:b+';'+a,uses=edges.get(edge)??[0,0];
        uses[a<b?0:1]++;edges.set(edge,uses);
      }
      for(let i=1;i+1<f.length;i++) volume+=dot(sub(f[0],origin),cross(sub(f[i],origin),sub(f[i+1],origin)))/6;
    }
    near(volume/1e9,p.volumeM3,1e-10);
    assert(p.volumeM3>0&&p.volumeM3<=p.stockVolumeM3+1e-10);
    assert([...edges.values()].every(([a,b])=>a===1&&b===1),p.id);
    if(p.role==='handrail') {
      if(p.railPiece==='straight') {
        const xy=p.profileContour;
        const area=xy.reduce((a,v,i)=>a+v.x*xy[(i+1)%xy.length].y-v.y*xy[(i+1)%xy.length].x,0)/2;
        near(area*p.lengthMm/1e9,p.volumeM3,1e-10);
      } else near(p.lengthMm,p.radiusMm*p.bendAngleDeg*Math.PI/180);
    } else {
      const rail=parts.find(q=>q.id===p.supportId),start=rail.axisPath[0],end=rail.axisPath[1],dir=sub(end,start);
      const l=Math.hypot(...dir),t=dir.map(n=>n/l),side=[-t[1],t[0],0].map(v=>v/Math.hypot(t[0],t[1]));
      const up=cross(t,side),bottomY=rail.profileContour[0].y,halfWidth=rail.profileContour[0].x;
      // Every corner of the scribed head must bear on the flat underside, and
      // be between the two actual saw cuts of the selected rail.
      for(const corner of p.faces[1]) {
        const d=sub(corner,start);
        near(dot(d,up),bottomY);
        assert(Math.abs(dot(d,side))<=halfWidth+1e-6);
        assert(dot(d,t)>=-1e-6&&dot(d,t)<=l+1e-6,p.id);
      }
      assert(p.profileStations.length>=8);
    }
    pieces++;
  }
  for(const side of ['L','R']) {
    const chain=parts.filter(p=>p.role==='handrail'&&p.id.includes('-LN-'+side+'-'));
    for(let j=1;j<chain.length;j++) {
      const end=chain[j-1].faces[1].map(key).sort(),start=chain[j].faces[0].map(key).sort();
      assert.deepEqual(end,start,chain[j].id);
    }
  }
}
for(const outerShape of ['square','faceted']) {
  const left=geometry('half_winder','classic',{outerShape,turnDirection:'left',railSide:'left'});
  const right=geometry('half_winder','classic',{outerShape,turnDirection:'right',railSide:'right'});
  assert.equal(left.length,right.length);
  left.forEach((p,i)=>{near(p.volumeM3,right[i].volumeM3,1e-10);near(p.lengthMm,right[i].lengthMm);});
}
const custom=geometry('straight','modern',{railSide:'left',handrailWidth:100,handrailDepth:94,balusterWidth:60,newelWidth:121,balusterPitch:82});
near(custom.find(p=>p.role==='newel').widthMm,121);
near(custom.find(p=>p.role==='baluster').widthMm,60);
near(custom.find(p=>p.role==='handrail').stockWidthMm,100);
assert.deepEqual(geometry('quarter_winder','classic',{railSide:'none'}),[]);
console.log(`Houten balustrades: ${pieces} gesloten delen, 6 families × 2 profielen; werkelijk opgelegde kopvlakken, gespiegelde halfslag, wrongstukaansluitingen en ruwvolumes gecontroleerd.`);
