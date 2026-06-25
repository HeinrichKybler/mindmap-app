// Levý sidebar - seznam map a jejich správa. Komunikuje pouze přes api.js
import { api } from './api.js';
import { toast } from './toast.js';
import { nodeColors } from './app.js';
import * as templates from './templates.js';
import * as stats from './stats.js';

const el = document.getElementById('sidebar');

// --- Miniaturní náhled mapy (sekce 8) ---
let previewTimer = null, previewEl = null, previewId = null;
const previewCache = new Map();  // id → plná mapa (ať hover netahá pořád)

(function injectPreviewStyle() {
  if (document.getElementById('sb-preview-style')) return;
  const s = document.createElement('style');
  s.id = 'sb-preview-style';
  s.textContent = `
    #sb-preview { position: fixed; z-index: 120; width: 240px; background: #111122;
      border: 1px solid #7C3AED44; border-radius: 8px; box-shadow: 0 12px 36px #000a;
      overflow: hidden; font-family: 'Inter', system-ui, sans-serif; pointer-events: none; }
    #sb-preview .sbp-canvas { width: 240px; height: 140px; background: #0d0d1a; display: block; }
    #sb-preview .sbp-foot { padding: 5px 8px; font-size: 11px; color: #9a9ab0; border-top: 1px solid #7C3AED22; }
    #sb-preview .sbp-empty { width: 240px; height: 140px; display: flex; align-items: center; justify-content: center; color: #5a5a72; font-size: 12px; }`;
  document.head.appendChild(s);
})();

function hidePreview() {
  clearTimeout(previewTimer); previewTimer = null; previewId = null;
  if (previewEl) { previewEl.remove(); previewEl = null; }
}

// Naplánuje zobrazení náhledu po 300ms hoveru
function schedulePreview(m, row) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    previewId = m.id;
    let full = previewCache.get(m.id);
    if (!full) { try { full = await api.getMap(m.id); previewCache.set(m.id, full); } catch (e) { return; } }
    if (previewId !== m.id) return;  // myš mezitím odešla
    buildPreview(full, m, row);
  }, 300);
}

// Zmenšená SVG kopie mapy (240×140)
function miniSvg(map) {
  const W = 240, H = 140, PAD = 10;
  const ns = map.nodes || [];
  if (!ns.length) return '<div class="sbp-empty">prázdná mapa</div>';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of ns) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height); }
  const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1;
  const sc = Math.min((W - 2 * PAD) / bw, (H - 2 * PAD) / bh);
  const ox = PAD + ((W - 2 * PAD) - bw * sc) / 2, oy = PAD + ((H - 2 * PAD) - bh * sc) / 2;
  const tx = (x) => (ox + (x - minX) * sc).toFixed(1), ty = (y) => (oy + (y - minY) * sc).toFixed(1);
  let s = `<svg class="sbp-canvas" viewBox="0 0 ${W} ${H}">`;
  for (const gr of (map.groups || [])) {
    s += `<rect x="${tx(gr.x)}" y="${ty(gr.y)}" width="${(gr.width * sc).toFixed(1)}" height="${(gr.height * sc).toFixed(1)}" rx="2" fill="none" stroke="${gr.color || '#7C3AED'}66"/>`;
  }
  for (const n of ns) {
    const c = nodeColors(n);
    s += `<rect x="${tx(n.x)}" y="${ty(n.y)}" width="${Math.max(1, n.width * sc).toFixed(1)}" height="${Math.max(1, n.height * sc).toFixed(1)}" rx="1.5" fill="${c.stroke}" opacity="0.85"/>`;
  }
  return s + '</svg>';
}

function buildPreview(full, m, row) {
  hidePreview();  // ujisti se, že není starý
  previewId = m.id;
  previewEl = document.createElement('div');
  previewEl.id = 'sb-preview';
  const date = (m.updatedAt || full.updatedAt || '').slice(0, 10);
  previewEl.innerHTML = miniSvg(full)
    + `<div class="sbp-foot">${(full.nodes || []).length} uzlů · ${(full.groups || []).length} skupin${date ? ' · ' + date : ''}</div>`;
  document.body.appendChild(previewEl);
  // Pozice: vpravo od sidebaru, zarovnáno k řádku (clamp do viewportu)
  const sbRect = el.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const top = Math.min(window.innerHeight - previewEl.offsetHeight - 8, Math.max(8, rowRect.top));
  previewEl.style.left = (sbRect.right + 8) + 'px';
  previewEl.style.top = top + 'px';
}

let onSelect = null;     // callback při výběru mapy
let onGoTo = null;       // callback (mapId, nodeId) pro skok na záložku
let maps = [];           // aktuální seznam map z indexu
let activeId = null;     // id aktivní mapy
let openMenuId = null;   // id mapy s otevřeným ⋯ dropdownem
let bookmarksMode = false;   // sidebar zobrazuje záložky místo map
let bookmarkItems = [];      // [{ mapId, mapName, nodeId, label }]
let collapsedMaps = new Set();  // id rodičovských map, které mají sbalené podmapy

