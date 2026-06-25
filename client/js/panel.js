// Pravý detail panel uzlu — název, barva, tagy, poznámka, obrázek, GitHub, akce
import { getState, NODE_COLORS, autoSave, pushHistory, renderMap, syncSubmapName } from './app.js';
import * as nodes from './nodes.js';
import * as edges from './edges.js';
import * as canvas from './canvas.js';
import * as groups from './groups.js';
import * as tags from './tags.js';
import * as timeline from './timeline.js';
import { api } from './api.js';
import { toast } from './export.js';

// Pevná paleta vlastních barev uzlu
const SWATCHES = ['#7C3AED', '#059669', '#3B82F6', '#06B6D4', '#F97316', '#E24B4A', '#F59E0B', '#3a3a5e'];

// Nejpoužívanější emoji (grid 5×4)
const EMOJI = ['📌', '🔥', '⚡', '💡', '🎯', '🔧', '🐛', '✅', '❌', '⚠️', '🟣', '🟢', '🔵', '🟡', '🔴', '📝', '🖼️', '🔗', '📊', '🎮'];
const BORDERS = ['solid', 'dashed', 'dotted', 'double'];
const PRIOS = [['high', '🔴'], ['medium', '🟡'], ['low', '🟢']];

// Tvary uzlu — mini SVG náhledy (sekce 9)
const NODE_SHAPES = [
  ['rectangle', '<rect x="3" y="5" width="38" height="14" rx="3"/>'],
  ['rounded', '<rect x="3" y="5" width="38" height="14" rx="7"/>'],
  ['ellipse', '<ellipse cx="22" cy="12" rx="19" ry="8"/>'],
  ['diamond', '<polygon points="22,3 41,12 22,21 3,12"/>'],
  ['hexagon', '<polygon points="11,4 33,4 41,12 33,20 11,20 3,12"/>'],
  ['cloud', '<path d="M14,18 C7,18 7,11 13,11 C12,5 22,4 23,9 C27,4 35,7 31,12 C36,12 35,18 29,18 Z"/>'],
];

// Barvy sticky komentářů (sekce 7)
const COMMENT_COLORS = ['#F59E0B', '#3B82F6', '#059669', '#E24B4A'];
let commentColor = COMMENT_COLORS[0];

// Tvary skupin — mini SVG náhledy (sekce 4)
const GROUP_SHAPES = [
  ['rectangle', '<rect x="3" y="5" width="38" height="14" rx="3"/>'],
  ['ellipse', '<ellipse cx="22" cy="12" rx="19" ry="8"/>'],
  ['diamond', '<polygon points="22,3 41,12 22,21 3,12"/>'],
  ['hexagon', '<polygon points="11,4 33,4 41,12 33,20 11,20 3,12"/>'],
  ['cloud', '<path d="M14,18 C7,18 7,11 13,11 C12,5 22,4 23,9 C27,4 35,7 31,12 C36,12 35,18 29,18 Z"/>'],
  ['custom', '<path d="M5,16 Q12,4 20,12 T38,8"/>'],
];

let current = null;      // aktuálně editovaný uzel
let currentEdge = null;  // aktuálně editovaná hrana
let currentGroup = null; // aktuálně editovaná skupina
let root = null;        // kořenový DOM panelu
let refs = {};          // reference na vstupní prvky
let noteTimer = null;

