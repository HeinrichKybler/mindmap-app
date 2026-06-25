// Plovoucí panel nástrojů (sekce 3) — jen v edit mode.
// Drag za hlavičku ⠿, pozice + orientace v localStorage, akce nad vybraným uzlem / výběrem.
import { getState, autoSave, pushHistory, deleteSelected, getSelectedNodeIds } from './app.js';
import * as nodes from './nodes.js';
import * as groups from './groups.js';
import * as panel from './panel.js';
import { toast } from './toast.js';

const LS_POS = 'mm-ft-pos';
const LS_ORIENT = 'mm-ft-orient';
const COLORS = [
  ['purple', '#7C3AED'], ['green', '#059669'], ['blue', '#3B82F6'], ['cyan', '#06B6D4'],
  ['orange', '#F97316'], ['red', '#E24B4A'], ['amber', '#F59E0B'], ['neutral', '#3a3a5e'],
];

let bar = null, orient = 'vertical';

(function injectStyles() {
  if (document.getElementById('ft-style')) return;
  const s = document.createElement('style');
  s.id = 'ft-style';
  s.textContent = `
    #float-toolbar { position: fixed; z-index: 55; display: none;
      background: #111122; border: 1px solid #7C3AED44; border-radius: 10px; padding: 6px;
      box-shadow: 0 8px 30px #0007; font-family: 'Inter', system-ui, sans-serif; }
    body.edit-mode #float-toolbar.on { display: block; }
    #float-toolbar .ft-head { height: 24px; display: flex; align-items: center; justify-content: space-between;
      gap: 6px; background: #7C3AED22; border-radius: 6px; margin-bottom: 6px; padding: 0 6px; cursor: grab; user-select: none; }
    #float-toolbar .ft-head.drag { cursor: grabbing; }
    #float-toolbar .ft-grip { color: #9a8fc0; font-size: 13px; letter-spacing: 1px; }
    #float-toolbar .ft-orient { color: #c8b8f0; font-size: 13px; background: none; border: none; cursor: pointer; padding: 0 2px; }
    #float-toolbar .ft-orient:hover { color: #fff; }
    #float-toolbar .ft-items { display: flex; gap: 4px; }
    #float-toolbar.vertical .ft-items { flex-direction: column; }
    #float-toolbar.horizontal .ft-items { flex-direction: row; }
    #float-toolbar .ft-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      font-size: 15px; background: #0a0a16; border: 1px solid transparent; border-radius: 6px; cursor: pointer; color: #e5e5f0; }
    #float-toolbar .ft-btn:hover { border-color: #7C3AED66; background: #15152a; }
    #float-toolbar .ft-btn.danger:hover { border-color: #E24B4A; background: #1f0a0a; }
    #float-toolbar .ft-sep { background: #7C3AED22; }
    #float-toolbar.vertical .ft-sep { height: 1px; margin: 3px 2px; }
    #float-toolbar.horizontal .ft-sep { width: 1px; margin: 2px 3px; }
    .ft-pop { position: fixed; z-index: 56; background: #15152a; border: 1px solid #7C3AED66;
      border-radius: 8px; padding: 8px; box-shadow: 0 8px 24px #0008; font-family: 'Inter', system-ui, sans-serif; }
    .ft-pop .ft-swatches { display: grid; grid-template-columns: repeat(4, 22px); gap: 6px; }
    .ft-pop .ft-sw { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
    .ft-pop .ft-sw:hover { border-color: #fff; }
    .ft-pop input[type=color] { width: 100%; height: 26px; margin-top: 6px; background: #0a0a16; border: 1px solid #7C3AED33; border-radius: 6px; cursor: pointer; }
    .ft-pop input[type=range] { width: 150px; accent-color: #7C3AED; }
    .ft-pop input[type=text] { width: 180px; padding: 6px 8px; font-size: 12px; color: #e5e5f0;
      background: #0a0a16; border: 1px solid #7C3AED33; border-radius: 6px; outline: none; box-sizing: border-box; margin-bottom: 6px; }
    .ft-pop button.ft-ok { width: 100%; padding: 6px; font-size: 12px; font-weight: 600; color: #fff; background: #7C3AED; border: none; border-radius: 6px; cursor: pointer; }`;
  document.head.appendChild(s);
})();

