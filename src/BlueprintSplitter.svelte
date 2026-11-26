<script>
  import { onMount } from 'svelte';

  let { side } = $props();
  const minimum = 168;
  let maximum = $state(420);
  let width = $state(240);
  let handle, panel, work;
  let drag = null;
  let dragging = $state(false);
  const variable = $derived('--stair-panel-' + side);
  const storageKey = $derived('openaec.stairs.panel.' + side);

  function setWidth(value) {
    const next = Math.round(Math.min(maximum, Math.max(minimum, value)));
    work.style.setProperty(variable, next + 'px');
    width = next;
  }
  function remember() {
    try { localStorage.setItem(storageKey, String(width)); } catch { /* Use this session's width. */ }
  }
  function reset() {
    work.style.removeProperty(variable);
    try { localStorage.removeItem(storageKey); } catch { /* Ignore unavailable storage. */ }
    width = Math.round(panel.getBoundingClientRect().width);
  }
  function measure() {
    maximum = Math.max(minimum, Math.min(420, Math.floor(work.clientWidth / 3)));
    width = Math.round(panel.getBoundingClientRect().width);
  }
  onMount(() => {
    work = handle.parentElement;
    panel = side === 'left' ? handle.previousElementSibling : handle.nextElementSibling;
    measure();
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= minimum) setWidth(saved);
    } catch { /* Width follows the design token. */ }
    const observer = new ResizeObserver(measure);
    observer.observe(work);
    observer.observe(panel);
    return () => observer.disconnect();
  });
  function start(event) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { start: event.clientX, width };
    dragging = true;
    handle.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (!drag) return;
    setWidth(drag.width + (event.clientX - drag.start) * (side === 'left' ? 1 : -1));
  }
  function stop() {
    if (!drag) return;
    remember();
    drag = null;
    dragging = false;
  }
  function keyboard(event) {
    const sign = side === 'left' ? 1 : -1;
    switch (event.key) {
      case 'ArrowLeft': setWidth(width - 12 * sign); break;
      case 'ArrowRight': setWidth(width + 12 * sign); break;
      case 'Home': setWidth(minimum); break;
      case 'End': setWidth(maximum); break;
      case 'Enter': reset(); event.preventDefault(); return;
      default: return;
    }
    event.preventDefault();
    remember();
  }
</script>

<!-- A focusable ARIA window splitter is operated with arrow keys. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div bind:this={handle} class="blueprint-splitter" class:dragging tabindex="0" role="separator"
  aria-label={side === 'left' ? 'Breedte projectverkenner' : 'Breedte eigenschappenpaneel'}
  aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width}
  aria-valuetext={width + ' pixels'} title="Sleep voor de paneelbreedte. Dubbelklik voor de standaardbreedte."
  onpointerdown={start} onpointermove={move} onlostpointercapture={stop} onkeydown={keyboard} ondblclick={reset}></div>

<style>
  .blueprint-splitter { flex: 0 0 4px; cursor: col-resize; touch-action: none; background: var(--oa-frame); }
  .blueprint-splitter:hover, .blueprint-splitter:focus-visible, .dragging { background: var(--oa-focus); outline: 0; }
  @media print { .blueprint-splitter { display: none; } }
</style>
