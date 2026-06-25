// Statistiky aktuální mapy — sbalitelný panel pod seznamem map v sidebaru.
// Aktualizuje se při každém autoSave a při přepnutí mapy.
import { getState } from './app.js';

let collapsed = false;

(function injectStyles() {
  if (document.getElementById('stats-style')) return;
  const s = document.createElement('style');
  s.id = 'stats-style';
  s.textContent = `
    #stats-panel {
      margin-top: 14px; padding: 10px 8px 4px; border-top: 1px solid #7C3AED22;
      font-size: 11px; color: #9a9ab0; user-select: none;
    }
    #stats-panel .stats-head {
      display: flex; justify-content: space-between; align-items: center;
      color: #7C3AED; font-weight: 600; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;
    }
    #stats-panel .stats-body { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; line-height: 1.4; }
    #stats-panel .stats-tags { word-break: break-word; }`;
  document.head.appendChild(s);
})();

// Spočítá statistiky z aktuální mapy
function compute() {
  const map = getState().map || {};
  const nodes = map.nodes || [];
  const groups = map.groups || [];

  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  let maxDepth = 0;
  for (const n of nodes) {
    let d = 1, p = n.parentId ? byId[n.parentId] : null;
    while (p) { d++; p = p.parentId ? byId[p.parentId] : null; }
    if (d > maxDepth) maxDepth = d;
  }

  const tagCounts = {};
  for (const n of nodes) for (const t of (n.tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const bookmarks = nodes.filter((n) => n.bookmarked).length;
  const taskNodes = nodes.filter((n) => n.task && n.task.enabled);
  const doneTasks = taskNodes.filter((n) => n.task.checked).length;

  return { nodes: nodes.length, depth: nodes.length ? maxDepth : 0, groups: groups.length, topTags, bookmarks, tasks: taskNodes.length, done: doneTasks };
}

// Překreslí panel (textContent, ať se názvy tagů neinterpretují jako HTML)
export function update() {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;
  const s = compute();
  panel.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'stats-head';
  head.appendChild(document.createTextNode('📊 Aktuální mapa'));
  const tog = document.createElement('span');
  tog.textContent = collapsed ? '▸' : '▾';
  head.appendChild(tog);
  head.addEventListener('click', () => { collapsed = !collapsed; update(); });
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'stats-body';
  body.style.display = collapsed ? 'none' : 'block';

  const l1 = document.createElement('div');
  l1.textContent = `Uzly: ${s.nodes} | Hloubka: ${s.depth} | Skupiny: ${s.groups}`;
  const l2 = document.createElement('div');
  l2.className = 'stats-tags';
  l2.textContent = 'Tagy: ' + (s.topTags.length ? s.topTags.map(([t, c]) => `#${t} (${c})`).join(' ') : '—');
  const l3 = document.createElement('div');
  l3.textContent = `Záložky: ${s.bookmarks} | Tasky: ${s.done}/${s.tasks}${s.tasks ? ' ✓' : ''}`;
  body.append(l1, l2, l3);
  panel.appendChild(body);
}
