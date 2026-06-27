// Skupinové rámečky v #groups-layer — render, drag, resize, přidání
import { getState, autoSave, pushHistory, getCanvasRect, toggleGroupSelect, clearMultiSelect, isEditMode, clientToMap } from './app.js';
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

// Aproximace mraku jako SVG path v rámci w×h
function cloudPath(w, h) {
  const x = (p) => (p * w).toFixed(1), y = (p) => (p * h).toFixed(1);
  return `M ${x(0.25)} ${y(0.85)} C ${x(0.05)} ${y(0.85)} ${x(0.05)} ${y(0.52)} ${x(0.22)} ${y(0.5)} `
    + `C ${x(0.18)} ${y(0.18)} ${x(0.5)} ${y(0.1)} ${x(0.56)} ${y(0.33)} `
    + `C ${x(0.72)} ${y(0.12)} ${x(0.97)} ${y(0.26)} ${x(0.82)} ${y(0.5)} `
    + `C ${x(0.99)} ${y(0.54)} ${x(0.97)} ${y(0.85)} ${x(0.78)} ${y(0.85)} Z`;
}

// Tělo skupiny jako SVG element dle group.shape (sekce 4)
function groupShapeBody(group) {
  const w = group.width, h = group.height;
  const base = { fill: group.color + '10', stroke: group.color + '66', 'stroke-width': 1.5, 'stroke-dasharray': '6 3' };
  const shape = group.shape || 'rectangle';
  if (shape === 'ellipse') return el('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, ...base });
  if (shape === 'diamond') return el('polygon', { points: `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`, ...base });
  if (shape === 'hexagon') {
    const i = Math.min(w * 0.2, h * 0.5);
    return el('polygon', { points: `${i},0 ${w - i},0 ${w},${h / 2} ${w - i},${h} ${i},${h} 0,${h / 2}`, ...base });
  }
  if (shape === 'cloud') return el('path', { d: cloudPath(w, h), ...base });
  if (shape === 'custom' && group.customPath) return el('path', { d: group.customPath, ...base });
  return el('rect', { x: 0, y: 0, width: w, height: h, rx: 12, ...base });
}

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

  // Rámeček dle tvaru (rectangle/ellipse/diamond/hexagon/cloud/custom)
  const rect = groupShapeBody(group);
  g.appendChild(rect);

  // Multiselect: zvýraznění vybrané skupiny (amber, plná čára)
  if (getState().selectedGroupIds.includes(group.id)) {
    rect.setAttribute('stroke', '#F59E0B');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', 'none');
  }

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
    if (!isEditMode()) return;  // View mode: skupiny nejsou interaktivní (jen pozadí)
    e.stopPropagation();
    const st = getState();
    const ctrl = e.ctrlKey || e.metaKey;
    const scale = st.viewTransform.scale;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    // Hromadný přesun: táhne-li se jedna z 2+ vybraných skupin, jdou všechny spolu
    const bulk = !ctrl && st.selectedGroupIds.includes(group.id) && st.selectedGroupIds.length >= 2;
    const dragGroups = bulk
      ? st.selectedGroupIds.map((id) => groupsArr().find((gr) => gr.id === id)).filter(Boolean)
      : [group];
    // Pro každou taženou skupinu uchovej výchozí pozici i členské uzly
    const sets = dragGroups.map((gr) => ({
      gr, ox: gr.x, oy: gr.y,
      members: st.map.nodes.filter((n) => n.groupId === gr.id).map((n) => ({ n, x: n.x, y: n.y })),
    }));

    const move = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      for (const s of sets) {
        s.gr.x = s.ox + dx;
        s.gr.y = s.oy + dy;
        const gg = layer().querySelector(`[data-id="${s.gr.id}"]`);
        if (gg) gg.setAttribute('transform', `translate(${s.gr.x},${s.gr.y})`);
        for (const m of s.members) {
          m.n.x = m.x + dx;
          m.n.y = m.y + dy;
          const ng = document.querySelector(`#nodes-layer [data-id="${m.n.id}"]`);
          if (ng) ng.setAttribute('transform', `translate(${m.n.x},${m.n.y})`);
        }
      }
      const map = st.map;
      edges.renderEdges(map.nodes, map.edges);   // hrany sledují uzly
      canvas.updateMinimap(map.nodes, st.viewTransform);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (moved) {
        pushHistory();
        autoSave();
      } else if (ctrl) {
        toggleGroupSelect(group.id);  // Ctrl+klik = přidej/odeber skupinu z multiselectu
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
    shape: 'rectangle',
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
  let members, label;
  if (st.selectedNodeIds && st.selectedNodeIds.length >= 2) {
    // Multiselect: seskup přesně vybrané uzly
    const sel = new Set(st.selectedNodeIds);
    members = st.map.nodes.filter((n) => sel.has(n.id));
    label = 'Skupina';
  } else {
    const node = st.map.nodes.find((n) => n.id === st.selectedNodeId);
    if (!node) { toast('Vyber uzel pro seskupení', 'info'); return; }
    // Posbírej id uzlu a všech potomků
    const ids = new Set();
    const collect = (id) => {
      ids.add(id);
      st.map.nodes.filter((n) => n.parentId === id).forEach((c) => collect(c.id));
    };
    collect(node.id);
    members = st.map.nodes.filter((n) => ids.has(n.id));
    label = node.label;
  }
  if (!members.length) return;

  // Bbox jen z viditelných uzlů (ne pod sbaleným předkem), ať rámeček sedí na to, co je vidět
  const byId = {};
  st.map.nodes.forEach((n) => { byId[n.id] = n; });
  const hidden = (n) => {
    let p = n.parentId ? byId[n.parentId] : null;
    const seen = new Set([n.id]);  // ochrana proti cyklu v parentId
    while (p && !seen.has(p.id)) { seen.add(p.id); if (p.collapsed) return true; p = p.parentId ? byId[p.parentId] : null; }
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
    label,
    color: '#7C3AED',
    x: minX - pad, y: minY - pad,
    width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2,
  };
  groupsArr().push(group);
  members.forEach((n) => { n.groupId = group.id; });
  renderGroups();
  clearMultiSelect();  // po seskupení zruš multiselect (a překresli uzly bez amber borderu)
  pushHistory();
  autoSave();
}

// --- Přizpůsobení skupin členským uzlům (po auto-layoutu) ---
// Každou skupinu, která má členy (n.groupId === gr.id), zvětší/posune tak, aby je obklopila.
// Prázdné skupiny nechá být. Volá se po runLayout, aby skupiny „šly s uzly".
export function reflowGroups() {
  const st = getState();
  const PAD = 30;
  let changed = false;
  for (const gr of st.map.groups) {
    const members = st.map.nodes.filter((n) => n.groupId === gr.id);
    if (!members.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of members) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
    }
    gr.x = minX - PAD; gr.y = minY - PAD;
    gr.width = Math.max(MIN_W, (maxX - minX) + PAD * 2);
    gr.height = Math.max(MIN_H, (maxY - minY) + PAD * 2);
    changed = true;
  }
  if (changed) renderGroups();
  return changed;
}

