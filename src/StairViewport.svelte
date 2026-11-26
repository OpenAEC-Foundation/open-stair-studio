<script context="module">
  let runtime;
  function loadRuntime() {
    if (!runtime) {
      runtime = import('./viewport-wasm/stair_viewport.js').then(async module => {
        await module.default();
        return module.StairScene;
      }).catch(error => { runtime = null; throw error; });
    }
    return runtime;
  }
</script>

<script>
  import { onMount } from 'svelte';
  import { buildViewportMesh } from './viewport-mesh.js';

  export let geometry;
  export let system = 'timber';
  export let cameraState = null;
  export let zoomPercent = 100;
  let host, canvas, scene, mesh;
  let backend = '', message = '3D-weergave laden…', frame = 0, epoch = 0;
  let meshReady = false, baseDistance = 1, recoveries = 0, mounted = false;
  let width = 0, height = 0;
  let background = [241, 242, 243];
  let dragging = false;
  const pointers = new Map();
  const lossEvent = 'stair-gpu-loss-' + Math.random().toString(36).slice(2);

  $: mesh = buildViewportMesh(geometry, system);
  $: if (scene && mesh) upload(scene, mesh);

  function upload(renderer, model) {
    renderer.set_mesh(model.bytes, model.triangles, model.bounds);
    if (!meshReady) {
      renderer.stair_iso(model.direction.x, model.direction.y);
      renderer.fit();
      baseDistance = renderer.camera_state()[3];
      if (cameraState) {
        renderer.restore(cameraState.values);
        baseDistance = cameraState.baseDistance;
      }
      meshReady = true;
    }
    refresh();
  }

  function refresh() {
    if (!scene || !meshReady) return;
    const values = Array.from(scene.camera_state());
    cameraState = { values, baseDistance };
    zoomPercent = Math.max(1, Math.round(100 * baseDistance / values[3]));
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!scene || !width || !height) return;
      try {
        scene.draw(...background);
      } catch (error) {
        console.warn('Open BIM Suite viewport', error);
        recover();
      }
    });
  }

  function measure() {
    if (!host || !canvas) return;
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    // The canvas can already have its new size while an asynchronous device is opening.
    // Keep the MSAA and depth textures aligned even if the DOM dimensions already match.
    scene?.resize(w, h);
    refresh();
  }

  function updateBackground() {
    const channels = getComputedStyle(host).backgroundColor.match(/[\d.]+/g);
    if (channels?.length >= 3) background = channels.slice(0, 3).map(Number);
    refresh();
  }

  function clearScene() {
    cancelAnimationFrame(frame);
    frame = 0;
    meshReady = false;
    dragging = false;
    pointers.clear();
    scene?.free();
    scene = null;
    canvas?.remove();
    canvas = null;
  }

  async function open() {
    const version = ++epoch;
    clearScene();
    backend = '';
    message = '3D-weergave laden…';
    try {
      const StairScene = await loadRuntime();
      if (!mounted || epoch !== version) return;
      // A canvas context cannot change type. Each candidate gets its own surface.
      const candidates = [];
      if (window.isSecureContext && navigator.gpu) {
        try { if (await navigator.gpu.requestAdapter()) candidates.push('WebGPU'); }
        catch (error) { console.warn('WebGPU-adapter', error); }
      }
      candidates.push('WebGL2');
      for (const candidate of candidates) {
        if (!mounted || epoch !== version) return;
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', '3D-model van de trap');
        host.appendChild(canvas);
        measure();
        try {
          const renderer = await StairScene.open(canvas, candidate === 'WebGL2', lossEvent);
          if (!mounted || epoch !== version) { renderer.free(); return; }
          scene = renderer;
          backend = candidate;
          message = '';
          measure();
          return;
        } catch (error) {
          console.warn('Open BIM Suite ' + candidate, error);
          if (!mounted || epoch !== version) return;
          canvas.remove();
          canvas = null;
        }
      }
      message = '3D kan op deze grafische adapter geen WebGPU- of WebGL2-sessie openen.';
    } catch (error) {
      if (!mounted || epoch !== version) return;
      console.error('Open BIM Suite WASM', error);
      message = 'De 3D-engine kon niet worden geladen.';
    }
  }

  function recover() {
    if (!mounted || !scene) return;
    if (++recoveries <= 1) { open(); return; }
    clearScene();
    backend = '';
    message = 'De verbinding met de grafische adapter is weggevallen.';
  }

  export function fit() {
    if (!scene || !meshReady) return;
    scene.fit();
    baseDistance = scene.camera_state()[3];
    refresh();
  }
  export function rotateQuarter() {
    if (scene) { scene.quarter(); refresh(); }
  }
  export function home() {
    if (scene && meshReady) { scene.stair_iso(mesh.direction.x, mesh.direction.y); fit(); }
  }
  export function zoomBy(factor) {
    if (scene && factor > 0) { scene.zoom(-Math.log(factor) / Math.log(0.85), 0, 0); refresh(); }
  }

  function position(event) { return { x: event.clientX, y: event.clientY }; }
  function center(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function span(a, b) { return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); }
  function zoomAt(steps, point) {
    const rect = host.getBoundingClientRect();
    scene.zoom(steps, 2 * (point.x - rect.left) / rect.width - 1, 1 - 2 * (point.y - rect.top) / rect.height);
  }
  function down(event) {
    if (!scene || event.button > 2) return;
    event.preventDefault();
    host.focus({ preventScroll: true });
    host.setPointerCapture(event.pointerId);
    const pan = event.button === 2 || (event.button === 1 ? !event.shiftKey : event.shiftKey);
    pointers.set(event.pointerId, { ...position(event), pan });
    dragging = true;
  }
  function move(event) {
    const last = pointers.get(event.pointerId);
    if (!last || !scene) return;
    const before = [...pointers.values()].slice(0, 2);
    const current = position(event);
    pointers.set(event.pointerId, { ...current, pan: last.pan });
    if (pointers.size > 1) {
      const after = [...pointers.values()].slice(0, 2);
      const a = center(...before), b = center(...after);
      scene.pan(b.x - a.x, b.y - a.y, height);
      zoomAt(-Math.log(span(...after) / span(...before)) / Math.log(0.85), b);
    } else if (last.pan) {
      scene.pan(current.x - last.x, current.y - last.y, height);
    } else {
      scene.orbit(current.x - last.x, current.y - last.y);
    }
    refresh();
  }
  function up(event) {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0;
  }
  function wheel(event) {
    if (!scene) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoomAt(Math.min(8, Math.max(-8, -pixels / 100)), position(event));
    refresh();
  }
  function key(event) {
    if (!scene) return;
    switch (event.key.toLowerCase()) {
      case 'f': fit(); break;
      case 'home': home(); break;
      case '+': case '=': zoomBy(1.25); break;
      case '-': zoomBy(0.8); break;
      case 'arrowleft': scene.orbit(-10, 0); break;
      case 'arrowright': scene.orbit(10, 0); break;
      case 'arrowup': scene.orbit(0, -10); break;
      case 'arrowdown': scene.orbit(0, 10); break;
      default: return;
    }
    event.preventDefault();
    refresh();
  }
  onMount(() => {
    mounted = true;
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up, keydown: key };
    for (const [name, handler] of Object.entries(events)) host.addEventListener(name, handler, options);
    host.addEventListener('wheel', wheel, { ...options, passive: false });
    host.addEventListener('contextmenu', event => event.preventDefault(), options);
    host.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      recover();
    }, { ...options, capture: true });
    window.addEventListener(lossEvent, recover, options);
    document.addEventListener('visibilitychange', refresh, options);
    window.addEventListener('pageshow', refresh, options);
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    const theme = new MutationObserver(updateBackground);
    for (let node = host.parentElement; node; node = node.parentElement) theme.observe(node, { attributes: true });
    updateBackground();
    open();
    return () => {
      mounted = false;
      epoch++;
      abort.abort();
      observer.disconnect();
      theme.disconnect();
      clearScene();
    };
  });
