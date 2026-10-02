import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as presentation from '../src/lib/marketplace/presentation.ts';

const require = createRequire(import.meta.url);

// Execute the actual components with deterministic hooks, Leaflet events and timers.
function harness(file, extra = {}) {
  let cursor = 0;
  let dirty = false;
  let props;
  let tree;
  const slots = [];
  const effects = [];
  const timers = new Map();
  const frames = new Map();
  const nodes = [];
  let nextId = 0;
  const node = {
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    removeEventListener(type) { this.listeners.delete(type); },
    listeners: new Map(),
    input(type, key) { this.listeners.get(type)?.({ type, key, isTrusted: true }); },
  };
  const documentNode = { ...node, listeners: new Map() };
  const hooks = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((d, j) => !Object.is(d, slots[i].deps[j]))) {
        const old = slots[i];
        slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn) { cursor++; return fn; },
  };
  const jsx = (type, p) => {
    if (p.ref && typeof p.ref === 'object') p.ref.current = node;
    const item = { type, props: p };
    nodes.push(item);
    return item;
  };
  const maps = [];
  const observers = [];
  let size = { x: 800, y: 600 };
  const L = {
    map(_node, options) {
      const handlers = new Map();
      const map = {
        options, fits: 0, removed: false,
        on(types, fn) { for (const type of types.split(' ')) handlers.set(type, fn); },
        fire(type) { handlers.get(type)?.({ type }); },
        getZoom: () => 10, getSize: () => size,
        getBounds: () => ({ getWest: () => 100, getSouth: () => 12, getEast: () => 102, getNorth: () => 14 }),
        invalidateSize() { assert.equal(this.removed, false); this.fire('moveend'); },
        stop() { this.fire('moveend'); },
        fitBounds() { this.fits++; this.fire('movestart'); this.fire('moveend'); },
        flyTo() { this.fire('movestart'); },
        remove() { this.removed = true; handlers.clear(); },
      };
      maps.push(map);
      return map;
    },
    tileLayer: () => ({ addTo() {} }),
    markerClusterGroup: () => ({ markers: [], addTo() {}, clearLayers() { this.markers = []; }, addLayer(marker) { this.markers.push(marker); } }),
    divIcon: (icon) => icon,
    marker: (coords) => ({ coords, on() {}, bindTooltip() {}, getElement() {}, setZIndexOffset() {} }),
    latLngBounds: () => ({ pad() { return this; } }),
  };
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    leaflet: L, 'leaflet.markercluster': {},
    'next/link': { default: 'Link' }, 'next/navigation': { useRouter: () => ({ replace() {} }) },
    'lucide-react': {}, '@/lib/utils': {}, '@/lib/marketplace/verification': { verificationBadges: () => [] },
    '@/lib/marketplace/search-filters': { locationChoices: () => ({ districts: [], subdistricts: [] }) },
    '@/lib/marketplace/presentation': presentation,
    './PropertyMap': 'PropertyMap', './SearchPropertyCard': 'SearchPropertyCard',
  };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, require: (name) => modules[name] ?? require(name),
    console, AbortController, URLSearchParams,
    document: { ...documentNode, createElement: () => ({}) }, window: { matchMedia: () => ({ matches: extra.desktop ?? false }) },
    ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame: (fn) => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    ...extra,
  });
  function render(next = props) {
    props = next; cursor = 0; dirty = false; nodes.length = 0;
    tree = module.exports.default(props);
    for (const fn of effects.splice(0)) fn();
    return tree;
  }
  return {
    render, maps, observers, node, documentNode, nodes, slots,
    size(value) { size = value; },
    async flush() { for (let i = 0; i < 6; i++) { await new Promise(setImmediate); if (dirty) render(); } },
    timers(delay) { for (const [id, timer] of [...timers]) if (delay === undefined || timer.delay === delay) { timers.delete(id); timer.fn(); } },
    frames() { for (const fn of frames.values()) fn(); frames.clear(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    mapProps() { return nodes.find((n) => n.type === 'PropertyMap').props; },
    clickMode(mode) { nodes.find((n) => String(n.props.onClick).includes(`setMobileMode("${mode}")`)).props.onClick(); render(); },
  };
}

const listings = [
  { id: '37', lat: 13, lng: 101 },
  { id: '109', lat: 14, lng: 102 },
  { id: '101', size_rai: 101, lat: null, lng: null },
];

test('actual PropertyMap gates motions, stale inputs, resize, fly, remount and cleanup', async () => {
  const h = harness('../src/components/search/PropertyMap.tsx');
  let searches = 0;
  const props = { properties: listings, onBoundsChange: () => searches++ };
  h.size({ x: 0, y: 0 });
  h.render(props); await h.flush();
  let map = h.maps[0];
  assert.equal(map.fits, 0);
  h.size({ x: 800, y: 600 }); h.observers[0].fn(); await h.flush();
  assert.equal(map.fits, 1);
  assert.equal(h.slots.find((s) => s?.current?.markers)?.current.markers.length, 2);
  h.frames(); assert.equal(searches, 0);
  for (const type of ['click', 'keydown', 'wheel', 'touchmove']) {
    h.node.input(type); h.observers[0].fn(); h.timers();
    map.fire('movestart'); map.fire('moveend');
    assert.equal(searches, 0, `idle ${type} must not authorize later motion`);
  }
  for (const type of ['click', 'dblclick', 'keydown', 'wheel', 'touchmove']) {
    h.node.input(type); map.fire('zoomstart'); map.fire('movestart'); map.fire('moveend');
    searches--; assert.equal(searches, 0, `${type} motion searches once`);
    h.timers();
  }
  map.fire('dragstart'); h.observers[0].fn(); assert.equal(searches, 0);
  map.fire('moveend'); searches--; assert.equal(searches, 0);
  map.fire('boxzoomstart'); h.documentNode.input('keydown', 'Escape'); h.timers();
  h.observers[0].fn(); assert.equal(searches, 0, 'cancelled box zoom does not leave a flag');
  map.fire('boxzoomstart'); h.documentNode.input('mouseup'); map.fire('movestart'); map.fire('moveend'); searches--; assert.equal(searches, 0);
  h.node.input('wheel'); h.render({ ...props, selectedId: '37' }); await h.flush();
  h.node.input('click'); map.fire('moveend'); assert.equal(searches, 0, 'fly end after idle input');
  h.node.input('keydown'); map.fire('movestart'); map.fire('moveend'); searches--; assert.equal(searches, 0);
  h.render({ ...props, scrollWheelZoom: false }); await h.flush();
  assert.equal(map.removed, true); map = h.maps[1]; assert.equal(map.fits, 1);
  assert.equal(searches, 0);
  h.unmount(); assert.equal(h.node.listeners.size, 0); assert.equal(h.documentNode.listeners.size, 0); h.frames(); h.timers();
  assert.equal(map.removed, true);
  h.render({ ...props, interactive: false }); await h.flush();
  map = h.maps[2];
  assert.equal(map.options.keyboard, false);
  assert.equal(map.options.boxZoom, false);
  h.unmount();
});

test('actual SearchExperience preserves 3 list results through mobile toggles and rejects stale searches', async () => {
  const requests = [];
  const h = harness('../src/components/search/SearchExperience.tsx', {
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
  });
  h.render({ initialProperties: listings, provinces: [], locationOptions: [], initialValues: {} });
  const bounds = { west: 100, south: 12, east: 102, north: 14 };
  h.mapProps().onBoundsChange(bounds); h.timers(350); assert.equal(requests.length, 0);
  h.clickMode('map'); h.clickMode('list');
  assert.equal(h.mapProps().properties.length, 3);
  assert.equal(requests.length, 0);
  h.clickMode('map'); h.mapProps().onBoundsChange(bounds); h.timers(350);
  assert.equal(requests.length, 1);
  h.mapProps().onBoundsChange(bounds);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].resolve({ ok: true, json: async () => ({ properties: [] }) }); await h.flush();
  assert.equal(h.mapProps().properties.length, 3);
  // Applying filters must clear the queued bounds request and supersede old responses.
  h.nodes.find((n) => String(n.props.onClick).includes('applyFilters')).props.onClick();
  h.timers(350); assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url, 'https://local').searchParams.has('west'), false);
  requests[1].resolve({ ok: true, json: async () => ({ properties: listings }) }); await h.flush();
  h.mapProps().onBoundsChange(bounds); h.timers(350);
  requests[2].resolve({ ok: true, json: async () => ({ properties: listings.slice(0, 2) }) }); await h.flush();
  assert.equal(h.mapProps().properties.length, 2);
  h.mapProps().onBoundsChange(bounds); h.unmount(); h.timers(350);
  assert.equal(requests.length, 3, 'unmount clears pending debounce');
  assert.equal(requests[2].options.signal.aborted, true);
});

test('desktop bounds searches remain enabled in mobile list mode; disabling move search cancels pending work', async () => {
  const requests = [];
  const h = harness('../src/components/search/SearchExperience.tsx', {
    desktop: true,
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
  });
  h.render({ initialProperties: listings, provinces: [], locationOptions: [], initialValues: {} });
  const bounds = { west: 100, south: 12, east: 102, north: 14 };
  h.mapProps().onBoundsChange(bounds); h.timers(350);
  assert.equal(requests.length, 1);
  h.mapProps().onBoundsChange(bounds);
  h.nodes.find((n) => n.type === 'input' && n.props.checked === true).props.onChange({ target: { checked: false } });
  h.render(); h.timers(350);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].resolve({ ok: true, json: async () => ({ properties: [] }) }); await h.flush();
  assert.equal(h.mapProps().properties.length, 3);
  // An explicit filter request remains usable with move search disabled.
  h.nodes.find((n) => String(n.props.onClick).includes('applyFilters')).props.onClick();
  assert.equal(requests.length, 2);
  requests[1].resolve({ ok: true, json: async () => ({ properties: listings }) }); await h.flush();
  assert.equal(h.mapProps().properties.length, 3);
  h.unmount();
});
