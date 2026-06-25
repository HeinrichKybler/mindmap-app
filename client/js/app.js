// Entry point, inicializace canvasu s pan & zoom + globální stav, auto-save, historie
import { api } from './api.js';
import * as sidebar from './sidebar.js';
import * as nodes from './nodes.js';
import * as edges from './edges.js';
import * as groups from './groups.js';
import * as panel from './panel.js';
import * as canvas from './canvas.js';
import { applyLayout, applyRadial, applyFishbone, applyOrgChart } from './layout.js';
import * as history from './history.js';
import * as search from './search.js';
import * as timeline from './timeline.js';
import * as cheatsheet from './cheatsheet.js';
import * as focus from './focus.js';
import * as pitch from './pitch.js';
import * as drill from './drill.js';
import * as stats from './stats.js';
import * as settings from './settings.js';
import * as detail from './detail.js';
import * as floatingToolbar from './floating-toolbar.js';
import * as palette from './command-palette.js';
import { toast } from './toast.js';
import './export.js';
import './context-menu.js';

// --- Vizuální konstanty ---
export const NODE_COLORS = {
  purple:  { fill: '#1a0a2e', stroke: '#7C3AED', glow: '#7C3AED' },
  green:   { fill: '#0a1f12', stroke: '#059669', glow: '#059669' },
  neutral: { fill: '#1a1a2e', stroke: '#3a3a5e', glow: '#3a3a5e' },
  amber:   { fill: '#1f1500', stroke: '#F59E0B', glow: '#F59E0B' },
  red:     { fill: '#1f0a0a', stroke: '#E24B4A', glow: '#E24B4A' },
};

// Vrátí barevné schéma uzlu — vlastní barva (color==='custom') má přednost
export function nodeColors(node) {
  if (node && node.color === 'custom') {
    // Poškozená/chybějící vlastní barva → výchozí fialová (ne šedá neutral)
    return (node.customColor && node.customColor.stroke) ? node.customColor : NODE_COLORS.purple;
  }
  return NODE_COLORS[node && node.color] || NODE_COLORS.neutral;
}

// --- Globální stav ---
const state = {
  currentMapId: null,
  map: { id: null, name: '', nodes: [], edges: [], groups: [] },
  selectedNodeId: null,
  selectedEdgeId: null,
  viewTransform: { x: 0, y: 0, scale: 1 },
  taskFilter: false,   // zobrazit jen uzly s task.enabled
  selectedNodeIds: [],   // multiselect uzlů (Shift+klik / rubber band)
  selectedGroupIds: [],  // multiselect skupin (Ctrl+klik / Ctrl+Shift rubber band)
  editMode: false,     // false = View mode (výchozí, čistý), true = Edit mode (sekce 1)
};

export function getState() { return state; }
export function setState(patch) { Object.assign(state, patch); }

// --- View / Edit mode (sekce 1) ---
let viewBanner = null;

(function injectModeStyles() {
  if (document.getElementById('mode-style')) return;
  const s = document.createElement('style');
  s.id = 'mode-style';
  s.textContent = `
    body.view-mode .resize-handle,
    body.view-mode .node .collapse-btn,
    body.view-mode .group-resize { display: none !important; }
    body.view-mode #node-panel { display: none !important; }
    body.view-mode .tb-edit-only { display: none !important; }
    body.view-mode #canvas { cursor: default; }
    #view-banner { position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      z-index: 42; margin-top: 8px; padding: 5px 14px;
      background: #7C3AED22; border: 1px solid #7C3AED44; border-radius: 999px;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px; color: #c8b8f0;
      user-select: none; pointer-events: none; white-space: nowrap; }
    #mode-btn.edit-on { background: #7C3AED; color: #fff; border-color: #7C3AED; }`;
  document.head.appendChild(s);
})();

export function isEditMode() { return state.editMode; }

// Aplikuje aktuální režim na DOM (třídy, banner, tlačítka, plovoucí toolbar)
function applyMode() {
  const on = state.editMode;
  document.body.classList.toggle('view-mode', !on);
  document.body.classList.toggle('edit-mode', on);
  const btn = document.getElementById('mode-btn');
  if (btn) {
    btn.textContent = on ? '✏' : '👁';
    btn.classList.toggle('edit-on', on);
    btn.title = on ? 'Edit mode — E pro View' : 'View mode — E pro Edit';
  }
  const wrap = document.getElementById('canvas-wrap');
  if (!on) {
    if (!viewBanner && wrap) {
      viewBanner = document.createElement('div');
      viewBanner.id = 'view-banner';
      viewBanner.textContent = 'View mode — stiskni E pro editaci';
      wrap.appendChild(viewBanner);
    }
  } else if (viewBanner) { viewBanner.remove(); viewBanner = null; }
  floatingToolbar.setVisible(on);
}

export function setEditMode(on) {
  on = !!on;
  if (state.editMode === on) return;
  state.editMode = on;
  if (!on) { panel.close(); clearMultiSelect(); }   // View: zavři editační panel a výběr
  else { detail.close(); }                           // Edit: zavři read-only detail okno
  applyMode();
}

export function toggleEditMode() { setEditMode(!state.editMode); }

// Klik na uzel ve View mode → read-only detail okno (volá nodes.js)
export function openNodeDetail(node) { detail.open(node); }

