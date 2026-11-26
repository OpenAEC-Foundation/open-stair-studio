export const isBar = part => part.kind==='rebar';
export const detailNames = {
  mainBar:'Hoofdstaaf', crossBar:'Verdeelstaaf', liftAnchor:'Hijsanker',
  connectionPlate:'Verbindingsplaat', anchorBolt:'Verankeringsbout',anchorNut:'Ankermoer',
  bearingBar:'Nok- en sponningwapening',liftingBar:'Hulswapening',anchorageBar:'Ankerwapening'
};
export const checkNames = {open:'Aanvullen',fail:'Overschreden',pass:'Voldoet voor deze deeltoets'};
export const formatMeasure = (v, digits=1) => Number.isFinite(v)
  ? v.toLocaleString('nl-NL',{maximumFractionDigits:digits}) : '—';
export function sheetFor(assembly, cast) {
  const parts=assembly.parts.filter(p=>p.parentId===cast.id);
  const groups=new Map(), pieces=[], inserts=[], bent=[], counts={};
  for (const part of parts) {
    if (isBar(part)) {
      if(part.targetId) {
        const item={part,code:part.position};
        bent.push(item); pieces.push(item);
        continue;
      }
      const key=[part.role,part.layer,part.diameterMm,part.lengthMm.toFixed(3)].join('/');
      if (!groups.has(key)) groups.set(key,{code:'S'+(groups.size+1),part,count:0,members:[]});
      const group=groups.get(key);
      group.count++;
      group.members.push(part);
      pieces.push({part,code:group.code});
    } else {
      const prefix={liftAnchor:'H',connectionPlate:'P',anchorBolt:'V',anchorNut:'M'}[part.role]??'I';
      counts[prefix]=(counts[prefix]??0)+1;
      const item={part,code:part.position??prefix+counts[prefix]};
      pieces.push(item); inserts.push(item);
    }
  }
  const calculation=assembly.precast?.elements.find(e=>e.id===cast.id);
  for (const g of groups.values()) {
    const a=g.members[0].start,b=g.members.at(-1).start;
    g.pitch=g.count>1?Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/(g.count-1):null;
  }
  return {cast,parts,pieces,groups:[...groups.values()],inserts,bent,calculation};
}

export function makeDetailCsv(sheet, mark) {
  const rows=[['Trapmerk','Betonelement','Positie','Onderdeel-ID','Soort','Net','Diameter mm','Aslengte mm','X begin mm','Y begin mm','Z begin mm','X einde mm','Y einde mm','Z einde mm','Bij voorziening','Doorn Ø mm','Hartlijnstraal mm','Rechte verankering mm','Buigsegmenten lokaal (JSON)']];
  for (const {part,code} of sheet.pieces) {
    const from=part.start, to=part.end;
    rows.push([mark,sheet.cast.id,code,part.id,part.label,part.layer==='top'?'Boven':part.layer==='bottom'?'Onder':'',
      part.diameterMm,part.lengthMm,from?.x,from?.y,from?.z,to?.x,to?.y,to?.z,part.targetId,part.mandrelMm,part.bendRadiusMm,part.anchorageMm,
      part.bendSchedule?JSON.stringify(part.bendSchedule):'']);
  }
  return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(typeof v==='number' ? v.toLocaleString('nl-NL',{useGrouping:false,maximumFractionDigits:3}) : v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
}

// Equal scale in horizontal and vertical directions. Dimensions and schedules
// use the element datum even for a rotated component on an upper storey.
export function projection(sheet, side) {
  const {profile,width,centroid}=sheet.cast.detail;
  const xx=profile.map(([x])=>x);
  const cutBar=sheet.pieces.filter(({part})=>isBar(part)&&part.layer==='bottom'&&Math.abs(part.end.x-part.start.x)<.001)
    .sort((a,b)=>Math.abs(a.part.start.x-centroid.x)-Math.abs(b.part.start.x-centroid.x))[0];
  const cut=cutBar?.part.start.x??centroid.x;
  const zCut=[];
  for(let k=0;k<profile.length;k++) {
    const [x,z]=profile[k], [endX,endZ]=profile[(k+1)%profile.length];
    if((x<=cut && cut<endX)||(endX<=cut && cut<x)) zCut.push(z+(cut-x)*(endZ-z)/(endX-x));
  }
  const cross=side==='cross', project=p=>cross?[p.y,p.z]:[p.x,side==='plan'?p.y:p.z];
  const shell=cross?[[0,Math.min(...zCut)],[width,Math.min(...zCut)],[width,Math.max(...zCut)],[0,Math.max(...zCut)]]:side==='plan'
    ? [[Math.min(...xx),0],[Math.max(...xx),0],[Math.max(...xx),width],[Math.min(...xx),width]]
    : profile;
  const positions=[...shell];
  if(!cross) for (const {part} of sheet.pieces) for(const p of part.path??[part.start,part.end]) if(p) positions.push(project(p));
  const xmin=Math.min(...positions.map(p=>p[0])), xmax=Math.max(...positions.map(p=>p[0]));
  const ymin=Math.min(...positions.map(p=>p[1])), ymax=Math.max(...positions.map(p=>p[1]));
  const w=640,h=252,scale=Math.min((w-94)/Math.max(xmax-xmin,1),(h-63)/Math.max(ymax-ymin,1));
  const xy=([x,y])=>[51+(w-94-(xmax-xmin)*scale)/2+(x-xmin)*scale,23+(h-63-(ymax-ymin)*scale)/2+(ymax-y)*scale];
  const point=p=>xy(project(p));
  const bars=[];
  for (const i of sheet.pieces.filter(i=>isBar(i.part))) {
    const path=i.part.path??[i.part.start,i.part.end];
    for(let j=1;j<path.length;j++){
      const start=path[j-1],end=path[j];
      if (!cross || (Math.abs(end.x-start.x)<.001 && Math.abs(cut-start.x)<i.part.diameterMm/2)) {
        bars.push({...i,a:point(start),b:point(end)});
      } else if ((start.x<cut && cut<=end.x)||(end.x<=cut && cut<start.x)) {
        const t=(cut-start.x)/(end.x-start.x);
        const at=xy([start.y+t*(end.y-start.y),start.z+t*(end.z-start.z)]);
        bars.push({...i,a:at,b:at});
      }
    }
  }
  const inserts=cross?[]:sheet.inserts.map(i=>({...i,a:point(i.part.start),b:i.part.end?point(i.part.end):null}));
  const shellX0=Math.min(...shell.map(p=>p[0])), shellX1=Math.max(...shell.map(p=>p[0]));
  const shellY0=Math.min(...shell.map(p=>p[1])), shellY1=Math.max(...shell.map(p=>p[1]));
  return {outline:shell.map(xy).map(p=>p.join(',')).join(' '),bars,inserts,center:point(centroid),cut,cutX:xy([cut,0])[0],
    low:xy([shellX0,shellY0]),high:xy([shellX1,shellY1]),width:shellX1-shellX0,height:shellY1-shellY0};
}
