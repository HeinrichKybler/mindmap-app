// Nativní kontextové menu (pravý klik) v SVG canvasu — uzel / hrana / skupina / prázdno.
// Žádné browser default menu — contextmenu se vždy preventDefault.
import { getState, addRootNodeAt, clientToMap, pushHistory, autoSave, getSelectedNodeIds, getSelectedGroupIds, deleteSelected } from './app.js';
import * as nodes from './nodes.js';
import * as edges from './edges.js';
import * as groups from './groups.js';
import * as panel from './panel.js';
import * as focus from './focus.js';
import * as drill from './drill.js';

// 8 barev (name → hex) pro submenu „Změnit barvu"
const COLORS = [
  ['purple', '#7C3AED'], ['green', '#059669'], ['blue', '#3B82F6'], ['cyan', '#06B6D4'],
  ['orange', '#F97316'], ['red', '#E24B4A'], ['amber', '#F59E0B'], ['neutral', '#3a3a5e'],
];

(function injectStyles() {
  if (document.getElementById('ctx-style')) return;
  const s = document.createElement('style');
  s.id = 'ctx-style';
  s.textContent = `
    .ctx-menu {
      position: fixed; z-index: 9999;
      background: #111122; border: 1px solid #7C3AED44; border-radius: 8px;
      padding: 4px 0; min-width: 200px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      font-family: 'Inter', system-ui, sans-serif;
    }
    .ctx-item {
      position: relative; height: 32px; display: flex; align-items: center;
      padding: 0 12px; font-size: 13px; color: #e0e0e0; cursor: pointer; white-space: nowrap;
    }
    .ctx-item:hover { background: #7C3AED22; }
    .ctx-item.danger { color: #E24B4A; }
    .ctx-item .ctx-arrow { margin-left: auto; padding-left: 16px; color: #9a9ab0; }
    .ctx-sep { height: 0; border-top: 1px solid #7C3AED22; margin: 4px 0; }
    .ctx-sub {
      display: none; position: absolute; left: 100%; top: -5px; margin-left: 1px;
    }
    .ctx-item:hover > .ctx-sub { display: block; }
    .ctx-colors { padding: 8px; min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; width: 132px; }
    .ctx-color {
      width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
      border: 2px solid transparent; box-sizing: border-box;
    }
    .ctx-color:hover { border-color: #fff; }`;
  document.head.appendChild(s);
})();

let menuEl = null;

function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener('mousedown', onDocDown, true);
  document.removeEventListener('keydown', onKey, true);
}

function onDocDown(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}
function onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); }
}

// Sestaví <div.ctx-menu> z položek
function buildMenu(items) {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  for (const it of items) {
    if (it.sep) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'ctx-item' + (it.danger ? ' danger' : '');
    row.textContent = it.label;

    if (it.colors) {
      // Submenu s barevnými kolečky
      const arrow = document.createElement('span');
      arrow.className = 'ctx-arrow';
      arrow.textContent = '▸';
      row.appendChild(arrow);
      const sub = document.createElement('div');
      sub.className = 'ctx-menu ctx-sub ctx-colors';
      for (const [name, hex] of it.colors) {
        const dot = document.createElement('div');
        dot.className = 'ctx-color';
        dot.style.background = hex;
        dot.title = name;
        dot.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.onPick(hex); });
        sub.appendChild(dot);
      }
      row.appendChild(sub);
    } else {
      row.addEventListener('click', () => { closeMenu(); it.action(); });
    }
    menu.appendChild(row);
  }
  return menu;
}

// Zobrazí menu na pozici (clamp do viewportu)
function showMenu(x, y, items) {
  closeMenu();
  menuEl = buildMenu(items);
  menuEl.style.left = '0px';
  menuEl.style.top = '0px';
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  const px = x + r.width > window.innerWidth ? Math.max(0, window.innerWidth - r.width - 4) : x;
  const py = y + r.height > window.innerHeight ? Math.max(0, window.innerHeight - r.height - 4) : y;
  menuEl.style.left = `${px}px`;
  menuEl.style.top = `${py}px`;
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
}

// --- Akce nad uzlem ---
function renameNode(node) {
  getState().selectedNodeId = node.id;
  panel.open(node);
  panel.focusName();
}
function focusBranch(node) {
  getState().selectedNodeId = node.id;
  if (focus.isActive()) focus.apply();  // přepni focus na tuto větev
  else focus.toggle();
}