// Výchozí barva nového kořenového uzlu (z nastavení)
let defaultNodeColor = 'purple';
export function setDefaultColor(c) { if (c) defaultNodeColor = c; }

// --- DOM reference ---
const svg = document.getElementById('canvas');
const panGroup = document.getElementById('pan-group');
const gridPattern = document.getElementById('grid');
const gridBg = document.getElementById('grid-bg');
const emptyHint = document.getElementById('empty-hint');

const SVG_NS = 'http://www.w3.org/2000/svg';
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;

// Zkratka pro vytvoření SVG elementu
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Vrátí obrazovkový rect canvasu (pro přepočet souřadnic)
export function getCanvasRect() { return svg.getBoundingClientRect(); }

// --- Transformace ---
// Aplikuje aktuální transformaci na pan-group i mřížku
export function applyTransform() {
  const v = state.viewTransform;
  panGroup.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.scale})`);
  // Mřížka se pohybuje a škáluje společně s obsahem
  const step = 40 * v.scale;
  gridPattern.setAttribute('width', step);
  gridPattern.setAttribute('height', step);
  gridPattern.setAttribute('patternTransform', `translate(${v.x},${v.y})`);
  const gp = gridPattern.querySelector('path');  // u stylu „tečky/žádná" path být nemusí
  if (gp) gp.setAttribute('d', `M ${step} 0 L 0 0 0 ${step}`);
  canvas.updateMinimap(state.map.nodes, state.viewTransform);
}

// --- PAN ---
let panning = false;
let panStart = { x: 0, y: 0 };
let viewStart = { x: 0, y: 0 };

svg.addEventListener('mousedown', (e) => {
  // Pan / rubber band jen na prázdné ploše (pozadí nebo samotné svg)
  if (e.target !== svg && e.target !== gridBg) return;
  if (e.button !== 0) return;
  // Shift = rubber band uzlů, Ctrl+Shift = rubber band skupin
  if (e.shiftKey) { startRubberBand(e, (e.ctrlKey || e.metaKey) ? 'groups' : 'nodes'); return; }
  panning = true;
  panStart = { x: e.clientX, y: e.clientY };
  viewStart = { x: state.viewTransform.x, y: state.viewTransform.y };
  svg.classList.add('panning');
  // Klik mimo uzel/panel zavře detail panel a zruší výběr (vč. multiselectu)
  panel.close();
  state.selectedNodeId = null;
  clearMultiSelect();
  if (state.selectedEdgeId) {
    state.selectedEdgeId = null;
    edges.renderEdges(state.map.nodes, state.map.edges);
  }
});

window.addEventListener('mousemove', (e) => {
  if (!panning) return;
  state.viewTransform.x = viewStart.x + (e.clientX - panStart.x);
  state.viewTransform.y = viewStart.y + (e.clientY - panStart.y);
  applyTransform();
});

window.addEventListener('mouseup', () => {
  panning = false;
  svg.classList.remove('panning');
});

// Obrazovkové souřadnice → souřadnice mapy (s pan/zoom)
export function clientToMap(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const v = state.viewTransform;
  return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale };
}

// Vytvoří kořenový uzel na pozici kurzoru (dvojklik i kontextové menu „Nový uzel zde")
export function addRootNodeAt(clientX, clientY) {
  // V timeline/drill/focus by nový kořenový uzel vznikl mimo viditelnou množinu = neviditelný orphan
  if (timeline.isActive() || drill.isActive() || focus.isActive()) return;
  const { x: mx, y: my } = clientToMap(clientX, clientY);
  const node = nodes.makeNode({ parentId: null, x: mx - 80, y: my - 24, color: defaultNodeColor });
  state.map.nodes.push(node);
  renderMap();
  state.selectedNodeId = node.id;
  panel.open(node);
  pushHistory();
  autoSave();
  nodes.startInlineEdit(node);  // okamžité inline pojmenování (sekce 5)
  return node;
}

// --- Multiselect (uzly: Shift, skupiny: Ctrl) ---
let multiBar = null;

(function injectMultiStyles() {
  if (document.getElementById('multi-style')) return;
  const s = document.createElement('style');
  s.id = 'multi-style';
  s.textContent = `
    #rubber-band { position: fixed; z-index: 90; border: 1.5px solid #F59E0B;
      background: #F59E0B1a; pointer-events: none; border-radius: 2px; }
    #multi-toolbar { position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
      z-index: 60; display: flex; align-items: center; gap: 8px;
      background: #15152aee; border: 1px solid #F59E0B66; border-radius: 10px;
      padding: 6px 12px; box-shadow: 0 8px 30px #0008;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px; color: #e5e5f0; }
    #multi-toolbar .mt-label { color: #F59E0B; font-weight: 600; margin-right: 4px; }
    #multi-toolbar .mt-swatch { width: 16px; height: 16px; border-radius: 4px; cursor: pointer; border: 1px solid #ffffff22; }
    #multi-toolbar .mt-swatch:hover { transform: scale(1.15); }
    #multi-toolbar .mt-color { width: 22px; height: 20px; padding: 0; border: none; background: none; cursor: pointer; }
    #multi-toolbar .mt-btn { padding: 4px 10px; font-size: 12px; font-weight: 600; color: #e5e5f0; background: #2a2a44; border: none; border-radius: 6px; cursor: pointer; }
    #multi-toolbar .mt-btn:hover { background: #34344f; }
    #multi-toolbar .mt-danger { background: #5a1f1f; }
    #multi-toolbar .mt-danger:hover { background: #7a2a2a; }`;
  document.head.appendChild(s);
})();

