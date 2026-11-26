import earcut from 'earcut';
import { box, tube } from './solids.js';
import { glassDesignFields, floatingDesignFields, designGlass, designFloating } from './glass-design.js';

const measure=(key,label,value,min,max,unit='mm',step=1)=>({key,label,default:value,min,max,unit,step,type:'number'});
const choice=(key,label,value,options)=>({key,label,default:value,options,type:'select'});
const layout=[measure('risers','Optredes inclusief aankomst',16,4,40,'st.'),
  measure('width','Breedte trede en bordes',1000,550,1800),measure('going','Aantrede',260,180,380),
  measure('landingDepth','Diepte aankomstbordes',900,450,1600),measure('railHeight','Handregel boven de neuslijn',980,750,1350)];
const glassFields=[...layout,measure('layers','Glasplaten per trede of bordes',3,2,5,'st.'),
  measure('ply','Dikte per glasplaat',10,6,20),measure('film','Dikte lamineerfolie',1.52,.38,3.04,'mm',.01),
  choice('finish','Loopvlakafwerking','frit',[['frit','Keramische zeefdrukstroken aan de neus'],['plain','Helder, afwerking nader te bepalen']]),
  choice('carrier','Uitvoering trapbomen','glass',[['glass','Gelaagde glazen zaagtandwang'],['steel','Stalen zaagtandwang']]),
  measure('carrierDepth','Hoogte wang onder trede-einde',180,95,320),
  choice('guard','Glazen balustrade','both',[['both','Beide zijden'],['left','Links bij stijgen'],['right','Rechts bij stijgen'],['none','Zonder balustrade']]),...glassDesignFields];
const floatingFields=[...layout,measure('thickness','Dikte houten trede',100,75,160),
  measure('armHeight','Hoogte stalen koker',50,30,100),measure('armWidth','Breedte stalen koker',40,25,75),
  measure('armWall','Wanddikte stalen koker',4,2,10),measure('tipCover','Hout voorbij de blinde uitsparing',36,15,100),
  measure('wallGap','Voeg tussen wandplaat en trede',12,8,40),measure('anchorEmbed','Inbedding wandankers',110,40,240),
  choice('wallSide','Draagwand bij stijgen','right',[['right','Rechts'],['left','Links']]),
  choice('guard','Leuning en balustrade','wall',[['wall','Handregel langs draagwand'],['free','Glazen balustrade aan vrije zijde'],['both','Wandhandregel en glazen balustrade'],['none','Zonder leuning']]),
  measure('armWeldLeg','Beenlengte rondomlopende hoeklas',4,2,8),...floatingDesignFields];
const P=(x,y,z)=>({x,y,z});
const mark=i=>String(i+1).padStart(2,'0');
const area=loop=>loop.reduce((v,[x,z],i)=>{const [u,w]=loop[(i+1)%loop.length];return v+x*w-u*z;},0)/2;
const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];

// Extrusion normal to the wall; interior contours are actual through-holes.
function extrudeXZ(outline,y0,y1,holes=[]) {
  const loops=[outline,...holes].map((r,i)=>(area(r)>0)===(i===0)?r:r.toReversed());
  const coords=loops.flat(),lo=coords.map(([x,z])=>P(x,y0,z)),hi=coords.map(([x,z])=>P(x,y1,z));
  let n=0;
  const holeStarts=loops.slice(0,-1).map(r=>n+=r.length);
  const idx=earcut(coords.flat(),holeStarts),faces=[];
  for(let j=0;j<idx.length;j+=3) {
    const tri=idx.slice(j,j+3);
    faces.push(tri.map(k=>lo[k]),tri.toReversed().map(k=>hi[k]));
  }
  let base=0;
  for(const loop of loops) {
    for(let i=0;i<loop.length;i++) {
      const a=base+i,b=base+(i+1)%loop.length;
      faces.push([lo[a],hi[a],hi[b],lo[b]]);
    }
    base+=loop.length;
  }
  return faces;
}
function bandXZ(x0,x1,z0,z1,depth,y0,y1) {
  return extrudeXZ([[x0,z0],[x1,z1],[x1,z1+depth],[x0,z0+depth]],y0,y1);
}
const circle=(x,z,r)=>Array.from({length:12},(_,i)=>[x+r*Math.cos(i*Math.PI/6),z+r*Math.sin(i*Math.PI/6)]);

