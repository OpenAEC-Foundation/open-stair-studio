<script>
  import {sheetFor,makeDetailCsv} from './precast-sheets.js';
  import PrecastElementSheet from './PrecastElementSheet.svelte';
  import ElementLiftPlan from './ElementLiftPlan.svelte';
  import { concrete } from './components/concrete.js';
  export let assembly, project, downloadFile, printSheet, enable, printing,changePlan,changeParam;
  let selected='',panel='Werkplaatsblad',printAll=false;
  $: casts=assembly.parts.filter(p=>p.material==='concrete' && p.detail);
  $: cast=casts.find(p=>p.id===selected)??casts[0];
  $: sheet=cast?sheetFor(assembly,cast):null;
  $: mark=assembly.instance.mark;
  $: inputs=assembly.instance.params;
  export function showCalculation(id) {selected=id;panel='Berekening';}
  function exportList() {
    if(sheet) downloadFile([project.number,mark,cast.id,'instortstaat.csv'].join('-'),
      makeDetailCsv(sheet,mark),'text/csv;charset=utf-8');
  }
</script>
<section class="shop" aria-label="Prefab werkvoorbereiding">
  {#if inputs.detailing!=='engineered'}
    <div class="intro"><h2>Prefab werkvoorbereiding</h2><p>Voeg per vlucht en bordes de wapeningsnetten, hijsankers en zijverbindingen toe. Vul in de eigenschappen de projectlasten, productgegevens en het hijsplan in.</p>
      <button class="action-btn" onclick={enable}>Wapening en instortdelen toevoegen</button></div>
  {:else if sheet}
    <div class="toolbar">
      <label>Prefabelement <select aria-label="Prefabelement" value={cast.id} onchange={e=>selected=e.currentTarget.value}>{#each casts as c}<option value={c.id}>{c.label} · {c.id}</option>{/each}</select></label>
      {#each ['Werkplaatsblad','Berekening','Elementhijsplan','Bijlegwapening'] as name}<button class:active={panel===name} aria-pressed={panel===name} onclick={()=>panel=name}>{name}</button>{/each}
      <label><input type="checkbox" bind:checked={printAll}/> Alle elementen in de PDF</label>
      <button onclick={printSheet}>Elementblad en berekening als PDF</button><button onclick={exportList}>Instortstaat CSV</button>
    </div>
    {#if panel==='Elementhijsplan' && !printing}<ElementLiftPlan {cast} {assembly} {changePlan}/>{/if}
    {#if panel==='Bijlegwapening' && !printing}
      <div class="local-input"><h2>Bijlegwapening · {mark}</h2>
        {#if inputs.localReinforcement!=='detailed'}<p>Voeg gebogen staven toe aan de oplegzones, hijshulzen en zijankers van deze betontrap.</p>
          <button onclick={()=>changeParam('localReinforcement','detailed')}>Bijlegwapening toevoegen</button>
        {:else}<details><summary>Bijlegwapening van deze trap instellen</summary><div class="local-fields">
          {#each concrete.fields.filter(f=>f.group?.startsWith('Bijlegwapening')) as f}
            <label>{f.label}{f.unit?' ('+f.unit+')':''}
              {#if f.type==='select'}<select value={inputs[f.key]} onchange={e=>changeParam(f.key,e.currentTarget.value)}>{#each f.options as [key,label]}<option value={key}>{label}</option>{/each}</select>
              {:else if f.type==='text'}<input type="text" maxlength={f.maxLength??160} value={inputs[f.key]} onchange={e=>{if(!changeParam(f.key,e.currentTarget.value))e.currentTarget.value=inputs[f.key]}}/>
              {:else}<input type="number" min={f.min} max={f.max} step={f.step??'any'} value={inputs[f.key]} onchange={e=>{if(!changeParam(f.key,e.currentTarget.valueAsNumber))e.currentTarget.value=inputs[f.key]}}/>{/if}
            </label>{/each}
        </div></details>{/if}
      </div>
    {/if}
    {#if printing && printAll}
      {#each casts as element}<div class="printed-element"><PrecastElementSheet {assembly} {project} {panel} sheet={sheetFor(assembly,element)}/></div>{/each}
    {:else}<PrecastElementSheet {assembly} {project} {panel} {sheet}/>{/if}
  {:else}<div class="intro"><h2>Controleer de elementgeometrie</h2>{#each assembly.issues as i}<p>{i.text}</p>{/each}</div>{/if}
</section>
<style>
  .shop{background:var(--oa-workspace);min-height:100%;font:12px var(--oa-font-body);}
  .intro{padding:20px;max-width:700px;color:var(--oa-text);}.intro h2{font-size:18px;}
  .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:7px 10px;background:var(--oa-panel);border-bottom:1px solid var(--oa-border);}
  .local-input{padding:12px 16px;color:var(--oa-text);background:var(--oa-panel);}.local-input h2{font-size:15px;}.local-input summary{cursor:pointer;}
  .local-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:8px 14px;padding:12px 0;}.local-fields label{display:grid;align-content:end;gap:3px;}.local-fields input{min-width:0;color:var(--oa-text);background:var(--oa-panel);border:1px solid var(--oa-border);padding:5px;}
  button,select{font:inherit;color:var(--oa-text);border:1px solid var(--oa-border);background:var(--oa-panel);padding:4px 8px;}
  button.active{box-shadow:inset 0 -2px var(--oa-accent);font-weight:600;}
  @media print{.shop{background:white;min-height:0;}.toolbar{display:none;}.printed-element+.printed-element{break-before:page;}}
</style>