// Členové skupiny: primárně dle groupId, fallback dle geometrie (střed uzlu uvnitř rámečku)
function membersOf(group, allNodes) {
  let m = allNodes.filter((n) => n.groupId === group.id);
  if (!m.length) {
    m = allNodes.filter((n) => {
      const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
      return cx >= group.x && cx <= group.x + group.width && cy >= group.y && cy <= group.y + group.height;
    });
  }
  return m;
}

// Odvodí smysluplný název skupiny z jejích uzlů (offline heuristika, bez LLM)
function deriveGroupName(members) {
  const ids = new Set(members.map((n) => n.id));
  // 1) Lokální kořen (rodič mimo skupinu) s potomky ve skupině → jeho label shrnuje celek
  const localRoots = members.filter((n) => n.parentId == null || !ids.has(n.parentId));
  if (localRoots.length === 1) {
    const r = localRoots[0];
    if (members.some((n) => n.parentId === r.id) && r.label && r.label.trim()) return r.label.trim();
  }
  // 2) Nejčastější tag (musí být aspoň u 2 uzlů)
  const tagCount = {};
  for (const n of members) for (const t of (n.tags || [])) tagCount[t] = (tagCount[t] || 0) + 1;
  let bestTag = null, bestN = 1;
  for (const t in tagCount) if (tagCount[t] > bestN) { bestN = tagCount[t]; bestTag = t; }
  if (bestTag) return bestTag.charAt(0).toUpperCase() + bestTag.slice(1);
  // 3) Spojení prvních labelů
  const labels = members.map((n) => (n.label || '').trim()).filter(Boolean);
  if (labels.length) { const head = labels.slice(0, 3).join(', '); return labels.length > 3 ? head + '…' : head; }
  return `Skupina (${members.length})`;
}

// --- Pojmenuj skupinu podle obsahu (kontextové menu) ---
export function autoNameGroup(group) {
  const st = getState();
  const members = membersOf(group, st.map.nodes);
  if (!members.length) { toast('Skupina nemá žádné uzly', 'info'); return; }
  group.label = deriveGroupName(members);
  renderGroups();
  pushHistory();
  autoSave();
  toast('Skupina pojmenována: ' + group.label, 'success');
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

// --- Freehand kreslení vlastního tvaru skupiny (sekce 4) ---
// Body (mapové souřadnice) → SVG path
function pointsToPath(pts, close) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  return d + (close ? ' Z' : '');
}

// Aktivuje režim kreslení: jedním tahem nakreslí tvar, uloží do group.customPath (lokální souřadnice)
export function startCustomDraw(group) {
  const svg = document.getElementById('canvas');
  if (!svg) return;
  toast('Nakresli tvar tažením myši', 'info');
  svg.style.cursor = 'crosshair';
  let pts = [];
  let preview = null;

  const down = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pts = [clientToMap(e.clientX, e.clientY)];
    preview = el('path', { fill: group.color + '20', stroke: group.color, 'stroke-width': 1.5 });
    layer().appendChild(preview);
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };
  const mv = (e) => {
    pts.push(clientToMap(e.clientX, e.clientY));
    if (preview) preview.setAttribute('d', pointsToPath(pts, false));
  };
  const up = () => {
    window.removeEventListener('mousemove', mv);
    window.removeEventListener('mouseup', up);
    svg.removeEventListener('mousedown', down, true);
    svg.style.cursor = '';
    if (preview) preview.remove();
    if (pts.length < 3) { toast('Tvar je příliš malý', 'error'); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const local = pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    group.customPath = pointsToPath(local, true);
    group.shape = 'custom';
    group.x = minX; group.y = minY;
    group.width = Math.max(MIN_W, maxX - minX);
    group.height = Math.max(MIN_H, maxY - minY);
    renderGroups();
    pushHistory();
    autoSave();
    toast('Tvar uložen', 'success');
  };
  svg.addEventListener('mousedown', down, true);  // capture: předběhne pan/rubber band
}

// Připojení tlačítka v toolbaru
const addBtn = document.getElementById('group-btn');
if (addBtn) addBtn.addEventListener('click', addGroup);