function begin(fields,input) {
  const p={height:2880,...Object.fromEntries(fields.map(f=>[f.key,f.default])),...input};
  const parts=[],metrics=[],issues=[],guides=[],result={parts,metrics,issues,guides};
  for(const f of fields) {
    const value=p[f.key];
    if(f.type==='select'?!f.options.some(([v])=>v===value):f.type==='text'?typeof value!=='string'||value.length>160:!Number.isFinite(value)||value<f.min||value>f.max||
      (f.step===1&&!Number.isInteger(value))) issues.push({level:'error',text:'Controleer '+f.label.toLowerCase()+'.'});
  }
  if(!Number.isFinite(p.height)||p.height<=0||p.height>10000) issues.push({level:'error',text:'Geef een vloerverschil tussen 0 en 10.000 mm op.'});
  const rise=p.height/p.risers,run=(p.risers-1)*p.going,end=run+p.landingDepth;
  const add=(id,label,kind,material,faces,properties)=>parts.push({id,label,kind,material,faces,...properties});
  const metric=(label,value,unit='mm')=>metrics.push({label,value,unit});
  const stations=Array.from({length:Number.isInteger(p.risers)&&p.risers>=4&&p.risers<=40?p.risers:0},(_,i)=>({i,
    x:i*p.going,d:i===p.risers-1?p.landingDepth:p.going-5,z:(i+1)*rise,
    prefix:i===p.risers-1?'bordes':'trede-'+mark(i),kind:i===p.risers-1?'landing':'tread',label:i===p.risers-1?'Aankomstbordes':'Trede '+mark(i)}));
  return {p,result,parts,issues,add,metric,stations,run,end,rise};
}

function addGuide(s) {
  const {p,run,end,rise,metric}=s;
  metric('Optrede',rise);metric('Aantrede',p.going);metric('Loopbreedte',p.width);metric('Bordesdiepte',p.landingDepth);
  s.result.guides.push({label:'Klimlijn',points:[P(0,p.width/2,rise),P(run,p.width/2,p.height),P(end,p.width/2,p.height)]});
}

// A dry-glazed shoe with steel cheeks, bottom gasket and side gaskets.
// Supports attached to the host's actual seats are generated by each family.
function guardPanels(s,id,y,baseAt,footWidth=22) {
  const {p,add,run,end,stations}=s;
  const spans=[];
  for(let x=0;x<run;x+=3*p.going) spans.push([x,Math.min(run,x+3*p.going)]);
  spans.push([run,end]);
  spans.forEach(([start,finish],i)=>{
    const x0=start+3,x1=finish-3,z0=baseAt(x0),z1=baseAt(x1),key=id+'-'+mark(i);
    const paneAt=x=>Math.min(p.height,s.rise+x*s.rise/p.going)+p.railHeight-23;
    const top0=paneAt(x0),top1=paneAt(x1);
    const layer=(suffix,label,material,y0,y1)=>add(key+'-'+suffix,label,'plate',material,
      extrudeXZ([[x0,z0+9],[x1,z1+9],[x1,top1],[x0,top0]],y+y0,y+y1));
    layer('glas-1','Hekpaneel · eerste glaslaag','glass',-8.38,-.38);
    layer('folie','Hekpaneel · folie','interlayer',-.38,.38);
    layer('glas-2','Hekpaneel · tweede glaslaag','glass',.38,8.38);
    const band=(suffix,label,mat,y0,y1,low,thick)=>add(key+'-'+suffix,label,'member',mat,bandXZ(x0,x1,z0+low,z1+low,thick,y+y0,y+y1));
    band('schoen','Bodem glasprofiel','steel',-17,17,0,5);
    band('rubber','Glasband onder paneel','rubber',-8.38,8.38,5,4);
    for(const side of [-1,1]) {
      const interval=(a,b)=>side<0?[-b,-a]:[a,b];
      band('flens'+side,'Flens glasprofiel','steel',...interval(12,17),5,54);
      band('pakking'+side,'Zijpakking glasprofiel','rubber',...interval(8.38,12),9,48);
    }
    add(key+'-regel','Handregel boven glas','railing','steel',bandXZ(start,finish,paneAt(start),paneAt(finish),23,y-19,y+19));
  });
  for(const t of stations) {
    const x=t.x+t.d*.45,bottom=t.seatTop;
    const w=24;
    add(id+'-voet-'+mark(t.i),'Staander glasprofiel','member','steel',extrudeXZ([
      [x-w/2,bottom],[x+w/2,bottom],[x+w/2,baseAt(x+w/2)],[x-w/2,baseAt(x-w/2)]],y-footWidth/2,y+footWidth/2));
  }
}

