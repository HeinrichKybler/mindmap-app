// Tag sidebar — místo seznamu map zobrazí uzly s vybraným tagem
import { getState, nodeColors, panToNode, highlightNode } from './app.js';
import * as sidebar from './sidebar.js';

let activeTag = null;

// --- Injekce stylů (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('tags-style')) return;
  const s = document.createElement('style');
  s.id = 'tags-style';
  s.textContent = `
    .tv-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .tv-title { font-size: 15px; font-weight: 600; color: #F59E0B; }
    .tv-back {
      background: none; border: none; color: #9a9ab0; font-size: 18px;
      cursor: pointer; line-height: 1; padding: 0 4px;
    }
    .tv-back:hover { color: #e5e5f0; }
    .tv-row {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      border-radius: 6px; cursor: pointer; color: #e5e5f0; font-size: 13px;
    }
    .tv-row:hover { background: #1d1d3a; }
    .tv-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
    .tv-empty { color: #9a9ab0; font-size: 13px; padding: 8px 10px; }`;
  document.head.appendChild(s);
})();

// Přepne obsah sidebaru na seznam uzlů s daným tagem
export function openTagView(tag) {
  activeTag = tag;
  const el = document.getElementById('sidebar');
  el.innerHTML = '';

  // Nadpis #tag + tlačítko zpět
  const head = document.createElement('div');
  head.className = 'tv-head';
  const title = document.createElement('span');
  title.className = 'tv-title';
  title.textContent = '#' + tag;
  const back = document.createElement('button');
  back.className = 'tv-back';
  back.textContent = '×';
  back.title = 'Zpět na mapy';
  back.addEventListener('click', closeTagView);
  head.appendChild(title);
  head.appendChild(back);
  el.appendChild(head);

  const matched = getState().map.nodes.filter((n) => (n.tags || []).includes(tag));
  if (!matched.length) {
    const empty = document.createElement('div');
    empty.className = 'tv-empty';
    empty.textContent = 'Žádné uzly s tímto tagem';
    el.appendChild(empty);
    return;
  }

  // Řádek uzlu: barevná tečka + label, klik = pan + zvýraznění
  for (const n of matched) {
    const row = document.createElement('div');
    row.className = 'tv-row';
    const dot = document.createElement('span');
    dot.className = 'tv-dot';
    const c = nodeColors(n);
    dot.style.background = c.stroke;
    const label = document.createElement('span');
    label.textContent = n.label || '(bez názvu)';
    row.appendChild(dot);
    row.appendChild(label);
    row.addEventListener('click', () => {
      panToNode(n);
      highlightNode(n);
    });
    el.appendChild(row);
  }
}

// Obnoví standardní sidebar se seznamem map
export function closeTagView() {
  activeTag = null;
  sidebar.refresh();
}
