export const appearanceOptions = {
  theme: [
    ['light', 'Licht'], ['dark', 'Donker'], ['blueprint', 'Blueprint'],
    ['high-contrast-light', 'Hoog contrast licht'], ['high-contrast-dark', 'Hoog contrast donker'],
  ],
  workspace: [['theme', 'Volg thema'], ['light', 'Licht'], ['dark', 'Donker']],
  statusbar: [['theme', 'Volg thema'], ['dark', 'Donker']],
  text: [['standard', 'Standaard'], ['compact', 'Compact'], ['large', 'Groot']],
};

const preferenceKey = 'openaec.stairs.appearance.v1';

export function loadPreferences() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(preferenceKey)) || {}; } catch { /* Use defaults. */ }
  return Object.fromEntries(Object.entries(appearanceOptions).map(([field, options]) => [
    field, options.some(([id]) => id === stored[field]) ? stored[field] : options[0][0],
  ]));
}

export function applyPreferences(prefs) {
  for (const field of Object.keys(appearanceOptions)) {
    document.documentElement.setAttribute('data-oa-' + field, prefs[field]);
  }
}

export function savePreferences(prefs) {
  applyPreferences(prefs);
  try { localStorage.setItem(preferenceKey, JSON.stringify(prefs)); } catch { /* Session still works. */ }
}

// Match the Blueprint Tabs/DocumentTabs keyboard contract while keeping Svelte in charge of selection.
export function blueprintTabs(node) {
  const tabs = () => Array.from(node.querySelectorAll(':scope > [role="tab"]'));
  function sync() {
    for (const tab of tabs()) {
      const active = tab.getAttribute('aria-selected') === 'true';
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        const item = tab.getBoundingClientRect();
        const strip = node.getBoundingClientRect();
        if (item.left < strip.left) node.scrollLeft += item.left - strip.left;
        if (item.right > strip.right) node.scrollLeft += item.right - strip.right;
      }
    }
  }
  function keydown(event) {
    const items = tabs();
    const index = items.indexOf(event.target);
    if (index < 0 || event.altKey || event.metaKey || event.ctrlKey) return;
    let next;
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % items.length; break;
      case 'ArrowLeft': next = (index + items.length - 1) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[next].focus({ preventScroll: true });
    items[next].click();
  }
  function wheel(event) {
    if (event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY || node.scrollWidth <= node.clientWidth) return;
    node.scrollLeft += event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
    event.preventDefault();
  }
  const observer = new MutationObserver(sync);
  observer.observe(node, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], childList: true });
  sync();
  node.addEventListener('keydown', keydown);
  node.addEventListener('wheel', wheel, { passive: false });
  return { destroy() {
    observer.disconnect();
    node.removeEventListener('keydown', keydown);
    node.removeEventListener('wheel', wheel);
  } };
}