// --- Injekce stylů panelu (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('panel-style')) return;
  const s = document.createElement('style');
  s.id = 'panel-style';
  s.textContent = `
    #node-panel {
      position: absolute; top: 0; right: 0; bottom: 0; width: 260px;
      background: #111122; border-left: 1px solid #7C3AED22;
      padding: 16px; overflow-y: auto; z-index: 50;
      font-family: 'Inter', system-ui, sans-serif; color: #e5e5f0;
      display: none;
    }
    #node-panel.open { display: block; }
    #node-panel .p-section { margin-bottom: 16px; }
    #node-panel .p-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
      color: #7C3AED; font-weight: 600; margin-bottom: 6px; display: block;
    }
    #node-panel input[type=text], #node-panel input[type=url],
    #node-panel input[type=date], #node-panel textarea {
      width: 100%; padding: 7px 9px; font-family: inherit; font-size: 13px;
      color: #e5e5f0; background: #0a0a16; border: 1px solid #7C3AED33;
      border-radius: 6px; outline: none; box-sizing: border-box; resize: vertical;
    }
    #node-panel input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
    #node-panel input:focus, #node-panel textarea:focus { border-color: #7C3AED; }
    #node-panel .p-colors { display: flex; flex-wrap: wrap; gap: 8px; }
    #node-panel .p-color {
      width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
      border: 2px solid transparent; box-sizing: border-box;
    }
    #node-panel .p-color.sel { border-color: #fff; }
    #node-panel .p-color-custom {
      display: flex; align-items: center; gap: 8px; margin-top: 10px;
    }
    #node-panel .p-color-custom input[type=color] {
      width: 36px; height: 28px; flex: 0 0 auto; padding: 2px;
      background: #0a0a16; border: 1px solid #7C3AED33; border-radius: 6px; cursor: pointer;
    }
    #node-panel .p-color-custom input[type=text] { flex: 1 1 auto; }
    #node-panel .p-icons { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    #node-panel .p-icon {
      height: 30px; display: flex; align-items: center; justify-content: center;
      font-size: 17px; cursor: pointer; border-radius: 6px;
      border: 1px solid transparent; background: #0a0a16;
    }
    #node-panel .p-icon:hover { border-color: #7C3AED66; }
    #node-panel .p-icon.sel { border-color: #fff; }
    #node-panel .p-styles { display: flex; gap: 8px; }
    #node-panel .p-style {
      flex: 1 1 auto; height: 30px; cursor: pointer; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #7C3AED22; background: #0a0a16;
    }
    #node-panel .p-style:hover { border-color: #7C3AED66; }
    #node-panel .p-style.sel { border-color: #fff; }
    #node-panel .p-shapes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    #node-panel .p-shape { height: 32px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; border-radius: 6px; border: 1px solid #7C3AED22; background: #0a0a16; }
    #node-panel .p-shape:hover { border-color: #7C3AED66; }
    #node-panel .p-shape.sel { border-color: #fff; }
    #node-panel .p-links { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
    #node-panel .p-link-row { display: flex; gap: 4px; align-items: center; }
    #node-panel .p-link-row input { flex: 1 1 auto; padding: 5px 7px; font-size: 12px; min-width: 0; }
    #node-panel .p-link-row .p-link-label { flex: 0 0 64px; }
    #node-panel .p-link-row button { flex: 0 0 auto; width: 22px; height: 22px; color: #E24B4A;
      background: transparent; border: none; cursor: pointer; font-size: 14px; }
    #node-panel .p-comment-colors { display: flex; gap: 8px; margin: 6px 0; }
    #node-panel .p-cc { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; box-sizing: border-box; }
    #node-panel .p-cc.sel { border-color: #fff; }
    #node-panel .p-comments { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    #node-panel .p-comment { display: flex; gap: 8px; padding: 7px 9px; border-radius: 6px; font-size: 12px;
      background: #0a0a16; border-left: 3px solid #888; align-items: flex-start; }
    #node-panel .p-comment .p-comment-text { flex: 1 1 auto; word-break: break-word; color: #d8d8e8; }
    #node-panel .p-comment button { flex: 0 0 auto; background: transparent; border: none; cursor: pointer; color: #9a9ab0; font-weight: 700; }
    #node-panel .p-comment button:hover { color: #E24B4A; }
    #node-panel input[type=range] { width: 100%; accent-color: #7C3AED; cursor: pointer; }
    #node-panel .p-check { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    #node-panel .p-check input { accent-color: #7C3AED; cursor: pointer; }
    #node-panel .p-task-prio { display: flex; gap: 12px; margin: 10px 0; }
    #node-panel .p-prio {
      font-size: 18px; cursor: pointer; opacity: 0.4; transition: opacity .12s;
      filter: grayscale(0.4);
    }
    #node-panel .p-prio:hover { opacity: 0.8; }
    #node-panel .p-prio.sel { opacity: 1; filter: none; transform: scale(1.15); }
    #node-panel .p-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    #node-panel .p-tag {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
      font-size: 12px; background: #7C3AED22; border: 1px solid #7C3AED44;
      border-radius: 999px; color: #e5e5f0;
    }
    #node-panel .p-tag span { cursor: pointer; color: #9a9ab0; font-weight: 700; }
    #node-panel .p-tag span:hover { color: #E24B4A; }
    #node-panel .p-img-preview {
      width: 60px; height: 60px; object-fit: cover; border-radius: 6px;
      cursor: pointer; display: block; margin-top: 8px; border: 1px solid #7C3AED33;
    }
    #node-panel .p-warn { color: #E24B4A; font-size: 12px; margin-top: 6px; }
    #node-panel .p-btn {
      width: 100%; height: 32px; font-family: inherit; font-size: 13px; font-weight: 500;
      border-radius: 6px; cursor: pointer; margin-top: 8px;
      color: #e5e5f0; background: #15152a; border: 1px solid #7C3AED33;
    }
    #node-panel .p-btn:hover { background: #1d1d3a; border-color: #7C3AED66; }
    #node-panel .p-btn.add { color: #7C3AED; border-color: #7C3AED; }
    #node-panel .p-btn.danger { color: #E24B4A; border-color: #E24B4A44; }
    #node-panel .p-btn.danger:hover { background: #1f0a0a; }
    #node-panel .p-file { display: none; }
    .p-img-overlay {
      position: fixed; inset: 0; z-index: 200; background: #000000ee;
      display: flex; align-items: center; justify-content: center; cursor: zoom-out;
    }
    .p-img-overlay img { max-width: 90%; max-height: 90%; border-radius: 8px; }
    #save-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
      align-self: center; margin-right: 4px; opacity: 0; transition: opacity .2s;
    }
    #save-dot.on { opacity: 1; }`;
  document.head.appendChild(s);
})();

