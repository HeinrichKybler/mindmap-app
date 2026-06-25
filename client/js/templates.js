// Šablony nových map — modal s výběrem + stavba stromu uzlů
import { makeNode } from './nodes.js';
import { applyLayout } from './layout.js';

// Stromové specifikace šablon (label + color + children)
const TEMPLATES = {
  empty: { label: 'Prázdná', tree: null },
  projekt: {
    label: 'Projekt',
    tree: {
      label: 'Projekt', color: 'purple', children: [
        { label: 'Fáze 1', color: 'green', children: [
          { label: 'Úkol 1', color: 'neutral' },
          { label: 'Úkol 2', color: 'neutral' },
        ] },
        { label: 'Fáze 2', color: 'green' },
        { label: 'Poznámky', color: 'amber' },
      ],
    },
  },
  brainstorming: {
    label: 'Brainstorming',
    tree: {
      label: 'Téma', color: 'purple', children: [
        { label: 'Nápad 1', color: 'neutral' },
        { label: 'Nápad 2', color: 'neutral' },
        { label: 'Nápad 3', color: 'neutral' },
        { label: 'Nápad 4', color: 'neutral' },
      ],
    },
  },
  swot: {
    label: 'SWOT',
    tree: {
      label: 'SWOT', color: 'neutral', children: [
        { label: 'Silné stránky', color: 'green' },
        { label: 'Slabé stránky', color: 'red' },
        { label: 'Příležitosti', color: 'amber' },
        { label: 'Hrozby', color: 'red' },
      ],
    },
  },
  livia: {
    label: 'Lívia arch.',
    tree: {
      label: 'Lívia', color: 'purple', children: [
        { label: 'Brain / Routing', color: 'purple', children: [
          { label: 'ITaskExecutor', color: 'neutral' },
        ] },
        { label: 'TTS — XTTS v2', color: 'green' },
        { label: 'STT — Whisper', color: 'green' },
        { label: 'Wake Word — OpenWakeWord', color: 'amber' },
        { label: 'API moduly', color: 'purple', children: [
          { label: 'REST endpoint', color: 'neutral' },
          { label: 'Lívia integrace', color: 'neutral' },
        ] },
      ],
    },
  },
};

const ORDER = ['empty', 'projekt', 'brainstorming', 'swot', 'livia'];

(function injectStyles() {
  if (document.getElementById('templates-style')) return;
  const s = document.createElement('style');
  s.id = 'templates-style';
  s.textContent = `
    #tpl-overlay {
      position: fixed; inset: 0; z-index: 500; background: #000000cc;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #tpl-modal {
      background: #15152a; border: 1px solid #7C3AED44; border-radius: 12px;
      padding: 24px 28px; box-shadow: 0 20px 60px #000a; width: 560px; max-width: 92vw;
    }
    #tpl-modal h2 { color: #7C3AED; font-size: 16px; margin-bottom: 16px; font-weight: 700; }
    #tpl-modal .tpl-name {
      width: 100%; padding: 9px 11px; font-family: inherit; font-size: 14px; margin-bottom: 18px;
      color: #e5e5f0; background: #0a0a16; border: 1px solid #7C3AED33; border-radius: 8px; outline: none; box-sizing: border-box;
    }
    #tpl-modal .tpl-name:focus { border-color: #7C3AED; }
    #tpl-modal .tpl-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    #tpl-modal .tpl-btn {
      flex: 1 1 150px; min-height: 64px; cursor: pointer;
      font-family: inherit; font-size: 14px; font-weight: 600; color: #e5e5f0;
      background: #1a1a2e; border: 1px solid #7C3AED33; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      transition: background .15s, border-color .15s;
    }
    #tpl-modal .tpl-btn:hover { background: #23234a; border-color: #7C3AED; }`;
  document.head.appendChild(s);
})();

// Sestaví { nodes, edges, groups } pro danou šablonu (s pozicemi z auto-layoutu)
export function buildTemplate(key) {
  const spec = TEMPLATES[key];
  if (!spec || !spec.tree) return { nodes: [], edges: [], groups: [] };
  const nodes = [];
  const edges = [];
  const walk = (node, parentId) => {
    const n = makeNode({ parentId, label: node.label, color: node.color || 'neutral' });
    nodes.push(n);
    if (parentId) edges.push({ id: crypto.randomUUID(), fromId: parentId, toId: n.id, label: '' });
    (node.children || []).forEach((c) => walk(c, n.id));
    return n;
  };
  walk(spec.tree, null);
  applyLayout(nodes);
  return { nodes, edges, groups: [] };
}

// Otevře modal výběru šablony. onConfirm(name, templateKey) se volá po výběru.
export function openModal(onConfirm) {
  const overlay = document.createElement('div');
  overlay.id = 'tpl-overlay';
  const modal = document.createElement('div');
  modal.id = 'tpl-modal';
  modal.innerHTML = `
    <h2>Nová mapa</h2>
    <input class="tpl-name" placeholder="Název mapy…">
    <div class="tpl-grid">
      ${ORDER.map((k) => `<button class="tpl-btn" data-key="${k}">${TEMPLATES[k].label}</button>`).join('')}
    </div>`;
  function close() { document.removeEventListener('keydown', onKey); overlay.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  const nameInput = modal.querySelector('.tpl-name');

  modal.querySelectorAll('.tpl-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const name = nameInput.value.trim() || (key === 'empty' ? 'Nová mapa' : TEMPLATES[key].label);
      close();
      onConfirm(name, key);
    });
  });

  modal.addEventListener('mousedown', (e) => e.stopPropagation());
  overlay.addEventListener('mousedown', close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);  // Escape funguje bez ohledu na fokus
  nameInput.focus();
}
