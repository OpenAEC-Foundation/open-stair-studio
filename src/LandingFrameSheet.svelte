<script>
  import { createLandingFrameDxf } from './landing-frame-dxf.js';
  import { checkLandingJoints } from './landing-joint-check.js';
  export let geometry;
  export let model;
  export let downloadFile;
  const format=n=>Number(n).toLocaleString('nl-NL',{maximumFractionDigits:1});
  $: landing=geometry.landings[0];
  $: members=geometry.landingFrame??[];
  $: joints=geometry.landingJoints??[];
  $: fasteners=geometry.landingFasteners??[];
  $: jointCheck=checkLandingJoints(model,geometry);
  $: minX=landing?Math.min(...landing.points.map(p=>p.x)):0;
  $: minY=landing?Math.min(...landing.points.map(p=>p.y)):0;
  $: maxX=landing?Math.max(...landing.points.map(p=>p.x)):1;
  $: maxY=landing?Math.max(...landing.points.map(p=>p.y)):1;
  const polygon=points=>points.map(p=>`${p.x},${p.y}`).join(' ');
  function exportDxf(){
    if(!landing||!members.length)return;
    downloadFile(`${model.stair.mark}-bordesraam.dxf`,createLandingFrameDxf(landing,members,joints,fasteners),'application/dxf');
  }
</script>

<div class="production-view">
  <div class="production-head"><div><span class="eyebrow">WERKPLAATS · BORDES</span><h1>Bordesraam en aansluitingen</h1><p>{model.stair.mark} · revisie {model.project.revision} · maten in mm</p></div>
    {#if members.length}<div class="button-row"><button class="action-btn" onclick={exportDxf}>DXF · 1:1</button><button class="action-btn" onclick={()=>window.print()}>PDF / afdrukken</button></div>{/if}
  </div>
  {#if !landing}<p>Deze trap heeft geen tussenbordes.</p>
  {:else if !members.length}<p>Schakel het houten bordesraam in bij de trapgeometrie.</p>
  {:else}
    <div class="production-summary"><div><span>Bordespeil</span><b>+{format(landing.elevation)} mm</b></div><div><span>Bordesplaat</span><b>{format(landing.thickness)} mm</b></div><div><span>Randliggers</span><b>{members.length} stuks</b></div><div><span>Schroeven</span><b>{fasteners.length} stuks</b></div></div>
    <svg role="img" aria-label="Bordesraam met vier randliggers en stuiknaden" viewBox={`${minX-100} ${minY-100} ${maxX-minX+200} ${maxY-minY+200}`} style="display:block;width:min(100%,780px);max-height:560px;margin:18px auto;background:#faf9f5;border:1px solid #d8d5ca">
      <polygon points={polygon(landing.points)} fill="#e9d4b3" stroke="#654a2e" stroke-width="4" />
      {#each members as member}<polygon points={polygon(member.points)} fill="#ad8055" stroke="#593b26" stroke-width="3" /><text x={member.center.x} y={member.center.y} text-anchor="middle" dominant-baseline="middle" font-size="30" fill="white">{member.id.split('-').at(-1)}</text>{/each}
      {#each joints as joint}<circle cx={joint.position.x} cy={joint.position.y} r="12" fill="#345d79" /><text x={joint.position.x+18} y={joint.position.y-16} font-size="24" fill="#263b4e">J{joints.indexOf(joint)+1}</text>{/each}
    </svg>
    <table class="parts-table"><thead><tr><th>Merk</th><th>Onderdeel</th><th>Lengte</th><th>Breedte</th><th>Hoogte</th><th>Netto m³</th></tr></thead><tbody>
      {#each members as member}<tr><td>{member.id}</td><td>{member.name}</td><td>{format(member.length)}</td><td>{format(member.width)}</td><td>{format(member.thickness)}</td><td>{member.volume.toFixed(4)}</td></tr>{/each}
    </tbody></table>
    {#if fasteners.length}<h2>Boorpunten voor de stuiknaden</h2><table class="parts-table"><thead><tr><th>Merk</th><th>Naad</th><th>X hoofd mm</th><th>Y hoofd mm</th><th>Z hoofd mm</th><th>Ø × lengte</th></tr></thead><tbody>
      {#each fasteners as screw}<tr><td>{screw.id}</td><td>{screw.jointId}</td><td>{format(screw.head.x)}</td><td>{format(screw.head.y)}</td><td>{format(screw.head.z)}</td><td>{screw.diameter} × {screw.length} mm</td></tr>{/each}
    </tbody></table>{/if}
    <h2>Voorlopige schroefbelasting</h2>
    <div class="production-summary"><div><span>Status</span><b>{jointCheck.status==='within-input'?'Binnen opgegeven weerstand':jointCheck.status==='over'?'Weerstand overschreden':'Invoer ontbreekt'}</b></div><div><span>Totale opgegeven last</span><b>{jointCheck.totalLoad==null?'—':`${format(jointCheck.totalLoad)} kN`}</b></div><div><span>Per schroef</span><b>{jointCheck.screwDemand==null?'—':`${format(jointCheck.screwDemand)} kN`}</b></div><div><span>Benutting</span><b>{jointCheck.utilization==null?'—':`${format(jointCheck.utilization*100)} %`}</b></div></div>
    <table class="parts-table"><thead><tr><th>Randligger</th><th>Overspanning</th><th>Moment Nmm</th><th>Buigspanning</th><th>Doorbuiging</th><th>Grenzen</th></tr></thead><tbody>
      {#each jointCheck.memberChecks as member}<tr><td>{member.id}</td><td>{format(member.span)} mm</td><td>{member.moment==null?'—':format(member.moment)}</td><td>{member.bendingStress==null?'—':`${format(member.bendingStress)} N/mm²`}</td><td>{member.deflection==null?'—':`${format(member.deflection)} mm`}</td><td>{member.bendingUtilization==null||member.deflectionUtilization==null?'invoer open':`${format(member.bendingUtilization*100)} % buiging · ${format(member.deflectionUtilization*100)} % vervorming`}</td></tr>{/each}
    </tbody></table>
    {#if jointCheck.reasons.length}<p class="reference-note">{jointCheck.reasons.join(' ')}</p>{/if}
    <p class="reference-note">{jointCheck.scope}</p>
    <p class="reference-note">De randliggers sluiten met stuiknaden aan. De schroefposities zijn geometrisch bepaald. Schroefsterkte, randvoorwaarden en de ankers naar de draagconstructie moeten voor productie worden getoetst. De DXF bevat plancontouren en boorpunten in buitenaanzicht.</p>
  {/if}
</div>
