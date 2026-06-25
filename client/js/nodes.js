// Render uzlů jako SVG <g>, drag, resize, collapse, inline edit, přidávání potomků
import { getState, nodeColors, autoSave, pushHistory, getCanvasRect, renderMap, toggleNodeSelect, clearMultiSelect, createOrOpenSubmap, goToNode, goToMap, isEditMode, openNodeDetail, syncSubmapName } from './app.js';
import { openReferenceModal } from './references.js';
import * as panel from './panel.js';
import * as edges from './edges.js';
import * as canvas from './canvas.js';
import * as timeline from './timeline.js';
import * as drill from './drill.js';
import * as sidebar from './sidebar.js';
import { toast } from './toast.js';

// Překreslí hrany z aktuálního stavu (endpointy se pohybují s uzly)
function rerenderEdges() {
  const map = getState().map;
  edges.renderEdges(map.nodes, map.edges);
  canvas.updateMinimap(map.nodes, getState().viewTransform);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_W = 80;
const MIN_H = 36;

// Zkratka pro vytvoření SVG elementu
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// --- Injekce stylů uzlů (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('nodes-style')) return;
  const s = document.createElement('style');
  s.id = 'nodes-style';
  s.textContent = `
    .node { cursor: pointer; }
    .node .resize-handle { opacity: 0; transition: opacity .12s; cursor: nwse-resize; }
    .node:hover .resize-handle { opacity: 1; }
    .node.locked .resize-handle { display: none; }
    .node .collapse-btn, .node .gh-icon { cursor: pointer; }
    .node-edit-input {
      position: fixed; z-index: 100; box-sizing: border-box;
      font-family: 'Inter', system-ui, sans-serif; font-size: 13px; text-align: center;
      color: #fff; background: #15152a; border: 1px solid #7C3AED; border-radius: 8px; outline: none;
    }`;
  document.head.appendChild(s);
})();

// Tovární funkce uzlu — jediný zdroj výchozích hodnot datového modelu
export function makeNode(props = {}) {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    label: 'Nový uzel',
    x: 0, y: 0, width: 160, height: 48,
    color: 'purple',
    customColor: null,
    tags: [],
    note: '',
    imageBase64: null,
    githubUrl: '',
    date: null,
    icon: null,
    borderStyle: 'solid',
    opacity: 1,
    bookmarked: false,
    isSummary: false,
    linkedMapId: null,   // odkaz na podmapovou mapu (sekce 2)
    references: [],      // cross-reference na jiné uzly/skupiny (sekce 3)
    links: [],           // libovolné odkazy [{ url, label }] (sekce 2)
    comments: [],        // sticky komentáře [{ id, text, createdAt, color }] (sekce 7)
    shape: 'rectangle',  // tvar uzlu (sekce 9)
    locked: false,       // zamčený uzel nelze táhnout/resizovat (sekce 3)
    task: { enabled: false, checked: false, priority: null, dueDate: null, progress: 0 },
    collapsed: false,
    createdAt: new Date().toISOString(),
    ...props,
  };
}

// --- Pomocné funkce nad stavem ---
function nodesArr() { return getState().map.nodes; }
function getNode(id) { return nodesArr().find((n) => n.id === id); }
function childrenOf(id) { return nodesArr().filter((n) => n.parentId === id); }

// Uzel je skrytý, pokud má některý předek collapsed=true
function isHidden(node) {
  let p = node.parentId ? getNode(node.parentId) : null;
  while (p) {
    if (p.collapsed) return true;
    p = p.parentId ? getNode(p.parentId) : null;
  }
  return false;
}

