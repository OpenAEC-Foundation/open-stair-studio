<script>
  export let rows;
  export let material;
  export let exportCsv;
  export let openEngineering;
</script>

<div class="production-view">
  <header class="production-head">
    <div><span class="eyebrow">ONDERDELEN · COÖRDINATIE</span><h1>Tredecontouren</h1><p>{material} · nominale omhulling voor de productuitwerking.</p></div>
    <div class="button-row"><button class="action-btn" onclick={exportCsv}>CSV</button><button class="action-btn" onclick={() => window.print()}>Afdrukken / PDF</button></div>
  </header>
  <table class="parts-table">
    <thead><tr>{#each rows[0] as heading}<th>{heading}</th>{/each}</tr></thead>
    <tbody>{#each rows.slice(1) as row}<tr>{#each row as cell}<td>{cell}</td>{/each}</tr>{/each}</tbody>
  </table>
  <p>Het oppervlak volgt de volle buitencontour van de trede. Openingen, glaslagen, oplegdetails en bevestigingen volgen uit het productdossier.</p>
  <button class="action-btn" onclick={openEngineering}>Engineeringdossier openen</button>
</div>
<style>
  p { margin: 12px 0; color: var(--oa-text-secondary); }
  @media print { button { display: none; } }
</style>