// Sestaví kostru panelu jednou a vloží do canvas-wrapu
function build() {
  if (root) return;
  root = document.createElement('aside');
  root.id = 'node-panel';
  root.innerHTML = `
    <div data-r="nodeBody">
    <div class="p-section">
      <label class="p-label">Název</label>
      <input type="text" data-r="name">
    </div>
    <div class="p-section">
      <label class="p-label">Barva</label>
      <div class="p-colors" data-r="colors"></div>
      <div class="p-color-custom">
        <input type="color" data-r="colorPicker" title="Vlastní barva">
        <input type="text" data-r="colorHex" maxlength="7" placeholder="#7C3AED">
      </div>
    </div>
    <div class="p-section">
      <label class="p-label">Ikona</label>
      <div class="p-icons" data-r="icons"></div>
      <button class="p-btn" data-r="iconClear">× Odebrat ikonu</button>
    </div>
    <div class="p-section">
      <label class="p-label">Styl hranice</label>
      <div class="p-styles" data-r="styles"></div>
    </div>
    <div class="p-section">
      <label class="p-label">Tvar uzlu</label>
      <div class="p-shapes" data-r="shapes"></div>
    </div>
    <div class="p-section">
      <label class="p-label">Průhlednost <span data-r="opacityVal"></span></label>
      <input type="range" min="20" max="100" step="5" data-r="opacity">
    </div>
    <div class="p-section">
      <label class="p-label">Tagy</label>
      <div class="p-tags" data-r="tags"></div>
      <input type="text" data-r="tagInput" placeholder="Přidat tag + Enter">
    </div>
    <div class="p-section">
      <label class="p-label">Poznámka</label>
      <textarea rows="4" data-r="note"></textarea>
    </div>
    <div class="p-section">
      <label class="p-label">Obrázek</label>
      <button class="p-btn" data-r="imgBtn">Nahrát obrázek</button>
      <input type="file" accept="image/*" class="p-file" data-r="file">
      <img class="p-img-preview" data-r="preview" style="display:none">
      <div class="p-warn" data-r="warn" style="display:none">Obrázek je příliš velký (max 2 MB)</div>
    </div>
    <div class="p-section">
      <label class="p-label">Odkazy</label>
      <input type="url" data-r="github" placeholder="GitHub: https://github.com/...">
      <div class="p-links" data-r="links"></div>
      <button class="p-btn add" data-r="addLink">+ Přidat odkaz</button>
    </div>
    <div class="p-section">
      <label class="p-label">Datum</label>
      <input type="date" data-r="date">
    </div>
    <div class="p-section">
      <label class="p-label">Task</label>
      <label class="p-check"><input type="checkbox" data-r="taskEnabled"> Task mode</label>
      <div data-r="taskFields" style="display:none">
        <div class="p-task-prio" data-r="taskPrio"></div>
        <input type="date" data-r="taskDue">
        <label class="p-label" style="margin-top:10px">Postup <span data-r="taskProgVal"></span></label>
        <input type="range" min="0" max="100" step="5" data-r="taskProgress">
      </div>
    </div>
    <div class="p-section">
      <label class="p-label">Komentáře</label>
      <textarea rows="2" data-r="commentText" placeholder="Nový komentář…"></textarea>
      <div class="p-comment-colors" data-r="commentColors"></div>
      <button class="p-btn add" data-r="addComment">+ Přidat komentář</button>
      <div class="p-comments" data-r="comments"></div>
    </div>
    <button class="p-btn add" data-r="addChild">+ Potomek</button>
    <button class="p-btn danger" data-r="delete">Smazat uzel</button>
    <div class="p-section" style="margin-top:16px">
      <label class="p-label">Lívia AI</label>
      <button class="p-btn" data-r="liviaExpand">Rozvinout téma</button>
      <button class="p-btn" data-r="liviaSummarize">Sumarizovat větev</button>
      <button class="p-btn" data-r="liviaTags">Navrhnout tagy</button>
      <button class="p-btn" data-r="liviaComment">Přidat komentář</button>
    </div>
    </div>
    <div data-r="edgeBody" style="display:none">
    <div class="p-section">
      <label class="p-label">Popisek hrany</label>
      <input type="text" data-r="edgeLabel" placeholder="Popisek…">
    </div>
    <button class="p-btn danger" data-r="edgeDelete">Smazat hranu</button>
    </div>
    <div data-r="groupBody" style="display:none">
    <div class="p-section">
      <label class="p-label">Název skupiny</label>
      <input type="text" data-r="groupName" placeholder="Název…">
    </div>
    <div class="p-section">
      <label class="p-label">Barva</label>
      <input type="color" data-r="groupColor">
    </div>
    <div class="p-section">
      <label class="p-label">Tvar</label>
      <div class="p-shapes" data-r="groupShapes"></div>
      <button class="p-btn" data-r="groupDraw">✏ Nakreslit tvar</button>
    </div>
    <button class="p-btn danger" data-r="groupDelete">Smazat skupinu</button>
    </div>
  `;
  document.getElementById('canvas-wrap').appendChild(root);

  // Reference
  root.querySelectorAll('[data-r]').forEach((e) => { refs[e.dataset.r] = e; });

  // Barevná kolečka — pevná paleta 8 odstínů
  for (const hex of SWATCHES) {
    const dot = document.createElement('div');
    dot.className = 'p-color';
    dot.dataset.hex = hex;
    dot.style.background = hex;
    dot.addEventListener('click', () => applyColor(hex));
    refs.colors.appendChild(dot);
  }

  // Vlastní barva: nativní picker + hex input (živý preview na uzlu)
  refs.colorPicker.addEventListener('input', () => applyColor(refs.colorPicker.value));
  refs.colorHex.addEventListener('input', () => {
    const v = refs.colorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyColor(v);
  });

  // Datum uzlu (pro timeline režim)
  refs.date.addEventListener('change', () => {
    if (!current) return;
    const v = refs.date.value;  // 'YYYY-MM-DD' nebo ''
    if (v) current.date = v;
    else delete current.date;
    autoSave();
    if (timeline.isActive()) timeline.refresh();
  });

  // Emoji ikony
  for (const e of EMOJI) {
    const b = document.createElement('div');
    b.className = 'p-icon';
    b.dataset.icon = e;
    b.textContent = e;
    b.addEventListener('click', () => setIcon(e));
    refs.icons.appendChild(b);
  }
  refs.iconClear.addEventListener('click', () => setIcon(null));

  // Styly hranice (mini SVG preview)
  for (const bs of BORDERS) {
    const dash = bs === 'dashed' ? 'stroke-dasharray="6 3"' : bs === 'dotted' ? 'stroke-dasharray="2 3"' : '';
    const inner = bs === 'double' ? '<rect x="6" y="6" width="32" height="10" rx="3" fill="none" stroke="#7C3AED" stroke-width="1"/>' : '';
    const b = document.createElement('div');
    b.className = 'p-style';
    b.dataset.style = bs;
    b.innerHTML = `<svg width="44" height="22"><rect x="2" y="2" width="40" height="18" rx="4" fill="none" stroke="#7C3AED" stroke-width="1.5" ${dash}/>${inner}</svg>`;
    b.addEventListener('click', () => setBorder(bs));
    refs.styles.appendChild(b);
  }

  // Tvary uzlu (mini SVG preview)
  for (const [name, inner] of NODE_SHAPES) {
    const b = document.createElement('div');
    b.className = 'p-shape'; b.dataset.shape = name;
    b.innerHTML = `<svg width="44" height="24" viewBox="0 0 44 24" fill="none" stroke="#7C3AED" stroke-width="1.5">${inner}</svg>`;
    b.addEventListener('click', () => setNodeShape(name));
    refs.shapes.appendChild(b);
  }

  // Barvy komentářů (výběr aktivní barvy nového komentáře)
  for (const col of COMMENT_COLORS) {
    const d = document.createElement('div');
    d.className = 'p-cc'; d.dataset.col = col; d.style.background = col;
    d.addEventListener('click', () => { commentColor = col; renderCommentColors(); });
    refs.commentColors.appendChild(d);
  }
  renderCommentColors();

  // Odkazy — přidání nového prázdného řádku
  refs.addLink.addEventListener('click', () => {
    if (!current) return;
    if (!Array.isArray(current.links)) current.links = [];
    current.links.push({ url: '', label: '' });
    renderLinks();
    autoSave();
  });

  // Komentáře — přidání nového
  refs.addComment.addEventListener('click', () => {
    if (!current) return;
    const text = refs.commentText.value.trim();
    if (!text) return;
    if (!Array.isArray(current.comments)) current.comments = [];
    current.comments.push({ id: crypto.randomUUID(), text, createdAt: new Date().toISOString(), color: commentColor });
    refs.commentText.value = '';
    renderComments();
    nodes.refresh(current);  // ukáže 💬 na uzlu
    pushHistory();
    autoSave();
  });

  // Průhlednost — živý preview přes input, jeden undo krok na release (change)
  refs.opacity.addEventListener('input', () => {
    if (!current) return;
    current.opacity = Number(refs.opacity.value) / 100;
    refs.opacityVal.textContent = refs.opacity.value + '%';
    nodes.refresh(current);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(autoSave, 400);
  });
  refs.opacity.addEventListener('change', () => { if (current) { pushHistory(); autoSave(); } });

  // Task mode
  refs.taskEnabled.addEventListener('change', () => {
    if (!current) return;
    ensureTask(current);
    current.task.enabled = refs.taskEnabled.checked;
    renderTask();
    nodes.refresh(current);
    pushHistory();
    autoSave();
  });
  for (const [p, emoji] of PRIOS) {
    const d = document.createElement('span');
    d.className = 'p-prio';
    d.dataset.prio = p;
    d.textContent = emoji;
    d.addEventListener('click', () => {
      if (!current) return;
      ensureTask(current);
      current.task.priority = current.task.priority === p ? null : p;
      renderTask();
      nodes.refresh(current);
      autoSave();
    });
    refs.taskPrio.appendChild(d);
  }
  refs.taskDue.addEventListener('change', () => {
    if (!current) return;
    ensureTask(current);
    current.task.dueDate = refs.taskDue.value || null;
    autoSave();
  });
  refs.taskProgress.addEventListener('input', () => {
    if (!current) return;
    ensureTask(current);
    current.task.progress = Number(refs.taskProgress.value);
    refs.taskProgVal.textContent = refs.taskProgress.value + '%';
    nodes.refresh(current);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(autoSave, 400);
  });
  refs.taskProgress.addEventListener('change', () => { if (current) { pushHistory(); autoSave(); } });

  // Listenery
  refs.name.addEventListener('blur', () => {
    const v = refs.name.value.trim();
    if (current && v && v !== current.label) {
      current.label = v;
      nodes.refresh(current);
      if (current.linkedMapId) syncSubmapName(current);  // přejmenuj i propojenou podmapu + její root
      pushHistory();
      autoSave();
    }
  });

  refs.tagInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = refs.tagInput.value.trim();
    if (current && v) {
      if (!current.tags) current.tags = [];
      if (!current.tags.includes(v)) { current.tags.push(v); renderTags(); autoSave(); }
    }
    refs.tagInput.value = '';
  });

  refs.note.addEventListener('input', () => {
    if (!current) return;
    current.note = refs.note.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(autoSave, 500);
  });

  refs.github.addEventListener('blur', () => {
    if (!current) return;
    current.githubUrl = refs.github.value.trim();
    nodes.refresh(current);
    autoSave();
  });

  refs.imgBtn.addEventListener('click', () => refs.file.click());
  refs.file.addEventListener('change', onImage);
  refs.preview.addEventListener('click', openFullscreen);

  refs.addChild.addEventListener('click', () => {
    if (current) nodes.addChild(current);
  });

  refs.delete.addEventListener('click', deleteNode);

  // Lívia AI — placeholder akce, zobrazí hint z odpovědi serveru
  refs.liviaExpand.addEventListener('click', () => callLivia('expand'));
  refs.liviaSummarize.addEventListener('click', () => callLivia('summarize'));
  refs.liviaTags.addEventListener('click', () => callLivia('tags'));
  refs.liviaComment.addEventListener('click', () => callLivia('comment'));

  // Hrana: popisek + smazání
  refs.edgeLabel.addEventListener('input', () => {
    if (!currentEdge) return;
    currentEdge.label = refs.edgeLabel.value;
    const map = getState().map;
    edges.renderEdges(map.nodes, map.edges);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(autoSave, 500);
  });
  refs.edgeDelete.addEventListener('click', () => {
    if (!currentEdge) return;
    edges.removeEdge(currentEdge.id);
    close();
  });

  // Skupina: název, barva, smazání
  refs.groupName.addEventListener('input', () => {
    if (!currentGroup) return;
    currentGroup.label = refs.groupName.value;
    groups.renderGroups();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(autoSave, 500);
  });
  refs.groupColor.addEventListener('input', () => {
    if (!currentGroup) return;
    currentGroup.color = refs.groupColor.value;
    groups.renderGroups();
    autoSave();
  });

  // Tvary skupiny (mini SVG preview) + kreslení vlastního tvaru
  for (const [name, inner] of GROUP_SHAPES) {
    const b = document.createElement('div');
    b.className = 'p-shape'; b.dataset.shape = name;
    b.innerHTML = `<svg width="44" height="24" viewBox="0 0 44 24" fill="none" stroke="#7C3AED" stroke-width="1.5">${inner}</svg>`;
    b.addEventListener('click', () => setGroupShape(name));
    refs.groupShapes.appendChild(b);
  }
  refs.groupDraw.addEventListener('click', () => { if (currentGroup) groups.startCustomDraw(currentGroup); });

  refs.groupDelete.addEventListener('click', () => {
    if (!currentGroup) return;
    groups.removeGroup(currentGroup.id);
    close();
  });
}

