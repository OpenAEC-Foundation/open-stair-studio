import earcut from 'earcut';
import { box, prism } from './solids.js';
import { steelDesignFields, calculateSteel } from './steel-design.js';

const n=(key,label,value,min,max,unit='mm')=>({key,label,type:'number',default:value,min,max,unit,step:1});
const pick=(key,label,value,options)=>({key,label,type:'select',default:value,options});
function fields(escape) {
  return [
    pick('layout','Vluchtverloop',escape?'return':'straight',[['straight','Rechte vlucht'],['return','Twee vluchten met keerbordes']]),
    pick('treadType','Treden en bordesvloer',escape?'grating':'plate',[['plate','Gezette staalplaat'],['grating','Open stalen rooster']]),
    pick('stringerStyle','Vorm van de plaatwang','solid',[['solid','Gesloten plaatwang'],['openFrame','Open driehoekframe met voetregel']]),
    pick('railSide','Leuning bij stijgen','both',[['both','Beide zijden'],['left','Links'],['right','Rechts'],['none','Geen leuning']]),
    n('width','Vrije tredebreedte tussen wangen',escape?1200:1000,600,1800),
    n('risers','Optredes inclusief bordes',16,6,36,'st.'),n('going','Aantrede',260,180,400),
    n('landingDepth','Diepte bordes',1100,500,1600),n('laneGap','Vrije ruimte tussen de binnenwangen',120,60,600),
    n('stringerThickness','Dikte stalen plaatwang',10,6,25),n('stringerDepth','Verticale hoogte plaatwang',230,140,370),
    n('plateThickness','Dikte gezette plaat',5,3,12),n('gratingDepth','Hoogte draagstrip rooster',30,20,60),
    n('bearingPitch','Steek draagstrippen in looprichting',34,24,70),n('crossPitch','Steek dwarsstaven',100,50,150),
    n('railHeight','Hoogte tot bovenkant leuning',1000,800,1300),
    pick('supports','Ondersteuning bordes','columns',[['columns','Kokerkolommen met voetplaat'],['building','Aansluiting op gebouwconstructie']]),
    pick('steelGrade','Staalsoort','S235',[['S235','S235'],['S355','S355']]),
    pick('finish','Oppervlak',escape?'galvanized':'steel',[['steel','Onbehandeld staal'],['galvanized','Thermisch verzinkt staal']]),
    ...steelDesignFields,
    ...(escape?[
      pick('escapeFunction','Toepasselijkheid Bbl art. 4.80 lid 1','unconfirmed',[['unconfirmed','Toepassing te bevestigen'],['listed','Gebruiksfunctie onder lid 1'],['other','Andere gebruiksfunctie']]),
      n('escapePersons','Aangewezen personen op deze route',0,0,20000,'pers.'),
      n('escapeWidth','Aangetoonde vrije routebreedte',0,0,5000),
      {key:'escapeBasis',label:'Onderbouwing vluchttoets',type:'text',default:'',maxLength:160}
    ].map(f=>({...f,group:'Vluchtroute'})):[])
  ];
}
const pt=(x,y,z)=>({x,y,z});
const sub=(a,b)=>pt(a.x-b.x,a.y-b.y,a.z-b.z);
const cross=(a,b)=>pt(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const unit=v=>{const m=Math.hypot(v.x,v.y,v.z);return pt(v.x/m,v.y/m,v.z/m);};
const number=i=>String(i).padStart(2,'0');
function massProperties(faces) {
  const origin=faces[0][0];
  let total=0,firstMoment=0;
  for(const f of faces) {
    const a=sub(f[0],origin);
    for(let i=1;i+1<f.length;i++) {
      const b=sub(f[i],origin),c=sub(f[i+1],origin),v=dot(a,cross(b,c))/6;
      total+=v;
      firstMoment+=v*(a.x+b.x+c.x)/4;
    }
  }
  return {volumeM3:total/1e9,station:origin.x+firstMoment/total};
}

// True bores and annular end faces for RHS and CHS. For vertical rectangular
// sections side/up align with plan X/Y, including after component rotation.
function hollow(a,b,width,depth,wall,circular=false,plumbEnds=false) {
  const axis=unit(sub(b,a));
  const side=Math.hypot(axis.x,axis.y)>1e-8?unit(pt(-axis.y,axis.x,0)):pt(1,0,0);
  const up=cross(axis,side),count=circular?12:4;
  const ring=(p,w,h)=>Array.from({length:count},(_,i)=>{
    const u=circular?w/2*Math.cos(i*2*Math.PI/count):[-1,1,1,-1][i]*w/2;
    const v=circular?h/2*Math.sin(i*2*Math.PI/count):[-1,-1,1,1][i]*h/2;
    const x=u*side.x+v*up.x,y=u*side.y+v*up.y;
    // Carry the section generators to a plumb end plane at the square post.
    const shift=plumbEnds?-(x*axis.x+y*axis.y)/(axis.x**2+axis.y**2):0;
    return pt(p.x+x+shift*axis.x,p.y+y+shift*axis.y,p.z+u*side.z+v*up.z+shift*axis.z);
  });
  const out0=ring(a,width,depth),out1=ring(b,width,depth),in0=ring(a,width-2*wall,depth-2*wall),in1=ring(b,width-2*wall,depth-2*wall);
  const faces=[];
  for(let i=0;i<count;i++){
    const j=(i+1)%count;
    faces.push([out0[i],out0[j],out1[j],out1[i]],[in0[j],in0[i],in1[i],in1[j]],
      [out0[j],out0[i],in0[i],in0[j]],[out1[i],out1[j],in1[j],in1[i]]);
  }
  return faces;
}

// One welded panel is one shop/IFC piece. The load bars span between the two
// side bands. Shallow crossbars join the upper layer. Emit only exposed faces
// of the steel union so every aperture remains open through the mesh.
function grating(length,width,depth,barPitch,crossPitch,landing) {
  const bands=(extent,pitch,edge0,edge1,thickness)=>{
    const clear=extent-edge0-edge1,spaces=Math.max(1,Math.ceil(clear/pitch)),b=[0,edge0];
    for(let i=1;i<spaces;i++) {
      const q=edge0+i*clear/spaces;b.push(q-thickness/2,q+thickness/2);
    }
    b.push(extent-edge1,extent);return b;
  };
  const xs=bands(length,barPitch,landing?4:32,4,3),ys=bands(width,crossPitch,5,5,5);
  const zs=[-depth,-8,0],nx=xs.length-1,ny=ys.length-1;
  const solid=(x,y,z)=>x>=0&&x<nx&&y>=0&&y<ny&&z>=0&&z<2&&
    (x%2===0||y===0||y===ny-1||(y%2===0&&z===1));
  const faces=[];
  for(let i=0;i<nx;i++) for(let j=0;j<ny;j++) for(let k=0;k<2;k++) {
    if(!solid(i,j,k)) continue;
    const x=xs[i],r=xs[i+1],y=ys[j]-width/2,s=ys[j+1]-width/2,z=zs[k],t=zs[k+1];
    const a=pt(x,y,z),b=pt(r,y,z),c=pt(r,s,z),d=pt(x,s,z),e=pt(x,y,t),f=pt(r,y,t),g=pt(r,s,t),h=pt(x,s,t);
    if(!solid(i-1,j,k)) faces.push([a,e,h,d]);
    if(!solid(i+1,j,k)) faces.push([b,c,g,f]);
    if(!solid(i,j-1,k)) faces.push([a,b,f,e]);
    if(!solid(i,j+1,k)) faces.push([d,h,g,c]);
    if(!solid(i,j,k-1)) faces.push([a,d,c,b]);
    if(!solid(i,j,k+1)) faces.push([e,f,g,h]);
  }
  return faces;
}

// Extrude an X/Z section along local Y, reversing the X/Z winding for +Y.
function sidePlate(xz,y0,y1) {
  const points=xz.filter(([x,z],i)=>!i||x!==xz[i-1][0]||z!==xz[i-1][1]);
  const corners=points.filter(([x,z],i)=>{
    const [ax,az]=points[(i+points.length-1)%points.length],[bx,bz]=points[(i+1)%points.length];
    return Math.abs((x-ax)*(bz-z)-(z-az)*(bx-x))>.00001;
  });
  return prism(corners.map(([x,z])=>({x,y:-z})),y0,y1).map(f=>f.map(p=>pt(p.x,p.z,-p.y)));
}
// Perforated plate in the same X/Z coordinates as sidePlate. Triangulate both
// caps around the opening and close every perimeter edge across the thickness.
function openSidePlate(outer,hole,y0,y1) {
  const loops=[outer,hole],flat=loops.flat();
  const triangles=earcut(flat.flat(),[outer.length]);
  const at=(i,y)=>pt(flat[i][0],y,flat[i][1]);
  const faces=[];
  for(let i=0;i<triangles.length;i+=3) {
    const ids=triangles.slice(i,i+3);
    const [a,b,c]=ids.map(j=>flat[j]);
    const signed=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const ccw=signed>0?ids:ids.toReversed();
    faces.push(ccw.map(j=>at(j,y0)),ccw.toReversed().map(j=>at(j,y1)));
  }
  let offset=0;
  for(const loop of loops) {
    for(let i=0;i<loop.length;i++) {
      const a=offset+i,b=offset+(i+1)%loop.length;
      faces.push([at(a,y0),at(a,y1),at(b,y1),at(b,y0)]);
    }
    offset+=loop.length;
  }
  return faces;
}
function foldedPlate(length,width,thickness) {
  const lip=35;
  return sidePlate([[0,0],[length,0],[length,-lip],[length-thickness,-lip],[length-thickness,-thickness],
    [thickness,-thickness],[thickness,-lip],[0,-lip]],-width/2,width/2);
}

// Four actual through-holes. Their layout is also passed to the anchor-group check.
function anchoredFoot(add,id,label,x,y,z,length,width,thick,embed) {
  const hx=length/2,hy=width/2,sx=hx-18,sy=hy-18;
  const rectangle=[[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]].map(([u,v])=>[x+u,y+v]);
  const ring=(cx,cy,r)=>Array.from({length:12},(_,i)=>[cx+r*Math.cos(i*Math.PI/6),cy+r*Math.sin(i*Math.PI/6)]);
  const holes=[[-sx,-sy],[sx,-sy],[-sx,sy],[sx,sy]].map(([u,v])=>ring(x+u,y+v,7).reverse());
  const loops=[rectangle,...holes],flat=loops.flat(),low=flat.map(([u,v])=>pt(u,v,z)),high=low.map(q=>pt(q.x,q.y,z+thick));
  const tris=earcut(flat.flat(),[4,16,28,40]),faces=[];
  for(let i=0;i<tris.length;i+=3) {
    const indices=tris.slice(i,i+3);
    faces.push(indices.map(j=>high[j]),indices.reverse().map(j=>low[j]));
  }
  let offset=0;
  for(const loop of loops) {
    for(let i=0;i<loop.length;i++){
      const a=offset+i,b=offset+(i+1)%loop.length;
      faces.push([low[a],low[b],high[b],high[a]]);
    }
    offset+=loop.length;
  }
  add(id,label+' · 4 × Ø14','plate','basePlate',faces);
  for(const [i,[u,v]] of [[-sx,-sy],[sx,-sy],[-sx,sy],[sx,sy]].entries()) {
    const shaft=ring(x+u,y+v,6),hex=ring(x+u,y+v,19/Math.sqrt(3));
    // Across flats 19 mm. Midpoints split the six flats for matching topology.
    for(let k=1;k<12;k+=2) hex[k]=hex[k-1].map((val,j)=>(val+hex[(k+1)%12][j])/2);
    const row=(r,h)=>r.map(([a,b])=>pt(a,b,h));
    const rings=[row(shaft,z-embed),row(shaft,z+thick),row(hex,z+thick),row(hex,z+thick+10)];
    const solid=[rings[0].slice().reverse(),rings[3]];
    for(let k=0;k<3;k++) for(let a=0;a<12;a++) {
      const b=(a+1)%12;
      solid.push([rings[k][a],rings[k][b],rings[k+1][b],rings[k+1][a]]);
    }
    add(id+'-anker-'+(i+1),'Vloeranker M12 · inbedding '+embed+' mm','fastener','floorAnchor',solid,
      {fastenerType:'ANCHORBOLT',diameterMm:12,lengthMm:embed+thick,embedMm:embed});
  }
}

function builder(defs,isEscape) {
  const defaults=Object.fromEntries(defs.map(f=>[f.key,f.default]));
  return (parameters={})=>{
    const p={height:2880,...defaults,...parameters};
    const parts=[],issues=[],metrics=[],guides=[],stations=new Map(),result={parts,issues,metrics,guides};
    for(const f of defs) {
      const v=p[f.key];
      if(f.type==='select'?!f.options.some(([k])=>k===v):f.type==='text'?typeof v!=='string'||v.length>f.maxLength:!Number.isFinite(v)||(f.step===1&&!Number.isInteger(v))||v<f.min||v>f.max)
        issues.push({level:'error',text:'Ongeldige invoer voor '+f.label+'.'});
    }
    if(!Number.isFinite(p.height)||p.height<=0||p.height>10000) issues.push({level:'error',text:'Controleer de verdiepingshoogte.'});
    const rise=p.height/p.risers,grated=p.treadType==='grating',deck=grated?p.gratingDepth:35;
    if(rise<=deck+50) issues.push({level:'error',text:'Optrede te klein voor de tredeconstructie, opleghoek en voetplaat.'});
    if(p.stringerStyle==='openFrame'&&p.layout!=='straight')
      issues.push({level:'error',text:'Het open driehoekframe is voorlopig alleen voor een rechte vlucht beschikbaar.'});
    if(issues.length) return result;
    const material=p.finish;
    function add(id,label,kind,role,faces,move=v=>v,attributes={}) {
      const {volumeM3,station}=massProperties(faces);
      stations.set(id,station);
      parts.push({id,label,kind,role,material,materialGrade:role==='floorAnchor'?'Volgens ankerspecificatie':p.steelGrade,volumeM3,massKg:volumeM3*7850,...attributes,
        faces:faces.map(f=>f.map(move))});
    }
    const place=(faces,dx,dy,dz)=>faces.map(f=>f.map(q=>pt(q.x+dx,q.y+dy,q.z+dz)));
    const frame=(x,y,z,dir)=>q=>pt(x+dir*q.x,y+dir*q.y,z+q.z);
    const metric=(label,value,unit='mm')=>metrics.push({label,value,unit});
    const rails=p.railSide==='none'?[]:p.railSide==='both'?[1,-1]:[p.railSide==='left'?1:-1];
    const treadLength=p.going-7;
    const panel=(length,width,landing)=>grated?grating(length,width,deck,p.bearingPitch,p.crossPitch,landing):
      landing?box(0,-width/2,-p.plateThickness,length,width/2,0):foldedPlate(length,width,p.plateThickness);
    const treadPanel=panel(treadLength,p.width,false);
    const railOuter=42.4;
    function guard(id,a,b,move) {
      const delta=sub(b,a),h=Math.hypot(delta.x,delta.y),nz=h/Math.hypot(h,delta.z),grade=delta.z/h;
      const height=p.railHeight,postSize=35,sections=Math.max(1,Math.ceil(h/1050));
      // Datum is the top of the inclined circular rail above the pitch line.
      function centre(q,v,diameter){return pt(q.x,q.y,q.z+v-diameter/(2*nz));}
      add(id+'-grip','Stalen buisleuning','railing','handrail',hollow(centre(a,height,railOuter),centre(b,height,railOuter),railOuter,railOuter,3,true),move);
      const lowA=centre(a,height*.52,26.9),lowB=centre(b,height*.52,26.9);
      const inset=Math.min(35,h/3);
      const stations=Array.from({length:sections+1},(_,i)=>(inset+(h-2*inset)*i/sections)/h);
      for(let i=0;i<stations.length;i++) {
        const t=stations[i],q=pt(a.x+delta.x*t,a.y+delta.y*t,a.z+delta.z*t);
        // Square posts stop at the underside chord. Upper/sole are scribed to
        // the local grade. The rail/post weld is part of the project detailing.
        const top=pt(q.x,q.y,q.z+height-railOuter/nz);
        const post=hollow(q,top,postSize,postSize,3).map(f=>f.map(v=>pt(v.x,v.y,v.z+grade*((v.x-q.x)*delta.x/h+(v.y-q.y)*delta.y/h))));
        add(id+'-post-'+number(i+1),'Hekstaander koker 35 × 35','member','guardPost',post,move);
        if(i) {
          const before=stations[i-1]+postSize/(2*h),after=t-postSize/(2*h);
          if(after>before) {
            const c=u=>pt(lowA.x+(lowB.x-lowA.x)*u,lowA.y+(lowB.y-lowA.y)*u,lowA.z+(lowB.z-lowA.z)*u);
            add(id+'-mid-'+number(i),'Tussenregel tussen staanders','railing','guardRail',hollow(c(before),c(after),26.9,26.9,2.6,true,true),move);
          }
        }
      }
    }
    function flight(name,count,move) {
      const run=(count-1)*p.going,gradient=rise/p.going,end=count*rise,foot=10;
      const mapPart=(id,label,kind,role,faces,attributes)=>add(name+'-'+id,label,kind,role,faces,move,attributes);
      for(let i=0;i<count-1;i++) {
        mapPart('trede-'+number(i+1),(grated?'Roostertrede ':'Gezette plaattrede ')+number(i+1),'tread',grated?'gratingTread':'foldedTread',
          place(treadPanel,i*p.going,0,(i+1)*rise));
        const seatZ=(i+1)*rise-(grated?deck:p.plateThickness);
        // 40x40x4 seating angle welded against the inner face of each stringer.
        // The tray is supported between its two folded lips.
        const x0=i*p.going+18,x1=i*p.going+treadLength-18;
        for(const sign of [-1,1]) {
          const edge=sign*p.width/2;
          const yz=[[0,0],[40,0],[40,-4],[4,-4],[4,-40],[0,-40]];
          const angle=prism(yz.map(([s,z])=>({x:edge-sign*s,y:seatZ+z})),x0,x1).map(f=>f.map(v=>pt(v.z,v.x,v.y)));
          mapPart('opleghoek-'+number(i+1)+(sign>0?'L':'R'),'Tredeopleghoek 40 × 40 × 4','member','treadCleat',angle);
        }
      }
      const footLength=Math.min(100,run/3),top=x=>rise+x*gradient,bottom=x=>Math.max(foot,top(x)-p.stringerDepth);
      const cut=(foot+p.stringerDepth-rise)/gradient;
      const outline=[[0,foot],[footLength,foot],[footLength,bottom(footLength)]];
      if(cut>footLength+.0001&&cut<run-.0001) outline.push([cut,foot]);
      outline.push([run,bottom(run)],[run,end],[0,rise]);
      const web=Math.max(40,p.stringerThickness*5);
      const frameOuter=[[0,foot],[run,foot],[run,end],[0,rise]];
      const frameHole=[[web*2,foot+web],[run-web,top(run-web)-web],[run-web,foot+web]];
      for(const sign of [-1,1]) {
        const code=sign>0?'L':'R',inside=sign*p.width/2,outside=sign*(p.width/2+p.stringerThickness),y=(inside+outside)/2;
        const profile=p.stringerStyle==='openFrame'&&run>web*4&&top(run-web)-web>foot+web*2
          ? openSidePlate(frameOuter,frameHole,Math.min(inside,outside),Math.max(inside,outside))
          : sidePlate(outline,Math.min(inside,outside),Math.max(inside,outside));
        mapPart('wang-'+code,p.stringerStyle==='openFrame'?'Open driehoekwang '+code:'Plaatwang '+code,
          'member','stringer',profile);
        if(name==='vlucht-1') anchoredFoot(mapPart,'voet-'+code,'Wangvoetplaat '+code,footLength/2,y,0,footLength,90,foot,p.steelEmbed);
        else mapPart('voet-'+code,'Wangvoetplaat '+code,'plate','basePlate',box(0,y-45,0,footLength,y+45,foot));
        const faceInner=inside-sign*65;
        mapPart('kopplaat-'+code,'Aansluitplaat wang naar bordes '+code,'plate','headPlate',
          box(run-6,Math.min(inside,faceInner),end-deck-95,run,Math.max(inside,faceInner),end-deck));
        if(name==='vlucht-2') {
          mapPart('zetel-'+code,'Gelaste oplegstoel keerbordes '+code,'plate','bearingSeat',
            sidePlate([[0,0],[footLength,0],[footLength,-10],[8,-10],[8,-deck-90],[0,-deck-90]],y-45,y+45));
        }
        if(rails.includes(sign))
          guard(name+'-hek-'+code,pt(0,y,rise),pt(run,y,end),move);
      }
      guides.push({label:'Klimlijn '+name,points:[pt(0,0,rise),pt(run,0,end)].map(move)});
      return run;
    }
    function platform(id,width,move,zWorld,cornerGuard) {
      const d=p.landingDepth,fy=width/2,beamWidth=70,beamDepth=120,deckBase=grated?-deck:-p.plateThickness,beamBottom=deckBase-beamDepth,webZ=deckBase-beamDepth/2;
      const make=(suffix,label,kind,role,faces,attributes)=>add(id+'-'+suffix,label,kind,role,faces,move,attributes);
      make('vloer',grated?'Open roosterbordes':'Stalen bordesplaat','landing','platformDeck',panel(d,width,true));
      for(const sign of [-1,1]) {
        const s=sign>0?'L':'R',y=sign*(fy-beamWidth/2);
        make('rand-'+s,'Randligger bordes '+s,'member','landingBeam',hollow(pt(0,y,webZ),pt(d,y,webZ),beamWidth,beamDepth,5));
      }
      for(const [s,x] of [['voor',beamWidth/2],['achter',d-beamWidth/2]]) {
        make('raveel-'+s,'Dwarsligger bordes '+s,'member','landingBeam',hollow(pt(x,-fy+beamWidth,webZ),pt(x,fy-beamWidth,webZ),beamWidth,beamDepth,5));
      }
      if(width>1500) make('middenligger','Middenligger bordes','member','landingBeam',
        hollow(pt(beamWidth,0,webZ),pt(d-beamWidth,0,webZ),beamWidth,beamDepth,5));
      if(p.supports==='columns') {
        const foot=12,koker=70;
        for(const [i,x] of [45,d-45].entries()) for(const [j,y] of [-fy+45,fy-45].entries()) {
          const idx=i*2+j+1;
          anchoredFoot(make,'voet-'+idx,'Kolomvoetplaat '+idx,x,y,-zWorld,130,130,foot,p.steelEmbed);
          make('kolom-'+idx,'Bordeskolom koker 70 × 70','column','platformColumn',
            hollow(pt(x,y,-zWorld+foot),pt(x,y,beamBottom),koker,koker,4));
        }
      }
      for(const sign of rails) {
        const y=sign*(fy-22);
        guard(id+'-hek-'+(sign>0?'L':'R'),pt(22,y,0),pt(d-22,y,0),move);
      }
      if(cornerGuard&&rails.length) guard(id+'-hek-kop',pt(d-22,-fy+44,0),pt(d-22,fy-44,0),move);
      guides.push({label:'Bordes '+id,points:[pt(0,0,0),pt(d,0,0)].map(move)});
    }
    const w=p.width,clearGap=p.laneGap+2*p.stringerThickness;
    const returns=p.layout==='return',n1=returns?Math.floor(p.risers/2):p.risers;
    const run=flight('vlucht-1',n1,frame(0,0,0,1));
    if(returns) {
      const z=n1*rise,c=w+clearGap;
      platform('keerbordes',2*w+clearGap,frame(run,c/2,z,1),z,true);
      const run2=flight('vlucht-2',p.risers-n1,frame(run,c,z,-1));
      platform('bovenbordes',w,frame(run-run2,c,p.height,-1),p.height,false);
    } else platform('bovenbordes',w,frame(run,0,p.height,1),p.height,false);
    const railIntrusion=Math.max(0,railOuter/2-p.stringerThickness/2);
    const clear=Math.min(w-rails.length*railIntrusion,w-rails.length*(22+railOuter/2));
    metric('Optrede',rise);metric('Aantrede',p.going);metric('Aantal trapvluchten',returns?2:1,'st.');
    metric('Vrije doorgangsbreedte tussen hekwerk of wangen',clear);
    metric('Netto staalmassa geometrie',parts.reduce((s,q)=>s+q.massKg,0),'kg');
    if(isEscape&&rails.length<2) issues.push({level:'warning',text:rails.length?
      'De vluchttrap heeft een open hekzijde. Beoordeel valbeveiliging en de aansluitende gebouwzijde.':
      'Vluchttrap zonder leuning en hekwerk. Beoordeel valbeveiliging, geleiding en de aansluitende gebouwzijden.'});
    issues.push({level:'info',text:(p.supports==='building'?'Bordesreacties worden door de gebouwconstructie opgenomen. ':'')+
      'Leg draagkracht, lassen, voetverankering en slipweerstand vast voor de gekozen trap en het werkelijke gebruik.'});
    result.structural=calculateSteel(p,parts,stations);
    return result;
  };
}
const steelFields=fields(false),escapeFields=fields(true);
export const steelStair={id:'steel',label:'Stalen trap',fields:steelFields,build:builder(steelFields,false)};
export const escapeStair={id:'escape',label:'Stalen vluchttrap',fields:escapeFields,build:builder(escapeFields,true)};
