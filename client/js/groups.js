// Skupinové rámečky v #groups-layer — render, drag, resize, přidání
import { getState, autoSave, pushHistory, getCanvasRect } from './app.js';
import * as panel from './panel.js';
import * as edges from './edges.js';
import * as canvas from './canvas.js';
import { toast } from './toast.js';
import { promptText } from './prompt.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_W = 120;
const MIN_H = 80;

// Zkratka pro vytvoření SVG elementu
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// --- Injekce stylů (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('groups-style')) return;
  const s = document.createElement('style');
  s.id = 'groups-style';
  s.textContent = `
    .group { cursor: move; }
    .group .group-label { text-transform: uppercase; letter-spacing: 0.08em; pointer-events: none; }
    .group .group-resize { opacity: 0; transition: opacity .12s; cursor: nwse-resize; }
    .group:hover .group-resize { opacity: 1; }`;
  document.head.appendChild(s);
})();

function groupsArr() { return getState().map.groups; }
function layer() { return document.getElementById('groups-layer'); }

// Překreslí celý #groups-layer
export function renderGroups() {
  const lyr = layer();
  if (!lyr) return;
  lyr.innerHTML = '';
  for (const group of groupsArr()) lyr.appendChild(drawGroup(group));
}

// Sestaví <g> jedné skupiny
function drawGroup(group) {
  const g = el('g', { class: 'group', 'data-id': group.id, transform: `translate(${group.x},${group.y})` });

  // Rámeček
  const rect = el('rect', {
    x: 0, y: 0, width: group.width, height: group.height, rx: 12,
    fill: group.color + '10', stroke: group.color + '66',
    'stroke-width': 1.5, 'stroke-dasharray': '6 3',
  });
  g.appendChild(rect);

  // Label vlevo nahoře
  const label = el('text', {
    class: 'group-label', x: 12, y: 18,
    fill: group.color, 'font-size': 10, 'font-weight': 600,
  });
  label.textContent = group.label;
  g.appendChild(label);

  // Resize handle pravý dolní roh
  const handle = el('rect', {
    class: 'group-resize', x: group.width - 8, y: group.height - 8,
    width: 8, height: 8, rx: 2, fill: group.color,
  });
  g.appendChild(handle);

  attachDrag(g, group);
  attachResize(handle, group);
  return g;
}

// --- Drag skupiny ---
function attachDrag(g, group) {
  g.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.classList.contains('group-resize')) return;
    e.stopPropagation();
    const scale = getState().viewTransform.scale;
    const startX = e.clientX, startY = e.clientY;
    const origX = group.x, origY = group.y;
    // Členové skupiny (uchovej výchozí pozice) — posunou se spolu se skupinou
    const members = getState().map.nodes
      .filter((n) => n.groupId === group.id)
      .map((n) => ({ n, x: n.x, y: n.y }));
    let moved = false;

    const move = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      group.x = origX + dx;
      group.y = origY + dy;
      g.setAttribute('transform', `translate(${group.x},${group.y})`);
      // Posuň členské uzly o stejnou deltu
      for (const m of members) {
        m.n.x = m.x + dx;
        m.n.y = m.y + dy;
        const ng = document.querySelector(`#nodes-layer [data-id="${m.n.id}"]`);
        if (ng) ng.setAttribute('transform', `translate(${m.n.x},${m.n.y})`);
      }
      if (members.length) {
        const map = getState().map;
        edges.renderEdges(map.nodes, map.edges);   // hrany sledují uzly
        canvas.updateMinimap(map.nodes, getState().viewTransform);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (moved) {
        pushHistory();
        autoSave();
      } else {
        panel.openGroup(group);  // klik bez pohybu otevře detail
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// --- Resize skupiny ---
function attachResize(handle, group) {
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const scale = getState().viewTransform.scale;
    const startX = e.clientX, startY = e.clientY;
    const origW = group.width, origH = group.height;

    const move = (ev) => {
      group.width = Math.max(MIN_W, origW + (ev.clientX - startX) / scale);
      group.height = Math.max(MIN_H, origH + (ev.clientY - startY) / scale);
      const g = layer().querySelector(`[data-id="${group.id}"]`);
      if (g) g.replaceWith(drawGroup(group));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      pushHistory();
      autoSave();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// Vytvoří skupinu se středem na (cx,cy) v mapových souřadnicích (ptá se na název)
async function createGroup(cx, cy) {
  const name = await promptText('Název skupiny:');
  if (name === null) return;
  const group = {
    id: crypto.randomUUID(),
    label: name.trim() || 'Skupina',
    color: '#7C3AED',
    x: cx - 100, y: cy - 75, width: 200, height: 150,
  };
  groupsArr().push(group);
  renderGroups();
  pushHistory();
  autoSave();
}

// --- Přidání skupiny na střed canvasu (toolbar) ---
export function addGroup() {
  const v = getState().viewTransform;
  const rect = getCanvasRect();
  createGroup((rect.width / 2 - v.x) / v.scale, (rect.height / 2 - v.y) / v.scale);
}

// --- Přidání skupiny na danou pozici (kontextové menu „Nová skupina zde") ---
export function addGroupAt(cx, cy) { createGroup(cx, cy); }

// --- Seskupení vybraného uzlu i s podstromem (Ctrl+G) ---
export function groupSelected() {
  const st = getState();
  const node = st.map.nodes.find((n) => n.id === st.selectedNodeId);
  if (!node) { toast('Vyber uzel pro seskupení', 'info'); return; }
  // Posbírej id uzlu a všech potomků
  const ids = new Set();
  const collect = (id) => {
    ids.add(id);
    st.map.nodes.filter((n) => n.parentId === id).forEach((c) => collect(c.id));
  };
  collect(node.id);
  const members = st.map.nodes.filter((n) => ids.has(n.id));

  // Bbox jen z viditelných uzlů (ne pod sbaleným předkem), ať rámeček sedí na to, co je vidět
  const byId = {};
  st.map.nodes.forEach((n) => { byId[n.id] = n; });
  const hidden = (n) => {
    let p = n.parentId ? byId[n.parentId] : null;
    while (p) { if (p.collapsed) return true; p = p.parentId ? byId[p.parentId] : null; }
    return false;
  };
  const visible = members.filter((n) => !hidden(n));
  const bboxNodes = visible.length ? visible : members;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of bboxNodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 30;
  const group = {
    id: crypto.randomUUID(),
    label: node.label,
    color: '#7C3AED',
    x: minX - pad, y: minY - pad,
    width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2,
  };
  groupsArr().push(group);
  members.forEach((n) => { n.groupId = group.id; });
  renderGroups();
  pushHistory();
  autoSave();
}

// --- Odebrání skupiny ---
export function removeGroup(id) {
  const map = getState().map;
  map.groups = map.groups.filter((gr) => gr.id !== id);
  // Uzly ve skupině zůstanou na místě, jen ztratí příslušnost
  for (const n of map.nodes) {
    if (n.groupId === id) delete n.groupId;
  }
  renderGroups();
  pushHistory();
  autoSave();
}

// Připojení tlačítka v toolbaru
const addBtn = document.getElementById('group-btn');
if (addBtn) addBtn.addEventListener('click', addGroup);
