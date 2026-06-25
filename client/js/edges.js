// Render hran (bezier), propojovací režim, výběr a mazání hran
import { getState, nodeColors, autoSave, pushHistory } from './app.js';
import * as nodes from './nodes.js';
import * as panel from './panel.js';
import * as drill from './drill.js';
import { promptText } from './prompt.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Zkratka pro vytvoření SVG elementu
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Inteligentní routing hrany — dle vzájemné polohy uzlů zvolí vhodný východ/příchod.
// fromNode/toNode jsou volitelné; bez nich fallback na původní svislou bezier (x1..y2).
function cubicBezierPath(x1, y1, x2, y2, fromNode, toNode) {
  // Bez uzlů: zachovej původní chování (zpětná kompatibilita)
  if (!fromNode || !toNode) {
    const cy = (y2 - y1) * 0.5;
    return `M${x1},${y1} C${x1},${y1 + cy} ${x2},${y2 - cy} ${x2},${y2}`;
  }

  // Středy uzlů a jejich rozdíl
  const fcx = fromNode.x + fromNode.width / 2;
  const fcy = fromNode.y + fromNode.height / 2;
  const tcx = toNode.x + toNode.width / 2;
  const tcy = toNode.y + toNode.height / 2;
  const dx = tcx - fcx;
  const dy = tcy - fcy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Středy stran uzlů (východ/příchod)
  const fTop = [fcx, fromNode.y], fBottom = [fcx, fromNode.y + fromNode.height];
  const fLeft = [fromNode.x, fcy], fRight = [fromNode.x + fromNode.width, fcy];
  const tTop = [tcx, toNode.y], tBottom = [tcx, toNode.y + toNode.height];
  const tLeft = [toNode.x, tcy], tRight = [toNode.x + toNode.width, tcy];

  // Pomocné generátory dráhy
  const vBezier = (a, b) => { const cy = (b[1] - a[1]) * 0.5; return `M${a[0]},${a[1]} C${a[0]},${a[1] + cy} ${b[0]},${b[1] - cy} ${b[0]},${b[1]}`; };
  const hBezier = (a, b) => { const cx = (b[0] - a[0]) * 0.5; return `M${a[0]},${a[1]} C${a[0] + cx},${a[1]} ${b[0] - cx},${b[1]} ${b[0]},${b[1]}`; };
  const line = (a, b) => `M${a[0]},${a[1]} L${b[0]},${b[1]}`;

  const ALIGN = 20;  // práh „stejná osa" (přímá čára)
  // „Skoro stejná výška" = svislé spany uzlů se překrývají (|dy| < součet polovin výšek).
  // Pak je potomek vedle → boční střed; jinak je pod/nad → vždy spodní/horní střed.
  const sameRow = ady < (fromNode.height + toNode.height) / 2;

  if (!sameRow) {
    // Potomek pod/nad → vždy ze spodního (resp. horního) středu, bez ohledu na posun v X
    if (adx < ALIGN) return dy > 0 ? line(fBottom, tTop) : line(fTop, tBottom);  // přímo pod/nad → přímá čára
    return dy > 0 ? vBezier(fBottom, tTop) : vBezier(fTop, tBottom);
  }

  // Skoro stejná výška → z bočního středu
  if (ady < ALIGN) return dx > 0 ? line(fRight, tLeft) : line(fLeft, tRight);   // přímo vedle → přímá čára
  return dx > 0 ? hBezier(fRight, tLeft) : hBezier(fLeft, tRight);
}

// --- Injekce stylů + marker šipky (jen jednou) ---
(function injectOnce() {
  if (!document.getElementById('edges-style')) {
    const s = document.createElement('style');
    s.id = 'edges-style';
    s.textContent = `
      .edge-hit { cursor: pointer; }
      .tb-btn.active { background: #7C3AED; color: #fff; border-color: #7C3AED; }
      #canvas.connecting { cursor: crosshair !important; }
      .edge-animated { animation: edge-dash 0.7s linear infinite; }
      @keyframes edge-dash { to { stroke-dashoffset: -24; } }`;
    document.head.appendChild(s);
  }
  // Markery konce hrany: šipka, kosočtverec, kolečko (sekce 4)
  const defs = document.querySelector('#canvas defs');
  if (defs && !document.getElementById('arrowhead')) {
    const mk = (id, child) => {
      const marker = el('marker', { id, markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' });
      marker.appendChild(child);
      defs.appendChild(marker);
    };
    mk('arrowhead', el('path', { d: 'M0,0 L6,3 L0,6 Z', fill: 'context-stroke' }));
    mk('arrowhead-diamond', el('path', { d: 'M0,3 L3,0 L6,3 L3,6 Z', fill: 'context-stroke' }));
    mk('arrowhead-circle', el('circle', { cx: 3, cy: 3, r: 2.6, fill: 'context-stroke' }));
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

    // Výchozí body (fallback) — skutečný routing si zvolí cubicBezierPath dle polohy uzlů
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    const d = cubicBezierPath(x1, y1, x2, y2, from, to);

    const c = nodeColors(from);
    const selected = edge.id === selId;
    const REL = '#7C3AED';  // barva vztahové hrany

    // Styl čáry (sekce 4): width, dash, color, arrowType, animated
    const st = edge.style || {};
    const color = st.color || (edge.isRelationship ? REL : c.stroke);
    const sw = st.width || 1.5;
    const dashMap = { solid: null, dashed: '8 4', dotted: '2 4' };
    let dash = (st.dash && st.dash in dashMap) ? dashMap[st.dash] : (edge.isRelationship ? '8 4' : null);
    if (st.animated && !dash) dash = '8 6';  // ať je animace vidět i u solid čáry
    const arrowType = st.arrowType || 'arrow';
    const markerId = arrowType === 'diamond' ? 'arrowhead-diamond'
      : arrowType === 'circle' ? 'arrowhead-circle'
      : arrowType === 'none' ? null : 'arrowhead';

    const path = el('path', {
      d, fill: 'none', stroke: color,
      'stroke-width': selected ? sw + 1.5 : sw,
      opacity: selected ? 1 : 0.6,
    });
    if (dash) path.setAttribute('stroke-dasharray', dash);
    if (markerId) path.setAttribute('marker-end', `url(#${markerId})`);
    if (st.animated) path.classList.add('edge-animated');
    path.style.filter = `drop-shadow(0 0 3px ${color})`;
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

    // Popisek na středu mezi uzly (robustní pro libovolný směr routingu)
    if (edge.label) {
      const mx = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
      const my = (from.y + from.height / 2 + to.y + to.height / 2) / 2;
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
export async function addEdge(fromId, toId) {
  if (fromId === toId) return;
  const map = getState().map;
  // Zákaz duplicitní hrany (stejný from+to)
  if (map.edges.some((e) => e.fromId === fromId && e.toId === toId)) return;
  const from = map.nodes.find((n) => n.id === fromId);
  const to = map.nodes.find((n) => n.id === toId);
  // Vztahová hrana = uzly nejsou v přímém parent-child vztahu → jiný styl + popisek
  const isRel = !(from && to && (to.parentId === fromId || from.parentId === toId));
  const edge = { id: crypto.randomUUID(), fromId, toId, label: '', isRelationship: isRel };
  if (isRel) edge.label = ((await promptText('Popis vztahu:')) || '').trim();
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