// --- Otevření / zavření ---
export function open(node) {
  build();
  current = node;
  currentEdge = null;
  currentGroup = null;
  refs.nodeBody.style.display = '';
  refs.edgeBody.style.display = 'none';
  refs.groupBody.style.display = 'none';
  refs.name.value = node.label || '';
  refs.note.value = node.note || '';
  refs.github.value = node.githubUrl || '';
  refs.date.value = node.date ? String(node.date).slice(0, 10) : '';
  refs.warn.style.display = 'none';
  renderColors();
  renderIcons();
  renderStyles();
  renderShapes();
  refs.opacity.value = Math.round((node.opacity == null ? 1 : node.opacity) * 100);
  refs.opacityVal.textContent = refs.opacity.value + '%';
  renderTask();
  renderTags();
  renderPreview();
  renderLinks();
  renderComments();
  root.classList.add('open');
}

// Detail hrany
export function openEdge(edge) {
  build();
  current = null;
  currentEdge = edge;
  currentGroup = null;
  refs.nodeBody.style.display = 'none';
  refs.edgeBody.style.display = '';
  refs.groupBody.style.display = 'none';
  refs.edgeLabel.value = edge.label || '';
  root.classList.add('open');
}

// Detail skupiny
export function openGroup(group) {
  build();
  current = null;
  currentEdge = null;
  currentGroup = group;
  refs.nodeBody.style.display = 'none';
  refs.edgeBody.style.display = 'none';
  refs.groupBody.style.display = '';
  refs.groupName.value = group.label || '';
  refs.groupColor.value = group.color || '#7C3AED';
  renderGroupShapes();
  root.classList.add('open');
}

