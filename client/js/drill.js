// Drill down — zobrazí jen vybranou větev jako "kořen"; breadcrumb navigace nahoře
import { getState, renderMap } from './app.js';

let stack = [];  // pole id uzlů, do kterých se postupně ponořilo
let bar = null;

(function injectStyles() {
  if (document.getElementById('drill-style')) return;
  const s = document.createElement('style');
  s.id = 'drill-style';
  s.textContent = `
    #breadcrumb {
      position: absolute; top: 0; left: 0; right: 0; z-index: 40;
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      padding: 6px 12px; background: #111122ee; border-bottom: 1px solid #7C3AED33;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px; color: #9a9ab0;
      user-select: none;
    }
    #breadcrumb .bc-item { cursor: pointer; color: #c8c8da; padding: 2px 4px; border-radius: 4px; }
    #breadcrumb .bc-item:hover { background: #7C3AED22; color: #fff; }
    #breadcrumb .bc-item.bc-current { color: #7C3AED; font-weight: 600; cursor: default; }
    #breadcrumb .bc-sep { color: #5a5a72; }`;
  document.head.appendChild(s);
})();

export function isActive() { return stack.length > 0; }

// Vrátí Set viditelných id uzlů (kořen drilldownu + jeho potomci), nebo null = vše viditelné
export function inViewSet() {
  if (!stack.length) return null;
  const rootId = stack[stack.length - 1];
  const nodes = getState().map.nodes;
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const set = new Set();
  for (const n of nodes) {
    let p = n;
    const seen = new Set();  // ochrana proti cyklu v parentId (poškozená data)
    while (p && !seen.has(p.id)) { seen.add(p.id); if (p.id === rootId) { set.add(n.id); break; } p = p.parentId ? byId[p.parentId] : null; }
  }
  return set;
}

function label(id) {
  const n = getState().map.nodes.find((x) => x.id === id);
  return n ? (n.label || '(bez názvu)') : '?';
}

function updateBreadcrumb() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  if (!stack.length) { if (bar) { bar.remove(); bar = null; } return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'breadcrumb'; wrap.appendChild(bar); }
  bar.innerHTML = '';
  // "Hlavní mapa" = výstup z drill downu
  const home = document.createElement('span');
  home.className = 'bc-item';
  home.textContent = 'Hlavní mapa';
  home.addEventListener('click', () => exit());
  bar.appendChild(home);
  stack.forEach((id, i) => {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.textContent = '›';
    bar.appendChild(sep);
    const item = document.createElement('span');
    item.className = 'bc-item' + (i === stack.length - 1 ? ' bc-current' : '');
    item.textContent = label(id);
    if (i < stack.length - 1) item.addEventListener('click', () => drillTo(i));
    bar.appendChild(item);
  });
}

// Ponoř se do větve uzlu
export function drillInto(node) {
  stack.push(node.id);
  getState().selectedNodeId = null;
  renderMap();
  updateBreadcrumb();
}

// Vrať se na danou úroveň breadcrumbu (index v zásobníku)
function drillTo(index) {
  stack = stack.slice(0, index + 1);
  renderMap();
  updateBreadcrumb();
}

// Výstup o úroveň výš (Escape)
export function pop() {
  if (!stack.length) return;
  stack.pop();
  renderMap();
  updateBreadcrumb();
}

// Úplný výstup z drill downu
export function exit() {
  if (!stack.length) return;
  stack = [];
  renderMap();
  updateBreadcrumb();
}

// Po smazání uzlů vyřaď smazaná id ze zásobníku (volající překreslí mapu).
// Pokud se smaže kořen drilldownu, spadne na nejbližší žijící úroveň (nebo se ukončí).
export function pruneRemoved(removedIds) {
  if (!stack.length) return;
  const next = stack.filter((id) => !removedIds.has(id));
  if (next.length !== stack.length) { stack = next; updateBreadcrumb(); }
}
