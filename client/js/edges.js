// Render hran (bezier), propojovací režim, výběr a mazání hran
import { getState, nodeColors, autoSave, pushHistory } from './app.js';
import * as nodes from './nodes.js';
import * as panel from './panel.js';
import * as drill from './drill.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Zkratka pro vytvoření SVG elementu
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Bezier dráha mezi dvěma body
function cubicBezierPath(x1, y1, x2, y2) {
  const cy = (y2 - y1) * 0.5;
  return `M${x1},${y1} C${x1},${y1 + cy} ${x2},${y2 - cy} ${x2},${y2}`;
}

// --- Injekce stylů + marker šipky (jen jednou) ---
(function injectOnce() {
  if (!document.getElementById('edges-style')) {
    const s = document.createElement('style');
    s.id = 'edges-style';
    s.textContent = `
      .edge-hit { cursor: pointer; }
      .tb-btn.active { background: #7C3AED; color: #fff; border-color: #7C3AED; }
      #canvas.connecting { cursor: crosshair !important; }`;
    document.head.appendChild(s);
  }
  // Šipka na konec hrany
  const defs = document.querySelector('#canvas defs');
  if (defs && !document.getElementById('arrowhead')) {
    const marker = el('marker', {
      id: 'arrowhead', markerWidth: 7, markerHeight: 7,
      refX: 6, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse',
    });
    const tri = el('path', { d: 'M0,0 L6,3 L0,6 Z', fill: 'context-stroke' });
    marker.appendChild(tri);
    defs.appendChild(marker);
  }
})();

// --- Pomocné nad stavem ---
function buildIndex(nodeList) {
  const idx = {};
  for (const n of nodeList) idx[n.id] = n;
  return idx;
}

// Uzel je skrytý, pokud má některý předek collapsed=true
function isHidden(node, idx) {
  let p = node.parentId ? idx[node.parentId] : null;
  while (p) {
    if (p.collapsed) return true;
    p = p.parentId ? idx[p.parentId] : null;
  }
  return false;
}

// --- Render ---
function layer() { return document.getElementById('edges-layer'); }

// Překreslí celý #edges-layer
export function renderEdges(nodeList, edgeList) {
  const lyr = layer();
  if (!lyr) return;
  lyr.innerHTML = '';
  const idx = buildIndex(nodeList);
  const selId = getState().selectedEdgeId;
  const taskFilter = getState().taskFilter;
  const isTask = (n) => n.task && n.task.enabled;
  const vis = drill.inViewSet();  // null = bez drill downu

  for (const edge of edgeList) {
    const from = idx[edge.fromId];
    const to = idx[edge.toId];
    if (!from || !to) continue;

    const g = el('g', { 'data-id': edge.id });
    // Skryj hranu (zůstane v datech) při sbaleném endpointu, task filtru nebo mimo drilldown větev
    const filtered = taskFilter && (!isTask(from) || !isTask(to));
    const outOfDrill = vis && (!vis.has(from.id) || !vis.has(to.id));
    if (isHidden(from, idx) || isHidden(to, idx) || filtered || outOfDrill) g.setAttribute('display', 'none');

    // Střed spodní strany → střed horní strany
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    const d = cubicBezierPath(x1, y1, x2, y2);

    const c = nodeColors(from);
    const selected = edge.id === selId;
    const REL = '#7C3AED';  // barva vztahové hrany

    // Viditelná křivka — vztahová: fialová čárkovaná; jinak glow dle zdrojového uzlu
    const path = el('path', {
      d, fill: 'none',
      stroke: edge.isRelationship ? REL : c.stroke,
      'stroke-width': selected ? 3 : 1.5,
      opacity: selected ? 1 : 0.5,
      'marker-end': 'url(#arrowhead)',
    });
    if (edge.isRelationship) path.setAttribute('stroke-dasharray', '8 4');
    path.style.filter = `drop-shadow(0 0 3px ${edge.isRelationship ? REL : c.glow})`;
    path.style.pointerEvents = 'none';
    g.appendChild(path);

    // Neviditelný hitbox (8px) pro výběr
    const hit = el('path', {
      class: 'edge-hit', d, fill: 'none',
      stroke: 'transparent', 'stroke-width': 8,
    });
    hit.style.pointerEvents = 'stroke';
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEdge(edge);
    });
    g.appendChild(hit);

    // Popisek na středu křivky
    if (edge.label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const text = el('text', {
        x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: '#fff', 'font-size': 11, 'font-family': "'Inter', system-ui, sans-serif",
      });
      text.style.pointerEvents = 'none';
      text.textContent = edge.label;
      g.appendChild(text);
      // Pozadí za text se vloží po změření
      requestAnimationFrame(() => {
        const bb = text.getBBox();
        const bg = el('rect', {
          x: bb.x - 3, y: bb.y - 1, width: bb.width + 6, height: bb.height + 2,
          rx: 3, fill: '#0d0d1a',
        });
        bg.style.pointerEvents = 'none';
        g.insertBefore(bg, text);
      });
    }

    lyr.appendChild(g);
  }
}