export function close() {
  current = null;
  currentEdge = null;
  currentGroup = null;
  if (root) root.classList.remove('open');
}

// --- Barvy ---
// Aktuální stroke hex uzlu (vlastní barva, nebo pojmenovaná z NODE_COLORS)
function currentHex() {
  if (current && current.color === 'custom' && current.customColor) return current.customColor.stroke;
  const c = NODE_COLORS[current && current.color];
  return (c && c.stroke) || NODE_COLORS.neutral.stroke;
}

function renderColors() {
  const hex = currentHex().toLowerCase();
  refs.colors.querySelectorAll('.p-color').forEach((d) => {
    d.classList.toggle('sel', d.dataset.hex.toLowerCase() === hex);
  });
  refs.colorPicker.value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#7c3aed';
  refs.colorHex.value = hex;
}

// Nastaví vlastní barvu uzlu z hex hodnoty + živý preview
let colorHistoryTimer = null;
function applyColor(hex) {
  if (!current) return;
  current.color = 'custom';
  current.customColor = { fill: hex + '22', stroke: hex, glow: hex };
  renderColors();
  nodes.refresh(current);
  // Odchozí hrany berou barvu zdrojového uzlu, minimapa kreslí uzly jejich barvou
  const m = getState().map;
  edges.renderEdges(m.nodes, m.edges);
  canvas.updateMinimap(m.nodes, getState().viewTransform);
  // Debounce push do historie — picker/hex fíruje 'input' průběžně (jeden tah = jeden undo krok)
  clearTimeout(colorHistoryTimer);
  colorHistoryTimer = setTimeout(pushHistory, 400);
  autoSave();
}

