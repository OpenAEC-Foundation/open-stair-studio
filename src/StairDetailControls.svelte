<script>
  import { generateStairGeometry } from './stair.js';
  import { buildStairDetails } from './stair-details.js';
  import {timberDimensions,timberStyles,noseNames} from './timber-settings.js';
  export let stair;
  export let update;
  export let issue = null;
  function exportDetails() {
    if (issue) return;
    const model=generateStairGeometry(stair,{projectIsometric:false});
    const parts=buildStairDetails(stair,model);
    const rows=[['Merk','Onderdeel','Materiaal','Aantal','Aslengte mm','Diameter mm','Hoogte mm','Dikte mm','Netto m³','Profiel','Ruwlengte mm','Ruwbreedte mm','Ruwdikte mm','Bruto m³'],
      ...parts.map(p=>[p.id,p.label,p.material==='timber'?stair.material:'Verzinkt staal',1,p.lengthMm,p.diameterMm,p.heightMm,p.thicknessMm,p.volumeM3,p.profileName,p.stockLengthMm,p.stockWidthMm,p.stockThicknessMm,p.stockVolumeM3])];
    const cell=x=>'"'+(typeof x==='number'?x.toLocaleString('nl-NL',{useGrouping:false,maximumFractionDigits:6}):String(x??'')).replaceAll('"','""')+'"';
    const url=URL.createObjectURL(new Blob(['\uFEFF',rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=stair.mark+'-leuningen-stootborden.csv';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
</script>

<section class="property-section">
  <h3>Houtdetails</h3>
  <label for="wood-detail">Uitvoering balustrade</label><select id="wood-detail" value={stair.timberDetail} onchange={e=>update('timberDetail',e.currentTarget.value)}>{#each Object.entries(timberStyles) as [id,name]}<option value={id}>{name}</option>{/each}</select>
  <label for="stair-rail-side">Leuning bij oplopen</label>
  <select id="stair-rail-side" value={stair.railSide ?? 'none'} onchange={e=>update('railSide',e.currentTarget.value)}>
    <option value="none">Geen leuning</option><option value="left">Links</option><option value="right">Rechts</option><option value="both">Beide zijden</option>
  </select>
  {#if stair.railSide && stair.railSide!=='none'}
    <label for="stair-rail-height">{stair.timberDetail==='basic'?'Hoogte greepas':'Hoogte bovenkant handlijst'} boven wang (mm)</label>
    <input id="stair-rail-height" class="text-field" type="number" min="650" max="1350" value={stair.railHeight} onchange={e=>update('railHeight',e.currentTarget)} />
  {/if}
  {#if stair.timberDetail!=='basic' && stair.railSide!=='none'}
    <details><summary>Profielmaten balustrade</summary>
    {#each timberDimensions as f}<label for={'wood-'+f.key}>{f.label} (mm)</label><input class="text-field" id={'wood-'+f.key} type="number" min={f.min} max={f.max} step="any" value={stair[f.key]} onchange={e=>update(f.key,e.currentTarget)}/>{/each}</details>
  {/if}
  <label for="wood-nose">Neusprofiel trede</label><select id="wood-nose" value={stair.noseProfile} onchange={e=>update('noseProfile',e.currentTarget.value)}>{#each Object.entries(noseNames) as [id,name]}<option value={id}>{name}</option>{/each}</select>
  {#if stair.noseProfile!=='square'}<label for="wood-nose-size">{stair.noseProfile==='round'?'Radius':'Vellingmaat'} (mm)</label><input id="wood-nose-size" class="text-field" type="number" min=".5" max="25" step=".5" value={stair.noseSize} onchange={e=>update('noseSize',e.currentTarget)}/>{/if}
  <label for="stair-riser-boards">Invulling tussen de treden</label>
  <select id="stair-riser-boards" value={stair.riserBoards ?? 'none'} onchange={e=>update('riserBoards',e.currentTarget.value)}>
    <option value="none">Open trap</option><option value="closed">Houten stootborden</option>
  </select>
  {#if stair.riserBoards==='closed'}
    <label for="stair-riser-thickness">Dikte stootbord (mm)</label>
    <input id="stair-riser-thickness" class="text-field" type="number" min="8" max="42" value={stair.riserThickness} onchange={e=>update('riserThickness',e.currentTarget)} />
    {#if !['quarter_winder','half_winder'].includes(stair.type)}
      <label for="stair-riser-position">Aansluiting stootbord</label>
      <select id="stair-riser-position" value={stair.riserPosition??'auto'} onchange={e=>update('riserPosition',e.currentTarget.value)}>
        <option value="auto">Automatisch · sluit tussen de treden</option><option value="manual">Boven- en onderzijde instellen</option>
      </select>
    {/if}
    {#if stair.riserPosition==='manual' && !['quarter_winder','half_winder'].includes(stair.type)}
      <label for="stair-riser-top">Bovenzijde achter tredevoorzijde (mm)</label>
      <input id="stair-riser-top" class="text-field" type="number" min="0" max="80" value={stair.riserTopInset} onchange={e=>update('riserTopInset',e.currentTarget)} />
      <label for="stair-riser-bottom">Onderzijde vóór achterrand ondertrede (mm)</label>
      <input id="stair-riser-bottom" class="text-field" type="number" min={stair.riserThickness} max="100" value={stair.riserBottomInset} onchange={e=>update('riserBottomInset',e.currentTarget)} />
    {/if}
    <label for="wood-wellat">Wellat onder de neus</label><select id="wood-wellat" value={stair.wellatType} onchange={e=>update('wellatType',e.currentTarget.value)}><option value="none">Geen</option><option value="chamfered">Met vellingkant</option></select>
    {#if stair.wellatType==='chamfered'}{#each [['wellatWidth','Breedte',3,35],['wellatHeight','Hoogte',5,45]] as [key,name,min,max]}<label for={'wood-'+key}>{name} wellat (mm)</label><input class="text-field" id={'wood-'+key} type="number" {min} {max} value={stair[key]} onchange={e=>update(key,e.currentTarget)}/>{/each}{/if}
  {/if}
  {#if stair.riserBoards==='closed' || (stair.railSide && stair.railSide!=='none')}
    {#if issue}<p role="alert">{issue.detail}</p>{/if}
    <button class="action-btn" disabled={!!issue} onclick={exportDetails}>Detailstukken als CSV</button>
    <small>Het tabblad Houtdetails toont de werkplaatstekening en de profielmaten per merk.</small>
  {/if}
</section>

<style>small { display:block; margin-top:6px; font-size:11px; line-height:1.35; color:var(--oa-text-secondary); }</style>