// Aktuálně vybraný uzel (jediný)
function sel() { return getState().map.nodes.find((n) => n.id === getState().selectedNodeId); }
function needSel() { const n = sel(); if (!n) toast('Vyber uzel', 'info'); return n; }

function closePops() { document.querySelectorAll('.ft-pop').forEach((p) => p.remove()); }

// Popover poblíž tlačítka
function popover(btn) {
  closePops();
  const pop = document.createElement('div'); pop.className = 'ft-pop';
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 220, r.right + 6) + 'px';
  pop.style.top = Math.min(window.innerHeight - 120, r.top) + 'px';
  setTimeout(() => {
    const off = (e) => { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
  }, 0);
  return pop;
}

// --- Akce ---
function actRename() { const n = needSel(); if (!n) return; panel.open(n); panel.focusName(); }

function actColor(btn, bulk) {
  const ids = bulk ? getSelectedNodeIds() : (sel() ? [sel().id] : []);
  if (!ids.length) { toast('Vyber uzel', 'info'); return; }
  const pop = popover(btn);
  const grid = document.createElement('div'); grid.className = 'ft-swatches';
  const apply = (hex) => {
    for (const id of ids) {
      const n = getState().map.nodes.find((x) => x.id === id);
      if (n) { n.color = 'custom'; n.customColor = { fill: hex + '22', stroke: hex, glow: hex }; }
    }
    nodes.renderAll(); pushHistory(); autoSave(); closePops();
  };
  for (const [, hex] of COLORS) { const sw = document.createElement('div'); sw.className = 'ft-sw'; sw.style.background = hex; sw.addEventListener('click', () => apply(hex)); grid.appendChild(sw); }
  pop.appendChild(grid);
  const picker = document.createElement('input'); picker.type = 'color'; picker.value = '#7c3aed';
  picker.addEventListener('input', () => apply(picker.value));
  pop.appendChild(picker);
}

function actOpacity(btn) {
  const n = needSel(); if (!n) return;
  const pop = popover(btn);
  const range = document.createElement('input'); range.type = 'range'; range.min = '20'; range.max = '100'; range.step = '5';
  range.value = String(Math.round((n.opacity == null ? 1 : n.opacity) * 100));
  range.addEventListener('input', () => { n.opacity = Number(range.value) / 100; nodes.refresh(n); });
  range.addEventListener('change', () => { pushHistory(); autoSave(); });
  pop.appendChild(range);
}

let fileInput = null;
function actImage() {
  const n = needSel(); if (!n) return;
  if (!fileInput) { fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); }
  fileInput.value = '';
  fileInput.onchange = () => {
    const f = fileInput.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('Obrázek je příliš velký (max 2 MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => { n.imageBase64 = reader.result; nodes.refresh(n); pushHistory(); autoSave(); };
    reader.readAsDataURL(f);
  };
  fileInput.click();
}

function actLink(btn) {
  const n = needSel(); if (!n) return;
  const pop = popover(btn);
  const label = document.createElement('input'); label.type = 'text'; label.placeholder = 'Popisek (volitelné)';
  const url = document.createElement('input'); url.type = 'text'; url.placeholder = 'https://…';
  const ok = document.createElement('button'); ok.className = 'ft-ok'; ok.textContent = 'Přidat odkaz';
  const add = () => {
    const u = url.value.trim(); if (!u) return;
    if (!Array.isArray(n.links)) n.links = [];
    n.links.push({ url: u, label: label.value.trim() });
    pushHistory(); autoSave(); closePops(); toast('Odkaz přidán', 'success');
  };
  ok.addEventListener('click', add);
  url.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
  label.addEventListener('keydown', (e) => e.stopPropagation());
  pop.appendChild(label); pop.appendChild(url); pop.appendChild(ok);
  setTimeout(() => url.focus(), 0);
}