function nodeMenu(node) {
  const selCount = getSelectedNodeIds().length + getSelectedGroupIds().length;
  // Pokud je multiselect (2+) a kliklo se na vybraný uzel, nabídni hromadné smazání nahoře
  const bulk = (selCount >= 2 && getSelectedNodeIds().includes(node.id))
    ? [{ label: `Smazat vybrané (${selCount})`, danger: true, action: () => deleteSelected() }, { sep: true }]
    : [];
  return [
    ...bulk,
    { label: 'Přejmenovat', action: () => renameNode(node) },
    { label: 'Přidat potomka', action: () => nodes.addChild(node) },
    { label: 'Duplikovat uzel', action: () => nodes.duplicateBranch(node) },
    { sep: true },
    { label: node.bookmarked ? 'Odebrat záložku ⭐' : 'Přidat záložku ⭐', action: () => nodes.toggleBookmark(node) },
    { label: 'Focus na tuto větev', action: () => focusBranch(node) },
    { label: 'Drill down', action: () => drill.drillInto(node) },
    { label: 'Přidat summary (sourozenci)', action: () => nodes.summarizeSiblings(node) },
    { sep: true },
    { label: 'Změnit barvu', colors: COLORS, onPick: (hex) => panel.applyColorTo(node, hex) },
    { sep: true },
    { label: 'Smazat uzel', danger: true, action: () => nodes.deleteNode(node) },
  ];
}

function edgeMenu(edge) {
  return [
    { label: 'Upravit popisek', action: () => {
      getState().selectedEdgeId = edge.id;
      const m = getState().map;
      edges.renderEdges(m.nodes, m.edges);
      panel.openEdge(edge);
      panel.focusEdgeLabel();
    } },
    { label: 'Smazat hranu', danger: true, action: () => edges.removeEdge(edge.id) },
  ];
}

// Nativní color picker pro skupinu
function groupColorPicker(group) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = group.color || '#7C3AED';
  input.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(input);
  const done = () => input.remove();
  input.addEventListener('input', () => { group.color = input.value; groups.renderGroups(); });
  input.addEventListener('change', () => { pushHistory(); autoSave(); done(); });
  // Úklid i při zrušení pickeru (kdy 'change' nemusí firnout): po zavření se vrátí focus do okna
  window.addEventListener('focus', done, { once: true });
  input.click();
}

function groupMenu(group) {
  return [
    { label: 'Přejmenovat', action: () => { panel.openGroup(group); panel.focusGroupName(); } },
    { label: 'Změnit barvu', action: () => groupColorPicker(group) },
    { label: 'Smazat skupinu', danger: true, action: () => groups.removeGroup(group.id) },
  ];
}

function canvasMenu(clientX, clientY) {
  return [
    { label: 'Nový uzel zde', action: () => addRootNodeAt(clientX, clientY) },
    { label: 'Nová skupina zde', action: () => { const p = clientToMap(clientX, clientY); groups.addGroupAt(p.x, p.y); } },
    { sep: true },
    { label: 'Fit all', action: () => document.getElementById('zoom-fit')?.click() },
  ];
}

// --- Připojení listeneru na SVG canvas ---
const svg = document.getElementById('canvas');
if (svg) {
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();  // žádné browser default menu
    const map = getState().map;

    const nodeG = e.target.closest('#nodes-layer [data-id]');
    if (nodeG) {
      const node = map.nodes.find((n) => n.id === nodeG.getAttribute('data-id'));
      if (node) return showMenu(e.clientX, e.clientY, nodeMenu(node));
    }
    const groupG = e.target.closest('#groups-layer [data-id]');
    if (groupG) {
      const group = map.groups.find((g) => g.id === groupG.getAttribute('data-id'));
      if (group) return showMenu(e.clientX, e.clientY, groupMenu(group));
    }
    const edgeG = e.target.closest('#edges-layer [data-id]');
    if (edgeG) {
      const edge = map.edges.find((ed) => ed.id === edgeG.getAttribute('data-id'));
      if (edge) return showMenu(e.clientX, e.clientY, edgeMenu(edge));
    }
    // Prázdná plocha
    showMenu(e.clientX, e.clientY, canvasMenu(e.clientX, e.clientY));
  });
}
