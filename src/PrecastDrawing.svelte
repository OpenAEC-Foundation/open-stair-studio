<script>
  import {formatMeasure,projection} from './precast-sheets.js';
  export let sheet;
  export let side;
  $: d=projection(sheet,side);
</script>
<figure>
  <figcaption>{side==='plan'?'Bovenaanzicht X–Y':side==='cross'?'Doorsnede A–A':'Langsaanzicht X–Z'} <span>{side==='cross'?'X = '+formatMeasure(d.cut)+' mm':'mm · elementassen'}</span></figcaption>
  <svg role="img" aria-label={side==='plan'?'Bovenaanzicht wapening en instortdelen':side==='cross'?'Dwarsdoorsnede wapening':'Langsaanzicht wapening en instortdelen'} viewBox="0 0 640 252">
    <polygon points={d.outline} fill="#f3f2ed" stroke="#44515a" stroke-width="1.5"/>
    {#each d.bars as b}
      {@const ink=b.part.targetId?'#67458e':b.part.layer==='top'?'#047687':'#9e3f18'}
      {#if Math.hypot(b.a[0]-b.b[0],b.a[1]-b.b[1])<1}
        <circle cx={b.a[0]} cy={b.a[1]} r="1.65" fill={ink}/>
      {:else}
        <line x1={b.a[0]} y1={b.a[1]} x2={b.b[0]} y2={b.b[1]} stroke={ink} stroke-width={b.part.targetId?2: b.part.layer==='top'?1:1.75} stroke-dasharray={b.part.layer==='top'?'5 3':undefined}/>
      {/if}
    {/each}
    {#each d.inserts as i}
      <g><title>{i.code} · {i.part.label}</title>
        {#if i.b}<line x1={i.a[0]} y1={i.a[1]} x2={i.b[0]} y2={i.b[1]} stroke="#283b65" stroke-width="2"/>{/if}
        {#if i.part.role==='liftAnchor'}<circle cx={i.a[0]} cy={i.a[1]} r="3.8" fill="white" stroke="#243963" stroke-width="2"/>
        {:else}<rect x={i.a[0]-2.8} y={i.a[1]-2.8} width="5.6" height="5.6" fill="#283b65"/>{/if}
        {#if side==='plan' && ['liftAnchor','connectionPlate'].includes(i.part.role)}<text class="tag" x={i.a[0]+5} y={i.a[1]-5}>{i.code}</text>{/if}
      </g>
    {/each}
    {#if side==='plan'}<path d={'M'+d.cutX+' '+(d.low[1]+4)+'V'+(d.high[1]-4)} stroke="#506675" stroke-dasharray="7 3 1 3"/><text class="tag" x={d.cutX+3} y={d.high[1]-5}>A</text>{/if}
    {#if side!=='cross'}<g stroke="#15191c" stroke-width="1.4"><circle cx={d.center[0]} cy={d.center[1]} r="5" fill="white"/><path d={'M'+(d.center[0]-7)+' '+d.center[1]+'h14 M'+d.center[0]+' '+(d.center[1]-7)+'v14'}/></g>{/if}
    <g stroke="#526776" stroke-width="1" fill="none">
      <path d={'M'+d.low[0]+' '+(d.low[1]+12)+'v7 m0 -3.5 H'+d.high[0]+'m0 -3.5 v7'}/>
      <path d={'M'+(d.low[0]-15)+' '+d.low[1]+'h7 m-3.5 0 V'+d.high[1]+'m-3.5 0 h7'}/>
    </g>
    <g fill="#354c5b" text-anchor="middle" font-size="12">
      <text x={(d.low[0]+d.high[0])/2} y={d.low[1]+32}>{formatMeasure(d.width)}</text>
      <text transform={'translate('+(d.low[0]-16)+' '+((d.high[1]+d.low[1])/2)+') rotate(-90)'}>{formatMeasure(d.height)}</text>
    </g>
  </svg>
</figure>
<style>
  figure{margin:0;min-width:0;border:1px solid #c5cbcd;background:white;}
  figcaption{display:flex;justify-content:space-between;gap:4px;padding:6px 8px;font-size:12px;font-weight:650;color:#293f48;}
  figcaption span{font-size:10px;font-weight:400;}
  svg{display:block;width:100%;font-family:var(--oa-font-mono),monospace;}
  .tag{font-size:12px;fill:#253c62;font-weight:600;paint-order:stroke;stroke:white;stroke-width:2px;}
</style>
