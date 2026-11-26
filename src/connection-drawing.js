import {boundsOf} from './components/solids.js';
import {elevationOf} from './stairwell.js';

export const statusNames={open:'Open',fail:'Overschreden',pass:'Voldoet'};
export const formatValue=value=>Number.isFinite(value)?value.toLocaleString('nl-NL',{maximumFractionDigits:3}):'—';
export function connectionStatus(checks) {
  if(checks.some(c=>c.status==='fail'))return 'fail';
  return checks.length&&checks.every(c=>c.status==='pass')?'pass':'open';
}

const axes=['x','y','z'];
const mid=(b,a)=>(b[a+'min']+b[a+'max'])/2;
const range=(b,a)=>b[a+'max']-b[a+'min'];
const planes=[
  {a:'x',b:'y',normal:'z',label:'Bovenaanzicht'},
  {a:'x',b:'z',normal:'y',label:'Langsaanzicht'},
  {a:'y',b:'z',normal:'x',label:'Dwarsaanzicht'}
];

// Flatten the face mesh to feature edges. Opposite winding on coplanar faces
// occurs in mirrored parts and must not reintroduce triangulation diagonals.
function featureEdges(part) {
  const edges=new Map();
  const key=p=>axes.map(a=>Math.round(p[a]*1000)).join(':');
  for (const f of part.faces) {
    let nx=0,ny=0,nz=0;
    for(let i=0;i<f.length;i++) {
      const p=f[i],q=f[(i+1)%f.length];
      nx+=(p.y-q.y)*(p.z+q.z); ny+=(p.z-q.z)*(p.x+q.x); nz+=(p.x-q.x)*(p.y+q.y);
    }
    const size=Math.hypot(nx,ny,nz);
    if(!size)continue;
    const n=[nx/size,ny/size,nz/size];
    for(let i=0;i<f.length;i++) {
      const start=f[i],end=f[(i+1)%f.length],k=[key(start),key(end)].sort().join('/');
      const prev=edges.get(k);
      if(prev) {
        const alignment=Math.abs(prev.normal.reduce((sum,v,j)=>sum+v*n[j],0));
        prev.internal=alignment>.99999;
      } else edges.set(k,{start,end,normal:n});
    }
  }
  return [...edges.values()].filter(e=>!e.internal);
}

export function connectionDrawing(assembly,well,connection) {
  const i=assembly.instance, r=i.rotation*Math.PI/180, c=Math.cos(r), s=Math.sin(r), h=elevationOf(well,i.storey);
  const local=p=>({x:(p.x-i.x)*c+(p.y-i.y)*s,y:-(p.x-i.x)*s+(p.y-i.y)*c,z:p.z-h});
  const ids=new Set(connection.partIds),focusIds=new Set(connection.focusIds??[]);
  const parts=assembly.parts.filter(p=>ids.has(p.id)).map(p=>{
    const faces=p.faces.map(f=>f.map(local)),bounds=boundsOf([{faces}]);
    return {...p,faces,bounds,focus:focusIds.has(p.id),anchor:p.fastenerType==='ANCHORBOLT'};
  });
  if(!parts.length)return null;
  const focus=parts.filter(p=>p.focus);
  const frame=boundsOf(focus.length?focus:parts);
  const anchors=parts.filter(p=>p.anchor).map(p=>{
    const a=axes.reduce((longest,k)=>range(p.bounds,k)>range(p.bounds,longest)?k:longest);
    return {id:p.id,axis:a,diameterMm:p.diameterMm,lengthMm:p.lengthMm,embedMm:p.embedMm,
      center:Object.fromEntries(axes.map(k=>[k,mid(p.bounds,k)])),number:0};
  });
  anchors.forEach((a,index)=>a.number=index+1);
  const selected=anchors.length?planes.find(p=>p.normal===anchors[0].axis):planes[1];
  const views=[selected,selected===planes[0]?planes[1]:planes[0]];
  const geometry=parts.map(p=>({...p,edges:featureEdges(p)}));
  return {parts,anchors,frame,views:views.map(plane=>projectDetail(geometry,frame,anchors,plane))};
}

function projectDetail(parts,frame,anchors,plane) {
  const {a,b}=plane,width=340,height=212,margin=38;
  const scale=Math.min((width-2*margin)/Math.max(32,range(frame,a)),(height-2*margin)/Math.max(32,range(frame,b)));
  const x=v=>width/2+(v-mid(frame,a))*scale, y=v=>height/2-(v-mid(frame,b))*scale;
  const pos=p=>x(p[a]).toFixed(2)+' '+y(p[b]).toFixed(2);
  const lines=parts.map(p=>({id:p.id,focus:p.focus,anchor:p.anchor,path:p.edges.map(e=>'M'+pos(e.start)+'L'+pos(e.end)).join('')}));
  lines.sort((p,q)=>Number(p.focus)+Number(p.anchor)-Number(q.focus)-Number(q.anchor));
  const marks=anchors.filter(m=>m.axis===plane.normal).map(m=>({x:x(m.center[a]),y:y(m.center[b]),number:m.number}));
  const series=k=>[...new Set(anchors.filter(m=>m.axis===plane.normal).map(m=>Math.round(m.center[k]*1000)/1000))].sort((v,w)=>v-w);
  const ma=series(a),mb=series(b);
  const dim=(values,k,project)=> {
    const centers=values.length>1;
    const low=centers?values[0]:frame[k+'min'],high=centers?values.at(-1):frame[k+'max'];
    return {start:project(low),end:project(high),label:formatValue(high-low)+(centers?' h.o.h.':'')};
  };
  return {...plane,lines,marks,horizontal:dim(ma,a,x),vertical:dim(mb,b,y)};
}
