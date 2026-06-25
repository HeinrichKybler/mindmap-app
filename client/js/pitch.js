// Pitch mode — prezentační fullscreen overlay, uzly procházené v DFS pořadí
import { getState } from './app.js';
import { toast } from './toast.js';

let active = false;
let slides = [];
let idx = 0;
let overlay = null;

(function injectStyles() {
  if (document.getElementById('pitch-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-style';
  s.textContent = `
    #pitch-overlay {
      position: fixed; inset: 0; z-index: 600; background: #0d0d1a;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif; cursor: pointer; user-select: none;
    }
    #pitch-slide { max-width: 70%; text-align: center; }
    #pitch-slide .pitch-icon { font-size: 56px; margin-bottom: 16px; }
    #pitch-slide .pitch-label { font-size: 32px; font-weight: 700; color: #e5e5f0; line-height: 1.3; }
    #pitch-slide .pitch-note { font-size: 16px; color: #9a9ab0; margin-top: 18px; white-space: pre-wrap; line-height: 1.5; }
    #pitch-counter { position: fixed; bottom: 18px; right: 22px; font-size: 14px; color: #7C3AED; font-weight: 600; }
    #pitch-arrows { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; }
    #pitch-arrows .pitch-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #3a3a5e; cursor: pointer; transition: background .15s;
    }
    #pitch-arrows .pitch-dot.on { background: #7C3AED; }
    #pitch-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); font-size: 12px; color: #5a5a72; }`;
  document.head.appendChild(s);
})();

export function isActive() { return active; }

// DFS preorder od kořenů (stejné pořadí jako auto-layout)
function dfsOrder() {
  const nodes = getState().map.nodes;
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const children = {};
  nodes.forEach((n) => { children[n.id] = []; });
  const roots = [];
  for (const n of nodes) {
    if (n.parentId == null || !byId[n.parentId]) roots.push(n);
    else children[n.parentId].push(n);
  }
  const order = [];
  const visit = (n) => { order.push(n); children[n.id].forEach(visit); };
  roots.forEach(visit);
  return order;
}

function render() {
  const n = slides[idx];
  if (!n) return;
  const dots = slides.map((_, i) => `<div class="pitch-dot${i === idx ? ' on' : ''}" data-i="${i}"></div>`).join('');
  overlay.innerHTML = `
    <div id="pitch-hint">← → nebo klik · Escape ukončí</div>
    <div id="pitch-slide">
      ${n.icon ? '<div class="pitch-icon"></div>' : ''}
      <div class="pitch-label"></div>
      ${n.note ? '<div class="pitch-note"></div>' : ''}
    </div>
    <div id="pitch-counter">${idx + 1} / ${slides.length}</div>
    <div id="pitch-arrows">${dots}</div>`;
  // textContent (ne innerHTML), aby se neinterpretoval uživatelský obsah (label/note/icon) jako HTML
  overlay.querySelector('.pitch-label').textContent = n.label || '(bez názvu)';
  const note = overlay.querySelector('.pitch-note');
  if (note) note.textContent = n.note;
  const ic = overlay.querySelector('.pitch-icon');
  if (ic) ic.textContent = n.icon;
  overlay.querySelectorAll('.pitch-dot').forEach((d) =>
    d.addEventListener('click', (e) => { e.stopPropagation(); go(Number(d.dataset.i)); }));
}

function go(i) {
  idx = Math.max(0, Math.min(slides.length - 1, i));
  render();
}

function onKey(e) {
  if (!active) return;
  // stopPropagation, ať app.js bubble handler znovu nezpracuje Escape (a nezruší výběr/panel)
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exit(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(idx + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(idx - 1); }
}

function enter() {
  slides = dfsOrder();
  if (!slides.length) { toast('Mapa je prázdná', 'info'); return; }
  active = true;
  idx = 0;
  overlay = document.createElement('div');
  overlay.id = 'pitch-overlay';
  overlay.addEventListener('click', () => go(idx + 1));  // klik = další
  document.body.appendChild(overlay);
  window.addEventListener('keydown', onKey, true);
  render();
}

export function exit() {
  if (!active) return;
  active = false;
  window.removeEventListener('keydown', onKey, true);
  if (overlay) { overlay.remove(); overlay = null; }
}

export function toggle() { active ? exit() : enter(); }
