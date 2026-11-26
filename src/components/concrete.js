import { box, tube } from './solids.js';
import { addPrecastDetails, precastDetailFields } from './precast-detail.js';
import { calculatePrecast, precastEngineeringFields } from '../precast-engineering.js';
import { effectiveLiftPlan, readLiftPlans } from '../precast-plans.js';

const mm = (key, label, value, min, max, step = 1, unit = 'mm') =>
  ({ key, label, default: value, min, max, step, type: 'number', unit });
const select = (key, label, value, options) => ({ key, label, default: value, type: 'select', options });
const fields = [
  select('layout', 'Vluchtverloop', 'return', [['return','180° met tussenbordes'],['straight','Rechte vlucht']]),
  mm('risers', 'Aantal optredes in totaal', 16, 4, 48, 1, 'st.'),
  mm('width', 'Betonbreedte per vlucht', 1200, 500, 2400),
  mm('going', 'Aantrede neus tot neus', 260, 160, 450),
  mm('well', 'Schalmgat tussen vluchten', 160, 0, 1800),
  mm('landingDepth', 'Bordesdiepte voorbij de stelvoeg', 1200, 450, 3000),
  mm('waist', 'Loopplaat loodrecht op helling', 150, 80, 400),
  mm('nosing', 'Onderschuining stootbord', 18, 0, 50),
  mm('bevel', 'Vellingkant voorzijde trede', 5, 0, 20),
  select('finish', 'Tredeafwerking', 'inlay', [['inlay','Verzonken contraststrip 30 × 4 mm'],['cast','Betonnen loopvlak']]),
  mm('headShoulder', 'Massieve kopschouder achter laatste stootbord', 70, 25, 220),
  mm('tongue', 'Projectie oplegnok', 145, 65, 260),
  mm('nib', 'Hoogte oplegnok', 90, 45, 200),
  mm('landingThickness', 'Bordesdikte', 230, 100, 450),
  mm('joint', 'Stelvoeg tussen betonelementen', 10, 3, 30),
  mm('pad', 'Dikte elastomeer', 10, 3, 25),
  mm('setback', 'Randafstand oplegstrip in looprichting', 15, 2, 50),
  select('base', 'Aanzet op vertrekvloer', 'host', [['host','Sponning in gebouwvloer'],['precast','Eigen prefab onderbordes']]),
  select('guards', 'Hekwerken langs vluchten en bordessen', 'both',
    [['both','Binnen- en buitenzijde'],['inner','Binnenzijde'],['outer','Buitenzijde'],['none','Zonder hekwerk']]),
  mm('railHeight', 'Hoogte leuning boven tredeas', 1000, 650, 1350),
  mm('infillPitch', 'Maximale h.o.h.-maat spijlen', 115, 60, 200),
  mm('density', 'Volumieke massa betonelement', 2450, 1500, 3200, 10, 'kg/m³'),
  ...precastDetailFields, ...precastEngineeringFields
];

function messages(p) {
  const errors = [];
  for (const f of fields) {
    const valid = f.type === 'select' ? f.options.some(([id]) => id === p[f.key]) :
      f.type === 'text' ? typeof p[f.key] === 'string' && p[f.key].length <= f.maxLength :
      Number.isFinite(p[f.key]) && p[f.key] >= f.min && p[f.key] <= f.max;
    if (!valid) errors.push(`Controleer ${f.label.toLowerCase()}.`);
  }
  if (!Number.isInteger(p.risers) || (p.layout === 'return' && p.risers < 6)) {
    errors.push('Gebruik hele optredes en minimaal drie optredes per retourvlucht.');
  }
  if (!(Number.isFinite(p.height) && p.height > 0 && p.height <= 14000)) errors.push('Vul een positief vloerverschil tot 14.000 mm in.');
  if (p.landingThickness <= p.nib + p.pad) errors.push('De bordesdikte moet ruimte bieden aan de oplegnok, de oplegstrip en de ondersponning.');
  if (p.tongue - p.joint <= 2 * p.setback) errors.push('De nokprojectie minus stelvoeg en beide randafstanden moet een positieve oplegbreedte geven.');
  const rise = p.height / p.risers;
  if (p.bevel >= rise || p.bevel + p.nosing >= p.going) errors.push('De neusafschuining moet binnen de optrede en aantrede blijven.');
  const waistVertical = p.waist * Math.hypot(1, rise / p.going);
  if (p.nib >= waistVertical + p.nosing * rise / p.going) errors.push('De oplegnok moet aan de voet boven de schuine onderzijde van de loopplaat passen.');
  if (p.nib >= rise + waistVertical - p.headShoulder*rise/p.going) errors.push('De kopschouder moet onder de bovennok voldoende doorsnede overhouden. Controleer nokhoogte, kopschouder en loopplaatdikte.');
  return errors.map(text => ({ level: 'error', text }));
}