// --- Ikona ---
function setIcon(icon) {
  if (!current) return;
  current.icon = icon;
  renderIcons();
  nodes.refresh(current);
  pushHistory();
  autoSave();
}
function renderIcons() {
  refs.icons.querySelectorAll('.p-icon').forEach((d) => {
    d.classList.toggle('sel', d.dataset.icon === current.icon);
  });
}

// --- Styl hranice ---
function setBorder(bs) {
  if (!current) return;
  current.borderStyle = bs;
  renderStyles();
  nodes.refresh(current);
  pushHistory();
  autoSave();
}
function renderStyles() {
  const cur = current.borderStyle || 'solid';
  refs.styles.querySelectorAll('.p-style').forEach((d) => {
    d.classList.toggle('sel', d.dataset.style === cur);
  });
}

// --- Tvar uzlu (sekce 9) ---
function setNodeShape(shape) {
  if (!current) return;
  current.shape = shape;
  renderShapes();
  nodes.refresh(current);
  pushHistory();
  autoSave();
}
function renderShapes() {
  const cur = current.shape || 'rectangle';
  refs.shapes.querySelectorAll('.p-shape').forEach((d) => d.classList.toggle('sel', d.dataset.shape === cur));
}

// --- Tvar skupiny (sekce 4) ---
function setGroupShape(name) {
  if (!currentGroup) return;
  if (name === 'custom' && !currentGroup.customPath) { groups.startCustomDraw(currentGroup); return; }
  currentGroup.shape = name;
  renderGroupShapes();
  groups.renderGroups();
  pushHistory();
  autoSave();
}
function renderGroupShapes() {
  const cur = (currentGroup && currentGroup.shape) || 'rectangle';
  refs.groupShapes.querySelectorAll('.p-shape').forEach((d) => d.classList.toggle('sel', d.dataset.shape === cur));
}