function glassBuild(input={}) {
  const s=begin(glassFields,input),{p,parts,issues,add,metric,stations,run,end,rise}=s;
  const thickness=p.layers*p.ply+(p.layers-1)*p.film;
  if(rise<=thickness+40) issues.push({level:'error',text:'De optrede biedt onvoldoende hoogte voor glas, oplegschoen en onderstoel.'});
  if(issues.length) return s.result;
  const layerWidth=12,carrierWidth=p.carrier==='glass'?4*layerWidth+3*1.52:36;
  const glassGuardSides=p.guard==='both'?[0,1]:p.guard==='left'?[1]:p.guard==='right'?[0]:[];
  const guardY=side=>side?p.width+24:-24;
  // Upper sawtooth face follows each bearing. The soffit meets the lower
  // floor shoe on a finite horizontal bearing area and flattens at the landing.
  const seat=z=>z-thickness-4-8-4;
  const soffit=x=>Math.min(p.height,Math.max(0,x*rise/p.going))-thickness-16-p.carrierDepth;
  const firstContact=(15+thickness+16+p.carrierDepth)*p.going/rise;
  const bottom=[ [0,15] ];
  if(firstContact<run-1e-7) bottom.push([firstContact,15],[run,soffit(run)]);
  bottom.push([end,Math.max(15,soffit(run))]);
  const saw=stations.flatMap(t=>[[t.x,seat(t.z)],[t.x+(t.i===p.risers-1?p.landingDepth:p.going),seat(t.z)]]);
  const outline=[...bottom,...saw.toReversed()];
  for(const side of [0,1]) {
    const sideKey=side?'L':'R',y=side?p.width-22-carrierWidth:22;
    if(p.carrier==='glass') {
      let start=y;
      for(let j=0;j<4;j++) {
        add('wang-'+sideKey+'-glas-'+(j+1),'Glazen trapboom '+sideKey+' · laag '+(j+1),'member','glass',extrudeXZ(outline,start,start+layerWidth));
        start+=layerWidth;
        if(j<3) {add('wang-'+sideKey+'-folie-'+(j+1),'Trapboom '+sideKey+' · folie','plate','interlayer',extrudeXZ(outline,start,start+1.52));start+=1.52;}
      }
    } else add('wang-'+sideKey,'Stalen trapboom '+sideKey,'member','steel',extrudeXZ(outline,y,y+carrierWidth));
    const bearingLength=Math.min(180,firstContact),footLength=Math.max(80,bearingLength);
    const floorBolts=[footLength*.22,footLength*.78].flatMap(x=>[y-14,y+carrierWidth+14].map(u=>[x,u]));
    const foot=extrudeXZ(rect(0,y-27,footLength,y+carrierWidth+27),0,11,floorBolts.map(([x,u])=>circle(x,u,6.6)));
    add('vloerplaat-'+sideKey,'Geperforeerde voetplaat trapboom '+sideKey,'plate','steel',foot.map(f=>f.map(v=>P(v.x,v.z,11-v.y))));
    add('voetblok-'+sideKey,'Elastomeer voetoplegging '+sideKey,'plate','rubber',box(0,y,11,bearingLength,y+carrierWidth,15));
    floorBolts.forEach(([x,u],j)=>{
      add('voetanker-'+sideKey+j,'Voetanker trapboom '+sideKey,'fastener','steel',tube(P(x,u,-100),P(x,u,11),6,12),
        {fastenerType:'ANCHORBOLT',diameterMm:12,lengthMm:111,embedMm:100});
      add('voetankerkop-'+sideKey+j,'Zeskantkop voetplaat '+sideKey,'fastener','steel',tube(P(x,u,11),P(x,u,17),9,6));
    });
    const rearZ=Math.max(15,soffit(run)),len=Math.min(140,p.landingDepth/3);
    add('kopoplegging-'+sideKey,'Aansluitconsole bordes '+sideKey,'plate','steel',box(end-len,y-10,rearZ-16,end+40,y+carrierWidth+10,rearZ-4));
    add('kopblok-'+sideKey,'Elastomeer bordesoplegging '+sideKey,'plate','rubber',box(end-len,y,rearZ-4,end,y+carrierWidth,rearZ));
    // The slotted/glazed assembly is carried at the floor edge by a steel
    // shelf. Rotate a perforated XZ plate into YZ at its rear, below the shelf.
    const mountZ=rearZ-62,holes=[y-3,y+carrierWidth+3];
    const mount=extrudeXZ(rect(y-18,mountZ-22,y+carrierWidth+18,rearZ-16),0,10,holes.map(u=>circle(u,mountZ,6.6)));
    add('kopflens-'+sideKey,'Geperforeerde kopflens bordes '+sideKey,'plate','steel',
      mount.map(f=>f.map(v=>P(end+40-v.y,v.x,v.z))));
    holes.forEach((u,j)=>{
      add('kopanker-'+sideKey+j,'Vloerrandanker bordes '+sideKey,'fastener','steel',tube(P(end+30,u,mountZ),P(end+140,u,mountZ),6,12),
        {fastenerType:'ANCHORBOLT',diameterMm:12,lengthMm:110,embedMm:100});
      add('ankerkop-'+sideKey+j,'Zeskantkop bordes '+sideKey,'fastener','steel',tube(P(end+24,u,mountZ),P(end+30,u,mountZ),9,6));
    });
    for(const t of stations) {
      const suffix=t.prefix+'-'+sideKey,z=seat(t.z),x0=t.x+2,x1=t.x+t.d-2;
      add(suffix+'-onderband','Isolatie op wang '+sideKey,'plate','rubber',box(x0,y,z,x1,y+carrierWidth,z+4));
      const out=guardY(side),y0=glassGuardSides.includes(side)?Math.min(y,out-11):y,y1=glassGuardSides.includes(side)?Math.max(y+carrierWidth,out+11):y+carrierWidth;
      add(suffix+'-stoel','Oplegstoel '+sideKey,'plate','steel',box(x0,y0,z+4,x1,y1,z+12));
      add(suffix+'-glasband','Oplegband onder glas '+sideKey,'plate','rubber',box(x0,y,z+12,x1,y+carrierWidth,z+16));
      t.seatTop=z+12;
    }
  }
  for(const t of stations) {
    let z=t.z-thickness;
    for(let j=0;j<p.layers;j++) {
      add(t.prefix+'-glas-'+(j+1),t.label+' · glaslaag '+(j+1),j===p.layers-1?t.kind:'plate','glass',box(t.x,0,z,t.x+t.d,p.width,z+p.ply));
      z+=p.ply;
      if(j<p.layers-1) {add(t.prefix+'-folie-'+(j+1),t.label+' · lamineerfolie '+(j+1),'plate','interlayer',box(t.x,0,z,t.x+t.d,p.width,z+p.film));z+=p.film;}
    }
    if(p.finish==='frit') for(let j=0;j<3;j++) {
      const x=t.x+18+12*j;
      add(t.prefix+'-zeefdruk-'+(j+1),t.label+' · keramische neusmarkering','plate','ceramic',box(x,15,t.z,x+5,p.width-15,t.z+.12));
    }
  }
  const baseAt=x=>Math.min(p.height,rise+x*rise/p.going)-thickness+22;
  glassGuardSides.forEach(side=>guardPanels(s,'hek-'+(side?'L':'R'),guardY(side),baseAt));
  addGuide(s);metric('Totaaldikte tredeglas',thickness);metric('Breedte per oplegband',carrierWidth);
  metric('Vrije overspanning tussen oplegbanden',p.width-2*(22+carrierWidth));
  s.result.structural=designGlass(s,carrierWidth,Math.min(180,firstContact),Math.min(140,p.landingDepth/3));
  issues.push({level:'info',text:'Bepaal glasopbouw, tussenlaag, restdraagvermogen, stroefheid, oplegdruk en bevestiging met de constructeur en glasleverancier.'});
  return s.result;
}

