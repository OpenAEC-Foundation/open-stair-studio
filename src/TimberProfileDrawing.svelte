<script>
  import { layoutTimberView, mm } from './timber-sheet.js';
  export let view, roundDiameter = null;
  $: diagram = layoutTimberView(view);
  $: xDimY = diagram.a.y + 4;
  $: yDimX = diagram.b.x + 4;
</script>

<figure>
  <figcaption><b>{view.title}</b><span>1:{mm(diagram.denominator)} op papier</span></figcaption>
  <svg role="img" aria-label={view.title+' met maatlijnen in millimeters'} viewBox="0 0 120 65">
    {#each diagram.paths as path}
      {#if roundDiameter>0 && path.mode==='wood'}<circle class="wood" cx={(diagram.a.x+diagram.b.x)/2} cy={(diagram.a.y+diagram.b.y)/2} r={roundDiameter/(2*diagram.denominator)}/>
      {:else if path.closed}<polygon class={path.mode} points={path.svg}/>
      {:else}<polyline class={path.mode} points={path.svg}/>{/if}
    {/each}
    {#if diagram.spanX > .001}
      <g class="dim">
        <path d={'M'+diagram.a.x+','+(diagram.a.y+1.4)+'V'+(xDimY+1.6)+'M'+diagram.b.x+','+(diagram.a.y+1.4)+'V'+(xDimY+1.6)+'M'+diagram.a.x+','+xDimY+'H'+diagram.b.x}/>
        <path d={'M'+(diagram.a.x-1)+','+(xDimY+1)+'l2,-2 M'+(diagram.b.x-1)+','+(xDimY+1)+'l2,-2'}/>
      </g>
      <text x={(diagram.a.x+diagram.b.x)/2} y={xDimY+3.9} text-anchor="middle">{mm(diagram.spanX)}</text>
    {/if}
    {#if diagram.spanY > .001}
      <g class="dim">
        <path d={'M'+(diagram.b.x+1.4)+','+diagram.a.y+'H'+(yDimX+1.6)+'M'+(diagram.b.x+1.4)+','+diagram.b.y+'H'+(yDimX+1.6)+'M'+yDimX+','+diagram.a.y+'V'+diagram.b.y}/>
        <path d={'M'+(yDimX-1)+','+(diagram.a.y+1)+'l2,-2 M'+(yDimX-1)+','+(diagram.b.y+1)+'l2,-2'}/>
      </g>
      <text transform={'translate('+(yDimX+3.8)+' '+((diagram.a.y+diagram.b.y)/2)+') rotate(-90)'} text-anchor="middle">{mm(diagram.spanY)}</text>
    {/if}
  </svg>
  <p>{view.note}</p>
</figure>

<style>
  figure{min-width:0;margin:0;background:#fff;border:1px solid #b7c2c3;display:flex;flex-direction:column;}
  figcaption{padding:6px 9px 0;display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap;}
  figcaption span,p{font-size:10px;color:#45595f;}p{margin:auto 9px 0;padding:3px 0 6px;}
  svg{width:100%;max-height:240px;display:block;}.wood{fill:#eddfc5;stroke:#51432f;stroke-width:.45;stroke-linejoin:round;}
  .joint{fill:#c6dfd4;stroke:#426950;stroke-width:.4;stroke-dasharray:1.4 .65;}
  .edge{fill:none;stroke:#147283;stroke-width:.7;stroke-linejoin:round;}.dim{stroke:#4a5c60;stroke-width:.22;fill:none;}
  text{font:2.7px var(--oa-font-mono,monospace);fill:#26393e;}
  @media print{figcaption{font-size:9pt;padding:1.4mm 2mm 0;}svg{width:120mm;height:65mm;max-height:none;align-self:center;}p,figcaption span{font-size:7.4pt;}p{padding:.6mm 0 1mm;}}
</style>
