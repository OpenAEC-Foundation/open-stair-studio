<script>
  import { heightOn, elevationOf, placementFields, typeOf, wellFields } from './stairwell.js';
  export let well, instance, select, change, duplicate, remove, issues = [];
  const inputId = (section, key) => 'well-' + (section === 'params' ? '' : section+'-') + key;
  $: designFields=instance ? typeOf(instance.type).fields : [];
  $: groups=[...new Set(designFields.map(f=>f.group).filter(Boolean))];
  function edit(section, key, event) {
    const el=event.currentTarget;
    const value=el.type==='number' ? (el.value==='' ? NaN : el.valueAsNumber) : el.value;
    if (!change(section,key,value)) el.value=section==='shaft'?well[key]:section==='params'?instance.params[key]:instance[key];
  }
</script>
{#snippet fields(section, defs, values)}
  {#each defs as f}
    <label for={inputId(section,f.key)}>{f.label}</label>
    {#if f.type==='select'}
      <select id={inputId(section,f.key)} value={values[f.key]} onchange={e=>edit(section,f.key,e)}>
        {#each f.options as [id,label]}<option value={id}>{label}</option>{/each}
      </select>
    {:else if f.type==='text'}
      <input id={inputId(section,f.key)} class="text-field" type="text" maxlength={f.maxLength??160} value={values[f.key]} onchange={e=>edit(section,f.key,e)} />
    {:else}
      <div class="numeric-input"><input id={inputId(section,f.key)} type="number" min={f.min} max={f.max} step={f.step??'any'} value={values[f.key]} onchange={e=>edit(section,f.key,e)} /><span>{f.unit??'mm'}</span></div>
    {/if}
  {/each}
{/snippet}
<div class="properties-content">
  <div class="property-section">
    <h3>Trapontwerp</h3>
    {#if instance}
      <label for="well-instance">Actief ontwerp</label>
      <select id="well-instance" value={instance.id} onchange={e=>select(e.currentTarget.value)}>
        {#each well.instances as item}<option value={item.id}>{item.mark} · {typeOf(item.type).label} · laag {item.storey}</option>{/each}
      </select>
      <label for="well-mark">Merk</label><input class="text-field" id="well-mark" value={instance.mark} onchange={e=>edit('place','mark',e)} />
    {:else}<p>Voeg een component toe om zijn bouwlaag, positie en uitvoering te bewerken.</p>{/if}
  </div>
  {#if instance}
    <div class="property-section"><h3>{typeOf(instance.type).label}</h3>{@render fields('params',designFields.filter(f=>!f.group),instance.params)}</div>
    {#if instance.type!=='concrete' || instance.params.detailing==='engineered'}
      {#each groups as group}<details class="property-section"><summary>{group}</summary>{@render fields('params',designFields.filter(f=>f.group===group),instance.params)}</details>{/each}
    {/if}
    <details class="property-section"><summary>Plaatsing en bouwlaag</summary>{@render fields('place',placementFields,instance)}
      <label for="well-level-height">Hoogte van deze bouwlaag</label><div class="numeric-input"><input id="well-level-height" type="number" min="500" max="10000" value={heightOn(well,instance.storey)} onchange={e=>{if (!change('level','height',e.currentTarget.valueAsNumber)) e.currentTarget.value=heightOn(well,instance.storey);}}/><span>mm</span></div>
      <small>Vertrekpeil {elevationOf(well,instance.storey)} mm · aankomstpeil {elevationOf(well,instance.storey+1)} mm</small>
      {#if well.heights?.[instance.storey]!=null}<button class="action-btn" onclick={()=>change('level','height',null)}>Standaardhoogte gebruiken</button>{/if}
      <button class="action-btn" onclick={duplicate}>Kopiëren naar volgende bouwlaag</button>
    </details>
  {/if}
  <details class="property-section"><summary>Schacht en verdiepingen</summary>{@render fields('shaft',wellFields,well)}</details>
  {#if issues.length}<div class="property-section"><h3>Coördinatie</h3>{#each issues as i}<p class:warning={i.level!=='info'}>{i.text}</p>{/each}</div>{/if}
  {#if instance}<div class="property-section"><button class="action-btn" onclick={remove}>Component verwijderen</button></div>{/if}
</div>
<style>
  p{font-size:11px;line-height:1.5;color:var(--oa-text-secondary);}
  .warning{border-left:2px solid var(--oa-accent);padding-left:6px;}
  button{margin-top:7px;}
  summary{cursor:pointer;font-weight:600;margin-bottom:8px;}
</style>
