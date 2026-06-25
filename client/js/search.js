// Fulltext hledání v uzlech — overlay nad canvasem, živé filtrování, navigace
import { getState, panToNode } from './app.js';
import * as nodes from './nodes.js';

let overlay = null, input = null, countEl = null;
let matches = [];
let navIdx = -1;
let open = false;

// --- Injekce stylů (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('search-style')) return;
  const s = document.createElement('style');
  s.id = 'search-style';
  s.textContent = `
    #search-overlay {
      position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 80; display: none; align-items: center; gap: 10px;
      padding: 8px 12px; background: #111122; border: 1px solid #7C3AED66;
      border-radius: 10px; box-shadow: 0 6px 24px #0008;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #search-overlay.open { display: flex; }
    #search-overlay input {
      width: 240px; padding: 6px 9px; font-family: inherit; font-size: 13px;
      color: #e5e5f0; background: #0a0a16; border: 1px solid #7C3AED33;
      border-radius: 6px; outline: none;
    }
    #search-overlay input:focus { border-color: #7C3AED; }
    #search-overlay .s-count {
      font-size: 12px; color: #9a9ab0; min-width: 56px; text-align: right;
    }`;
  document.head.appendChild(s);
})();

// Sestaví overlay jednou a vloží do canvas-wrapu
function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'search-overlay';
  input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Hledat v uzlech...';
  countEl = document.createElement('span');
  countEl.className = 's-count';
  overlay.appendChild(input);
  overlay.appendChild(countEl);
  document.getElementById('canvas-wrap').appendChild(overlay);

  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!matches.length) return;
      // Enter → první výsledek, Ctrl+Enter → další v pořadí
      navIdx = (e.ctrlKey || e.metaKey) ? (navIdx + 1) % matches.length : 0;
      panToNode(matches[navIdx]);
    }
  });
}

// Obnoví neutrální vzhled všech uzlů (zruší ztmavení i zlatý okraj)
function reset() { nodes.renderAll(); }

// Živé filtrování podle dotazu
function runSearch(q) {
  const query = q.trim().toLowerCase();
  const lyr = document.getElementById('nodes-layer');
  matches = [];
  navIdx = -1;

  if (!query) {
    reset();
    countEl.textContent = '';
    return;
  }

  for (const n of getState().map.nodes) {
    // Prohledává label, poznámku a tagy
    const hay = `${n.label} ${n.note || ''} ${(n.tags || []).join(' ')}`.toLowerCase();
    const hit = hay.includes(query);
    if (hit) matches.push(n);

    const g = lyr.querySelector(`[data-id="${n.id}"]`);
    if (!g) continue;
    g.style.opacity = hit ? '1' : '0.15';
    if (hit) {
      const rect = g.querySelector('rect');
      if (rect) {
        rect.setAttribute('stroke', '#F59E0B');  // zlatý okraj na shodě
        rect.setAttribute('stroke-width', 2);
      }
    }
  }
  countEl.textContent = `${matches.length} uzlů`;
}

// Klik mimo overlay zavře hledání
function onDocDown(e) {
  if (overlay && !overlay.contains(e.target)) closeSearch();
}

export function openSearch() {
  build();
  open = true;
  overlay.classList.add('open');
  input.value = '';
  runSearch('');
  input.focus();
  document.addEventListener('mousedown', onDocDown, true);
}

export function closeSearch() {
  if (!open) return;
  open = false;
  overlay.classList.remove('open');
  reset();
  document.removeEventListener('mousedown', onDocDown, true);
}