const point = (x,y,z) => ({x,y,z});
const identity = p => p;
function sectionArea(profile) {
  return profile.reduce((sum, [x,z], i) => {
    const [nx,nz] = profile[(i + 1) % profile.length];
    return sum + x*nz - nx*z;
  }, 0) / 2;
}

// Extrusion of the actual mould profile in the XZ plane. A 180-degree
// return is a proper rotation so the winding of the shell is preserved.
function extrude(profile, width, place) {
  const outline = sectionArea(profile) > 0 ? profile : [...profile].reverse();
  const side = y => outline.map(([x,z]) => place(point(x,y,z)));
  const a = side(0), b = side(width);
  return [a, [...b].reverse(), ...a.map((p,i) => {
    const j = (i + 1) % a.length;
    return [a[j],p,b[i],b[j]];
  })];
}

function flightProfile(p, count, rise) {
  const run = (count-1)*p.going, high = count*rise;
  const seat = run+p.nosing+p.headShoulder;
  const profile = [[-p.tongue,0]];
  for (let i = 0; i < count; i++) {
    const x = i*p.going, top = (i+1)*rise;
    profile.push([x+p.nosing, i*rise]);
    if (p.bevel) profile.push([x+p.nosing*p.bevel/rise, top-p.bevel]);
    profile.push([x+p.bevel,top]);
    if (p.finish==='inlay' && i<count-1) {
      const start=x+p.bevel+22, end=start+30;
      profile.push([start,top],[start,top-4],[end,top-4],[end,top]);
    }
  }
  const slope = rise/p.going;
  // Offset from the pitch line through the re-entrant tread corners.
  const underside = x => slope*(x-p.nosing) - p.waist*Math.hypot(1,slope);
  return [...profile, [seat+p.tongue,high], [seat+p.tongue,high-p.nib], [seat,high-p.nib],
    [seat,underside(seat)], [0,underside(0)], [0,-p.nib], [-p.tongue,-p.nib]];
}

function landingProfile(p) {
  const throat = p.joint, lip = p.tongue + p.joint, far = lip + p.landingDepth;
  return [[throat,-p.nib-p.pad], [lip,-p.nib-p.pad], [lip,0], [far,0],
    [far,-p.landingThickness], [throat,-p.landingThickness]];
}

const interpolate = (a,b,t) => point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
function railing(parts, id, path, posts, p) {
  const dia = 42;
  const rod = (suffix,label,start,end,r,n=10) =>
    parts.push({id:id+'-'+suffix,label,kind:'railing',material:'galvanized',faces:tube(start,end,r,n)});
  const lower = a => ({...a,z:a.z - p.railHeight + 200});
  for (let i=1; i<path.length; i++) {
    const a = path[i-1], b = path[i];
    const length = Math.hypot(b.x-a.x,b.y-a.y);
    if (length < 1e-6) continue;
    rod('hand-'+i,'Ronde bovenleuning',a,b,dia/2,12);
    rod('low-'+i,'Onderregel hekwerk',lower(a),lower(b),12);
    const intervals = Math.ceil(length/p.infillPitch);
    for (let j=1; j<intervals; j++) {
      const top = interpolate(a,b,j/intervals);
      if (posts.some(post => Math.hypot(top.x-post.x,top.y-post.y)<30)) continue;
      rod(`bar-${i}-${j}`,'Verticale vulspijl',lower(top),top,6,8);
    }
  }
  posts.forEach((top,i) => {
    const z = top.z - p.railHeight;
    parts.push({id:`${id}-foot-${i+1}`,label:'Voetplaat hekstijl',kind:'plate',material:'galvanized',
      faces:box(top.x-40,top.y-40,z,top.x+40,top.y+40,z+8)});
    rod('post-'+(i+1),'Hekstijl op voetplaat',{...top,z:z+8},top,19,12);
  });
}

