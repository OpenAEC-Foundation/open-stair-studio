import { box, boundsOf, prism, tube } from './solids.js';

const n=(key,label,value,min,max,unit='mm',step=1)=>({key,label,default:value,min,max,unit,step,type:'number'});
const pick=(key,label,value,options)=>({key,label,default:value,options,type:'select'});
const material=pick('frameMaterial','Materiaal bomen en treden','timber',[['timber','Hout'],['galvanized','Verzinkt staal']]);
const portableFields=[
  n('accessHeight','Hoogte bovenzijde platform',1000,350,2800),
  n('width','Breedte buitenwerks bomen',650,350,1400),
  n('angle','Helling opgang vanaf vloer',54,35,72,'°',.1),
  n('steps','Optredes inclusief platform',5,2,16,'st.'),
  n('treadDepth','Tredebreedte in looprichting',165,65,380),
  n('stepThickness','Trede- en platformdikte',28,16,60),
  n('platformDepth','Platformdiepte',470,250,1200),
  n('rearSplay','Uitzet achtervoet buiten achtersteun',180,40,650),
  pick('guard','Steunbeugel platform','back',[['none','Zonder beugel'],['back','Rugbeugel'],['sides','Rugbeugel en zijleuningen']]),
  n('guardHeight','Hoogte beugel boven platform',720,350,1150),material
];
const ladderFields=[
  n('accessHeight','Hoogte aanlegpunt boven vloer',2500,400,6000),
  n('width','Breedte buitenwerks bomen',450,270,850),
  n('angle','Helling ladder vanaf vloer',74,55,85,'°',.1),
  n('rungs','Aantal sporten',9,2,25,'st.'),
  pick('rungShape','Doorsnede sporten','round',[['round','Ronde sport'],['flat','Vlakke trede']]),
  n('rungSize','Diameter sport of dikte trede',30,18,50),
  pick('handholds','Handgrepen nabij aanlegpunt','none',[['none','Zonder handgrepen'],['pair','Twee handgrepen aan de klimzijde']]),
  material
];
const pt=(x,y,z)=>({x,y,z}), deg=Math.PI/180;
const number=i=>String(i).padStart(2,'0');
function design(fields,input) {
  const p={...Object.fromEntries(fields.map(f=>[f.key,f.default])),...input};
  const result={parts:[],metrics:[],issues:[],guides:[]};
  for(const f of fields) {
    const v=p[f.key];
    const valid=f.type==='select'?f.options.some(([id])=>v===id):
      Number.isFinite(v)&&v>=f.min&&v<=f.max&&(f.step!==1||Number.isInteger(v));
    if(!valid) result.issues.push({level:'error',text:'Controleer de invoer voor '+f.label.toLowerCase()+'.'});
  }
  return {p,result};
}
const metric=(r,label,value,unit='mm')=>r.metrics.push({label,value,unit});
const part=(r,id,label,kind,material,faces)=>r.parts.push({id,label,kind,material,faces});

// Plumb-cut inclined stiles touch their sole over an entire horizontal face.
// The depth is measured perpendicular to the stile's centreline.
function stile(r,id,label,xAt,gradient,y,zTop,thickness,depth,mat) {
  const dx=depth*Math.hypot(1,gradient)/2, sole=15;
  function segment(z0,z1,halfDepth,halfWidth) {
    return box(-halfDepth,y-halfWidth,z0,halfDepth,y+halfWidth,z1)
      .map(f=>f.map(p=>({...p,x:p.x+xAt(p.z)})));
  }
  part(r,id,label,'member',mat,segment(sole,zTop,dx,thickness/2));
  part(r,id+'-voet','Antislipvoet '+label.toLowerCase(),'plate','rubber',segment(0,sole,dx+4,thickness/2+4));
}

