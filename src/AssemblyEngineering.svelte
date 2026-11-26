<script>
  import ConnectionSheet from './ConnectionSheet.svelte';
  import {formatValue,statusNames} from './connection-drawing.js';
  import {typeOf} from './stairwell.js';
  export let assembly,project,well,details=false,printing=false,printSheet,openDetails,changeGround;
  import {groundTypes} from './connection-ground.js';
  let connectionId='',all=false,filter='all';
  $: result=assembly.structural;
  $: connection=result.connections.find(c=>c.id===connectionId)??result.connections[0];
  $: shown=printing||filter==='all'?result.checks:result.checks.filter(c=>c.status===filter);
  $: inputs=typeOf(assembly.instance.type).fields.filter(f=>f.group&&/Constructie|Verbindingen|Vloerankers/.test(f.group));
  function print(allSheets){all=allSheets;printSheet();}
  $: if(!printing)all=false;
  export function selectConnection(id){connectionId=id;}
  function updateGround(key,value){
    const base={type:'unknown',reference:'',grade:'',edgeMm:0,spacingMm:0,tensionRd:0,shearRd:0,...connection.ground};
    changeGround(connection.id,{...base,[key]:value});
  }
</script>

{#if details}
  <div class="tools"><label>Verbinding <select aria-label="Verbinding op werkplaatsblad" value={connection?.id} onchange={e=>connectionId=e.currentTarget.value}>{#each result.connections as c}<option value={c.id}>{c.id} · {c.label}</option>{/each}</select></label>
    <button class="action-btn" onclick={()=>print(false)}>Detail afdrukken</button><button class="action-btn" onclick={()=>print(true)}>Alle verbindingsbladen afdrukken</button></div>
  {#if connection}
    {#if connection.checkIds.some(id=>id.endsWith('-ondergrond'))}
      <fieldset class="ground"><legend>Ondergrond en ankerweerstand · {connection.id}</legend>
        <label>Ondergrond <select aria-label="Ondergrond van ankergroep" value={connection.ground?.type??'unknown'} onchange={e=>updateGround('type',e.currentTarget.value)}>{#each groundTypes as [id,label]}<option value={id}>{label}</option>{/each}</select></label>
        <label>Sterkteklasse <input aria-label="Sterkteklasse ondergrond" value={connection.ground?.grade??''} onchange={e=>updateGround('grade',e.currentTarget.value)}/></label>
        <label>Product en rapport <input aria-label="Productrapport ankergroep" value={connection.ground?.reference??''} onchange={e=>updateGround('reference',e.currentTarget.value)}/></label>
        {#each [['edgeMm','Randafstand mm'],['spacingMm','Kleinste h.o.h. mm'],['tensionRd','Groepstrek Rd kN'],['shearRd','Groepsafschuiving Rd kN']] as [key,label]}
          <label>{label}<input aria-label={label} type="number" min="0" max="100000" step="any" value={connection.ground?.[key]??0} onchange={e=>updateGround(key,e.currentTarget.valueAsNumber)}/></label>
        {/each}
      </fieldset>
    {/if}
    {#each (printing&&all?result.connections:[connection]) as item (item.id)}
      <ConnectionSheet {assembly} {well} {project} connection={item}/>
    {/each}
  {:else}<p>Voor deze geometrie is geen verbindingsblad beschikbaar.</p>{/if}
{:else}
  <section class="calculation" aria-label="Constructieve berekening">
    <header><div><small>CONSTRUCTIEVE BEREKENING · {project.number} · REV. {project.revision}</small><h2>{assembly.instance.mark} · {typeOf(assembly.instance.type).label}</h2></div><strong class:failed={result.status==='fail'}>{statusNames[result.status]}</strong></header>
    <p>Grondslag · {assembly.instance.params.designBasis?.trim()||'Nog in te vullen bij de constructie-eigenschappen.'}</p>
    <details class="inputs" open={printing}><summary>Rekeninvoer en onderbouwing</summary>
      <dl>{#each inputs as f}<div><dt>{f.label}</dt><dd>{f.type==='text'?(assembly.instance.params[f.key]||'Open'):f.type==='select'?f.options.find(([key])=>key===assembly.instance.params[f.key])?.[1]:formatValue(assembly.instance.params[f.key])} {f.unit??''}</dd></div>{/each}</dl>
    </details>
    <ul>{#each result.notes as note}<li>{note}</li>{/each}</ul>
    <div class="tools"><label>Deeltoetsen <select aria-label="Filter constructieve toetsen" bind:value={filter}><option value="all">Alle statussen</option><option value="fail">Overschreden</option><option value="open">Open</option><option value="pass">Voldoet</option></select></label><button class="action-btn" onclick={()=>print(false)}>Berekening afdrukken</button></div>
    <table><thead><tr><th>Deeltoets en uitgangspunt</th><th>Rekenwaarde</th><th>Grenswaarde</th><th>Status</th></tr></thead>
      <tbody>{#each shown as c}
        {@const related=result.connections.filter(conn=>conn.checkIds.includes(c.id))}
        <tr><td><b>{c.label}</b> <small>{c.phase??''}</small><p>{c.note??''}</p>
          {#if related.length}<select class="link" aria-label={'Werkplaatsblad bij '+c.label} value="" onchange={e=>openDetails(e.currentTarget.value)}>
            <option value="" disabled>Werkplaatsblad ({related.length})</option>{#each related as conn}<option value={conn.id}>{conn.label} · {conn.id}</option>{/each}
          </select>{/if}</td><td>{formatValue(c.demand)} {c.unit??''}</td><td>{formatValue(c.capacity)} {c.unit??''}</td><td class:failed={c.status==='fail'}>{statusNames[c.status]}</td></tr>
      {/each}</tbody>
    </table>
    {#if shown.length===0}<p>Geen deeltoetsen met deze status.</p>{/if}
  </section>
{/if}

<style>
  .tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:var(--oa-panel);color:var(--oa-text);border-bottom:1px solid var(--oa-border);font:12px var(--oa-font-body)}
  .ground{display:flex;gap:7px;flex-wrap:wrap;margin:9px 12px;border:1px solid var(--oa-border);font:11px var(--oa-font-body)}.ground input{width:110px;max-width:100%;padding:4px;color:var(--oa-text);background:var(--oa-panel);border:1px solid var(--oa-border)}
  label{display:flex;align-items:center;gap:6px;max-width:100%}select{max-width:100%;min-width:0;padding:4px;color:var(--oa-text);background:var(--oa-panel);border:1px solid var(--oa-border)}
  .calculation{background:var(--oa-panel);color:var(--oa-text);padding:18px;min-height:100%;font:12px/1.45 var(--oa-font-body)}
  header{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid var(--oa-border);padding-bottom:8px}header small{font:11px var(--oa-font-mono);color:var(--oa-text-secondary)}h2{font:600 20px var(--oa-font-heading);margin:4px 0 0}
  ul{padding-left:18px}.calculation .tools{padding:6px 0}.failed{color:#a43721}
  .inputs{margin:10px 0}.inputs summary{cursor:pointer;font-weight:600}.inputs dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px}.inputs dl div{border-bottom:1px solid var(--oa-border-subtle);break-inside:avoid}.inputs dd{margin:0;font-weight:600}
  table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--oa-border);text-align:left;padding:7px;vertical-align:top}th{font-size:11px}td:not(:first-child){white-space:nowrap}td p{margin:2px 0;color:var(--oa-text-secondary);font-size:11px}.link{padding:0;margin-right:6px;border:0;background:none;color:var(--oa-accent-text);text-decoration:underline;cursor:pointer;font:10px var(--oa-font-mono)}
  @media print{.tools,.link,.ground{display:none}.calculation{padding:0;background:white;color:black;font-size:8pt}.calculation td p,.calculation header small{color:#38464c}tr{break-inside:avoid}}
</style>