</script>

<div class="viewport">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The interactive 3D canvas accepts arrow, zoom and fit keys.) -->
  <div class="surface" class:dragging bind:this={host} tabindex="0" role="application"
    aria-label="3D-trapmodel. Sleep om te draaien, wiel om te zoomen, F voor passend beeld."
    data-backend={backend} data-camera={cameraState?.values?.join(',') ?? ''}></div>
  {#if message}
    <div class="notice" role="status">{message}
      {#if !message.endsWith('…')}<button on:click={() => { recoveries = 0; open(); }}>Opnieuw openen</button>{/if}
    </div>
  {:else}
    <div class="hint">Slepen · draaien <span>Shift + slepen · schuiven</span> Wiel · zoomen</div>
  {/if}
</div>

<style>
  .viewport, .surface { position:absolute; inset:0; overflow:hidden; }
  .surface { touch-action:none; cursor:grab; outline:none; background:var(--oa-workspace,#f1f2f3); }
  .surface:focus-visible { outline:2px solid var(--oa-accent,#b77912); outline-offset:-2px; }
  .surface.dragging { cursor:grabbing; }
  .surface :global(canvas) { display:block; width:100%; height:100%; }
  .hint, .notice { position:absolute; color:var(--oa-text-secondary,#42484c); font:12px/1.4 var(--oa-font-body,system-ui); }
  .hint { pointer-events:none; left:12px; bottom:9px; display:flex; gap:14px; padding:3px 6px; border-radius:3px; color:var(--oa-workspace-text); background:var(--oa-workspace); }
  .notice { inset:0; display:flex; align-items:center; justify-content:center; gap:12px; padding:18px; text-align:center; }
  .notice button { color:inherit; padding:4px 8px; cursor:pointer; }
  @media (max-width:760px) { .hint span { display:none; } }
</style>
