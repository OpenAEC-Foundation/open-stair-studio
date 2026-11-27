<script>
  import { flushSync, tick } from 'svelte';
  import StairViewport from './StairViewport.svelte';
  import AssemblyEngineering from './AssemblyEngineering.svelte';
  import WellDrawing from './WellDrawing.svelte';
  import PrecastWorkshop from './PrecastWorkshop.svelte';
  import SteelPlateSheet from './SteelPlateSheet.svelte';
  import Icon from './Icon.svelte';
  import {escapeReference} from './escape-capacity.js';
  import { componentTypes, elevationOf, floorParts, kindNames, levelsFor, materialNames, typeOf } from './stairwell.js';
  export let well, instance, assemblies, project, add, addConcreteExample, exportIfc, downloadFile, change;
  let mode='3D', scope='selected', context=false, viewport, printing=false;
  let camera=null, zoom=100;
  let workshop, engineering;
  async function openConnection(id){mode='Verbindingen';await tick();engineering?.selectConnection(id);}
  export function showMode(value){mode=value;}
  export async function showCalculation(id) {
    mode='Prefabdetails';
    await tick();
    workshop?.showCalculation(id);
  }
  const number = v => typeof v==='number'?v.toLocaleString('nl-NL',{maximumFractionDigits:2}):v;
  const quantity = (value, digits) => Number.isFinite(value) ? value.toLocaleString('nl-NL',{useGrouping:false,maximumFractionDigits:digits}) : '';
  $: current=assemblies.find(a=>a.instance.id===instance?.id);
  $: structuralMode=mode==='Berekening'||mode==='Verbindingen';
  $: if(!current?.structural && (mode==='Berekening'||mode==='Verbindingen'))mode='Ontwerpcontrole';
  let insertsOnly=false;
  $: detailed=current?.instance.params.detailing==='engineered';
  $: if(instance?.type!=='concrete' && mode==='Prefabdetails') mode='3D';
  $: if(mode==='Plaatwang'&&!current?.parts.some(part=>part.platePattern)) mode='3D';
  $: if (!current) {scope='selected';context=false;}
  $: floor=instance?.storey ?? 0;
  $: onFloor=assemblies.filter(a=>a.instance.storey===floor);
  $: visible=scope==='building'?assemblies:scope==='floor'?onFloor:current?[current]:[];
  $: sheetModels=scope==='selected'&&current?[current]:onFloor;
  $: printLevels=scope==='building'?[...new Set(visible.map(a=>a.instance.storey))].sort((a,b)=>a-b):[floor];
  $: angle=((instance?.rotation??0)+(instance?.type==='loft'?180:0))*Math.PI/180;
  $: scene={viewDirection:{x:Math.cos(angle),y:Math.sin(angle)},componentParts:[...visible.flatMap(a=>insertsOnly&&detailed?a.parts.filter(p=>p.parentId):a.parts),...(context?floorParts(well,levelsFor(visible.map(a=>a.instance))):[])]};
  $: issues=visible.flatMap(a=>a.issues.filter(i=>i.level!=='info').map(i=>({...i,mark:a.instance.mark})));
  let lastScene='';
  $: {
    const signature=scope+'/'+context+'/'+visible.map(a=>a.instance.id+'@'+a.instance.storey).join('/');
    if(signature!==lastScene){lastScene=signature; camera=null; tick().then(()=>viewport?.home());}
  }
  function csv(){
    const rows=[['Component','Bouwlaag','Onderdeel','Omschrijving','Categorie','Materiaal','Nettovolume (m³)','Massa (kg)',
      'Ruwe plaatlengte (mm)','Ruwe plaathoogte (mm)','Plaatdikte (mm)','Bruto plaatmassa (kg)'],
      ...visible.flatMap(a=>a.parts.map(p=>[a.instance.mark,a.instance.storey,p.id,p.label,kindNames[p.kind]??p.kind,materialNames[p.material]??p.material,
        quantity(p.volumeM3,6),quantity(p.massKg,3),quantity(p.platePattern?.stockLength,2),quantity(p.platePattern?.stockHeight,2),
        quantity(p.platePattern?.thickness,2),quantity(p.platePattern?.stockMassKg,3)]))];
    const cell=v=>'"'+String(v).replaceAll('"','""')+'"';
    downloadFile(project.number+'-trappenhuis-onderdelen.csv','\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function printSheet(){printing=true;tick().then(()=>window.print());}
</script>
<svelte:window onbeforeprint={()=>flushSync(()=>printing=true)} onafterprint={()=>printing=false}/>
<section class="well-work" aria-label="Trap ontwerpen">
  {#if !current}
    <div class="empty-well"><Icon name="bim.workspace" size={32}/><h2>Trap of ladder ontwerpen</h2><p>Kies een trap voor de eerste bouwlaag. Je kunt de componenten vervolgens plaatsen en naar een volgende verdieping kopiëren.</p>
      <div class="choices">{#each componentTypes as t}<button class="action-btn" onclick={()=>add(t.id)}>{t.label}</button>{/each}</div>
      <button class="action-btn example" onclick={()=>{
        if (addConcreteExample()) {scope='building';context=true;mode='3D';}
      }}>Plaats voorbeeldtrappenhuis met twee bouwlagen</button>
      <button class="action-btn example" onclick={()=>{
        if(addConcreteExample(true)){scope='selected';context=false;insertsOnly=true;mode='Prefabdetails';}
      }}>Plaats prefabvoorbeeld met bijlegwapening en hijsplannen</button>
    </div>
  {:else}
    <div class="well-tools">
      <div class="mode">{#each ['3D','Plattegrond','Aanzicht','Onderdelen','Ontwerpcontrole',...(current.parts.some(part=>part.platePattern)?['Plaatwang']:[]),...(current.structural?['Berekening','Verbindingen']:[]),...(instance.type==='concrete'?['Prefabdetails']:[])] as v}<button class:active={mode===v} aria-pressed={mode===v} onclick={()=>mode=v}>{v}</button>{/each}</div>
      {#if mode!=='Prefabdetails'&&mode!=='Plaatwang'&&!structuralMode}<select aria-label="Zichtbare componenten" value={scope} onchange={e=>{scope=e.currentTarget.value;context=scope!=='selected';}}><option value="selected">Actief ontwerp</option><option value="floor">Vertrekbouwlaag</option><option value="building">Hele trappenhuis</option></select>
      <label><input type="checkbox" bind:checked={context}/> Vloerranden</label>{/if}
      {#if mode==='3D' && detailed}<label><input type="checkbox" bind:checked={insertsOnly}/> Alleen wapening en instortdelen</label>{/if}
    </div>
    <div class="stage" class:sheet={mode!=='3D'} class:precast={mode==='Prefabdetails'||mode==='Plaatwang'||structuralMode}>
      {#if mode==='3D'}
        {#if scene.componentParts.length}
          <StairViewport geometry={scene} bind:this={viewport} bind:cameraState={camera} bind:zoomPercent={zoom}/>
          <div class="fit"><button title="Passend" aria-label="Passend" onclick={()=>viewport?.fit()}><Icon name="view.fit" size={16}/></button><small>{zoom}%</small></div>
        {:else}<p class="notice">Pas de gemarkeerde componentmaten aan om het model te tekenen.</p>{/if}
      {:else if mode==='Prefabdetails'}
        <PrecastWorkshop bind:this={workshop} assembly={current} {project} {downloadFile} {printSheet} {printing}
          changePlan={(id,changes)=>change('liftPlan',id,changes)} changeParam={(key,value)=>change('params',key,value)} enable={()=>change('params','detailing','engineered')}/>
      {:else if mode==='Plaatwang'}
        <SteelPlateSheet assembly={current} {project} {downloadFile} {printSheet}/>
      {:else if structuralMode && current.structural}
        <AssemblyEngineering bind:this={engineering} assembly={current} {project} {well} {printSheet} {printing} details={mode==='Verbindingen'} openDetails={openConnection} changeGround={(id,plan)=>change('connectionGround',id,plan)}/>
      {:else if mode==='Ontwerpcontrole'}
        <div class="checks-work"><h2>{instance.mark} · Ontwerpcontrole</h2><p>{typeOf(instance.type).label}</p>{#if current.structural}<button class="action-btn" onclick={()=>mode='Berekening'}>Constructieve berekening openen</button>{/if}
          <dl>{#each current.metrics as m}<div><dt>{m.label}</dt><dd>{number(m.value)} {m.unit??''}</dd></div>{/each}</dl>
          {#if current.escape}{@const c=current.escape}<h3>Doorstroomcapaciteit · Nederlandse nieuwbouw</h3>
            <p>{c.capacity!=null?c.capacity+' personen':'Capaciteit open'} · {c.status==='pass'?'Bezetting binnen capaciteit':c.status==='fail'?'Bezetting overschrijdt capaciteit':c.status==='na'?'Buiten toepassingsgebied':'Aanvullen'}</p>
            {#each c.reasons as reason}<p>{reason}</p>{/each}<p>{c.scope} <a href={escapeReference.url} target="_blank" rel="noreferrer">Bron IPLO</a></p>{/if}
          {#each current.issues as issue}<p>{issue.text}</p>{/each}
        </div>
      {:else if mode==='Onderdelen'}
        {@const hasConcrete=visible.some(a=>a.parts.some(p=>Number.isFinite(p.massKg)))}
        <table><thead><tr><th>Merk</th><th>Onderdeel</th><th>Omschrijving</th><th>Materiaal</th>{#if hasConcrete}<th>Nettovolume (m³)</th><th>Massa (kg)</th>{/if}</tr></thead><tbody>
          {#each visible as a}{#each a.parts as p}<tr><td>{a.instance.mark}</td><td>{p.id}</td><td>{p.label}</td><td>{materialNames[p.material]??p.material}</td>{#if hasConcrete}<td>{quantity(p.volumeM3,4)}</td><td>{quantity(p.massKg,2)}</td>{/if}</tr>{/each}{/each}
        </tbody></table>
      {:else}
        <WellDrawing assemblies={mode==='Aanzicht'?visible:sheetModels} {well} storey={scope==='building'&&mode==='Aanzicht'?0:floor}
          allLevels={scope==='building'&&mode==='Aanzicht'} side={mode==='Aanzicht'?'elevation':'plan'} showContext={context}/>
      {/if}
    </div>
    <div class="summary">
      <header><h2>{instance.mark} · {typeOf(instance.type).label}</h2><span>Vertrek op bouwlaag {floor} · {current.parts.length} onderdelen</span></header>
      {#if issues.length}<ul>{#each issues as i}<li><b>{i.mark}</b> · {i.text}</li>{/each}</ul>{/if}
      <details><summary>Maten en hoeveelheden</summary><dl>{#each current.metrics as m}<div><dt>{m.label}</dt><dd>{number(m.value)} {m.unit??''}</dd></div>{/each}</dl></details>
      <div class="actions"><button class="action-btn" onclick={()=>exportIfc()}>Ontwerp als IFC4</button>{#if well.instances.length>1}<button class="action-btn" onclick={()=>exportIfc('project')}>Geheel project als IFC4</button>{/if}<button class="action-btn" onclick={printSheet}>Tekening afdrukken</button><button class="action-btn" onclick={csv}>Onderdelen als CSV</button></div>
    </div>
    {#if printing && mode!=='Prefabdetails' && mode!=='Plaatwang' && !structuralMode}<article class="well-print">
      {#if scope==='building'}<div class="building-sheet"><h1>{project.number} · Trappenhuis</h1><p>{project.name} · revisie {project.revision} · gebouw-aanzicht · mm</p>
        <WellDrawing assemblies={visible} {well} storey={0} side="elevation" allLevels={true} showContext={context}/>
        <p>{visible.map(a=>a.instance.mark+' · laag '+a.instance.storey).join(' / ')}</p></div>{/if}
      {#each printLevels as n}
        {@const group=visible.filter(a=>a.instance.storey===n)}
        <section class="level-sheet"><h1>{project.number} · {group.map(a=>a.instance.mark).join(' / ')}</h1><p>{project.name} · revisie {project.revision} · bouwlaag {n} · peil +{elevationOf(well,n)} mm · coördinatietekening</p>
          <div class="sheets"><WellDrawing assemblies={group} {well} storey={n} side="plan" showContext={context}/><WellDrawing assemblies={group} {well} storey={n} side="elevation" showContext={context}/></div>
          {#each group as a}<h2>{a.instance.mark} · {typeOf(a.instance.type).label}</h2><dl>{#each a.metrics as m}<div><dt>{m.label}</dt><dd>{number(m.value)} {m.unit??''}</dd></div>{/each}</dl>
            {#each a.issues as issue}<p>{a.instance.mark} · {issue.text}</p>{/each}{/each}
        </section>
      {/each}
    </article>{/if}
  {/if}
</section>
<style>
  .checks-work{padding:16px;color:var(--oa-text);}.checks-work dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;}.checks-work dd{margin:2px 0;font-weight:650;}
  .well-work{display:flex;flex:1;flex-direction:column;min-height:0;overflow:auto;color:var(--oa-text);background:var(--oa-panel);}
  .empty-well{margin:auto;max-width:440px;padding:28px;}
  h2{margin:0;font:600 16px var(--oa-font-heading);}p{font-size:12px;line-height:1.55;}
  .empty-well h2{margin-top:12px;font-size:21px;}.choices,.actions,.well-tools,.mode,.fit,.summary header{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
  .example{margin-top:18px;}
  .well-tools{padding:5px 8px;border-bottom:1px solid var(--oa-border);background:var(--oa-panel);}
  .mode{gap:0;} .mode button,.fit button,.well-tools select{height:27px;padding:2px 8px;color:var(--oa-text);background:var(--oa-panel);border:1px solid var(--oa-border);font:11px var(--oa-font-body);}
  .mode button+button{border-left:0;}.mode button.active{color:var(--oa-accent-text);box-shadow:inset 0 -2px var(--oa-accent);font-weight:600;}
  .well-tools label,.summary header span{font:11px var(--oa-font-body);color:var(--oa-text-secondary);}
  .stage{min-height:210px;flex:1;position:relative;overflow:hidden;background:var(--oa-workspace);}
  .stage.sheet{overflow:auto;}.fit{position:absolute;right:9px;top:9px;padding:2px;background:var(--oa-panel);border-radius:3px;}.fit small{padding:0 3px;}
  .summary{padding:9px 12px;border-top:1px solid var(--oa-border);max-height:36%;overflow:auto;}
  .summary header{justify-content:space-between;}.summary h2{font-size:14px;}.summary details{margin:6px 0;font-size:11px;}
  .summary li{font-size:11px;}.summary ul{padding-left:17px;margin:5px 0;}
  dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 12px;}
  dt{font-size:10px;color:var(--oa-text-secondary);}dd{margin:0;font:600 12px var(--oa-font-mono);}
  .actions{margin-top:7px;}table{border-collapse:collapse;width:100%;font-size:11px;}td,th{padding:4px 6px;text-align:left;border-bottom:1px solid var(--oa-border);}
  thead{position:sticky;top:0;background:var(--oa-panel);}.notice{padding:12px;}.well-print{display:none;}
  @media print{
    :global(body:has(.well-work)),:global(.oa-app:has(.well-work)),:global(.editor-area:has(.well-work)),:global(.workspace:has(.well-work)){height:auto!important;min-height:0!important;background:white!important;}
    .well-work{display:block;overflow:visible;background:white;color:black;}
    .well-tools,.stage,.summary{display:none;}.well-print{display:block;}.sheets{display:grid;grid-template-columns:1fr 1fr;gap:3mm;}
    .stage.precast{display:block;overflow:visible;min-height:0;}
    :global(body:has(.stage.precast) .print-heading){display:none!important;}
    .well-print h1{font-size:14pt;}.well-print p,.well-print dt{font-size:8pt;}.well-print dd{font-size:9pt;}
    .well-print dl{grid-template-columns:repeat(4,1fr);}
    .building-sheet,.level-sheet:not(:last-child){break-after:page;}
    .building-sheet :global(figure){height:140mm;}
  }
</style>