function bentBar(path,normal,clipEnd) {
  const rings=path.map((p,i)=>{
    const a=path[Math.max(i-1,0)],b=path[Math.min(i+1,path.length-1)];
    const len=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    const tx=(b.x-a.x)/len,ty=(b.y-a.y)/len,tz=(b.z-a.z)/len;
    const vx=ty*normal.z-tz*normal.y,vy=tz*normal.x-tx*normal.z,vz=tx*normal.y-ty*normal.x;
    return Array.from({length:16},(_,j)=>{
      const u=12*Math.cos(j*Math.PI/8),v=12*Math.sin(j*Math.PI/8);
      const q=pt(p.x+u*normal.x+v*vx,p.y+u*normal.y+v*vy,p.z+u*normal.z+v*vz);
      return i===path.length-1 && clipEnd?clipEnd(q):q;
    });
  });
  const faces=[[...rings[0]].reverse()];
  const end=rings.at(-1);
  if(clipEnd){
    // The coped end follows the rear hoop's faceted vertical leg. Opposite
    // vertices have equal Y and X; strips between them lie on each flat.
    for(let i=0;i<8;i++){
      const indices=[i,i+1,(16-(i+1))%16,(16-i)%16];
      faces.push([...new Set(indices)].map(k=>end[k]));
    }
  } else faces.push(end);
  for(let i=1;i<rings.length;i++) for(let j=0;j<16;j++) {
    const k=(j+1)%16,a=rings[i-1],b=rings[i];
    faces.push([a[j],a[k],b[k]],[a[j],b[k],b[j]]);
  }
  return faces;
}
function hoop(r,x,half,h,top) {
  const radius=Math.min(65,half/3),path=[pt(x,-half,h)];
  for(let i=0;i<=8;i++) {
    const t=i*Math.PI/16;
    path.push(pt(x,-half+radius*(1-Math.cos(t)),top-radius+radius*Math.sin(t)));
  }
  for(let i=0;i<=8;i++) {
    const t=i*Math.PI/16;
    path.push(pt(x,half-radius+radius*Math.sin(t),top-radius*(1-Math.cos(t))));
  }
  path.push(pt(x,half,h));
  part(r,'rugbeugel','Doorlopende rugbeugel met twee bochten','railing','galvanized',bentBar(path,pt(1,0,0)));
}
function sideRail(r,id,x0,x1,y,h,top) {
  const radius=42,path=[pt(x0,y,h)];
  for(let i=0;i<=8;i++){
    const a=i*Math.PI/16;
    path.push(pt(x0+radius*(1-Math.cos(a)),y,top-radius+radius*Math.sin(a)));
  }
  path.push(pt(x1,y,top));
  const cope=q=>({...q,x:x1-Math.sqrt(Math.max(0,144-(q.y-y)**2))});
  part(r,'zijleuning-'+id,'Gebogen zijleuning '+id+' met zaagzadel','railing','galvanized',bentBar(path,pt(0,1,0),cope));
}

function portableBuild(input={}) {
  const {p,result:r}=design(portableFields,input);
  if(r.issues.length) return r;
  const h=p.accessHeight,rise=h/p.steps,th=p.stepThickness,sole=15;
  if(rise<=sole+th) {
    r.issues.push({level:'error',text:'De onderste trede heeft onvoldoende ruimte boven de voeten. Verklein het aantal optredes of de trededikte.'});
    return r;
  }
  const k=1/Math.tan(p.angle*deg),zSeat=h-th,stileWidth=32,stileDepth=80;
  const half=p.width/2, ySide=half-stileWidth/2,inside=half-stileWidth;
  const front=z=>k*z,frontDX=stileDepth*Math.hypot(1,k)/2;
  const frontEdge=front(zSeat)-frontDX, rearEdge=frontEdge+p.platformDepth;
  const rearK=-p.rearSplay/zSeat,rearDX=stileDepth*Math.hypot(1,rearK)/2;
  const rear=z=>rearEdge-rearDX+(z-zSeat)*rearK;
  for(const [id,side] of [['links',-1],['rechts',1]]) {
    const y=side*ySide;
    stile(r,'voorboom-'+id,'Voorboom '+id,front,k,y,zSeat,stileWidth,stileDepth,p.frameMaterial);
    stile(r,'steunpoot-'+id,'Achtersteunpoot '+id,rear,rearK,y,zSeat,stileWidth,stileDepth,p.frameMaterial);
    const z=.44*zSeat, x1=front(z),x2=rear(z);
    const y0=side<0?-half-5:half,y1=y0+5;
    part(r,'spreidstang-'+id,'Spreidstang '+id,'member','galvanized',box(x1-11,y0,z-11,x2+11,y1,z+11));
    for(const [end,x] of [['voor',x1],['achter',x2]]) {
      const from=pt(x,side*(half+5),z),to=pt(x,side*(half+9),z);
      part(r,'boutkop-'+id+'-'+end,'Boutkop spreidstang '+id+' '+end,'fastener','galvanized',tube(from,to,8,12));
    }
  }
  for(let i=1;i<p.steps;i++) {
    const z=i*rise,x=front(z-th/2);
    part(r,'trede-'+number(i),'Losse opstaptrede '+number(i),'tread',p.frameMaterial,
      box(x-p.treadDepth/2,-inside,z-th,x+p.treadDepth/2,inside,z));
  }
  part(r,'platform','Werkplatform','landing',p.frameMaterial,box(frontEdge,-half,zSeat,rearEdge,half,h));
  for(const [id,x] of [['voor',front(zSeat)],['achter',rear(zSeat)]]) {
    part(r,'platformregel-'+id,'Dwarsregel onder platform '+id,'member',p.frameMaterial,
      box(x-21,-inside,zSeat-40,x+21,inside,zSeat));
  }
  const crossZ=.30*zSeat,crossX=rear(crossZ);
  part(r,'achterregel','Dwarsregel achterframe','member',p.frameMaterial,box(crossX-13,-inside,crossZ-22,crossX+13,inside,crossZ+22));
  if(p.guard!=='none'){
    const x=rearEdge-26,y=half-24,top=h+p.guardHeight;
    hoop(r,x,y,h,top);
    if(p.guard==='sides') for(const [id,sign] of [['links',-1],['rechts',1]]) {
      sideRail(r,id,frontEdge+22,x,sign*y,h,top-115);
    }
  }
  const b=boundsOf(r.parts.filter(member=>member.id.endsWith('-voet')));
  metric(r,'Platformhoogte',h);metric(r,'Optrede',rise);metric(r,'Aantrede tussen opvolgende tredeassen',rise*k);
  metric(r,'Vrije tredebreedte',2*inside);metric(r,'Treden onder het platform',p.steps-1,'st.');
  metric(r,'Platformdiepte',p.platformDepth);metric(r,'Buitenwerks van voet tot voet in looprichting',b.xmax-b.xmin);
  r.guides.push({label:'Opgang en werkplatform',points:[pt(0,0,0),pt(front(zSeat),0,h),pt(rearEdge,0,h)]});
  r.issues.push({level:'info',text:'De trap is getekend in opgestelde werkstand. Draagvermogen, stabiliteit en bevestiging van de spreidstangen vragen een beoordeling van de gekozen uitvoering.'});
  return r;
}