export function getSelectedNodeIds() { return state.selectedNodeIds; }
export function getSelectedGroupIds() { return state.selectedGroupIds; }

// Přepne plovoucí multiselect toolbar podle počtu vybraných (zobrazí se od 2 položek)
function updateMultiToolbar() {
  const nCount = state.selectedNodeIds.length;
  const gCount = state.selectedGroupIds.length;
  if (nCount + gCount < 2) { if (multiBar) { multiBar.remove(); multiBar = null; } return; }
  if (!multiBar) { multiBar = document.createElement('div'); multiBar.id = 'multi-toolbar'; document.body.appendChild(multiBar); }
  multiBar.innerHTML = '';
  const lbl = document.createElement('span');
  lbl.className = 'mt-label';
  lbl.textContent = `${nCount + gCount} vybráno`;
  multiBar.appendChild(lbl);
  if (nCount) {
    const PRESETS = [['purple', '#7C3AED'], ['green', '#059669'], ['neutral', '#3a3a5e'], ['amber', '#F59E0B'], ['red', '#E24B4A']];
    for (const [key, col] of PRESETS) {
      const sw = document.createElement('span');
      sw.className = 'mt-swatch'; sw.style.background = col; sw.title = key;
      sw.addEventListener('click', () => applyMultiColor(key, null));
      multiBar.appendChild(sw);
    }
    const custom = document.createElement('input');
    custom.type = 'color'; custom.className = 'mt-color'; custom.title = 'Vlastní barva';
    custom.addEventListener('input', () => applyMultiColor('custom', custom.value));
    multiBar.appendChild(custom);
    const grp = document.createElement('button');
    grp.className = 'mt-btn'; grp.textContent = 'Seskupit';
    grp.addEventListener('click', () => groups.groupSelected());
    multiBar.appendChild(grp);
  }
  const del = document.createElement('button');
  del.className = 'mt-btn mt-danger'; del.textContent = `Smazat (${nCount + gCount})`;
  del.addEventListener('click', () => deleteSelected());
  multiBar.appendChild(del);
}

// Aplikuje barvu na všechny vybrané uzly
function applyMultiColor(colorKey, hex) {
  for (const id of state.selectedNodeIds) {
    const n = getNode(id);
    if (!n) continue;
    if (colorKey === 'custom' && hex) { n.color = 'custom'; n.customColor = { fill: hex + '1a', stroke: hex, glow: hex }; }
    else { n.color = colorKey; n.customColor = null; }
  }
  nodes.renderAll();
  pushHistory();
  autoSave();
}

// Hromadné smazání vybraných uzlů (vč. podstromů) a skupin
export function deleteSelected() {
  const map = state.map;
  const toRemove = new Set();
  const collect = (id) => { toRemove.add(id); map.nodes.filter((n) => n.parentId === id).forEach((n) => collect(n.id)); };
  state.selectedNodeIds.forEach(collect);
  map.nodes = map.nodes.filter((n) => !toRemove.has(n.id));
  map.edges = map.edges.filter((e) => !toRemove.has(e.fromId) && !toRemove.has(e.toId));
  const gids = new Set(state.selectedGroupIds);
  if (gids.size) {
    map.groups = map.groups.filter((gr) => !gids.has(gr.id));
    for (const n of map.nodes) if (gids.has(n.groupId)) delete n.groupId;
  }
  if (drill.isActive()) drill.pruneRemoved(toRemove);
  state.selectedNodeIds = [];
  state.selectedGroupIds = [];
  state.selectedNodeId = null;
  panel.close();
  renderMap();
  updateMultiToolbar();
  pushHistory();
  autoSave();
}

// Přidá/odebere uzel z multiselectu (Shift+klik); naváže na případný jednoduchý výběr
export function toggleNodeSelect(id) {
  if (!state.selectedNodeIds.length && state.selectedNodeId && state.selectedNodeId !== id) {
    state.selectedNodeIds = [state.selectedNodeId];
  }
  const i = state.selectedNodeIds.indexOf(id);
  if (i >= 0) state.selectedNodeIds.splice(i, 1);
  else state.selectedNodeIds.push(id);
  state.selectedNodeId = state.selectedNodeIds[state.selectedNodeIds.length - 1] || null;
  panel.close();
  nodes.renderAll();
  updateMultiToolbar();
}

// Přidá/odebere skupinu z multiselectu (Ctrl+klik)
export function toggleGroupSelect(id) {
  const i = state.selectedGroupIds.indexOf(id);
  if (i >= 0) state.selectedGroupIds.splice(i, 1);
  else state.selectedGroupIds.push(id);
  groups.renderGroups();
  updateMultiToolbar();
}

// Zruší celý multiselect (Escape / klik na prázdno)
export function clearMultiSelect() {
  if (!state.selectedNodeIds.length && !state.selectedGroupIds.length) return;
  state.selectedNodeIds = [];
  state.selectedGroupIds = [];
  nodes.renderAll();
  groups.renderGroups();
  updateMultiToolbar();
}

// --- Rubber band (tažený výběrový obdélník) ---
function rectsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  return !(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1);
}