// Pomocné překreslení z aktuálního stavu
function rerender() {
  const map = getState().map;
  renderEdges(map.nodes, map.edges);
}

// --- Výběr hrany ---
function selectEdge(edge) {
  getState().selectedNodeId = null;
  getState().selectedEdgeId = edge.id;
  rerender();
  panel.openEdge(edge);
}

// --- Přidání / odebrání hrany ---
export function addEdge(fromId, toId) {
  if (fromId === toId) return;
  const map = getState().map;
  // Zákaz duplicitní hrany (stejný from+to)
  if (map.edges.some((e) => e.fromId === fromId && e.toId === toId)) return;
  const from = map.nodes.find((n) => n.id === fromId);
  const to = map.nodes.find((n) => n.id === toId);
  // Vztahová hrana = uzly nejsou v přímém parent-child vztahu → jiný styl + povinný popisek
  const isRel = !(from && to && (to.parentId === fromId || from.parentId === toId));
  const edge = { id: crypto.randomUUID(), fromId, toId, label: '', isRelationship: isRel };
  if (isRel) edge.label = (prompt('Popis vztahu:') || '').trim();
  map.edges.push(edge);
  rerender();
  pushHistory();
  autoSave();
}

export function removeEdge(id) {
  const map = getState().map;
  map.edges = map.edges.filter((e) => e.id !== id);
  if (getState().selectedEdgeId === id) getState().selectedEdgeId = null;
  rerender();
  pushHistory();
  autoSave();
}

// --- Propojovací režim ---
let connectMode = false;
let firstId = null;

export function isConnectMode() { return connectMode; }

// Nastaví stroke konkrétního uzlu (zvýraznění při propojování)
function setNodeStroke(id, color) {
  const g = document.querySelector(`#nodes-layer [data-id="${id}"] rect`);
  if (g) g.setAttribute('stroke', color);
}

function setConnectMode(on) {
  connectMode = on;
  firstId = null;
  const btn = document.getElementById('connect-btn');
  const canvas = document.getElementById('canvas');
  if (btn) btn.classList.toggle('active', on);
  if (canvas) canvas.classList.toggle('connecting', on);
  // Obnov původní barvy uzlů
  nodes.renderAll();
}

// Toggle z tlačítka v toolbaru
export function toggleConnectMode() { setConnectMode(!connectMode); }

// Klik na uzel v propojovacím režimu (volá nodes.js)
export function handleNodeClick(node) {
  if (!connectMode) return;
  if (firstId === null) {
    firstId = node.id;
    setNodeStroke(node.id, '#F59E0B');  // zlaté zvýraznění prvního uzlu
    return;
  }
  if (node.id !== firstId) addEdge(firstId, node.id);
  setConnectMode(false);
}

// --- Klávesy ---
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && connectMode) {
    setConnectMode(false);
    return;
  }
  // Delete smaže vybranou hranu (mimo textová pole)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const selId = getState().selectedEdgeId;
    if (selId) {
      e.preventDefault();
      removeEdge(selId);
      panel.close();
    }
  }
});

// Klik mimo canvas (sidebar/panel/toolbar) zruší propojovací režim
document.addEventListener('mousedown', (e) => {
  if (!connectMode) return;
  // Klik na samotné tlačítko Propojit řeší jeho vlastní toggle
  if (e.target.closest('#connect-btn')) return;
  if (!e.target.closest('#canvas-wrap')) setConnectMode(false);
});

// Připojení tlačítka v toolbaru
const connectBtn = document.getElementById('connect-btn');
if (connectBtn) connectBtn.addEventListener('click', toggleConnectMode);
