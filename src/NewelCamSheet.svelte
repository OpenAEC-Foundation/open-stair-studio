<script>
  import {compileNewelFaceJob,newelFaceSetups,writeNewelLinuxCnc} from './newel-cam.js';
  import {mm} from './timber-sheet.js';
  export let post, model, downloadFile;
  let chosenFace='';
  $: faces=newelFaceSetups(post);
  $: active=faces.find(f=>f.id===chosenFace && f.pockets.length)??faces.find(f=>f.pockets.length);
  function prepare(face,cam,metadata,mark) {
    if(!face) return {};
    try { return {job:compileNewelFaceJob(face,cam,{...metadata,stairMark:mark})}; }
    catch(error){return {error:error.message};}
  }
  $: result=prepare(active,model.cam,model.project,model.stair.mark);
</script>

<p><b>Aansluitende treden</b> {(post.connectedTreadIds??[]).join(' · ')||'Geen'}</p>
{#if post.pockets.length}
  <table>
    <thead><tr><th>Tredehuis</th><th>Onderkant vanaf voet</th><th>Bovenkant vanaf voet</th><th>Hoogte</th><th>Insteek</th><th>Af te tekenen hoekpunten X / Y (mm)</th></tr></thead>
    <tbody>{#each post.pockets as p}<tr>
      <td>{p.treadId}</td><td>{mm(p.lowerZ-post.lowerZ)} mm</td><td>{mm(p.upperZ-post.lowerZ)} mm</td>
      <td>{mm(p.upperZ-p.lowerZ)} mm</td><td>{mm(p.depth)} mm</td>
      <td>{p.points.map(v=>mm(v.x-post.xMin)+' / '+mm(v.y-post.yMin)).join(' · ')}</td>
    </tr>{/each}</tbody>
  </table>
  <p>Meet de hoekpunten van de horizontale doorsnede vanaf de hoek X− / Y−, in de positieve X- en Y-richting van de plattegrond.</p>
  {#each post.pockets.filter(p=>p.cornerLandsMm2?.length) as p}
    <p class="finding"><b>{p.treadId} · doorlopende hoekgroef.</b> Tussen de openingen op twee spilvlakken blijft een hoekstuk van {p.cornerLandsMm2.map(mm).join(' / ')} mm² staan. Controleer dit resthout vóór de bewerking.</p>
  {/each}
  <div class="machining">
    <label>Spilvlak
      <select value={active?.id} onchange={e=>chosenFace=e.currentTarget.value}>
        {#each faces.filter(f=>f.pockets.length) as face}<option value={face.id}>{face.label} · {face.pockets.length} huizen</option>{/each}
      </select>
    </label>
    <button class="action-btn" disabled={!result.job} onclick={()=>downloadFile(result.job.fileStem+'.ngc',writeNewelLinuxCnc(result.job),'text/plain')}>Spilhuizen voorfrezen · LinuxCNC</button>
  </div>
  {#if active}
    <p><b>Opspanning {active.label}</b> Leg dit vlak boven. G54 X0 ligt aan de voet, X+ wijst naar de kop. Y0 ligt op model-XY ({mm(active.origin.x)}, {mm(active.origin.y)}), Y+ wijst in de richting ({active.yAxis.x}, {active.yAxis.y}). Z0 ligt op het bovenvlak.</p>
  {/if}
  {#if result.job}
    <p>Frees Ø {mm(result.job.cam.toolDiameter)} mm. Houd aan beide zijden één freesdiameter vrij voor uitloop. Bewerk ieder aangegeven spilvlak. Steek de inwendige hoeken en eventuele schuine ruggen na volgens de horizontale doorsneden op dit blad.</p>
    {#if result.job.skipped.length}<p class="finding">Frees te breed voor {result.job.skipped.join(', ')}. Werk deze huizen afzonderlijk af.</p>{/if}
  {:else if result.error}<p class="finding">{result.error}</p>{/if}
{:else}
  <p>Deze spil heeft stuikende tredeaansluitingen. Zaag de spil volgens de ruwmaat op het blad.</p>
{/if}
<style>
  table{width:100%;border-collapse:collapse;text-align:left;font-size:11px}td,th{border-bottom:1px solid #cdd4d5;padding:3px 5px}th{background:#edf0ef}
  .machining{display:flex;gap:10px;align-items:end;margin:7px 0}.machining label{display:grid;gap:3px}.finding{color:#873f23}
  @media print{.machining{display:none}table{break-inside:avoid}}
</style>