// --- Odkazy (node.links, sekce 2) ---
function renderLinks() {
  refs.links.innerHTML = '';
  const links = current.links || [];
  links.forEach((lnk, i) => {
    const row = document.createElement('div'); row.className = 'p-link-row';
    const label = document.createElement('input');
    label.className = 'p-link-label'; label.type = 'text'; label.placeholder = 'popisek'; label.value = lnk.label || '';
    const url = document.createElement('input');
    url.type = 'url'; url.placeholder = 'https://…'; url.value = lnk.url || '';
    label.addEventListener('input', () => { lnk.label = label.value; clearTimeout(noteTimer); noteTimer = setTimeout(autoSave, 500); });
    url.addEventListener('input', () => { lnk.url = url.value.trim(); clearTimeout(noteTimer); noteTimer = setTimeout(autoSave, 500); });
    const rm = document.createElement('button'); rm.textContent = '×'; rm.title = 'Odebrat';
    rm.addEventListener('click', () => { current.links.splice(i, 1); renderLinks(); pushHistory(); autoSave(); });
    row.appendChild(label); row.appendChild(url); row.appendChild(rm);
    refs.links.appendChild(row);
  });
}

// --- Komentáře (sekce 7) ---
function renderCommentColors() {
  refs.commentColors.querySelectorAll('.p-cc').forEach((d) => d.classList.toggle('sel', d.dataset.col === commentColor));
}
function renderComments() {
  refs.comments.innerHTML = '';
  const list = current.comments || [];
  list.forEach((cm, i) => {
    const card = document.createElement('div'); card.className = 'p-comment';
    card.style.borderLeftColor = cm.color || '#888';
    const txt = document.createElement('span'); txt.className = 'p-comment-text'; txt.textContent = cm.text;
    const rm = document.createElement('button'); rm.textContent = '×'; rm.title = 'Smazat';
    rm.addEventListener('click', () => { current.comments.splice(i, 1); renderComments(); nodes.refresh(current); pushHistory(); autoSave(); });
    card.appendChild(txt); card.appendChild(rm);
    refs.comments.appendChild(card);
  });
}