function startRubberBand(e, mode) {
  const box = document.createElement('div');
  box.id = 'rubber-band';
  document.body.appendChild(box);
  const x0 = e.clientX, y0 = e.clientY;
  const move = (ev) => {
    box.style.left = Math.min(x0, ev.clientX) + 'px';
    box.style.top = Math.min(y0, ev.clientY) + 'px';
    box.style.width = Math.abs(ev.clientX - x0) + 'px';
    box.style.height = Math.abs(ev.clientY - y0) + 'px';
  };
  const up = (ev) => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    box.remove();
    const a = clientToMap(Math.min(x0, ev.clientX), Math.min(y0, ev.clientY));
    const b = clientToMap(Math.max(x0, ev.clientX), Math.max(y0, ev.clientY));
    if (mode === 'groups') {
      state.selectedGroupIds = state.map.groups
        .filter((gr) => rectsIntersect(a.x, a.y, b.x, b.y, gr.x, gr.y, gr.x + gr.width, gr.y + gr.height))
        .map((gr) => gr.id);
    } else {
      const ids = state.map.nodes
        .filter((n) => rectsIntersect(a.x, a.y, b.x, b.y, n.x, n.y, n.x + n.width, n.y + n.height))
        .map((n) => n.id);
      state.selectedNodeIds = ids;
      state.selectedNodeId = ids[ids.length - 1] || null;
    }
    nodes.renderAll();
    groups.renderGroups();
    updateMultiToolbar();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

// --- Podmapové odkazy (sekce 2): navigace mezi mapami + breadcrumb ---
let mapBreadcrumb = null;

(function injectSubmapStyles() {
  if (document.getElementById('submap-style')) return;
  const s = document.createElement('style');
  s.id = 'submap-style';
  s.textContent = `
    #map-breadcrumb { position: absolute; top: 0; left: 0; right: 0; z-index: 41;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 6px 12px; background: #1a1430ee; border-bottom: 1px solid #7C3AED44;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px; color: #9a9ab0; user-select: none; }
    #map-breadcrumb .mb-back { cursor: pointer; color: #7C3AED; font-weight: 700; font-size: 14px; padding: 0 6px; }
    #map-breadcrumb .mb-back:hover { color: #fff; }
    #map-breadcrumb .mb-item { cursor: pointer; color: #c8c8da; padding: 2px 4px; border-radius: 4px; }
    #map-breadcrumb .mb-item:hover { background: #7C3AED22; color: #fff; }
    #map-breadcrumb .mb-item.mb-current { color: #7C3AED; font-weight: 600; cursor: default; }
    #map-breadcrumb .mb-sep { color: #5a5a72; }`;
  document.head.appendChild(s);
})();

// Vytvoří novou podmapu propojenou s uzlem (s daným názvem), nebo (pokud už existuje) na ni přejde
export async function createOrOpenSubmap(node, name) {
  if (node.linkedMapId) {
    if (sidebar.getMaps().some((m) => m.id === node.linkedMapId)) { await selectMap(node.linkedMapId); return; }
    node.linkedMapId = null;  // cílová mapa byla smazaná → vytvoř ji znovu
  }
  const mapName = (name && name.trim()) || node.label || 'Podmapa';
  try {
    const created = await api.createMap(mapName, state.currentMapId);
    const full = await api.getMap(created.id);
    full.nodes = [nodes.makeNode({ parentId: null, label: mapName, x: 400, y: 300 })];
    await api.updateMap(created.id, full);
    node.linkedMapId = created.id;
    renderMap();          // ukáže 🔗 na uzlu
    pushHistory();
    autoSave();           // označ odkaz jako neuloženou změnu…
    await flushSave();    // …a hned ho zapiš do aktuální mapy před přepnutím
    await sidebar.refresh();
    await selectMap(created.id);
  } catch (err) {
    console.error('Podmapu se nepodařilo vytvořit:', err.message);
    toast('Podmapu se nepodařilo vytvořit', 'error');
  }
}

export function goToMap(id) { selectMap(id); }

// Skok na nadřazenou mapu (tlačítko ← / Alt+← bez vybraného uzlu)
export function goToParentMap() {
  const m = sidebar.getMaps().find((x) => x.id === state.currentMapId);
  if (m && m.parentMapId) selectMap(m.parentMapId);
}

// Sync názvu: přejmenování odkazového uzlu → přejmenuj cílovou mapu i její root uzel
export async function syncSubmapName(node) {
  if (!node || !node.linkedMapId) return;
  try {
    const full = await api.getMap(node.linkedMapId);
    full.name = node.label;
    const root = (full.nodes || []).find((n) => n.parentId == null);
    if (root) root.label = node.label;
    await api.updateMap(node.linkedMapId, full);
    await sidebar.refresh();
    updateMapBreadcrumb();
  } catch (err) { console.error('Sync názvu podmapy selhal:', err.message); }
}

// Sestaví breadcrumb z řetězce parentMapId (zobrazí se jen v podmapě)
function updateMapBreadcrumb() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  const byId = {};
  sidebar.getMaps().forEach((m) => { byId[m.id] = m; });
  const chain = [];
  let cur = byId[state.currentMapId];
  const seen = new Set();  // ochrana proti cyklu v parentMapId
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parentMapId ? byId[cur.parentMapId] : null; }
  if (chain.length <= 1) { if (mapBreadcrumb) { mapBreadcrumb.remove(); mapBreadcrumb = null; } return; }
  if (!mapBreadcrumb) { mapBreadcrumb = document.createElement('div'); mapBreadcrumb.id = 'map-breadcrumb'; wrap.appendChild(mapBreadcrumb); }
  mapBreadcrumb.innerHTML = '';
  const back = document.createElement('span');
  back.className = 'mb-back'; back.textContent = '←'; back.title = 'Zpět na nadřazenou mapu (Alt+←)';
  back.addEventListener('click', () => selectMap(chain[chain.length - 2].id));
  mapBreadcrumb.appendChild(back);
  chain.forEach((m, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'mb-sep'; sep.textContent = '›'; mapBreadcrumb.appendChild(sep); }
    const item = document.createElement('span');
    item.className = 'mb-item' + (i === chain.length - 1 ? ' mb-current' : '');
    item.textContent = m.name;
    if (i < chain.length - 1) item.addEventListener('click', () => selectMap(m.id));
    mapBreadcrumb.appendChild(item);
  });
}