// Extrusion of a local X-Z outline between two Y coordinates, with unchanged winding.
function sidePrism(outline,y0,y1) {
  return prism(outline.map(([x,z])=>({x,y:z})),-y1,-y0).map(f=>f.map(v=>pt(v.x,-v.z,v.y)));
}
function ladderBuild(input={}) {
  const {p,result:r}=design(ladderFields,input);
  if(r.issues.length) return r;
  const h=p.accessHeight,k=1/Math.tan(p.angle*deg),pitch=h/(p.rungs+1),run=k*h;
  if(pitch<=p.rungSize+15) {
    r.issues.push({level:'error',text:'De gekozen sportafstand laat onvoldoende ruimte tussen opeenvolgende sporten en bij de voet.'});return r;
  }
  const sideWidth=28,depth=68,half=p.width/2,inside=half-sideWidth,sideY=half-sideWidth/2;
  const dx=depth*Math.hypot(1,k)/2, axis=z=>k*z, contact=run+dx+7;
  for(const [id,sign] of [['links',-1],['rechts',1]]){
    const y=sign*sideY;
    stile(r,'ladderboom-'+id,'Ladderboom '+id,axis,k,y,h,sideWidth,depth,p.frameMaterial);
    const z=h-56;
    part(r,'aanlegblok-'+id,'Aanlegrubber '+id,'plate','rubber',sidePrism([[axis(z)+dx,z],[contact,z],[contact,h],[axis(h)+dx,h]],y-sideWidth/2,y+sideWidth/2));
    if(p.handholds==='pair'){
      const lower=h-Math.min(500,h*.65),upper=h-80,offset=dx+64;
      const grip=z=>pt(axis(z)-offset,y,z);
      part(r,'handgreep-'+id,'Handgreep klimzijde '+id,'railing','galvanized',tube(grip(lower),grip(upper),12));
      for(const [s,at] of [['laag',lower+18],['hoog',upper-18]]) {
        part(r,'handgreepbeugel-'+id+'-'+s,'Steun handgreep '+id+' '+s,'member','galvanized',
          tube(pt(axis(at)-dx,y,at),pt(grip(at).x+9,y,at),7));
      }
    }
  }
  for(let i=1;i<=p.rungs;i++) {
    const top=i*pitch,mid=top-p.rungSize/2,x=axis(mid),tag=number(i);
    if(p.rungShape==='round') part(r,'sport-'+tag,'Ronde sport '+tag,'tread',p.frameMaterial,tube(pt(x,-inside,mid),pt(x,inside,mid),p.rungSize/2,24));
    else part(r,'sport-'+tag,'Vlakke laddersport '+tag,'tread',p.frameMaterial,box(x-43,-inside,top-p.rungSize,x+43,inside,top));
  }
  metric(r,'Hoogte aanlegpunt',h);metric(r,'Standhoek vanaf horizontaal',p.angle,'°');metric(r,'Verticale sportafstand',pitch);
  metric(r,'Sportafstand langs de boom',pitch/Math.sin(p.angle*deg));metric(r,'Aantal sporten',p.rungs,'st.');
  metric(r,'Afstand voetas tot aanlegvlak',contact);metric(r,'Vrije lengte sport',2*inside);
  metric(r,'Boomlengte op hartlijn inclusief voet',Math.hypot(run,h));
  r.guides.push({label:'Aanlegvlak voor de ladderkop',points:[pt(contact,-half,h-56),pt(contact,half,h-56),pt(contact,half,h),pt(contact,-half,h),pt(contact,-half,h-56)]});
  r.issues.push({level:'info',text:'Het gemodelleerde aanlegvlak bepaalt waar de ondergrond de ladderkop opvangt. Ondergrond, borging, sportverbinding en draagvermogen vereisen projectspecifieke beoordeling.'});
  return r;
}
export const portableStair={id:'portable',label:'Losse platformtrap',fields:portableFields,build:portableBuild};
export const ladder={id:'ladder',label:'Aanlegladder',fields:ladderFields,build:ladderBuild};