// --- Task ---
function ensureTask(node) {
  if (!node.task) node.task = { enabled: false, checked: false, priority: null, dueDate: null, progress: 0 };
}
function renderTask() {
  ensureTask(current);
  const t = current.task;
  refs.taskEnabled.checked = !!t.enabled;
  refs.taskFields.style.display = t.enabled ? '' : 'none';
  refs.taskPrio.querySelectorAll('.p-prio').forEach((d) => {
    d.classList.toggle('sel', d.dataset.prio === t.priority);
  });
  refs.taskDue.value = t.dueDate || '';
  refs.taskProgress.value = t.progress || 0;
  refs.taskProgVal.textContent = (t.progress || 0) + '%';
}

// Nastaví vlastní barvu danému uzlu (kontextové menu) — okamžitý push do historie
export function applyColorTo(node, hex) {
  node.color = 'custom';
  node.customColor = { fill: hex + '22', stroke: hex, glow: hex };
  nodes.refresh(node);
  const m = getState().map;
  edges.renderEdges(m.nodes, m.edges);
  canvas.updateMinimap(m.nodes, getState().viewTransform);
  if (current === node) renderColors();  // sjednoť panel, je-li uzel otevřený
  pushHistory();
  autoSave();
}

// Fokus na vstupy panelu (předpokládá otevřený příslušný panel)
export function focusName() { if (refs.name) { refs.name.focus(); refs.name.select(); } }
export function focusNote() { if (refs.note) refs.note.focus(); }
export function focusEdgeLabel() { if (refs.edgeLabel) { refs.edgeLabel.focus(); refs.edgeLabel.select(); } }
export function focusGroupName() { if (refs.groupName) { refs.groupName.focus(); refs.groupName.select(); } }

// --- Tagy ---
function renderTags() {
  refs.tags.innerHTML = '';
  for (const t of (current.tags || [])) {
    const pill = document.createElement('span');
    pill.className = 'p-tag';
    pill.textContent = t;
    pill.style.cursor = 'pointer';
    // Klik na pill otevře tag view v sidebaru
    pill.addEventListener('click', () => tags.openTagView(t));
    const x = document.createElement('span');
    x.textContent = '×';
    x.addEventListener('click', (e) => {
      e.stopPropagation();  // jen odebrání tagu, neotvírat tag view
      current.tags = current.tags.filter((tag) => tag !== t);
      renderTags();
      autoSave();
    });
    pill.appendChild(x);
    refs.tags.appendChild(pill);
  }
}

// --- Obrázek ---
function onImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  refs.file.value = '';
  if (file.size > 2 * 1024 * 1024) {
    refs.warn.style.display = 'block';
    return;
  }
  refs.warn.style.display = 'none';
  const node = current;  // zachyť uzel z času výběru — async čtení by jinak zapsalo do mezitím vybraného jiného uzlu
  const reader = new FileReader();
  reader.onload = () => {
    if (!node) return;
    node.imageBase64 = reader.result;
    if (current === node) renderPreview();
    nodes.refresh(node);
    pushHistory();
    autoSave();
  };
  reader.readAsDataURL(file);
}

function renderPreview() {
  if (current.imageBase64) {
    refs.preview.src = current.imageBase64;
    refs.preview.style.display = 'block';
  } else {
    refs.preview.style.display = 'none';
  }
}

function openFullscreen() {
  if (!current || !current.imageBase64) return;
  const overlay = document.createElement('div');
  overlay.className = 'p-img-overlay';
  const img = document.createElement('img');
  img.src = current.imageBase64;
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// --- Lívia AI akce ---
async function callLivia(action) {
  if (!current) return;
  try {
    const data = await api.livia(action, { nodeId: current.id });
    toast(data.hint || data.error || 'Lívia neodpověděla', 'error');
  } catch (err) {
    toast('Lívia není dostupná', 'error');
    console.error('Lívia selhala:', err);
  }
}

// --- Smazání uzlu + potomků + jejich hran ---
function deleteNode() {
  if (!current) return;
  if (!confirm(`Smazat uzel „${current.label}" a jeho potomky?`)) return;

  const map = getState().map;
  // Rekurzivně posbírej id uzlu a všech potomků
  const toRemove = new Set();
  const collect = (id) => {
    toRemove.add(id);
    map.nodes.filter((n) => n.parentId === id).forEach((n) => collect(n.id));
  };
  collect(current.id);

  map.nodes = map.nodes.filter((n) => !toRemove.has(n.id));
  map.edges = map.edges.filter((e) => !toRemove.has(e.fromId) && !toRemove.has(e.toId));

  close();
  renderMap();
  pushHistory();
  autoSave();
}
