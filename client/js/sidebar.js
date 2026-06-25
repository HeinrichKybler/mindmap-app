// Levý sidebar - seznam map a jejich správa. Komunikuje pouze přes api.js
import { api } from './api.js';
import { toast } from './toast.js';
import * as templates from './templates.js';
import * as stats from './stats.js';

const el = document.getElementById('sidebar');

let onSelect = null;     // callback při výběru mapy
let onGoTo = null;       // callback (mapId, nodeId) pro skok na záložku
let maps = [];           // aktuální seznam map z indexu
let activeId = null;     // id aktivní mapy
let openMenuId = null;   // id mapy s otevřeným ⋯ dropdownem
let bookmarksMode = false;   // sidebar zobrazuje záložky místo map
let bookmarkItems = [];      // [{ mapId, mapName, nodeId, label }]

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

  // Seznam map
  const list = document.createElement('div');
  list.className = 'sb-list';
  for (const m of maps) list.appendChild(renderRow(m));
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

// Vykreslí jeden řádek mapy
function renderRow(m) {
  const row = document.createElement('div');
  row.className = 'sb-row' + (m.id === activeId ? ' active' : '');

  const name = document.createElement('span');
  name.className = 'sb-name';
  name.textContent = m.name;
  name.addEventListener('click', () => selectMap(m.id));
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
function startCreate() {
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
  const rows = el.querySelectorAll('.sb-row');
  const row = Array.from(rows).find((_, i) => maps[i] && maps[i].id === m.id);
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
          await api.updateMap(m.id, full);
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