// A rectangular grid leaves real blind mortises for both tubes. Faces on
// shared cell boundaries are omitted, yielding one watertight timber body.
function timberShell(xs,ys,zs,through) {
  const faces=[],nx=xs.length-1,ny=ys.length-1,nz=zs.length-1;
  const full=(i,j,k)=>i>=0&&i<nx&&j>=0&&j<ny&&k>=0&&k<nz&&
    !((i%2===1)&&k===1&&(j===0||through));
  for(let i=0;i<nx;i++) for(let j=0;j<ny;j++) for(let k=0;k<nz;k++) if(full(i,j,k)) {
    const cube=box(xs[i],ys[j],zs[k],xs[i+1],ys[j+1],zs[k+1]);
    [[0,0,-1],[0,0,1],[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]].forEach(([a,b,c],f)=>{
      if(!full(i+a,j+b,k+c)) faces.push(cube[f]);
    });
  }
  return faces;
}

// Closed triangular fillet around the outside perimeter of the tube at its root.
function armWeld(x,z,y,halfWidth,halfHeight,leg) {
  const ring=(dx,dz,at)=>rect(x-dx,z-dz,x+dx,z+dz).map(([u,h])=>P(u,at,h));
  const rings=[ring(halfWidth,halfHeight,y),ring(halfWidth+leg,halfHeight+leg,y),ring(halfWidth,halfHeight,y+leg)];
  return rings.flatMap((a,k)=>a.map((v,i)=>{
    const b=rings[(k+1)%3], j=(i+1)%4;
    return [v,b[i],b[j],a[j]];
  }));
}