// --- Dvojklik na prázdnou plochu → nový kořenový uzel (jen v edit mode) ---
svg.addEventListener('dblclick', (e) => {
  if (e.target !== svg && e.target !== gridBg) return;
  if (!state.editMode) return;  // View mode = žádné vytváření uzlů
  if (edges.isConnectMode()) return;
  addRootNodeAt(e.clientX, e.clientY);
});

// --- ZOOM kolečkem k pozici kurzoru ---
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const v = state.viewTransform;

  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor));
  const ratio = newScale / v.scale;

  // Udrží bod pod kurzorem na místě
  v.x = mx - (mx - v.x) * ratio;
  v.y = my - (my - v.y) * ratio;
  v.scale = newScale;
  applyTransform();
}, { passive: false });

// --- ZOOM tlačítka ---
function zoomBy(factor) {
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const v = state.viewTransform;
  const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor));
  const ratio = newScale / v.scale;
  v.x = cx - (cx - v.x) * ratio;
  v.y = cy - (cy - v.y) * ratio;
  v.scale = newScale;
  applyTransform();
}

// Fit: vystředí a přizpůsobí zoom tak, aby byl vidět veškerý obsah
function fitToView() {
  const ns = state.map.nodes;
  const rect = svg.getBoundingClientRect();
  if (!ns.length) {
    state.viewTransform = { x: 0, y: 0, scale: 1 };
    applyTransform();
    return;
  }
  // Bounding box všech uzlů
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of ns) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 60;
  const bw = (maxX - minX) || 1;
  const bh = (maxY - minY) || 1;
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN,
    Math.min((rect.width - 2 * pad) / bw, (rect.height - 2 * pad) / bh)));
  state.viewTransform.scale = scale;
  state.viewTransform.x = (rect.width - bw * scale) / 2 - minX * scale;
  state.viewTransform.y = (rect.height - bh * scale) / 2 - minY * scale;
  // Hladký přechod
  panGroup.style.transition = 'transform 0.3s ease';
  applyTransform();
  setTimeout(() => { panGroup.style.transition = ''; }, 300);
}

document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('zoom-fit').addEventListener('click', fitToView);

// --- Render mapy ---
// Vymaže obsah pan-group a vytvoří vrstvy ve správném pořadí
function buildLayers() {
  panGroup.innerHTML = '';
  panGroup.appendChild(svgEl('g', { id: 'groups-layer' }));  // skupiny (fáze 5)
  panGroup.appendChild(svgEl('g', { id: 'edges-layer' }));   // hrany (fáze 4)
  panGroup.appendChild(svgEl('g', { id: 'nodes-layer' }));   // uzly (tato fáze)
}

// Překreslí celou mapu
export function renderMap() {
  buildLayers();
  groups.renderGroups();
  nodes.renderAll();
  edges.renderEdges(state.map.nodes, state.map.edges);
  canvas.updateMinimap(state.map.nodes, state.viewTransform);
  if (timeline.isActive()) timeline.drawAxis();  // dokresli časovou osu nad přerenderem
  if (focus.isActive()) focus.apply();           // znovu aplikuj focus ztlumení
  const allNodes = state.map && Array.isArray(state.map.nodes) ? state.map.nodes : [];
  // Při task filtru počítej viditelnost jen z uzlů s tasky (jinak vypadá prázdná plocha jako bug)
  const visible = state.taskFilter ? allNodes.some((n) => n.task && n.task.enabled) : allNodes.length > 0;
  emptyHint.style.display = visible ? 'none' : '';
  const nb = document.getElementById('number-btn');
  if (nb) nb.classList.toggle('active', !!(state.map.settings && state.map.settings.autoNumber));
}

// Načte a zobrazí vybranou mapu
async function selectMap(id) {
  try {
    // Nejdřív flushni rozpracované uložení STARÉ mapy — jinak by debounce timer doběhl až po
    // přepnutí a uložil novou mapu (nebo zahodil rozpracovanou změnu staré). Pak zavři hledání.
    await flushSave();
    search.closeSearch();
    // Ukonči přechodové módy před načtením jiné mapy (snapshot/osa/ztlumení/drill patří staré mapě)
    if (timeline.isActive()) timeline.deactivate();
    if (focus.isActive()) focus.exit();
    if (drill.isActive()) drill.exit();
    const map = await api.getMap(id);
    // Pojistka na povinná pole
    map.nodes = map.nodes || [];
    map.edges = map.edges || [];
    map.groups = map.groups || [];
    setState({ currentMapId: id, map, selectedNodeId: null, selectedNodeIds: [], selectedGroupIds: [] });
    updateMultiToolbar();
    panel.close();
    renderMap();
    stats.update();  // statistiky nově načtené mapy
    updateMapBreadcrumb();  // breadcrumb podmapové hierarchie
    // Historie patří jen aktuální mapě: vyčisti a seedni baseline načteného stavu
    history.reset();
    pushHistory();
  } catch (err) {
    console.error('Nepodařilo se načíst mapu:', err.message);
    toast('Nepodařilo se načíst mapu', 'error');
  }
}