// Zkrátí text uzlu s elipsou, aby se vešel do maxWidth (vyžaduje element v DOM)
function fitLabel(textEl, full, maxWidth) {
  textEl.textContent = full;
  if (textEl.getComputedTextLength() <= maxWidth) return;
  let lo = 0, hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    textEl.textContent = full.slice(0, mid) + '…';
    if (textEl.getComputedTextLength() <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  textEl.textContent = lo > 0 ? full.slice(0, lo) + '…' : '…';
}

// --- Automatické číslování (DFS: 1, 1.1, 1.2.1 …) ---
let numberMap = {};  // id → "1.2.1", přepočítané v renderAll

function autoNumberOn() {
  const s = getState().map.settings;
  return !!(s && s.autoNumber);
}

function computeNumbers(nodeList) {
  const byId = {};
  nodeList.forEach((n) => { byId[n.id] = n; });
  const children = {};
  nodeList.forEach((n) => { children[n.id] = []; });
  const roots = [];
  for (const n of nodeList) {
    if (n.parentId == null || !byId[n.parentId]) roots.push(n);
    else children[n.parentId].push(n);
  }
  const num = {};
  const visit = (n, prefix) => {
    num[n.id] = prefix;
    children[n.id].forEach((c, i) => visit(c, `${prefix}.${i + 1}`));
  };
  roots.forEach((r, i) => visit(r, String(i + 1)));
  return num;
}

// Vykreslí label se šedým číslem vpředu, ořízne jen část labelu (ne číslo)
function setLabelWithNumber(textEl, number, full, maxWidth) {
  textEl.textContent = '';
  const numSpan = document.createElementNS(SVG_NS, 'tspan');
  numSpan.setAttribute('fill', '#7a7a8e');
  numSpan.textContent = number + '  ';
  const lblSpan = document.createElementNS(SVG_NS, 'tspan');
  lblSpan.setAttribute('fill', '#fff');
  lblSpan.textContent = full;
  textEl.appendChild(numSpan);
  textEl.appendChild(lblSpan);
  if (textEl.getComputedTextLength() <= maxWidth) return;
  let lo = 0, hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    lblSpan.textContent = full.slice(0, mid) + '…';
    if (textEl.getComputedTextLength() <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  lblSpan.textContent = lo > 0 ? full.slice(0, lo) + '…' : '…';
}

// --- Render ---
function layer() { return document.getElementById('nodes-layer'); }

// Překreslí všechny viditelné uzly
export function renderAll() {
  const lyr = layer();
  if (!lyr) return;
  lyr.innerHTML = '';
  numberMap = autoNumberOn() ? computeNumbers(nodesArr()) : {};
  const taskFilter = getState().taskFilter;
  const vis = drill.inViewSet();  // null = bez drill downu
  for (const node of nodesArr()) {
    if (isHidden(node)) continue;
    if (taskFilter && !(node.task && node.task.enabled)) continue;  // jen tasky
    if (vis && !vis.has(node.id)) continue;                         // jen drilldown větev
    lyr.appendChild(drawNode(node));
  }
}

// Překreslí jeden konkrétní uzel (nahradí jeho <g>)
export function refresh(node) {
  const old = layer().querySelector(`[data-id="${node.id}"]`);
  if (old) { old.replaceWith(drawNode(node)); return; }
  // Uzel není vykreslený (např. opožděný highlight timeout po přepnutí mapy) — nepřidávej cizí uzel
  if (nodesArr().includes(node)) layer().appendChild(drawNode(node));
}

// --- Koš (mazání tažením) ---
function trashEl() { return document.getElementById('trash-bin'); }

// Je kurzor (obrazovkové souřadnice) nad košem?
function isOverTrash(clientX, clientY) {
  const t = trashEl();
  if (!t) return false;
  const r = t.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function setTrashActive(on) {
  const t = trashEl();
  if (t) t.classList.toggle('active', on);
}

// --- Skupiny (zvýraznění a příslušnost při tažení) ---
// Vrátí skupinu, do jejíhož rámečku spadá bod (mapové souřadnice); horní má přednost
function groupAtPoint(px, py) {
  const groups = getState().map.groups;
  for (let i = groups.length - 1; i >= 0; i--) {
    const gr = groups[i];
    if (px >= gr.x && px <= gr.x + gr.width && py >= gr.y && py <= gr.y + gr.height) return gr;
  }
  return null;
}

// Rozsvítí rámeček cílové skupiny (stroke alfa +0.4 → 'cc'), ostatní vrátí na '66'
function setGroupHighlight(activeId) {
  for (const gr of getState().map.groups) {
    const rectEl = document.querySelector(`#groups-layer [data-id="${gr.id}"] rect`);
    if (rectEl) rectEl.setAttribute('stroke', gr.color + (gr.id === activeId ? 'cc' : '66'));
  }
}

// Rekurzivně odstraní uzel, jeho potomky a všechny jejich hrany ze stavu
function removeNodeTree(node) {
  const map = getState().map;
  const toRemove = new Set();
  const collect = (id) => {
    toRemove.add(id);
    map.nodes.filter((n) => n.parentId === id).forEach((c) => collect(c.id));
  };
  collect(node.id);
  map.nodes = map.nodes.filter((n) => !toRemove.has(n.id));
  map.edges = map.edges.filter((e) => !toRemove.has(e.fromId) && !toRemove.has(e.toId));
  if (toRemove.has(getState().selectedNodeId)) {
    getState().selectedNodeId = null;
    panel.close();
  }
  if (drill.isActive()) drill.pruneRemoved(toRemove);  // smazaný drill-kořen by jinak nechal prázdné plátno
}

// Animované smazání (scale 0, opacity 0, 150ms), poté odstranění ze stavu
function deleteNodeAnimated(node) {
  const finish = () => {
    removeNodeTree(node);
    renderAll();
    rerenderEdges();
    pushHistory();
    autoSave();
  };
  const g = layer().querySelector(`[data-id="${node.id}"]`);
  if (!g) { finish(); return; }
  g.style.transformBox = 'fill-box';
  g.style.transformOrigin = 'center';
  g.style.transform = `translate(${node.x}px, ${node.y}px) scale(1)`;
  void g.getBoundingClientRect();  // vynucený reflow, aby transition odstartovala
  g.style.transition = 'transform .15s ease, opacity .15s ease';
  g.style.transform = `translate(${node.x}px, ${node.y}px) scale(0)`;
  g.style.opacity = '0';
  setTimeout(finish, 150);
}

// Barvy progress baru dle priority tasku
const PRIO_COLOR = { high: '#E24B4A', medium: '#F59E0B', low: '#059669' };

// Aproximace mraku jako SVG path v rámci w×h
function cloudPath(w, h) {
  const x = (p) => (p * w).toFixed(1), y = (p) => (p * h).toFixed(1);
  return `M ${x(0.25)} ${y(0.85)} C ${x(0.05)} ${y(0.85)} ${x(0.05)} ${y(0.52)} ${x(0.22)} ${y(0.5)} `
    + `C ${x(0.18)} ${y(0.18)} ${x(0.5)} ${y(0.1)} ${x(0.56)} ${y(0.33)} `
    + `C ${x(0.72)} ${y(0.12)} ${x(0.97)} ${y(0.26)} ${x(0.82)} ${y(0.5)} `
    + `C ${x(0.99)} ${y(0.54)} ${x(0.97)} ${y(0.85)} ${x(0.78)} ${y(0.85)} Z`;
}

// Tělo uzlu jako SVG element dle node.shape (sekce 9)
function shapeBody(shape, w, h, c) {
  const base = { fill: c.fill, stroke: c.stroke, 'stroke-width': 1.5 };
  if (shape === 'ellipse') return el('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, ...base });
  if (shape === 'diamond') return el('polygon', { points: `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`, ...base });
  if (shape === 'hexagon') {
    const i = Math.min(w * 0.22, h * 0.5);
    return el('polygon', { points: `${i},0 ${w - i},0 ${w},${h / 2} ${w - i},${h} ${i},${h} 0,${h / 2}`, ...base });
  }
  if (shape === 'rounded') return el('rect', { x: 0, y: 0, width: w, height: h, rx: h / 2, ...base });
  if (shape === 'cloud') return el('path', { d: cloudPath(w, h), ...base });
  return el('rect', { x: 0, y: 0, width: w, height: h, rx: 10, ...base });  // rectangle (výchozí)
}

// Sestaví <g> jednoho uzlu
function drawNode(node) {
  const c = nodeColors(node);
  const w = node.width, h = node.height;
  const kids = childrenOf(node.id);
  const hasKids = kids.length > 0;
  const hasImg = !!node.imageBase64;
  const task = node.task || {};
  const checked = !!(task.enabled && task.checked);

  const g = el('g', { class: 'node' + (node.locked ? ' locked' : ''), 'data-id': node.id, transform: `translate(${node.x},${node.y})` });
  // Průhlednost uzlu (vlastní opacity × ztlumení při splněném tasku)
  const op = (node.opacity == null ? 1 : node.opacity) * (checked ? 0.6 : 1);
  if (op < 1) g.setAttribute('opacity', op);

  // Tělo uzlu — tvar dle node.shape, styl hranice dle node.borderStyle
  const shape = node.shape || 'rectangle';
  const boxy = shape === 'rectangle' || shape === 'rounded';  // vnitřní rámečky jen u hranatých tvarů
  const dash = node.borderStyle === 'dashed' ? '6 3'
    : node.borderStyle === 'dotted' ? '2 3' : null;
  const rect = shapeBody(shape, w, h, c);
  if (dash) rect.setAttribute('stroke-dasharray', dash);
  rect.style.filter = `drop-shadow(0 0 6px ${c.glow}66)`;
  g.appendChild(rect);

  // double = vnitřní rámeček o 3px menší (jen hranaté tvary)
  if (node.borderStyle === 'double' && boxy) {
    g.appendChild(el('rect', {
      x: 3, y: 3, width: w - 6, height: h - 6, rx: 8,
      fill: 'none', stroke: c.stroke, 'stroke-width': 1,
    }));
  }

  // Podmapový odkaz: vnitřní rámeček (vizuální „double") + tooltip s názvem cílové mapy
  if (node.linkedMapId) {
    if (boxy) g.appendChild(el('rect', {
      x: 3, y: 3, width: w - 6, height: h - 6, rx: 8,
      fill: 'none', stroke: c.stroke, 'stroke-width': 1, 'stroke-dasharray': '3 2',
    }));
    const tt = el('title');
    const lm = sidebar.getMaps().find((x) => x.id === node.linkedMapId);
    tt.textContent = 'Ctrl+klik → ' + (lm ? lm.name : 'podmapa');
    g.appendChild(tt);
  }

  // Multiselect: zvýraznění vybraného uzlu (amber border + glow)
  if (getState().selectedNodeIds.includes(node.id)) {
    rect.setAttribute('stroke', '#F59E0B');
    rect.setAttribute('stroke-width', '2');
    rect.style.filter = 'drop-shadow(0 0 6px #F59E0Baa)';
  }

  // Výpočet okrajů pro label (kurzor zleva doprava)
  let leftPad = 10;
  let rightPad = 10;
  const collapseShown = hasKids;

  // Task checkbox ☐/☑ úplně vlevo
  if (task.enabled) {
    const box = el('text', {
      class: 'task-check', x: leftPad, y: h / 2,
      'dominant-baseline': 'central', 'text-anchor': 'start',
      fill: c.stroke, 'font-size': 14,
    });
    box.textContent = checked ? '☑' : '☐';
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      node.task.checked = !node.task.checked;
      refresh(node);
      pushHistory();
      autoSave();
    });
    g.appendChild(box);
    leftPad += 20;
  }

  // Miniatura obrázku 36×36 vlevo
  if (hasImg) {
    const img = el('image', {
      x: leftPad, y: (h - 36) / 2, width: 36, height: 36,
      preserveAspectRatio: 'xMidYMid slice', href: node.imageBase64,
    });
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', node.imageBase64);
    g.appendChild(img);
    leftPad += 42;
  }

  // Collapse tlačítko ▸/▾ vlevo od labelu
  if (collapseShown) {
    const btn = el('text', {
      class: 'collapse-btn', x: leftPad, y: h / 2,
      'dominant-baseline': 'central', 'text-anchor': 'start',
      fill: c.stroke, 'font-size': 12,
    });
    btn.textContent = node.collapsed ? '▸' : '▾';
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      renderAll();
      rerenderEdges();  // hrany k potomkům se skryjí/vrátí
      autoSave();
    });
    g.appendChild(btn);
    leftPad += 14;
  }

  // Emoji ikona před labelem
  if (node.icon) {
    const ic = el('text', {
      x: leftPad, y: h / 2,
      'dominant-baseline': 'central', 'text-anchor': 'start', 'font-size': 16,
    });
    ic.style.pointerEvents = 'none';
    ic.textContent = node.icon;
    g.appendChild(ic);
    leftPad += 22;
  }

  // Ikona 🔗 u odkazového uzlu (podmapa)
  if (node.linkedMapId) {
    const lk = el('text', {
      x: leftPad, y: h / 2,
      'dominant-baseline': 'central', 'text-anchor': 'start', 'font-size': 14,
    });
    lk.style.pointerEvents = 'none';
    lk.textContent = '🔗';
    g.appendChild(lk);
    leftPad += 20;
  }

  // Badge "+N" vpravo nahoře pokud collapsed a má potomky
  if (node.collapsed && hasKids) {
    g.appendChild(el('circle', { cx: w - 8, cy: 8, r: 9, fill: '#E24B4A' }));
    const cnt = el('text', {
      x: w - 8, y: 8, 'dominant-baseline': 'central', 'text-anchor': 'middle',
      fill: '#fff', 'font-size': 10, 'font-weight': 600,
    });
    cnt.textContent = '+' + kids.length;
    g.appendChild(cnt);
    rightPad = 22;
  }

  // Záložka ⭐ vpravo nahoře (vlevo od +N badge / komentářů, pokud jsou)
  const hasComments = !!(node.comments && node.comments.length);
  if (node.bookmarked) {
    const sx = (node.collapsed && hasKids) ? w - 24 : (hasComments ? w - 30 : w - 11);
    const star = el('text', {
      x: sx, y: 10, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12,
    });
    star.style.pointerEvents = 'none';
    star.textContent = '⭐';
    g.appendChild(star);
  }

  // Komentáře 💬 + počet vpravo nahoře + tooltip s prvním komentářem (sekce 7)
  if (hasComments) {
    const cy0 = (node.collapsed && hasKids) ? 24 : 11;
    const cm = el('text', {
      class: 'node-comments', x: w - 6, y: cy0,
      'text-anchor': 'end', 'dominant-baseline': 'central', 'font-size': 11,
    });
    cm.style.pointerEvents = 'none';
    cm.textContent = '💬' + node.comments.length;
    const tt = el('title');
    const first = (node.comments[0] && node.comments[0].text) || '';
    tt.textContent = first.length > 80 ? first.slice(0, 80) + '…' : first;
    cm.appendChild(tt);
    g.appendChild(cm);
  }

  // Zámek 🔒 vlevo nahoře u zamčeného uzlu (sekce 3)
  if (node.locked) {
    const lk = el('text', { x: 7, y: 12, 'text-anchor': 'start', 'dominant-baseline': 'central', 'font-size': 11 });
    lk.style.pointerEvents = 'none';
    lk.textContent = '🔒';
    g.appendChild(lk);
  }

  // GitHub ikona vlevo dole pokud je vyplněn odkaz
  if (node.githubUrl) {
    const gh = el('path', {
      class: 'gh-icon', transform: `translate(6,${h - 16}) scale(0.6)`,
      fill: '#9a9ab0',
      d: 'M10 0C4.48 0 0 4.48 0 10c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 10 4.84c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10 10 0 0 0 20 10c0-5.52-4.48-10-10-10z',
    });
    gh.addEventListener('mousedown', (e) => e.stopPropagation());
    gh.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(node.githubUrl, '_blank');
    });
    g.appendChild(gh);
  }

  // Cross-reference indikátor ⬡ vlevo dole (posunutý, pokud je tam GitHub ikona) + tooltip se seznamem
  if (Array.isArray(node.references) && node.references.length) {
    const rx = node.githubUrl ? 24 : 8;
    const ref = el('text', {
      class: 'ref-icon', x: rx, y: h - 5, 'text-anchor': 'start', 'font-size': 12, fill: '#06B6D4',
    });
    ref.style.cursor = 'pointer';
    ref.textContent = '⬡';
    const tt = el('title');
    tt.textContent = 'Reference:\n' + node.references
      .map((r) => '→ ' + (r.targetLabel || r.targetNodeId) + (r.targetMapName ? ' [' + r.targetMapName + ']' : '') + (r.note ? ' — ' + r.note : ''))
      .join('\n');
    ref.appendChild(tt);
    ref.addEventListener('mousedown', (e) => e.stopPropagation());
    ref.addEventListener('click', (e) => {
      e.stopPropagation();
      // Klik skočí na první referenci typu uzel; skupinová ref otevře alespoň cílovou mapu
      const first = node.references.find((r) => r.targetType === 'node') || node.references[0];
      if (!first) return;
      if (first.targetType === 'node') goToNode(first.targetMapId, first.targetNodeId);
      else if (first.targetMapId !== getState().currentMapId) goToMap(first.targetMapId);
    });
    g.appendChild(ref);
  }

  // Label v dostupné oblasti; při těsném prostoru (hodně ozdob vlevo) zarovnej vlevo,
  // ať zůstanou čitelné úvodní znaky místo jediného znaku + elipsa
  const number = numberMap[node.id];  // šedé číslo před labelem (auto-číslování)
  const areaL = leftPad;
  const areaR = w - rightPad;
  const leftAnchor = (areaR - areaL) < 40 || !!number;  // číslo → zarovnat vlevo
  const labelText = el('text', {
    class: 'node-label', x: leftAnchor ? areaL : (areaL + areaR) / 2, y: h / 2,
    'dominant-baseline': 'central', 'text-anchor': leftAnchor ? 'start' : 'middle',
    fill: '#fff', 'font-size': 13, 'font-weight': 500,
  });
  labelText.style.pointerEvents = 'none';
  if (checked) labelText.setAttribute('text-decoration', 'line-through');
  g.appendChild(labelText);

  // Resize handle 8×8 pravý dolní roh
  const handle = el('rect', {
    class: 'resize-handle', x: w - 8, y: h - 8, width: 8, height: 8, rx: 2,
    fill: c.stroke,
  });
  g.appendChild(handle);

  // Task progress bar na spodní hraně (barva dle priority)
  if (task.enabled && task.progress > 0) {
    const pw = Math.max(0, Math.min(1, task.progress / 100)) * w;
    g.appendChild(el('rect', {
      x: 0, y: h - 3, width: pw, height: 3, rx: 1.5,
      fill: PRIO_COLOR[task.priority] || '#7C3AED',
    }));
  }

  // Interakce
  attachDrag(g, node);
  attachResize(handle, g, node, rect, handle, labelText);
  attachEdit(labelText, g, node);

  // Elipsa labelu se měří až po vložení do DOM
  requestAnimationFrame(() => {
    if (number) setLabelWithNumber(labelText, number, node.label, Math.max(10, areaR - areaL));
    else fitLabel(labelText, node.label, Math.max(10, areaR - areaL));
  });
  return g;
}