function floatingBuild(input={}) {
  const s=begin(floatingFields,input),{p,issues,add,metric,stations,run,end,rise}=s;
  const woodenSkin=(p.thickness-p.armHeight-2)/2;
  if(woodenSkin<10||2*p.armWall>=Math.min(p.armWidth,p.armHeight)) issues.push({level:'error',text:'De koker vraagt een open kern en aan boven- en onderzijde minstens 10 mm hout in dit model.'});
  if(rise<=p.thickness+15) issues.push({level:'error',text:'De optrede moet hoger zijn dan de houten huls met de vrije tussenruimte.'});
  if(issues.length) return s.result;
  const free=['free','both'].includes(p.guard),plateT=12,root=plateT+p.wallGap,edge=root+p.width;
  for(const t of stations) {
    const {x,d,z,prefix}=t,mid=z-p.thickness/2;
    // The landing receives additional pairs wherever its panel is longer
    // than an ordinary tread. All plates are attached to the same bearing wall.
    const count=t.kind==='landing'?2*Math.ceil(d/(2*p.going)):2;
    const centers=Array.from({length:count},(_,i)=>x+d*(i+.5)/count);
    const ax=p.armWidth/2,az=p.armHeight/2,clear=1;
    const xs=[x,...centers.flatMap(u=>[u-ax-clear,u+ax+clear]),x+d];
    const ys=free?[root,edge]:[root,edge-p.tipCover,edge];
    const zs=[z-p.thickness,mid-az-clear,mid+az+clear,z];
    add(prefix,t.label+' · houten huls',t.kind,'timber',timberShell(xs,ys,zs,free));
    const halfPlate=Math.max(58,az+28),plateBottom=mid-halfPlate,plateTop=mid+halfPlate;
    t.armCount=count;
    t.rowSpacing=plateTop-plateBottom-34;
    for(let j=0;j<count;j+=2) {
      const start=x+d*j/count+4,finish=x+d*(j+2)/count-4,key=prefix+'-wandplaat-'+(j/2+1);
      const bs=[start+18,finish-18].flatMap(u=>[plateBottom+17,plateTop-17].map(h=>[u,h]));
      add(key,'Geperforeerde wandplaat '+t.label,'plate','steel',extrudeXZ(rect(start,plateBottom,finish,plateTop),0,plateT,bs.map(([u,h])=>circle(u,h,6.6))));
      bs.forEach(([u,h],b)=>{
        add(key+'-anker-'+b,'Wandanker '+t.label,'fastener','steel',tube(P(u,-p.anchorEmbed,h),P(u,plateT,h),6,12),
          {fastenerType:'ANCHORBOLT',diameterMm:12,lengthMm:p.anchorEmbed+plateT,embedMm:p.anchorEmbed});
        add(key+'-kop-'+b,'Zeskantkop wandanker','fastener','steel',tube(P(u,plateT,h),P(u,plateT+7,h),9.3,6));
      });
    }
    centers.forEach((u,i)=>{
      const outer=rect(u-ax,mid-az,u+ax,mid+az),v=p.armWall;
      const inner=rect(u-ax+v,mid-az+v,u+ax-v,mid+az-v);
      const endY=free?edge+7:edge-p.tipCover-2;
      add(prefix+'-arm-'+(i+1),'Rechthoekige draagkoker '+t.label,'member','steel',extrudeXZ(outer,plateT,endY,[inner]));
      add(prefix+'-las-'+(i+1),'Rondomlas koker aan wandplaat '+t.label,'fastener','steel',armWeld(u,mid,plateT,ax,az,p.armWeldLeg),
        {fastenerType:'WELD'});
      // Shims on the upper faces transfer bearing from hollow tread to tubes.
      add(prefix+'-opleg-'+(i+1),'Oplegstrook op draagkoker','plate','rubber',box(u-ax,root,mid+az,u+ax,free?edge:endY,mid+az+clear));
    });
    if(free) {
      add(prefix+'-juk','Kopplaat draagarmen voor balustrade','plate','steel',box(x+4,edge+7,mid-az,x+d-4,edge+18,mid+az));
      t.seatTop=mid+az;
    }
  }
  if(free) guardPanels(s,'vrij-hek',edge+12.5,x=>Math.min(p.height,rise+x*rise/p.going)+32,11);
  if(['wall','both'].includes(p.guard)) {
    const y=55,z0=rise+p.railHeight,top=p.height+p.railHeight;
    // Rectangular handrail with vertical mitre at the landing transition.
    add('wandregel-vlucht','Houten wandhandregel vlucht','railing','timber',bandXZ(0,run,z0-36,top-36,36,y,y+42));
    add('wandregel-bordes','Houten wandhandregel bordes','railing','timber',box(run,y,top-36,end,y+42,top));
    const posts=[0,...Array.from({length:Math.ceil(run/950)},(_,i)=>(i+1)*run/Math.ceil(run/950)),end-50];
    posts.forEach((x,i)=>{
      const u=Math.max(12,x),z=Math.min(top,z0+u*rise/p.going)-36;
      add('wandrozet-'+i,'Voet wandhandregel','plate','steel',tube(P(u,0,z-45),P(u,6,z-45),20));
      add('wanddrager-'+i,'Draagpen wandhandregel','member','steel',tube(P(u,6,z-45),P(u,y+20,z-45),7));
      add('wandsteun-'+i,'Stift onder wandhandregel','member','steel',tube(P(u,y+20,z-45),P(u,y+20,z),7));
    });
  }
  addGuide(s);s.result.guides[0].points=s.result.guides[0].points.map(p=>({...p,y:p.y+root}));
  metric('Uitkraging vanaf draagwand',edge);metric('Bovenhuid boven uitsparing',woodenSkin);
  metric('Inbedding wandanker',p.anchorEmbed);metric('Draagkokers',s.parts.filter(p=>p.id.includes('-arm-')).length,'st.');
  s.result.structural=designFloating(s,plateT);
  issues.push({level:'info',text:'Leg wandmateriaal, ankertype, verankering, lasverbindingen en de toets op doorbuiging en trillingen per project vast. Het model toont de bevestigingsgeometrie.'});
  if(p.wallSide==='left') {
    for(const part of s.parts) part.faces=part.faces.map(f=>f.map(p=>({...p,y:edge-p.y})).reverse());
    for(const g of s.result.guides) g.points=g.points.map(p=>({...p,y:edge-p.y}));
  }
  return s.result;
}

export const glassStair={id:'glass',label:'Glazen trap',fields:glassFields,build:glassBuild};
export const cantileverStair={id:'cantilever',label:'Boomloze wandtrap',fields:floatingFields,build:floatingBuild};
