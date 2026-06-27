// Export/import mapy — PNG (dom-to-image-more), JSON export, JSON import
import { getState, applyTransform } from './app.js';
import * as sidebar from './sidebar.js';
import { api } from './api.js';
import { toast } from './toast.js';
import { makeNode } from './nodes.js';
import { applyLayout } from './layout.js';

// Re-export toastu pro zpětnou kompatibilitu (panel.js importuje odsud)
export { toast };

// Spustí stažení souboru z data-url / blob-url
function download(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Datum YYYY-MM-DD pro název souboru
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Očistí název mapy pro použití v názvu souboru
function safeName(name) {
  return (name || 'mapa').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'mapa';
}

// --- PNG export ---
export async function exportPNG() {
  const domtoimage = window.domtoimage;
  if (!domtoimage) { toast('Knihovna pro PNG není načtena', 'error'); return; }

  const map = getState().map;
  const nodes = map.nodes;
  if (!nodes.length) { toast('Mapa je prázdná', 'error'); return; }

  // Bounding box všech uzlů + 40px padding
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 40;
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);

  const svg = document.getElementById('canvas');
  const panGroup = document.getElementById('pan-group');
  const gridBg = document.getElementById('grid-bg');

  // Dočasně posuň obsah do levého horního rohu (scale 1) a skryj mřížku
  panGroup.setAttribute('transform', `translate(${-minX + pad},${-minY + pad}) scale(1)`);
  const gridDisplay = gridBg.style.display;
  gridBg.style.display = 'none';

  try {
    const dataUrl = await domtoimage.toPng(svg, { width: w, height: h, bgcolor: '#0d0d1a' });
    download(dataUrl, `mindmap-${safeName(map.name)}-${today()}.png`);
    toast('PNG uloženo', 'success');
  } catch (err) {
    toast('Export PNG selhal', 'error');
    console.error('Export PNG selhal:', err);
  } finally {
    // Obnov původní pohled
    gridBg.style.display = gridDisplay;
    applyTransform();
  }
}

