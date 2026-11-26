<script>
  import { drawnLiftStations, fixedLiftLayout, liftPlanFields } from './precast-plans.js';
  export let cast, assembly, changePlan;
  $: values=cast.detail.liftPlan;
  $: overrides=assembly.instance.liftPlans?.[cast.id]??{};
  $: stations=drawnLiftStations(cast.detail.liftPoints);
  $: automatic=values.liftLayout==='auto';
  const coordinateKeys=['liftStationAX','liftStationBX','liftStationY'];
  const mm=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:3,useGrouping:false});
  // The model keeps the full generated station. Hide binary floating-point noise in its editor.
  function inputValue(key,value) {return coordinateKeys.includes(key)?Number(value.toFixed(9)):value;}
  function section(key) {
    if(['liftDiameter','liftInset','liftEmbed','liftLayout','liftStationAX','liftStationBX','liftStationY'].includes(key)) return 'Hijsvoorzieningen en posities';
    if(['liftingReference','riggingReference','liftingWLL','liftingStrength','requiredLiftingStrength','earlyCylinderStrength','liftBarArea','liftBarTail','liftBarTransfer','liftBarReference'].includes(key)) return 'Product, bijlegwapening en bewijs';
    return 'Hijsconfiguratie en belastingen';
  }
  const groups=[...new Set(liftPlanFields.map(f=>section(f.key)))];
  function setField(f,event) {
    const el=event.currentTarget,v=f.type==='number'?el.valueAsNumber:el.value;
    const changes=f.key==='liftLayout' && v==='fixed' && automatic?fixedLiftLayout(stations,overrides):{[f.key]:v};
    if(!changePlan(cast.id,changes)) el.value=inputValue(f.key,values[f.key]);
  }
</script>
<section class="editor" aria-label="Elementhijsplan">
  <header><div><small>{assembly.instance.mark} / {cast.id}</small><h2>Hijsplan · {cast.label}</h2></div>
    {#if Object.keys(overrides).length}<button onclick={()=>changePlan(cast.id,null)}>Alle trapwaarden overnemen</button>{/if}</header>
  <p>Een gewijzigde waarde geldt voor dit element. Overgenomen waarden volgen de instellingen van de trap.</p>
  {#each groups as group}<fieldset><legend>{group}</legend>
    <div class="fields">{#each liftPlanFields.filter(f=>section(f.key)===group) as f}
      {@const measured=automatic && coordinateKeys.includes(f.key)}
      <div class="field"><label for={'plan-'+f.key}>{f.label}{f.unit?' ('+f.unit+')':''}</label>
        {#if measured}<output id={'plan-'+f.key}>{stations?mm.format(stations[f.key]):'Geen positie gevonden'}</output>
        {:else if f.type==='select'}<select id={'plan-'+f.key} value={values[f.key]} onchange={e=>setField(f,e)}>{#each f.options as [key,label]}<option value={key}>{label}</option>{/each}</select>
        {:else if f.type==='number'}<input id={'plan-'+f.key} type="number" min={f.min} max={f.max} step={f.step??'any'} value={inputValue(f.key,values[f.key])} onchange={e=>setField(f,e)}/>
        {:else}<input id={'plan-'+f.key} type="text" maxlength={f.maxLength??160} value={values[f.key]} onchange={e=>setField(f,e)}/>{/if}
        {#if measured}
          <small>{stations?'Automatisch getekend':'Geen vier passende hijshulzen'}</small>
          {#if Object.hasOwn(overrides,f.key)}<button class="reset" aria-label={'Vaste maat wissen voor '+f.label} onclick={()=>changePlan(cast.id,{[f.key]:null})}>Vaste maat {mm.format(overrides[f.key])} mm wissen</button>{/if}
        {:else if Object.hasOwn(overrides,f.key)}<button class="reset" aria-label={'Trapwaarde overnemen voor '+f.label} onclick={()=>changePlan(cast.id,{[f.key]:null})}>Elementwaarde · herstel trapwaarde</button>{:else}<small>Trapwaarde</small>{/if}
      </div>
    {/each}</div>
    {#if automatic && group==='Hijsvoorzieningen en posities'}
      <p>{stations?'Bij omschakelen naar vast worden de getekende posities overgenomen.':'Kies vaste posities om zelf twee X-maten en de Y-randafstand in te voeren.'} Eerder vastgelegde elementmaten hebben voorrang.</p>
    {/if}
  </fieldset>{/each}
</section>
<style>
  .editor{padding:15px;color:var(--oa-text);background:var(--oa-panel);}header{display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap;}h2{margin:3px 0;font:600 19px var(--oa-font-heading);}small{color:var(--oa-text-secondary);font-size:10px;}p{font-size:12px;}
  fieldset{border:1px solid var(--oa-border);margin:14px 0 0;padding:12px;}legend{font-weight:650;}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(205px,100%),1fr));gap:11px 14px;}.field{display:flex;flex-direction:column;gap:3px;}
  .field label{font-weight:550;}input,select,button{font:inherit;color:var(--oa-text);background:var(--oa-panel);border:1px solid var(--oa-border);min-width:0;padding:5px;}
  .reset{align-self:flex-start;color:var(--oa-accent-text);padding:0;border:0;text-decoration:underline;font-size:10px;}button{cursor:pointer;}
  @media print{.editor{display:none;}}
</style>