function actLock() {
  const n = needSel(); if (!n) return;
  n.locked = !n.locked; nodes.refresh(n); pushHistory(); autoSave();
  toast(n.locked ? 'Uzel zamčen' : 'Uzel odemčen', 'info');
}
function actBookmark() { const n = needSel(); if (!n) return; nodes.toggleBookmark(n); }
function actTask() {
  const n = needSel(); if (!n) return;
  if (!n.task) n.task = { enabled: false, checked: false, priority: null, dueDate: null, progress: 0 };
  n.task.enabled = !n.task.enabled; nodes.refresh(n); pushHistory(); autoSave();
}
function actDelete() {
  const st = getState();
  if (st.selectedNodeIds.length >= 2 || st.selectedGroupIds.length) { deleteSelected(); return; }
  const n = sel(); if (!n) { toast('Vyber uzel', 'info'); return; }
  nodes.deleteNode(n);
}
function actDuplicate() { const n = needSel(); if (!n) return; nodes.duplicateBranch(n); }
function actGroup() { groups.groupSelected(); }

const ITEMS = [
  ['✏', 'Přejmenovat (F2)', actRename],
  ['🎨', 'Barva', (b) => actColor(b, false)],
  ['👁', 'Průhlednost', actOpacity],
  ['🖼', 'Přidat obrázek', actImage],
  ['🔗', 'Přidat odkaz', actLink],
  ['📌', 'Zamknout/odemknout', actLock],
  ['⭐', 'Záložka', actBookmark],
  ['☑', 'Task mode', actTask],
  ['🗑', 'Smazat vybrané', actDelete, 'danger'],
  ['sep'],
  ['🎨', 'Hromadná barva (vybrané)', (b) => actColor(b, true)],
  ['📋', 'Duplikovat (Ctrl+D)', actDuplicate],
  ['🔲', 'Seskupit (Ctrl+G)', actGroup],
];

function build() {
  if (bar) return;
  orient = localStorage.getItem(LS_ORIENT) || 'vertical';
  bar = document.createElement('div');
  bar.id = 'float-toolbar';
  bar.className = orient;
  const head = document.createElement('div'); head.className = 'ft-head';
  const grip = document.createElement('span'); grip.className = 'ft-grip'; grip.textContent = '⠿';
  const ori = document.createElement('button'); ori.className = 'ft-orient'; ori.title = 'Orientace'; ori.textContent = orient === 'vertical' ? '↔' : '↕';
  ori.addEventListener('click', toggleOrient);
  head.appendChild(grip); head.appendChild(ori);
  bar.appendChild(head);
  const items = document.createElement('div'); items.className = 'ft-items';
  for (const it of ITEMS) {
    if (it[0] === 'sep') { const sp = document.createElement('div'); sp.className = 'ft-sep'; items.appendChild(sp); continue; }
    const [icon, tip, fn, cls] = it;
    const b = document.createElement('button');
    b.className = 'ft-btn' + (cls ? ' ' + cls : '');
    b.textContent = icon; b.title = tip;
    b.addEventListener('click', () => fn(b));
    items.appendChild(b);
  }
  bar.appendChild(items);
  document.body.appendChild(bar);
  attachDrag(head);
  restorePos();
}

function toggleOrient() {
  orient = orient === 'vertical' ? 'horizontal' : 'vertical';
  localStorage.setItem(LS_ORIENT, orient);
  bar.className = orient + (bar.classList.contains('on') ? ' on' : '');
  bar.querySelector('.ft-orient').textContent = orient === 'vertical' ? '↔' : '↕';
}

// Výchozí pozice: pravý dolní roh nad zoom tlačítky
function restorePos() {
  const saved = localStorage.getItem(LS_POS);
  if (saved) {
    try { const p = JSON.parse(saved); bar.style.left = p.x + 'px'; bar.style.top = p.y + 'px'; return; } catch (e) {}
  }
  bar.style.left = (window.innerWidth - 120) + 'px';
  bar.style.top = (window.innerHeight - 180) + 'px';
}

function attachDrag(head) {
  head.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('ft-orient')) return;
    e.preventDefault();
    head.classList.add('drag');
    const r = bar.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev) => {
      const x = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, ev.clientX - ox));
      const y = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, ev.clientY - oy));
      bar.style.left = x + 'px'; bar.style.top = y + 'px';
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      head.classList.remove('drag');
      localStorage.setItem(LS_POS, JSON.stringify({ x: parseInt(bar.style.left, 10) || 0, y: parseInt(bar.style.top, 10) || 0 }));
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });
}

// Zobrazí / skryje panel (volá app.setEditMode)
export function setVisible(on) {
  if (on) { build(); bar.classList.add('on'); }
  else if (bar) { bar.classList.remove('on'); closePops(); }
}