function build(params = {}) {
  const p = { height:2880, ...Object.fromEntries(fields.map(f=>[f.key,f.default])), ...params };
  p.liftPlans=readLiftPlans(p.liftPlans);
  const issues = messages(p), parts = [], metrics = [], guides = [];
  if (issues.length) return { parts, metrics, guides, issues };
  const rise = p.height/p.risers, returned = p.layout === 'return';
  const counts = returned ? [Math.ceil(p.risers/2),Math.floor(p.risers/2)] : [p.risers];
  const shoulder=p.nosing+p.headShoulder;
  const seat1 = (counts[0]-1)*p.going+shoulder, totalWidth = returned ? 2*p.width+p.well : p.width;
  const outer = p.guards==='both' || p.guards==='outer', inner = p.guards==='both' || p.guards==='inner';
  const guardInset = 70;
  const concreteParts = [];
  const addCast = (id,label,kind,profile,width,place,flightData={}) => {
    const volumeM3 = Math.abs(sectionArea(profile))*width/1e9;
    const part = {id,label,kind,material:'concrete',faces:extrude(profile,width,place),volumeM3,massKg:volumeM3*p.density};
    parts.push(part);
    concreteParts.push(part);
    if(p.detailing==='engineered') {
      const liftPlan=effectiveLiftPlan(p,p.liftPlans,id);
      addPrecastDetails({...p,...liftPlan},{cast:part,profile,width,place,...flightData},parts);
      part.detail.liftPlan=liftPlan;
      for(const text of part.detail.geometryIssues) issues.push({level:'error',text:label+' · '+text});
    }
    return part;
  };
  // "away" maps X into the landing away from the adjoining flight.
  function landing(id,label,width,away,guardSides,railEnd) {
    addCast(id,label,'landing',landingProfile(p),width,away);
    const front = p.tongue, near = front+p.joint+guardInset, far = front+p.joint+p.landingDepth-guardInset;
    // End rail along the back of a turning landing, leaving both runs open.
    // Exit and entry landings are open across their far edge.
    const landingPoint = (x,y) => away(point(x,y,p.railHeight));
    function railLine(suffix, coords, anchorFrom, anchorTo) {
      const a = landingPoint(...coords[0]), b = landingPoint(...coords[1]);
      const first = landingPoint(...anchorFrom), last = landingPoint(...anchorTo);
      const intervals = Math.max(1,Math.ceil(Math.hypot(last.x-first.x,last.y-first.y)/900));
      const posts = Array.from({length:intervals+1},(_,i)=>interpolate(first,last,i/intervals));
      railing(parts,id+'-'+suffix,[a,b],posts,p);
    }
    for (const side of guardSides) {
      railLine('zijde-'+side,[[front,side],[far,side]],[near,side],[far,side]);
    }
    if (railEnd && outer) {
      const a=landingPoint(far,guardInset), b=landingPoint(far,width-guardInset);
      const intervals = Math.ceil((width-2*guardInset)/900);
      const posts = Array.from({length:intervals-1},(_,i)=>interpolate(a,b,(i+1)/intervals));
      railing(parts,id+'-achter',[a,b],posts,p);
    }
    if (railEnd && inner) {
      const left = p.width-guardInset, right = p.width+p.well+guardInset;
      const a=landingPoint(near,left), b=landingPoint(near,right);
      const intervals=Math.ceil((right-left)/900);
      const posts=Array.from({length:intervals+1},(_,i)=>interpolate(a,b,i/intervals));
      railing(parts,id+'-schalm',[landingPoint(front,left),a,b,landingPoint(front,right)],posts,p);
    }
  }
  function bearing(id, at) {
    const x0=p.joint+p.setback, x1=p.tongue-p.setback;
    const strip=box(x0,0,-p.nib-p.pad,x1,p.width,-p.nib).map(face=>face.map(at));
    parts.push({id, label:'Elastomeer · oplegstrip', kind:'plate',material:'rubber',faces:strip});
  }

  let z0 = 0;
  counts.forEach((count, index) => {
    const floor = z0, high = count*rise, run=(count-1)*p.going;
    const seat=run+shoulder;
    const place = index === 0 ? identity : ({x,y,z})=>point(seat1-x,totalWidth-y,z+floor);
    const base = ({x,y,z}) => place(point(-x,p.width-y,z));
    const head = ({x,y,z}) => place(point(seat+x,y,high+z));
    const id = 'vlucht-'+(index+1);
    const flight=addCast(id,'Prefab vlucht '+(index+1),'flight',flightProfile(p,count,rise),p.width,place,{run,rise,count,seat});
    Object.assign(flight,{risers:count,treadCount:count-1,rise,going:p.going});
    if (p.finish==='inlay') {
      for (let i=0; i<count-1; i++) {
        const x=i*p.going+p.bevel+22, z=(i+1)*rise;
        const faces=box(x,0,z-4,x+30,p.width,z).map(face=>face.map(place));
        parts.push({id:`${id}-strip-${i+1}`,label:'Verzonken contraststrip',kind:'plate',material:'rubber',faces});
      }
    }
    bearing(id+'-onderstrip',base);
    bearing(id+'-bovenstrip',head);

    const walk = y => Array.from({length:count},(_,i) => place(point(i*p.going,y,(i+1)*rise)));
    guides.push({label:'Klimlijn vlucht '+(index+1), points:walk(p.width/2)});
    for (const [side, y, active] of [['buiten',guardInset,outer],['binnen',p.width-guardInset,inner]]) {
      if (!active) continue;
      const railPoint = (x,z) => place(point(x,y,z+p.railHeight));
      const treadPoint = i => railPoint((i+.5)*p.going,(i+1)*rise);
      const last = count-2;
      const stations = Array.from({length:last+1},(_,i)=>i).filter(i=>i===last || i%Math.max(1,Math.floor(900/p.going))===0);
      const path = [railPoint(-p.tongue,0),treadPoint(0),treadPoint(last),railPoint(seat+p.tongue,high)];
      railing(parts,id+'-'+side,path,stations.map(treadPoint),p);
    }
    // The base landing's local axes are reversed, hence swapped side offsets.
    if (index===0 && p.base==='precast') landing('onderbordes','Vertrekbordes',p.width,base,
      [outer ? p.width-guardInset : null,inner ? guardInset : null].filter(v=>v!==null),false);
    const middle = returned && index===0;
    const sides = middle ? (outer ? [guardInset,totalWidth-guardInset] : []) :
      [outer ? guardInset : null,inner ? p.width-guardInset : null].filter(v=>v!==null);
    landing(middle ? 'tussenbordes' : 'bovenbordes',middle ? 'Tussenbordes 180°' : 'Verdiepingsbordes',middle ? totalWidth : p.width,head,sides,middle);
    z0+=high;
  });
  const volume = concreteParts.reduce((s,v)=>s+v.volumeM3,0);
  metrics.push({label:'Optrede',value:rise,unit:'mm'}, {label:'Aantrede',value:p.going,unit:'mm'},
    {label:'Breedte trapopstelling',value:totalWidth,unit:'mm'},
    {label:'Breedte op handgreephoogte per vlucht',value:p.width-(Number(outer)+Number(inner))*(guardInset+21),unit:'mm'},
    {label:'Netto breedte oplegstrip',value:p.tongue-p.joint-2*p.setback,unit:'mm'},
    {label:'Betonvolume',value:volume,unit:'m³'}, {label:'Elementmassa beton',value:volume*p.density,unit:'kg'},
    ...concreteParts.map(v=>({label:'Massa '+v.label.toLowerCase(),value:v.massKg,unit:'kg'})));
  if (returned) metrics.push({label:'Peil tussenbordes',value:counts[0]*rise,unit:'mm'});
  if (p.base==='host') issues.push({level:'info',text:`Vertrekvloer vereist een sponning van ${p.nib+p.pad} mm diep. Stem de positie van de oplegstrip af op de bouwkundige vloer.`});
  issues.push({level:'info',text:p.detailing==='engineered'?
    'De elementmassa volgt uit het buitenvolume en de opgegeven volumieke massa van het gewapende element. Stem bijlegwapening aan oplegnokken, verankeringen en hijshulzen af op het constructeur- en leveranciersdetail.':
    'De massa omvat het volume van de betonelementen met de opgegeven volumieke massa. Schakel prefab engineering in voor wapeningsnetten, hijsvoorzieningen en zijverbindingen.'});
  const model={parts,metrics,issues,guides};
  if(p.detailing==='engineered') model.precast=calculatePrecast(p,parts);
  return model;
}

export const concrete = { id:'concrete', label:'Prefab betontrap', fields, build };