// --- Historie (undo/redo) ---
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

// Uloží hluboký snapshot aktuální mapy na zásobník
export function pushHistory() {
  // V timeline režimu uložit do historie původní (snapshot) pozice, ne dočasné layout souřadnice
  history.push(timeline.isActive() ? timeline.mapForSave(state.map) : state.map);
  updateHistoryButtons();
}

// Aktualizuje disabled stav toolbar šipek podle zásobníků
function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = !history.canUndo();
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

// Dosadí snapshot do stavu a překreslí (bez nového zápisu do historie)
function restoreState(snapshot) {
  // Ukonči přechodové módy před dosazením snapshotu z historie (osiřelé reference / zaseklý banner)
  if (timeline.isActive()) timeline.deactivate();
  if (focus.isActive()) focus.exit();
  if (drill.isActive()) drill.exit();
  state.map = JSON.parse(JSON.stringify(snapshot));
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.selectedNodeIds = [];
  state.selectedGroupIds = [];
  panel.close();
  updateMultiToolbar();
  renderMap();
  autoSave();
}

if (undoBtn) undoBtn.addEventListener('click', () => { history.undo(restoreState); updateHistoryButtons(); });
if (redoBtn) redoBtn.addEventListener('click', () => { history.redo(restoreState); updateHistoryButtons(); });

// --- Pomocné akce nad vybraným uzlem ---
function getNode(id) { return id ? state.map.nodes.find((n) => n.id === id) : null; }

// Smaže uzel včetně potomků a jejich hran
function deleteNode(node) {
  const map = state.map;
  const toRemove = new Set();
  const collect = (id) => {
    toRemove.add(id);
    map.nodes.filter((n) => n.parentId === id).forEach((n) => collect(n.id));
  };
  collect(node.id);
  map.nodes = map.nodes.filter((n) => !toRemove.has(n.id));
  map.edges = map.edges.filter((e) => !toRemove.has(e.fromId) && !toRemove.has(e.toId));
  if (drill.isActive()) drill.pruneRemoved(toRemove);  // smazaný drill-kořen by jinak nechal prázdné plátno
  state.selectedNodeId = null;
  panel.close();
  renderMap();
  pushHistory();
  autoSave();
}

// Přepne na mapu (pokud je jiná) a vystředí + zvýrazní daný uzel (záložky napříč mapami)
export async function goToNode(mapId, nodeId) {
  if (state.currentMapId !== mapId) await selectMap(mapId);
  const node = state.map.nodes.find((n) => n.id === nodeId);
  if (node) {
    state.selectedNodeId = node.id;
    panToNode(node);
    highlightNode(node);
  }
}

// Animovaně vystředí uzel ve viewportu
export function panToNode(node) {
  if (!node) return;
  const v = state.viewTransform;
  const rect = getCanvasRect();
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  v.x = rect.width / 2 - cx * v.scale;
  v.y = rect.height / 2 - cy * v.scale;
  panGroup.style.transition = 'transform 0.3s ease';
  applyTransform();
  setTimeout(() => { panGroup.style.transition = ''; }, 300);
}

// Dočasně zvýrazní uzel zlatým okrajem, pak obnoví původní vzhled
export function highlightNode(node) {
  if (!node) return;
  const g = document.querySelector(`#nodes-layer [data-id="${node.id}"]`);
  const rect = g && g.querySelector('rect');
  if (!rect) return;
  rect.setAttribute('stroke', '#F59E0B');
  rect.setAttribute('stroke-width', 3);
  rect.style.filter = 'drop-shadow(0 0 10px #F59E0B)';
  setTimeout(() => nodes.refresh(node), 1300);
}