// --- JSON export ---
export function exportJSON() {
  const map = getState().map;
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `mindmap-${safeName(map.name)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('JSON uloženo', 'success');
}

// --- JSON import ---
let fileInput = null;

function ensureFileInput() {
  if (fileInput) return fileInput;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', onFile);
  document.body.appendChild(fileInput);
  return fileInput;
}

// Validace: musí mít pole nodes, edges, groups
function isValidMap(data) {
  return data && typeof data === 'object'
    && Array.isArray(data.nodes)
    && Array.isArray(data.edges)
    && Array.isArray(data.groups);
}

async function onFile(e) {
  const file = e.target.files[0];
  fileInput.value = '';
  if (!file) return;
  // Parsování odděleno od ukládání — ať chybová hláška nelže (parse vs. uložení)
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Neplatný soubor — není platný JSON', 'error');
    return;
  }
  // Vícemapový formát { maps: [...] } umí podmapy (linkedMapKey) i reference (targetMapKey).
  // Jednomapový formát { nodes, edges, groups } zůstává jako dřív (bez křížových odkazů).
  if (Array.isArray(data.maps)) return importMulti(data);
  if (isValidMap(data)) return importSingle(data, file);
  toast('Neplatný soubor — chybí nodes/edges/groups nebo maps', 'error');
}

// Jednomapový import (původní chování)
async function importSingle(data, file) {
  // Název: z mapy, jinak z názvu souboru
  const name = (data.name && String(data.name).trim())
    || file.name.replace(/\.json$/i, '')
    || 'Importovaná mapa';

  let created = null;
  try {
    created = await api.createMap(name);
    if (Array.isArray(data.nodes)) assignGroupMembership(data.nodes, data.groups);
    await api.updateMap(created.id, { ...data, name });
    await sidebar.refresh();
    sidebar.select(created.id);
    toast('Mapa importována', 'success');
  } catch (err) {
    console.error('Import selhal:', err);
    // Ukliď prázdnou mapu, která už vznikla, ať nezůstane orphan v indexu
    if (created) { try { await api.deleteMap(created.id); } catch {} await sidebar.refresh(); }
    toast('Import se nepodařilo uložit', 'error');
  }
}

// Přiřadí uzlům groupId podle skupiny, v níž leží jejich střed (stejně jako ruční drop do skupiny).
// Bez toho by importované uzly ve skupině nebyly její členové a nehýbaly by se s ní.
// Explicitně zadaný groupId v souboru se respektuje.
function assignGroupMembership(nodes, groupList) {
  if (!Array.isArray(groupList) || !groupList.length) return;
  for (const n of nodes) {
    if (n.groupId) continue;  // respektuj explicitní příslušnost ze souboru
    const cx = n.x + (n.width || 0) / 2;
    const cy = n.y + (n.height || 0) / 2;
    for (let i = groupList.length - 1; i >= 0; i--) {  // odshora (nejvrchnější skupina)
      const gr = groupList[i];
      if (cx >= gr.x && cx <= gr.x + gr.width && cy >= gr.y && cy <= gr.y + gr.height) { n.groupId = gr.id; break; }
    }
  }
}

// Doplní reálná serverová ID do uzlu: linkedMapKey → linkedMapId,
// references[].targetMapKey → targetMapId (+ dopočítá targetMapName/targetLabel z dat souboru)
function resolveNodeKeys(node, keyToId, keyToName, labelIndex) {
  const out = { ...node };
  if (out.linkedMapKey != null) {
    out.linkedMapId = keyToId[out.linkedMapKey] || null;
    delete out.linkedMapKey;
  }
  if (Array.isArray(out.references)) {
    out.references = out.references.map((r) => {
      const rr = { ...r };
      if (rr.targetMapKey != null) {
        rr.targetMapId = keyToId[rr.targetMapKey] || null;
        rr.targetMapName = rr.targetMapName || keyToName[rr.targetMapKey] || '';
        const idx = labelIndex[rr.targetMapKey];
        if (!rr.targetLabel && idx && idx[rr.targetNodeId] != null) rr.targetLabel = idx[rr.targetNodeId];
        delete rr.targetMapKey;
      }
      return rr;
    });
  }
  return out;
}

// Vícemapový import: vytvoří všechny mapy, zjistí jejich reálná ID a doplní křížové odkazy.
// Tím jde přes soubor vytvořit i to, co se jinak dělá ručně v appce (podmapy, reference).
async function importMulti(data) {
  const maps = Array.isArray(data.maps) ? data.maps : [];
  if (!maps.length) { toast('Neplatný soubor — maps je prázdné', 'error'); return; }
  for (const m of maps) {
    if (!m || typeof m !== 'object' || !m.key || !isValidMap(m)) {
      toast('Neplatný soubor — každá mapa potřebuje key a pole nodes/edges/groups', 'error');
      return;
    }
  }
  const keys = maps.map((m) => String(m.key));
  if (new Set(keys).size !== keys.length) { toast('Neplatný soubor — duplicitní key mapy', 'error'); return; }

  const created = [];  // pro úklid při chybě
  try {
    // 1) Vytvoř všechny mapy → reálná ID + názvy + index labelů uzlů (pro dopočet referencí)
    const keyToId = {}, keyToName = {}, labelIndex = {};
    for (const m of maps) {
      const name = (m.name && String(m.name).trim()) || String(m.key);
      const c = await api.createMap(name);
      created.push(c.id);
      keyToId[m.key] = c.id;
      keyToName[m.key] = name;
      const idx = {};
      for (const n of m.nodes) idx[n.id] = n.label;
      labelIndex[m.key] = idx;
    }
    // 2) Ulož každou mapu s vyřešenými odkazy (linkedMapId, references, parentMapId)
    for (const m of maps) {
      const nodes = m.nodes.map((n) => resolveNodeKeys(n, keyToId, keyToName, labelIndex));
      assignGroupMembership(nodes, m.groups);
      await api.updateMap(keyToId[m.key], {
        name: keyToName[m.key],
        parentMapId: m.parentMapKey != null ? (keyToId[m.parentMapKey] || null) : null,
        nodes,
        edges: Array.isArray(m.edges) ? m.edges : [],
        groups: Array.isArray(m.groups) ? m.groups : [],
        settings: m.settings || { autoNumber: false },
      });
    }
    await sidebar.refresh();
    const rootMap = maps.find((m) => m.parentMapKey == null) || maps[0];
    sidebar.select(keyToId[rootMap.key]);
    toast(`Importováno map: ${maps.length}`, 'success');
  } catch (err) {
    console.error('Vícemapový import selhal:', err);
    // Úklid: smaž všechny mapy, které už vznikly, ať nezůstanou orphan
    for (const id of created) { try { await api.deleteMap(id); } catch {} }
    await sidebar.refresh();
    toast('Import se nepodařilo uložit', 'error');
  }
}

function importJSON() {
  ensureFileInput().click();
}

// --- Sdílená stavba stromu pro serializaci ---
function treeRoots(map) {
  const nodes = map.nodes || [];
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const children = {};
  nodes.forEach((n) => { children[n.id] = []; });
  const roots = [];
  for (const n of nodes) {
    if (n.parentId == null || !byId[n.parentId]) roots.push(n);
    else children[n.parentId].push(n);
  }
  return { roots, children };
}

// --- Markdown export ---
function mapToMarkdown(map) {
  const { roots, children } = treeRoots(map);
  let out = `# ${map.name || 'Mapa'}\n\n`;
  const walk = (n, d) => {
    if (d === 0) out += `## ${n.label}\n`;
    else if (d === 1) out += `### ${n.label}\n`;
    else out += `${'  '.repeat(d - 2)}- ${n.label}\n`;
    children[n.id].forEach((c) => walk(c, d + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}
export function exportMarkdown() {
  const map = getState().map;
  const blob = new Blob([mapToMarkdown(map)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  download(url, `mindmap-${safeName(map.name)}.md`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Markdown uloženo', 'success');
}

// --- OPML export ---
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mapToOPML(map) {
  const { roots, children } = treeRoots(map);
  const walk = (n, indent) => {
    const kids = children[n.id];
    if (!kids.length) return `${indent}<outline text="${xmlEsc(n.label)}" />\n`;
    let s = `${indent}<outline text="${xmlEsc(n.label)}">\n`;
    kids.forEach((c) => { s += walk(c, indent + '  '); });
    s += `${indent}</outline>\n`;
    return s;
  };
  let body = '';
  roots.forEach((r) => { body += walk(r, '    '); });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${xmlEsc(map.name || 'Mapa')}</title></head>\n  <body>\n${body}  </body>\n</opml>\n`;
}
function exportOPML() {
  const map = getState().map;
  const blob = new Blob([mapToOPML(map)], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  download(url, `mindmap-${safeName(map.name)}.opml`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('OPML uloženo', 'success');
}

// --- SVG export ---
function exportSVG() {
  const map = getState().map;
  const nodes = map.nodes;
  if (!nodes.length) { toast('Mapa je prázdná', 'error'); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 40;
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);
  const pan = document.getElementById('pan-group').cloneNode(true);
  pan.setAttribute('transform', `translate(${-minX + pad},${-minY + pad}) scale(1)`);
  const defs = document.querySelector('#canvas defs');
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="#0d0d1a"/>`
    + (defs ? defs.outerHTML : '')
    + pan.outerHTML + '</svg>';
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  download(url, `mindmap-${safeName(map.name)}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('SVG uloženo', 'success');
}

// --- Markdown import ---
// Parsuje #/##/### headingy i odrážky (-, *, ·) na strom dle úrovně
function parseMarkdown(text) {
  const nodes = [];
  const edges = [];
  const stack = [];  // [{ level, id }]
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let level = -1, label = '';
    const h = raw.match(/^(#{1,6})\s+(.*)/);
    const b = raw.match(/^(\s*)[-*+·]\s+(.*)/);
    if (h) {
      if (h[1].length === 1) continue;  // # = název mapy
      level = h[1].length - 2;          // ## → 0, ### → 1 …
      label = h[2].trim();
    } else if (b) {
      level = 2 + Math.floor(b[1].replace(/\t/g, '  ').length / 2);
      label = b[2].trim();
    } else {
      continue;
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    const node = makeNode({ parentId: parent ? parent.id : null, label });
    nodes.push(node);
    if (parent) edges.push({ id: crypto.randomUUID(), fromId: parent.id, toId: node.id, label: '' });
    stack.push({ level, id: node.id });
  }
  applyLayout(nodes);
  return { nodes, edges, groups: [] };
}

let mdInput = null;
function ensureMdInput() {
  if (mdInput) return mdInput;
  mdInput = document.createElement('input');
  mdInput.type = 'file';
  mdInput.accept = '.md,.markdown,.txt';
  mdInput.style.display = 'none';
  mdInput.addEventListener('change', onMarkdownFile);
  document.body.appendChild(mdInput);
  return mdInput;
}
async function onMarkdownFile(e) {
  const file = e.target.files[0];
  mdInput.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const name = file.name.replace(/\.(md|markdown|txt)$/i, '') || 'Importovaná mapa';
    const data = parseMarkdown(text);
    if (!data.nodes.length) { toast('Markdown neobsahuje žádné položky', 'error'); return; }
    const created = await api.createMap(name);
    await api.updateMap(created.id, { ...data, name });
    await sidebar.refresh();
    sidebar.select(created.id);
    toast('Markdown importován', 'success');
  } catch (err) {
    toast('Import Markdownu selhal', 'error');
    console.error('Import MD selhal:', err);
  }
}
function importMarkdown() { ensureMdInput().click(); }

// --- Export vybrané větve (sekce 10) ---
// Posbírá vybraný uzel + všechny potomky rekurzivně
function collectBranch(map, rootId) {
  const ids = new Set();
  const walk = (id) => { ids.add(id); map.nodes.filter((n) => n.parentId === id).forEach((c) => walk(c.id)); };
  walk(rootId);
  const nodes = map.nodes.filter((n) => ids.has(n.id));
  const edges = (map.edges || []).filter((e) => ids.has(e.fromId) && ids.has(e.toId));
  return { ids, nodes, edges };
}

function selectedNode() {
  const map = getState().map;
  return map.nodes.find((n) => n.id === getState().selectedNodeId);
}

function exportBranchJSON() {
  const map = getState().map;
  const sel = selectedNode();
  if (!sel) { toast('Vyber uzel pro export větve', 'info'); return; }
  const { nodes, edges } = collectBranch(map, sel.id);
  const sub = { name: `${map.name} - ${sel.label}`, nodes, edges, groups: [] };
  const blob = new Blob([JSON.stringify(sub, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `vetev-${safeName(sel.label)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Větev (JSON) uložena', 'success');
}

function exportBranchMarkdown() {
  const map = getState().map;
  const sel = selectedNode();
  if (!sel) { toast('Vyber uzel pro export větve', 'info'); return; }
  const { nodes, edges } = collectBranch(map, sel.id);
  const blob = new Blob([mapToMarkdown({ name: sel.label, nodes, edges })], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  download(url, `vetev-${safeName(sel.label)}.md`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Větev (Markdown) uložena', 'success');
}

async function exportBranchPNG() {
  const domtoimage = window.domtoimage;
  if (!domtoimage) { toast('Knihovna pro PNG není načtena', 'error'); return; }
  const map = getState().map;
  const sel = selectedNode();
  if (!sel) { toast('Vyber uzel pro export větve', 'info'); return; }
  const { ids, nodes, edges } = collectBranch(map, sel.id);
  if (!nodes.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 40;
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);

  const svg = document.getElementById('canvas');
  const panGroup = document.getElementById('pan-group');
  const gridBg = document.getElementById('grid-bg');
  const edgeIds = new Set(edges.map((e) => e.id));
  const hidden = [];
  const hide = (elm) => { hidden.push([elm, elm.style.display]); elm.style.display = 'none'; };
  // Skryj uzly/hrany mimo větev + všechny skupiny
  document.querySelectorAll('#nodes-layer [data-id]').forEach((gEl) => { if (!ids.has(gEl.getAttribute('data-id'))) hide(gEl); });
  document.querySelectorAll('#edges-layer [data-id]').forEach((gEl) => { if (!edgeIds.has(gEl.getAttribute('data-id'))) hide(gEl); });
  document.querySelectorAll('#groups-layer [data-id]').forEach((gEl) => hide(gEl));

  panGroup.setAttribute('transform', `translate(${-minX + pad},${-minY + pad}) scale(1)`);
  const gridDisplay = gridBg.style.display;
  gridBg.style.display = 'none';
  try {
    const dataUrl = await domtoimage.toPng(svg, { width: w, height: h, bgcolor: '#0d0d1a' });
    download(dataUrl, `vetev-${safeName(sel.label)}-${today()}.png`);
    toast('Větev (PNG) uložena', 'success');
  } catch (err) {
    toast('Export větve selhal', 'error');
    console.error('Export větve PNG selhal:', err);
  } finally {
    for (const [elm, disp] of hidden) elm.style.display = disp;
    gridBg.style.display = gridDisplay;
    applyTransform();
  }
}

// --- Dropdown menu v toolbaru (sdílí styl .tb-menu) ---
function openExportMenu(btn, items) {
  document.querySelectorAll('.tb-menu.export-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'tb-menu export-menu';
  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.left = `${r.left}px`;
  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  for (const [label, fn] of items) {
    const it = document.createElement('div');
    it.className = 'tb-menu-item';
    it.textContent = label;
    it.addEventListener('click', () => { close(); fn(); });
    menu.appendChild(it);
  }
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', close), 0);
}

// --- Připojení toolbar tlačítek ---
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
if (exportBtn) exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openExportMenu(exportBtn, [
    ['PNG', exportPNG], ['JSON', exportJSON], ['Markdown', exportMarkdown], ['OPML', exportOPML], ['SVG', exportSVG],
    ['Větev → PNG', exportBranchPNG], ['Větev → JSON', exportBranchJSON], ['Větev → Markdown', exportBranchMarkdown],
  ]);
});
if (importBtn) importBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openExportMenu(importBtn, [['JSON', importJSON], ['Markdown', importMarkdown]]);
});