// Inicializace - uloží callbacky a načte seznam map
export async function init(onMapSelect, onGoToNode) {
  onSelect = onMapSelect;
  onGoTo = onGoToNode;
  await refresh();
  // Po startu automaticky vyber první mapu
  if (!activeId && maps.length) selectMap(maps[0].id);
}

// Přepne sidebar do/z režimu záložek (Ctrl+Shift+B)
export async function toggleBookmarks() {
  bookmarksMode = !bookmarksMode;
  if (bookmarksMode) await loadBookmarks();
  render();
}

// Posbírá záložkované uzly napříč VŠEMI mapami
async function loadBookmarks() {
  bookmarkItems = [];
  try {
    const list = await api.getMaps();
    // Paralelně místo sériově (N+1) — jedna pomalá/chybná mapa nezablokuje ostatní
    const full = await Promise.all(list.map((m) => api.getMap(m.id).catch(() => null)));
    list.forEach((m, i) => {
      if (!full[i]) return;
      for (const n of (full[i].nodes || [])) {
        if (n.bookmarked) bookmarkItems.push({ mapId: m.id, mapName: m.name, nodeId: n.id, label: n.label || '(bez názvu)' });
      }
    });
  } catch (err) {
    console.error('Nepodařilo se načíst záložky:', err.message);
    toast('Nepodařilo se načíst záložky', 'error');
  }
}

// Znovu načte index ze serveru a překreslí seznam
export async function refresh() {
  hidePreview();
  previewCache.clear();  // náhledy se znovu načtou (mapy se mohly změnit)
  try {
    maps = await api.getMaps();
  } catch (err) {
    console.error('Nepodařilo se načíst mapy:', err.message);
    toast('Nepodařilo se načíst mapy', 'error');
    maps = [];
  }
  render();
}

// Přepne aktivní mapu a zavolá callback
async function selectMap(id) {
  activeId = id;
  openMenuId = null;
  render();
  if (onSelect) onSelect(id);
}

// Programové přepnutí na mapu (např. po importu)
export function select(id) { selectMap(id); }

// Přepnutí na mapu dle pořadí v sidebaru (Ctrl+1..9)
export function selectByIndex(i) {
  if (i >= 0 && i < maps.length) selectMap(maps[i].id);
}

// Aktuální seznam map (pro statistiky/zkratky)
export function getMaps() { return maps; }

// --- Vykreslení ---
function render() {
  el.innerHTML = '';
  if (bookmarksMode) { renderBookmarks(); return; }

  // Nadpis
  const title = document.createElement('div');
  title.className = 'sb-title';
  title.textContent = 'MAPY';
  el.appendChild(title);

  // Tlačítko nové mapy
  const addBtn = document.createElement('button');
  addBtn.className = 'sb-add';
  addBtn.textContent = '+ Nová mapa';
  addBtn.addEventListener('click', startCreate);
  el.appendChild(addBtn);

  // Seznam map jako strom (parentMapId → hierarchie)
  const list = document.createElement('div');
  list.className = 'sb-list';
  const byParent = {};
  for (const m of maps) {
    const p = (m.parentMapId && maps.some((x) => x.id === m.parentMapId)) ? m.parentMapId : '__root__';
    (byParent[p] = byParent[p] || []).push(m);
  }
  const seen = new Set();  // ochrana proti cyklu v parentMapId
  const renderLevel = (parentKey, depth) => {
    for (const m of (byParent[parentKey] || [])) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const hasChildren = !!byParent[m.id];
      list.appendChild(renderRow(m, depth, hasChildren));
      if (hasChildren && !collapsedMaps.has(m.id)) renderLevel(m.id, depth + 1);
    }
  };
  renderLevel('__root__', 0);
  el.appendChild(list);

  // Statistiky aktuální mapy pod seznamem
  const sp = document.createElement('div');
  sp.id = 'stats-panel';
  el.appendChild(sp);
  stats.update();
}

// Vykreslí režim záložek (napříč mapami)
function renderBookmarks() {
  const title = document.createElement('div');
  title.className = 'sb-title';
  title.textContent = 'ZÁLOŽKY';
  el.appendChild(title);

  const back = document.createElement('button');
  back.className = 'sb-add';
  back.textContent = '← Zpět na mapy';
  back.addEventListener('click', () => { bookmarksMode = false; render(); });
  el.appendChild(back);

  const list = document.createElement('div');
  list.className = 'sb-list';
  if (!bookmarkItems.length) {
    const empty = document.createElement('div');
    empty.className = 'sb-empty';
    empty.textContent = 'Žádné záložky';
    list.appendChild(empty);
  }
  for (const b of bookmarkItems) {
    const row = document.createElement('div');
    row.className = 'sb-row';
    const wrap = document.createElement('div');
    wrap.className = 'sb-bm-wrap';
    const name = document.createElement('span');
    name.className = 'sb-name';
    name.textContent = '⭐ ' + b.label;
    const sub = document.createElement('span');
    sub.className = 'sb-bm-map';
    sub.textContent = b.mapName;
    wrap.appendChild(name);
    wrap.appendChild(sub);
    row.appendChild(wrap);
    row.addEventListener('click', () => {
      bookmarksMode = false;
      activeId = b.mapId;
      render();
      if (onGoTo) onGoTo(b.mapId, b.nodeId);
    });
    list.appendChild(row);
  }
  el.appendChild(list);
}