// --- Klávesové zkratky ---
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  // V pitch módu řeší klávesy jeho vlastní capture listener (šipky/Escape) — ostatní ignoruj,
  // ať se mapa pod prezentačním overlayem nemění
  if (pitch.isActive()) return;

  // Read-only detail okno / command palette si řeší klávesy samy (Escape přes vlastní listener)
  if (detail.isOpen() || palette.isOpen()) return;

  // Inline pojmenování uzlu běží — klávesy patří jen jeho inputu (pojistka: kdyby fokus selhal,
  // ať psaný název nespouští globální zkratky jako E/N a nevytvoří kaskádu nechtěných akcí)
  if (document.querySelector('.node-edit-input')) return;

  // Otevřený modal (Nastavení / Cheatsheet) pohlcuje mapové zkratky — projde jen jeho zavření,
  // ať se mapa pod overlayem nemění (Delete/Tab/Enter/Space/… by jinak prošly)
  if (settings.isOpen() || cheatsheet.isOpen()) {
    if (cheatsheet.isOpen() && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); cheatsheet.close(); }
    return;
  }

  // Ctrl+F hledání / Ctrl+Shift+F focus mode (fungují i při psaní)
  if (mod && k === 'f') {
    e.preventDefault();
    if (e.shiftKey) focus.toggle(); else search.openSearch();
    return;
  }

  // Mod zkratky mimo textová pole
  if (mod && !typing) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(restoreState); updateHistoryButtons(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); history.redo(restoreState); updateHistoryButtons(); return; }
    if (k === 'd') { e.preventDefault(); const n = getNode(state.selectedNodeId); if (n) nodes.duplicateBranch(n); return; }
    if (k === 'g') { e.preventDefault(); groups.groupSelected(); return; }
    if (k === 'l') { e.preventDefault(); edges.toggleConnectMode(); return; }
    if (k === 'm') { e.preventDefault(); toggleMinimap(); return; }
    if (k === 'p' && e.shiftKey) { e.preventDefault(); palette.open(); return; }  // Ctrl+Shift+P
    if (k === 'p') { e.preventDefault(); pitch.toggle(); return; }
    if (k === 's') { e.preventDefault(); autoSave(); return; }
    if (k === 'b') {
      e.preventDefault();
      if (e.shiftKey) sidebar.toggleBookmarks();  // Ctrl+Shift+B = záložky napříč mapami
      else { const n = getNode(state.selectedNodeId); if (n) nodes.toggleBookmark(n); }
      return;
    }
    if (e.key === '0') { e.preventDefault(); fitToView(); return; }
    if (e.key >= '1' && e.key <= '9') { e.preventDefault(); sidebar.selectByIndex(Number(e.key) - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); const n = getNode(state.selectedNodeId); if (n) { panel.open(n); panel.focusNote(); } return; }
  }

  if (typing) return;

  // ? — cheatsheet zkratek
  if (e.key === '?') { e.preventDefault(); cheatsheet.toggle(); return; }

  // E — přepnout View / Edit mode (sekce 1)
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleEditMode(); return; }

  // Escape — postupně zavírá módy/overlay, pak panel a výběr
  if (e.key === 'Escape') {
    if (cheatsheet.isOpen()) { cheatsheet.close(); return; }
    if (pitch.isActive()) { pitch.exit(); return; }
    if (focus.isActive()) { focus.exit(); return; }
    if (drill.isActive()) { drill.pop(); return; }
    if (state.selectedNodeIds.length || state.selectedGroupIds.length) { clearMultiSelect(); return; }
    panel.close();
    search.closeSearch();
    if (state.selectedNodeId || state.selectedEdgeId) {
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      edges.renderEdges(state.map.nodes, state.map.edges);
    }
    return;
  }

  const sel = getNode(state.selectedNodeId);

  // F2 — přejmenuj (fokus na název v panelu)
  if (e.key === 'F2') { if (sel) { e.preventDefault(); panel.open(sel); panel.focusName(); } return; }

  // Tab — nový potomek, Enter — nový sourozenec
  if (e.key === 'Tab') { if (sel) { e.preventDefault(); nodes.addChild(sel); } return; }
  if (e.key === 'Enter') { if (sel) { e.preventDefault(); nodes.addSibling(sel); } return; }

  // Alt+šipky — přesun ve stromu
  if (e.altKey && sel) {
    if (e.key === 'ArrowUp') { e.preventDefault(); nodes.moveAmongSiblings(sel, -1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); nodes.moveAmongSiblings(sel, 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); nodes.moveLevelUp(sel); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); nodes.moveLevelDown(sel); return; }
  }
  // Alt+← bez vybraného uzlu = zpět na nadřazenou mapu (podmapová navigace)
  if (e.altKey && e.key === 'ArrowLeft' && !sel) { e.preventDefault(); goToParentMap(); return; }

  // Delete / Backspace — smaž vybrané (multiselect má přednost), jinak vybraný uzel (hranu řeší edges.js)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedNodeIds.length >= 2 || state.selectedGroupIds.length) { e.preventDefault(); deleteSelected(); return; }
    if (sel) { e.preventDefault(); deleteNode(sel); }
    return;
  }

  // N — přidej potomka vybraného uzlu
  if (e.key === 'n' || e.key === 'N') {
    if (sel) { e.preventDefault(); nodes.addChild(sel); }
    return;
  }

  // Space — sbalit/rozbalit vybraný uzel
  if (e.key === ' ') {
    if (sel) { e.preventDefault(); sel.collapsed = !sel.collapsed; renderMap(); autoSave(); }
    return;
  }
});

// Skrytí / zobrazení minimapy (Ctrl+M)
function toggleMinimap() {
  const mini = document.getElementById('minimap');
  if (mini) mini.style.display = mini.style.display === 'none' ? '' : 'none';
}

// --- Auto-save ---
let saveTimer = null;
let pendingSave = false;  // je naplánovaná, ještě nezapsaná změna? (kvůli flushi při přepnutí mapy)
let dotTimer = null;
const saveDot = document.createElement('span');
saveDot.id = 'save-dot';
document.querySelector('.toolbar-right').prepend(saveDot);

// Zobrazí zelenou tečku, po 2s ji skryje
function flashSaved() {
  saveDot.classList.remove('err');
  saveDot.classList.add('on');
  clearTimeout(dotTimer);
  dotTimer = setTimeout(() => saveDot.classList.remove('on'), 2000);
}

// Trvalá červená tečka + toast při selhání ukládání
function flashSaveError() {
  saveDot.classList.add('on', 'err');
  clearTimeout(dotTimer);
  toast('Chyba ukládání', 'error');
}

