// Cross-reference (sekce 3) — modal pro přidání reference z uzlu na uzel/skupinu jiné (i téže) mapy.
import { api } from './api.js';
import { getState, autoSave, pushHistory, renderMap } from './app.js';
import * as sidebar from './sidebar.js';
import { toast } from './toast.js';

(function injectStyles() {
  if (document.getElementById('ref-style')) return;
  const s = document.createElement('style');
  s.id = 'ref-style';
  s.textContent = `
    #ref-overlay { position: fixed; inset: 0; z-index: 600; background: #000000cc;
      display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif; }
    #ref-modal { width: 460px; max-width: 92vw; background: #15152a; border: 1px solid #7C3AED44;
      border-radius: 12px; box-shadow: 0 20px 60px #000a; padding: 20px; }
    #ref-modal h2 { color: #7C3AED; font-size: 16px; font-weight: 700; margin-bottom: 14px; }
    #ref-modal label { display: block; font-size: 12px; color: #9a9ab0; margin: 10px 0 4px; }
    #ref-modal select, #ref-modal input {
      width: 100%; padding: 8px 10px; font-size: 13px; color: #e5e5f0;
      background: #0a0a16; border: 1px solid #7C3AED44; border-radius: 6px; outline: none; box-sizing: border-box; }
    #ref-modal select:focus, #ref-modal input:focus { border-color: #7C3AED; }
    #ref-list { max-height: 200px; overflow-y: auto; margin-top: 6px; border: 1px solid #7C3AED22; border-radius: 6px; }
    #ref-list .ref-item { padding: 7px 10px; font-size: 13px; color: #e5e5f0; cursor: pointer; display: flex; gap: 8px; align-items: center; }
    #ref-list .ref-item:hover { background: #7C3AED22; }
    #ref-list .ref-item.sel { background: #7C3AED55; }
    #ref-list .ref-kind { font-size: 11px; color: #9a9ab0; flex: 0 0 auto; }
    #ref-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    #ref-actions button { padding: 7px 16px; font-size: 13px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; }
    #ref-ok { color: #fff; background: #7C3AED; }
    #ref-cancel { color: #c5c5d8; background: #2a2a44; }
    #ref-existing { margin: 4px 0 10px; }
    #ref-existing .ref-ex {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-top: 4px;
      font-size: 12px; color: #c5c5d8; background: #0a0a16; border: 1px solid #06B6D433; border-radius: 6px; }
    #ref-existing .ref-ex span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #ref-existing .ref-ex button {
      flex: 0 0 auto; width: 20px; height: 20px; line-height: 1; padding: 0;
      color: #E24B4A; background: transparent; border: none; cursor: pointer; font-size: 14px; }`;
  document.head.appendChild(s);
})();