// --- Drag celého uzlu ---
function attachDrag(g, node) {
  g.addEventListener('mousedown', (e) => {
    // Ignoruj klik na handle/tlačítka (mají vlastní stopPropagation)
    if (e.button !== 0) return;
    if (e.target.classList.contains('resize-handle')) return;
    e.stopPropagation();

    // View mode: uzel není tažitelný — klik (bez tažení) otevře read-only detail okno
    if (!isEditMode()) {
      const sx = e.clientX, sy = e.clientY;
      let movedV = false;
      const mvV = (ev) => { if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) movedV = true; };
      const upV = () => {
        window.removeEventListener('mousemove', mvV);
        window.removeEventListener('mouseup', upV);
        if (!movedV) { getState().selectedNodeId = node.id; openNodeDetail(node); }
      };
      window.addEventListener('mousemove', mvV);
      window.addEventListener('mouseup', upV);
      return;
    }

    const st = getState();
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey || e.metaKey;  // Ctrl+klik na odkazový uzel = přechod do podmapy
    const locked = !!node.locked;         // zamčený uzel se nehýbe (sekce 3)
    const scale = st.viewTransform.scale;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let overTrash = false;
    // Hromadný přesun: táhne-li se jeden z 2+ vybraných uzlů, jdou všechny spolu
    const bulk = !shift && st.selectedNodeIds.includes(node.id) && st.selectedNodeIds.length >= 2;
    const dragSet = bulk
      ? st.selectedNodeIds.map((id) => getNode(id)).filter(Boolean).map((n) => ({ n, x: n.x, y: n.y }))
      : [{ n: node, x: node.x, y: node.y }];

    const move = (ev) => {
      if (locked) return;  // zamčený uzel ignoruje tažení (klik pak otevře panel)
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      for (const m of dragSet) {
        m.n.x = m.x + dx;
        m.n.y = m.y + dy;
        const ng = layer().querySelector(`[data-id="${m.n.id}"]`);
        if (ng) ng.setAttribute('transform', `translate(${m.n.x},${m.n.y})`);
      }
      rerenderEdges();  // hrany sledují uzly

      // Zvýraznění koše a cílové skupiny během tažení (jen jednotlivý uzel)
      if (!bulk) {
        overTrash = isOverTrash(ev.clientX, ev.clientY);
        setTrashActive(overTrash);
        const gr = overTrash ? null : groupAtPoint(node.x + node.width / 2, node.y + node.height / 2);
        setGroupHighlight(gr ? gr.id : null);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setTrashActive(false);
      setGroupHighlight(null);

      if (moved && overTrash && !bulk) {
        // Drop na koš → animované smazání uzlu i s potomky
        deleteNodeAnimated(node);
        return;
      }
      if (moved) {
        if (!bulk) {
          // Příslušnost ke skupině podle středu uzlu (mimo = vytažení ven)
          const gr = groupAtPoint(node.x + node.width / 2, node.y + node.height / 2);
          if (gr) node.groupId = gr.id;
          else delete node.groupId;
        }
        pushHistory();
        autoSave();
      } else if (shift) {
        // Shift+klik bez pohybu = přidej/odeber uzel z multiselectu
        toggleNodeSelect(node.id);
      } else if (edges.isConnectMode()) {
        // V propojovacím režimu klik vybírá uzly pro hranu
        edges.handleNodeClick(node);
      } else if (ctrl && node.linkedMapId) {
        // Odkazový uzel: jen Ctrl+klik přejde do propojené podmapy (prostý klik edituje uzel)
        clearMultiSelect();
        createOrOpenSubmap(node);
      } else {
        // Klik bez pohybu otevře detail panel; zruš multiselect i výběr hrany
        clearMultiSelect();
        getState().selectedNodeId = node.id;
        if (getState().selectedEdgeId) { getState().selectedEdgeId = null; rerenderEdges(); }
        panel.open(node);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// --- Resize přes handle ---
function attachResize(handle, g, node, rect, handleEl, labelText) {
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!isEditMode() || node.locked) return;  // resize jen v edit mode a u odemčeného uzlu
    e.stopPropagation();
    const scale = getState().viewTransform.scale;
    const startX = e.clientX, startY = e.clientY;
    const origW = node.width, origH = node.height;

    const move = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      node.width = Math.max(MIN_W, origW + dx);
      node.height = Math.max(MIN_H, origH + dy);
      refresh(node);
      rerenderEdges();  // změna rozměru posune endpointy hran
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

// --- Dvojklik na uzel = přidej potomka (sekce 1); přejmenování je výhradně na F2 ---
function attachEdit(labelText, g, node) {
  g.addEventListener('dblclick', (e) => {
    if (!isEditMode()) return;
    e.stopPropagation();
    e.preventDefault();
    addChild(node);
  });
}

// Jediný aktivní inline input (kvůli čistému cleanupu, ať nezůstávají viset / neunikají listenery)
let activeNameInput = null;
function clearActiveNameInput() { if (activeNameInput) { activeNameInput.kill(); activeNameInput = null; } }

// Inline input nad uzlem; commit(value) na Enter/blur/klik mimo, cancel() na Escape (sekce 5)
export function showNodeInput(node, initial, commit, cancel) {
  clearActiveNameInput();  // korektně uklidí předchozí input (vč. listeneru)
  const rect = getCanvasRect();
  const v = getState().viewTransform;
  const input = document.createElement('input');
  input.className = 'node-edit-input';
  input.spellcheck = true;  // nativní kontrola pravopisu (OS podtrhne chyby)
  input.value = initial || '';
  input.style.left = (rect.left + v.x + node.x * v.scale) + 'px';
  input.style.top = (rect.top + v.y + node.y * v.scale) + 'px';
  input.style.width = node.width * v.scale + 'px';
  input.style.height = node.height * v.scale + 'px';
  document.body.appendChild(input);

  let done = false;
  let listenerAdded = false;
  let addTimer = null;
  const onOutside = (ev) => { if (ev.target !== input) finish(true); };
  const cleanup = () => {
    if (addTimer) { clearTimeout(addTimer); addTimer = null; }
    if (listenerAdded) { document.removeEventListener('mousedown', onOutside, true); listenerAdded = false; }
    if (input.parentNode) input.remove();
  };
  const finish = (ok) => {
    if (done) return;
    done = true;
    if (activeNameInput && activeNameInput.input === input) activeNameInput = null;
    const val = input.value.trim();
    cleanup();
    if (ok) commit(val); else if (cancel) cancel();
  };
  // kill = zruš bez commitu (při nahrazení novým inputem)
  activeNameInput = { input, kill: () => { if (!done) { done = true; cleanup(); } } };

  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();  // ať psaní nespouští globální klávesové zkratky
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));

  // Fokus hned + fallback přes setTimeout (NE rAF — ten je v pozadí/zátěži throttlovaný a fokus by selhal)
  input.focus(); input.select();
  setTimeout(() => { if (!done && document.activeElement !== input) { input.focus(); input.select(); } }, 0);
  // Klik mimo input = potvrď; listener navěs až po aktuálním cyklu (ať ho nespustí samotná tvorba)
  addTimer = setTimeout(() => { addTimer = null; if (!done) { document.addEventListener('mousedown', onOutside, true); listenerAdded = true; } }, 0);
  return input;
}

// Okamžité inline pojmenování nově vytvořeného uzlu — Enter potvrdí (capitalize 1. písmene),
// Escape ponechá původní label. (sekce 5)
export function startInlineEdit(node) {
  showNodeInput(node, node.label, (val) => {
    if (val) {
      node.label = val.charAt(0).toUpperCase() + val.slice(1);
      refresh(node);
      if (node.linkedMapId) syncSubmapName(node);
      pushHistory();
      autoSave();
    }
  });
}

// Pojmenování podmapy před vytvořením odkazu (sekce 3): inline input → vytvoř mapu s tím názvem
export function startSubmapNaming(node) {
  if (node.linkedMapId) { createOrOpenSubmap(node); return; }  // odkaz už existuje → jen přejdi
  showNodeInput(node, node.label || 'Podmapa', (val) => {
    createOrOpenSubmap(node, val || node.label || 'Podmapa');
  });
}

// --- Přidání potomka ---
export function addChild(parentNode) {
  if (timeline.isActive()) return;  // v timeline režimu se uzly nepřidávají
  const node = makeNode({
    parentId: parentNode.id,
    x: parentNode.x,
    y: parentNode.y + parentNode.height + 60,
    color: parentNode.color,
    // Potomek zdědí i vlastní barvu rodiče (mělká kopie, aby nesdíleli referenci)
    customColor: parentNode.color === 'custom' && parentNode.customColor
      ? { ...parentNode.customColor } : null,
  });
  // Pokud byl rodič sbalený, rozbal aby byl potomek vidět
  if (parentNode.collapsed) parentNode.collapsed = false;
  nodesArr().push(node);
  // Automatická parent→child hrana
  getState().map.edges.push({
    id: crypto.randomUUID(), fromId: parentNode.id, toId: node.id, label: '',
  });
  renderAll();
  rerenderEdges();
  pushHistory();
  autoSave();
  startInlineEdit(node);  // okamžité pojmenování (sekce 5)
  return node;
}

// --- Nový sourozenec (Enter) ---
export function addSibling(node) {
  if (timeline.isActive()) return;
  const sib = makeNode({
    parentId: node.parentId,
    x: node.x,
    y: node.y + node.height + 60,
    color: node.color,
    customColor: node.color === 'custom' && node.customColor ? { ...node.customColor } : null,
  });
  nodesArr().push(sib);
  // Automatická hrana od stejného rodiče (pokud existuje)
  if (node.parentId) {
    getState().map.edges.push({ id: crypto.randomUUID(), fromId: node.parentId, toId: sib.id, label: '' });
  }
  renderAll();
  rerenderEdges();
  pushHistory();
  autoSave();
  startInlineEdit(sib);  // okamžité pojmenování (sekce 5)
  return sib;
}

// --- Duplikace uzlu i s celou větví (Ctrl+D) ---
export function duplicateBranch(node) {
  if (timeline.isActive()) return;  // klony by neměly snapshot pozic
  const map = getState().map;
  const subtree = [];
  const collect = (n) => { subtree.push(n); map.nodes.filter((x) => x.parentId === n.id).forEach(collect); };
  collect(node);
  const ids = new Set(subtree.map((n) => n.id));
  const idMap = {};
  // Preorder → rodič klonu existuje dřív než potomek
  for (const n of subtree) {
    const c = JSON.parse(JSON.stringify(n));
    c.id = crypto.randomUUID();
    idMap[n.id] = c.id;
    c.x += 40; c.y += 40;
    c.parentId = n.id === node.id ? node.parentId : idMap[n.parentId];
    map.nodes.push(c);
  }
  // Interní hrany podstromu + rodičovská hrana ke klonu kořene
  for (const e of map.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId))) {
    map.edges.push({ id: crypto.randomUUID(), fromId: idMap[e.fromId], toId: idMap[e.toId], label: e.label });
  }
  if (node.parentId) {
    map.edges.push({ id: crypto.randomUUID(), fromId: node.parentId, toId: idMap[node.id], label: '' });
  }
  renderAll();
  rerenderEdges();
  pushHistory();
  autoSave();
  return idMap[node.id];
}

// Posune uzel i celý jeho podstrom o (dx,dy)
function shiftSubtree(node, dx, dy) {
  const ids = new Set();
  const collect = (n) => { ids.add(n.id); nodesArr().filter((x) => x.parentId === n.id).forEach(collect); };
  collect(node);
  for (const n of nodesArr()) if (ids.has(n.id)) { n.x += dx; n.y += dy; }
}

// Přepíše parentId a udrží STROMOVOU hranu (starý rodič → uzel) — ne vztahové hrany do uzlu
function reparent(node, newParentId) {
  const oldParentId = node.parentId;
  node.parentId = newParentId || null;
  const map = getState().map;
  // Stromová hrana je jen ta od původního rodiče; vztahové hrany (jiný fromId) nech být
  const te = oldParentId ? map.edges.find((e) => e.fromId === oldParentId && e.toId === node.id) : null;
  if (newParentId) {
    if (te) te.fromId = newParentId;
    // Nepřidávej druhou hranu, pokud už mezi novým rodičem a uzlem nějaká existuje (např. vztahová)
    else if (!map.edges.some((e) => e.fromId === newParentId && e.toId === node.id))
      map.edges.push({ id: crypto.randomUUID(), fromId: newParentId, toId: node.id, label: '' });
  } else if (te) {
    map.edges = map.edges.filter((e) => e !== te);
  }
}

// --- Přesun mezi sourozenci (Alt+↑/↓) — dir: -1 nahoru, +1 dolů ---
export function moveAmongSiblings(node, dir) {
  if (timeline.isActive()) return;  // pozice v timeline jsou dočasné
  const arr = nodesArr();
  const sibs = arr.filter((n) => n.parentId === node.parentId);
  const si = sibs.indexOf(node);
  const ti = si + dir;
  if (ti < 0 || ti >= sibs.length) return;
  const other = sibs[ti];
  // Prohoď pozice obou podstromů (zůstanou připojené)
  const dx = other.x - node.x, dy = other.y - node.y;
  shiftSubtree(node, dx, dy);
  shiftSubtree(other, -dx, -dy);
  // Prohoď pořadí v hlavním poli (ovlivní auto-layout)
  const ai = arr.indexOf(node), aj = arr.indexOf(other);
  arr[ai] = other; arr[aj] = node;
  renderMap();  // přes renderMap, ať se obnoví focus/timeline overlay
  pushHistory();
  autoSave();
}

// --- O úroveň výš (Alt+←): parentId = děda ---
export function moveLevelUp(node) {
  if (timeline.isActive()) return;
  if (!node.parentId) return;  // už je kořen
  const parent = getNode(node.parentId);
  if (!parent) return;
  const newParentId = parent.parentId || null;
  reparent(node, newParentId);
  // Přemísti pod nového (pra)rodiče, ať uzel nezůstane vizuálně odtržený
  const np = newParentId ? getNode(newParentId) : null;
  if (np) shiftSubtree(node, np.x - node.x, (np.y + np.height + 60) - node.y);
  renderMap();
  pushHistory();
  autoSave();
}

// --- O úroveň níž (Alt+→): přiřaď k předchozímu sourozenci ---
export function moveLevelDown(node) {
  if (timeline.isActive()) return;
  const sibs = nodesArr().filter((n) => n.parentId === node.parentId);
  const i = sibs.indexOf(node);
  if (i <= 0) return;  // žádný předchozí sourozenec
  const prev = sibs[i - 1];
  reparent(node, prev.id);
  shiftSubtree(node, prev.x - node.x, (prev.y + prev.height + 60) - node.y);
  renderMap();
  pushHistory();
  autoSave();
}

// --- Summary node ze sourozenců vybraného uzlu ---
export function summarizeSiblings(node) {
  if (timeline.isActive()) return;
  const map = getState().map;
  const siblings = map.nodes.filter((n) => n.parentId === node.parentId && !n.isSummary);
  if (siblings.length < 2) { toast('Potřebuješ aspoň 2 sourozence pro summary', 'info'); return; }
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const s of siblings) {
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y + s.height);
    maxX = Math.max(maxX, s.x + s.width);
  }
  const summary = makeNode({
    parentId: node.parentId,
    label: 'Souhrn',
    color: 'neutral',
    borderStyle: 'dashed',
    isSummary: true,
    x: maxX + 80,
    y: (minY + maxY) / 2 - 24,
  });
  map.nodes.push(summary);
  // Hrany od každého sourozence do summary uzlu
  for (const s of siblings) {
    map.edges.push({ id: crypto.randomUUID(), fromId: s.id, toId: summary.id, label: '' });
  }
  renderMap();
  pushHistory();
  autoSave();
  return summary;
}

// --- Záložka (toggle) ---
export function toggleBookmark(node) {
  node.bookmarked = !node.bookmarked;
  refresh(node);
  pushHistory();
  autoSave();
}

// --- Smazání uzlu i s potomky (z kontextového menu) ---
export function deleteNode(node) {
  if (!confirm(`Smazat uzel „${node.label}" a jeho potomky?`)) return;
  removeNodeTree(node);  // odstraní uzel, potomky, jejich hrany; zruší výběr + zavře panel
  renderMap();
  pushHistory();
  autoSave();
}