export function autoSave() {
  stats.update();  // statistiky reflektují každou změnu okamžitě
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!state.currentMapId) { pendingSave = false; return; }
    try {
      // V timeline režimu jsou x/y dočasné — na disk ulož původní pozice ze snapshotu,
      // datové změny (date, label, …) zůstanou zachované
      const payload = timeline.isActive() ? timeline.mapForSave(state.map) : state.map;
      await api.updateMap(state.currentMapId, payload);
      pendingSave = false;
      flashSaved();
    } catch (err) {
      console.error('Auto-save selhal:', err.message);
      flashSaveError();
    }
  }, 300);
}

// Okamžitě zapíše rozpracovanou změnu (volá se před přepnutím mapy, ať se neztratí v debounce okně)
async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pendingSave || !state.currentMapId) { pendingSave = false; return; }
  pendingSave = false;
  const id = state.currentMapId;
  const payload = timeline.isActive() ? timeline.mapForSave(state.map) : state.map;
  try { await api.updateMap(id, payload); } catch (err) { console.error('Flush save selhal:', err.message); }
}

// --- Auto-layout ---
function runLayout(layoutFn) {
  if (timeline.isActive()) { toast('Layout není dostupný v timeline režimu', 'error'); return; }
  (layoutFn || applyLayout)(state.map.nodes);
  const lyr = document.getElementById('nodes-layer');
  // Animovaný přechod uzlů na nové pozice
  for (const n of state.map.nodes) {
    const g = lyr.querySelector(`[data-id="${n.id}"]`);
    if (!g) continue;
    g.style.transition = 'transform 0.4s ease';
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
  }
  edges.renderEdges(state.map.nodes, state.map.edges);
  // Historie + persistence hned (nezávisle na délce CSS animace), ať se nemíchá s mezilehlou akcí
  pushHistory();
  autoSave();
  setTimeout(() => {
    for (const n of state.map.nodes) {
      const g = lyr.querySelector(`[data-id="${n.id}"]`);
      if (g) g.style.transition = '';
    }
    renderMap();
  }, 400);
}
// --- Layout dropdown (Hierarchie / Radial / Fishbone / Org chart) ---
const LAYOUTS = [
  ['Hierarchie', applyLayout],
  ['Radial', applyRadial],
  ['Fishbone', applyFishbone],
  ['Org chart', applyOrgChart],
];
const layoutBtn = document.getElementById('layout-btn');
let layoutMenu = null;
function closeLayoutMenu() { if (layoutMenu) { layoutMenu.remove(); layoutMenu = null; } }
if (layoutBtn) {
  layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (layoutMenu) { closeLayoutMenu(); return; }
    layoutMenu = document.createElement('div');
    layoutMenu.className = 'tb-menu';
    const r = layoutBtn.getBoundingClientRect();
    layoutMenu.style.top = `${r.bottom + 4}px`;
    layoutMenu.style.left = `${r.left}px`;
    for (const [name, fn] of LAYOUTS) {
      const item = document.createElement('div');
      item.className = 'tb-menu-item';
      item.textContent = name;
      item.addEventListener('click', () => { closeLayoutMenu(); runLayout(fn); });
      layoutMenu.appendChild(item);
    }
    document.body.appendChild(layoutMenu);
  });
  document.addEventListener('click', closeLayoutMenu);
}

// --- Timeline režim ---
const timelineBtn = document.getElementById('timeline-btn');
if (timelineBtn) timelineBtn.addEventListener('click', () => timeline.toggle());

// --- Task filtr / Focus / Pitch tlačítka ---
const taskFilterBtn = document.getElementById('task-filter-btn');
if (taskFilterBtn) taskFilterBtn.addEventListener('click', () => {
  state.taskFilter = !state.taskFilter;
  taskFilterBtn.classList.toggle('active', state.taskFilter);
  // Při zapnutí filtru zruš výběr odfiltrovaného uzlu (klávesy by jinak cílily na neviditelný uzel)
  if (state.taskFilter) {
    const sel = getNode(state.selectedNodeId);
    if (sel && !(sel.task && sel.task.enabled)) {
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      panel.close();
    }
  }
  renderMap();
});
const focusBtn = document.getElementById('focus-btn');
if (focusBtn) focusBtn.addEventListener('click', () => focus.toggle());
const pitchBtn = document.getElementById('pitch-btn');
if (pitchBtn) pitchBtn.addEventListener('click', () => pitch.toggle());
const settingsBtn = document.getElementById('settings-btn');
if (settingsBtn) settingsBtn.addEventListener('click', () => settings.open());
const numberBtn = document.getElementById('number-btn');
if (numberBtn) numberBtn.addEventListener('click', () => {
  if (!state.map.settings) state.map.settings = {};
  state.map.settings.autoNumber = !state.map.settings.autoNumber;
  numberBtn.classList.toggle('active', state.map.settings.autoNumber);
  renderMap();
  pushHistory();
  autoSave();
});

// --- View/Edit mode tlačítko ---
const modeBtn = document.getElementById('mode-btn');
if (modeBtn) modeBtn.addEventListener('click', () => toggleEditMode());

// --- Inicializace ---
applyTransform();
updateHistoryButtons();
applyMode();  // výchozí View mode (banner, skryté editační prvky)
sidebar.init(selectMap, goToNode);
settings.load();
