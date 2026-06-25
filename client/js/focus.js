// Focus mode — zvýrazní vybraný uzel, jeho přímé potomky a předky; ostatní ztlumí
import { getState, renderMap } from './app.js';
import { toast } from './toast.js';

let active = false;
let banner = null;

(function injectStyles() {
  if (document.getElementById('focus-style')) return;
  const s = document.createElement('style');
  s.id = 'focus-style';
  s.textContent = `
    #focus-banner {
      position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
      z-index: 60; background: #7C3AED; color: #fff;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px; font-weight: 600;
      padding: 6px 14px; border-radius: 999px; box-shadow: 0 4px 16px #0007;
      pointer-events: none;
    }`;
  document.head.appendChild(s);
})();

export function isActive() { return active; }

// Množina id uzlů ve focusu: vybraný + předci (cesta ke kořeni) + přímí potomci
function focusedSet(sel) {
  const nodes = getState().map.nodes;
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const set = new Set([sel]);
  let p = byId[sel] ? byId[sel].parentId : null;
  while (p && byId[p]) { set.add(p); p = byId[p].parentId; }
  nodes.forEach((n) => { if (n.parentId === sel) set.add(n.id); });
  return set;
}

// Aplikuje ztlumení na vykreslené uzly (volá se i z renderMap, aby přežilo přerender)
export function apply() {
  if (!active) return;
  const sel = getState().selectedNodeId;
  if (!sel) { exit(); return; }  // ztráta výběru (smazání/undo) → ukonči focus, ať nezůstane banner
  const focused = focusedSet(sel);
  document.querySelectorAll('#nodes-layer [data-id]').forEach((g) => {
    const on = focused.has(g.getAttribute('data-id'));
    g.style.opacity = on ? '1' : '0.08';
    g.style.pointerEvents = on ? '' : 'none';
  });
  const edges = document.getElementById('edges-layer');
  const groups = document.getElementById('groups-layer');
  if (edges) edges.style.opacity = '0.15';
  if (groups) groups.style.opacity = '0.15';
}

function enter() {
  if (active) return;
  if (!getState().selectedNodeId) { toast('Vyber uzel pro focus mode', 'info'); return; }
  active = true;
  banner = document.createElement('div');
  banner.id = 'focus-banner';
  banner.textContent = 'Focus mode — Escape pro ukončení';
  document.getElementById('canvas-wrap').appendChild(banner);
  document.getElementById('focus-btn')?.classList.add('active');
  apply();
}

export function exit() {
  if (!active) return;
  active = false;
  if (banner) { banner.remove(); banner = null; }
  document.getElementById('focus-btn')?.classList.remove('active');
  renderMap();  // přerender obnoví původní opacity uzlů i vrstev
}

export function toggle() { active ? exit() : enter(); }