// Vykreslí jeden řádek mapy (depth = úroveň zanoření, hasChildren = má podmapy)
function renderRow(m, depth = 0, hasChildren = false) {
  const row = document.createElement('div');
  row.className = 'sb-row' + (m.id === activeId ? ' active' : '');
  row.dataset.mapId = m.id;
  if (depth) row.style.paddingLeft = (8 + depth * 16) + 'px';

  // Šipka rozbalení/sbalení podmap
  const arrow = document.createElement('span');
  arrow.style.cssText = 'display:inline-block;width:14px;flex:0 0 auto;text-align:center;color:#7C3AED;cursor:default;';
  if (hasChildren) {
    arrow.textContent = collapsedMaps.has(m.id) ? '▸' : '▾';
    arrow.style.cursor = 'pointer';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapsedMaps.has(m.id)) collapsedMaps.delete(m.id); else collapsedMaps.add(m.id);
      render();
    });
  }
  row.appendChild(arrow);

  const name = document.createElement('span');
  name.className = 'sb-name';
  if (depth) name.style.fontSize = '11px';
  name.textContent = m.name;
  name.addEventListener('click', () => selectMap(m.id));
  name.addEventListener('mouseenter', () => schedulePreview(m, row));  // náhled mapy (sekce 8)
  row.addEventListener('mouseleave', hidePreview);
  row.appendChild(name);

  // Tlačítko ⋯
  const dots = document.createElement('button');
  dots.className = 'sb-dots';
  dots.textContent = '⋯';
  dots.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuId = openMenuId === m.id ? null : m.id;
    render();
  });
  row.appendChild(dots);

  // Inline dropdown
  if (openMenuId === m.id) row.appendChild(renderMenu(m));

  return row;
}

// Vykreslí dropdown menu řádku
function renderMenu(m) {
  const menu = document.createElement('div');
  menu.className = 'sb-menu';

  const rename = document.createElement('div');
  rename.className = 'sb-menu-item';
  rename.textContent = 'Přejmenovat';
  rename.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuId = null;
    startRename(m);
  });
  menu.appendChild(rename);

  const del = document.createElement('div');
  del.className = 'sb-menu-item danger';
  del.textContent = 'Smazat';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuId = null;
    removeMap(m);
  });
  menu.appendChild(del);

  return menu;
}

// --- Akce ---

// Nová mapa: modal s výběrem šablony
export function startCreate() {
  templates.openModal(async (name, key) => {
    try {
      const map = await api.createMap(name);
      // Neprázdná šablona: naplň mapu vygenerovaným stromem
      if (key !== 'empty') {
        const tpl = templates.buildTemplate(key);
        const full = await api.getMap(map.id);
        full.nodes = tpl.nodes;
        full.edges = tpl.edges;
        full.groups = tpl.groups;
        await api.updateMap(map.id, full);
      }
      await refresh();
      selectMap(map.id);
    } catch (err) {
      console.error('Nepodařilo se vytvořit mapu:', err.message);
      toast('Nepodařilo se vytvořit mapu', 'error');
    }
  });
}

// Přejmenování: inline edit přímo v řádku
function startRename(m) {
  render();
  const row = el.querySelector(`.sb-row[data-map-id="${m.id}"]`);
  if (!row) return;
  const nameSpan = row.querySelector('.sb-name');

  const input = document.createElement('input');
  input.className = 'sb-input';
  input.value = m.name;

  const finish = async (commit) => {
    if (commit) {
      const name = input.value.trim();
      if (name && name !== m.name) {
        try {
          const full = await api.getMap(m.id);
          full.name = name;
          const root = (full.nodes || []).find((n) => n.parentId == null);
          if (root) root.label = name;  // přejmenuj i root uzel mapy
          await api.updateMap(m.id, full);
          // Reverzní sync: přejmenuj odkazový uzel v nadřazené mapě
          if (m.parentMapId) {
            try {
              const parent = await api.getMap(m.parentMapId);
              let changed = false;
              for (const n of (parent.nodes || [])) if (n.linkedMapId === m.id) { n.label = name; changed = true; }
              if (changed) await api.updateMap(m.parentMapId, parent);
            } catch (e) { /* best-effort */ }
          }
        } catch (err) {
          console.error('Nepodařilo se přejmenovat mapu:', err.message);
          toast('Nepodařilo se přejmenovat mapu', 'error');
        }
      }
    }
    await refresh();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(false));

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

// Smazání s potvrzením
async function removeMap(m) {
  render();
  if (!confirm(`Smazat mapu „${m.name}"?`)) return;
  try {
    await api.deleteMap(m.id);
    if (activeId === m.id) activeId = null;
    await refresh();
    if (!activeId && maps.length) selectMap(maps[0].id);
  } catch (err) {
    console.error('Nepodařilo se smazat mapu:', err.message);
    toast('Nepodařilo se smazat mapu', 'error');
  }
}