// Otevře modal pro přidání reference do sourceNode.references[]
export function openReferenceModal(sourceNode) {
  const maps = sidebar.getMaps();
  if (!maps.length) { toast('Žádné mapy k odkazu', 'info'); return; }

  const overlay = document.createElement('div');
  overlay.id = 'ref-overlay';
  const modal = document.createElement('div');
  modal.id = 'ref-modal';
  modal.innerHTML = '<h2>Reference uzlu ⬡</h2>';

  // Seznam existujících referencí s možností odebrání
  const existing = document.createElement('div'); existing.id = 'ref-existing';
  modal.appendChild(existing);
  const renderExisting = () => {
    existing.innerHTML = '';
    const refs = Array.isArray(sourceNode.references) ? sourceNode.references : [];
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      const row = document.createElement('div'); row.className = 'ref-ex';
      const lbl = document.createElement('span');
      lbl.textContent = '⬡ ' + (r.targetLabel || r.targetNodeId) + (r.targetMapName ? ' [' + r.targetMapName + ']' : '') + (r.note ? ' — ' + r.note : '');
      const rm = document.createElement('button'); rm.textContent = '✕'; rm.title = 'Odebrat';
      rm.addEventListener('click', () => {
        sourceNode.references.splice(i, 1);
        renderExisting();
        renderMap(); pushHistory(); autoSave();
      });
      row.appendChild(lbl); row.appendChild(rm);
      existing.appendChild(row);
    }
  };
  renderExisting();

  const mapLabel = document.createElement('label'); mapLabel.textContent = 'Cílová mapa';
  const mapSel = document.createElement('select');
  for (const m of maps) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.name;
    if (m.id === getState().currentMapId) o.selected = true;
    mapSel.appendChild(o);
  }
  modal.appendChild(mapLabel); modal.appendChild(mapSel);

  const searchLabel = document.createElement('label'); searchLabel.textContent = 'Uzel / skupina';
  const search = document.createElement('input'); search.placeholder = 'Hledat…';
  modal.appendChild(searchLabel); modal.appendChild(search);
  const listEl = document.createElement('div'); listEl.id = 'ref-list';
  modal.appendChild(listEl);

  const noteLabel = document.createElement('label'); noteLabel.textContent = 'Co je podmínkou (volitelné)';
  const note = document.createElement('input'); note.placeholder = 'Poznámka…';
  modal.appendChild(noteLabel); modal.appendChild(note);

  const actions = document.createElement('div'); actions.id = 'ref-actions';
  const cancel = document.createElement('button'); cancel.id = 'ref-cancel'; cancel.textContent = 'Zrušit';
  const ok = document.createElement('button'); ok.id = 'ref-ok'; ok.textContent = 'Přidat';
  actions.appendChild(cancel); actions.appendChild(ok);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let targets = [];    // [{ id, label, type }]
  let selected = null; // { id, label, type, mapId, mapName }

  const close = () => overlay.remove();
  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    listEl.innerHTML = '';
    for (const t of targets) {
      if (q && !t.label.toLowerCase().includes(q)) continue;
      const it = document.createElement('div');
      it.className = 'ref-item' + (selected && selected.id === t.id && selected.type === t.type ? ' sel' : '');
      const kind = document.createElement('span'); kind.className = 'ref-kind'; kind.textContent = t.type === 'group' ? '▢' : '●';
      const lbl = document.createElement('span'); lbl.textContent = t.label;
      it.appendChild(kind); it.appendChild(lbl);
      it.addEventListener('click', () => {
        const m = maps.find((x) => x.id === mapSel.value);
        selected = { id: t.id, label: t.label, type: t.type, mapId: mapSel.value, mapName: m ? m.name : '' };
        renderList();
      });
      listEl.appendChild(it);
    }
    if (!listEl.children.length) {
      const empty = document.createElement('div');
      empty.className = 'ref-item ref-kind'; empty.textContent = 'Nic nenalezeno';
      listEl.appendChild(empty);
    }
  };
  const loadMap = async () => {
    selected = null; targets = [];
    listEl.innerHTML = '<div class="ref-item ref-kind">Načítám…</div>';
    try {
      const full = await api.getMap(mapSel.value);
      for (const n of (full.nodes || [])) targets.push({ id: n.id, label: n.label || '(bez názvu)', type: 'node' });
      for (const gr of (full.groups || [])) targets.push({ id: gr.id, label: gr.label || '(skupina)', type: 'group' });
    } catch (e) { /* ignore */ }
    renderList();
  };

  mapSel.addEventListener('change', loadMap);
  search.addEventListener('input', renderList);
  // Ať Esc / písmena v polích nespouští globální klávesové zkratky aplikace
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  note.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  cancel.addEventListener('click', close);
  ok.addEventListener('click', () => {
    if (!selected) { toast('Vyber cíl reference', 'info'); return; }
    if (!Array.isArray(sourceNode.references)) sourceNode.references = [];
    sourceNode.references.push({
      targetMapId: selected.mapId, targetNodeId: selected.id, targetType: selected.type,
      targetLabel: selected.label, targetMapName: selected.mapName, note: note.value.trim(),
    });
    selected = null; note.value = '';
    renderExisting();  // přidaná reference se objeví v seznamu nahoře (modal zůstává otevřený)
    renderList();      // zruší zvýraznění vybrané položky
    renderMap();       // ukáže ⬡ na uzlu
    pushHistory();
    autoSave();
    toast('Reference přidána', 'success');
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  modal.addEventListener('mousedown', (e) => e.stopPropagation());

  loadMap();
}
