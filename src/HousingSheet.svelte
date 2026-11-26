<script>
  import { tick } from 'svelte';
  import HousingDrawing from './HousingDrawing.svelte';

  export let housings;
  export let selectedBeamId = '';
  export let selectedPocketId = '';
  export let metadata = {};
  export let downloadFile;
  export let openCam = null;
  export let cam;

  let printAll = false;
  async function printDrawings(all) {
    printAll = all;
    await tick();
    window.print();
  }
</script>

<svelte:window onafterprint={() => printAll = false}/>

<div class="interactive-sheet" class:printing-set={printAll}>
  <HousingDrawing {housings} bind:selectedBeamId bind:selectedPocketId {metadata} {cam} {downloadFile}
    {openCam} printSelection={() => printDrawings(false)} printSet={() => printDrawings(true)} />
</div>

{#if printAll}
  <div class="sheet-set">
    {#each housings.beams as beam, index (beam.id)}
      <section class="set-item">
        <header class="set-title">
          <b>{metadata.number} · revisie {metadata.revision} · {metadata.stairMark}</b>
          <span>Wangdeel {index + 1} van {housings.beams.length} · concept</span>
        </header>
        <HousingDrawing housings={{ ...housings, beams: [beam] }} {cam} {metadata} embedded />
      </section>
    {/each}
  </div>
{/if}

<style>
  .interactive-sheet { display: contents; }
  .sheet-set { display: none; }
  @media print {
    .sheet-set { display: block; }
    .printing-set, :global(.editor-area:has(.printing-set) > .print-heading) { display: none; }
    .set-item + .set-item { break-before: page; }
    .set-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
      padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1px solid #aaa; font-size: 10pt; }
  }
</style>
