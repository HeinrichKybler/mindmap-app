// Rychlá paleta příkazů (sekce 6) — Ctrl+Shift+P, fuzzy hledání, šipky + Enter.
import { getState, setEditMode, addRootNodeAt, deleteSelected, goToMap } from './app.js';
import * as sidebar from './sidebar.js';
import * as search from './search.js';
import * as pitch from './pitch.js';
import * as focus from './focus.js';
import * as settings from './settings.js';
import * as cheatsheet from './cheatsheet.js';
import * as nodes from './nodes.js';
import * as panel from './panel.js';
import { exportPNG, exportJSON, exportMarkdown } from './export.js';
import { toast } from './toast.js';

const COLORS = [
  ['fialovou', '#7C3AED'], ['zelenou', '#059669'], ['modrou', '#3B82F6'], ['azurovou', '#06B6D4'],
  ['oranžovou', '#F97316'], ['červenou', '#E24B4A'], ['žlutou', '#F59E0B'], ['šedou', '#3a3a5e'],
];

let overlay = null, input = null, listEl = null, items = [], active = 0, onKey = null;

(function injectStyles() {
  if (document.getElementById('palette-style')) return;
  const s = document.createElement('style');
  s.id = 'palette-style';
  s.textContent = `
    #palette-overlay { position: fixed; inset: 0; z-index: 350; background: #000000aa;
      display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh;
      font-family: 'Inter', system-ui, sans-serif; }
    #palette-box { width: 560px; max-width: 92vw; background: #111122;
      border: 1px solid #7C3AED; border-radius: 12px; box-shadow: 0 24px 70px #000b; overflow: hidden; }
    #palette-input { width: 100%; padding: 14px 16px; font-size: 15px; color: #fff;
      background: #0a0a16; border: none; border-bottom: 1px solid #7C3AED44; outline: none; box-sizing: border-box; }
    #palette-list { max-height: 320px; overflow-y: auto; }
    #palette-list .pl-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px;
      font-size: 13px; color: #e5e5f0; cursor: pointer; }
    #palette-list .pl-item .pl-hint { margin-left: auto; font-size: 11px; color: #7a7a92; }
    #palette-list .pl-item.active, #palette-list .pl-item:hover { background: #7C3AED2e; }
    #palette-list .pl-empty { padding: 14px 16px; font-size: 13px; color: #7a7a92; }`;
  document.head.appendChild(s);
})();

export function isOpen() { return !!overlay; }

export function close() {
  if (!overlay) return;
  overlay.remove(); overlay = null; input = null; listEl = null; items = [];
  if (onKey) { document.removeEventListener('keydown', onKey, true); onKey = null; }
}

// Vybraný uzel (jediný)
function selNode() { return getState().map.nodes.find((n) => n.id === getState().selectedNodeId); }

// Sestaví seznam příkazů podle aktuálního stavu
function buildCommands() {
  const cmds = [];
  const add = (label, run, hint) => cmds.push({ label, run, hint: hint || '' });

  add('Nový uzel', () => { setEditMode(true); addRootNodeAt(window.innerWidth / 2, window.innerHeight / 2); });
  add('Nová mapa', () => sidebar.startCreate());
  add('Smazat vybrané', () => {
    const st = getState();
    if (st.selectedNodeIds.length >= 2 || st.selectedGroupIds.length) deleteSelected();
    else { const n = selNode(); if (n) nodes.deleteNode(n); else toast('Nic nevybráno', 'info'); }
  });
  for (const [name, hex] of COLORS) {
    add(`Změnit barvu na ${name}`, () => { const n = selNode(); if (n) panel.applyColorTo(n, hex); else toast('Vyber uzel', 'info'); });
  }
  add('Fit all', () => document.getElementById('zoom-fit')?.click(), 'Ctrl+0');
  add('Undo', () => document.getElementById('undo-btn')?.click(), 'Ctrl+Z');
  add('Redo', () => document.getElementById('redo-btn')?.click(), 'Ctrl+Y');
  add('Hledání', () => search.openSearch(), 'Ctrl+F');
  add('Export PNG', () => exportPNG());
  add('Export JSON', () => exportJSON());
  add('Export Markdown', () => exportMarkdown());
  add('Snapshot (JSON záloha)', () => exportJSON());
  add('Pitch mode', () => pitch.toggle(), 'Ctrl+P');
  add('Focus mode', () => focus.toggle(), 'Ctrl+Shift+F');
  add('Nastavení', () => settings.open());
  add('Cheatsheet zkratek', () => cheatsheet.toggle(), '?');
  // Přepínač map
  for (const m of sidebar.getMaps()) {
    if (m.id === getState().currentMapId) continue;
    add(`Přejít na mapu: ${m.name}`, () => goToMap(m.id), 'mapa');
  }
  return cmds;
}

// Fuzzy: obsahuje znaky dotazu v pořadí; skóre dle kompaktnosti a pozice
function fuzzy(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase(), t = text.toLowerCase();
  let qi = 0, score = 0, last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += (last >= 0 && ti === last + 1) ? 3 : 1;  // bonus za navazující znaky
      if (ti === 0) score += 2;
      last = ti; qi++;
    }
  }
  return qi === q.length ? score : -1;
}

let allCmds = [];
function renderList() {
  const q = input.value.trim();
  let matched;
  if (!q) matched = allCmds.slice(0, 8);
  else {
    matched = allCmds
      .map((c) => ({ c, s: fuzzy(q, c.label) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.c);
  }
  items = matched;
  active = 0;
  listEl.innerHTML = '';
  if (!matched.length) {
    const empty = document.createElement('div'); empty.className = 'pl-empty'; empty.textContent = 'Žádný příkaz';
    listEl.appendChild(empty); return;
  }
  matched.forEach((c, i) => {
    const it = document.createElement('div');
    it.className = 'pl-item' + (i === active ? ' active' : '');
    const lbl = document.createElement('span'); lbl.textContent = c.label;
    it.appendChild(lbl);
    if (c.hint) { const h = document.createElement('span'); h.className = 'pl-hint'; h.textContent = c.hint; it.appendChild(h); }
    it.addEventListener('mousemove', () => { active = i; highlight(); });
    it.addEventListener('click', () => run(i));
    listEl.appendChild(it);
  });
}

function highlight() {
  listEl.querySelectorAll('.pl-item').forEach((el, i) => el.classList.toggle('active', i === active));
}

function run(i) {
  const cmd = items[i];
  if (!cmd) return;
  close();
  try { cmd.run(); } catch (e) { console.error('Příkaz selhal:', e); }
}

export function open() {
  if (overlay) { close(); return; }
  allCmds = buildCommands();
  overlay = document.createElement('div'); overlay.id = 'palette-overlay';
  const box = document.createElement('div'); box.id = 'palette-box';
  input = document.createElement('input'); input.id = 'palette-input'; input.placeholder = 'Napiš příkaz…';
  listEl = document.createElement('div'); listEl.id = 'palette-list';
  box.appendChild(input); box.appendChild(listEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  renderList();
  input.focus();
  input.addEventListener('input', renderList);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  onKey = (e) => {
    if (!overlay) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); active = Math.min(items.length - 1, active + 1); highlight(); ensureVisible(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); active = Math.max(0, active - 1); highlight(); ensureVisible(); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(active); return; }
  };
  document.addEventListener('keydown', onKey, true);
}

function ensureVisible() {
  const el = listEl.querySelectorAll('.pl-item')[active];
  if (el) el.scrollIntoView({ block: 'nearest' });
}
