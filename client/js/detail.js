// Read-only detail okno uzlu (View mode) — sekce 2.
// Klik na uzel ve view mode otevře tohle okno místo editačního panelu.
import { getState, setEditMode, goToNode, goToMap, createOrOpenSubmap, nodeColors } from './app.js';
import * as panel from './panel.js';
import * as sidebar from './sidebar.js';
import { renderMarkdown } from './markdown.js';

let overlay = null;
let onKey = null;

(function injectStyles() {
  if (document.getElementById('detail-style')) return;
  const s = document.createElement('style');
  s.id = 'detail-style';
  s.textContent = `
    #detail-overlay { position: fixed; inset: 0; z-index: 300; background: #000000cc;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif; }
    #detail-modal { width: 600px; max-width: 92vw; height: 400px; max-height: 88vh;
      display: flex; flex-direction: column; background: #111122;
      border: 1px solid #7C3AED44; border-radius: 12px; box-shadow: 0 24px 70px #000a; overflow: hidden; }
    #detail-head { flex: 0 0 auto; display: flex; align-items: flex-start; gap: 10px;
      padding: 16px 18px 12px; border-bottom: 1px solid #7C3AED22; }
    #detail-head .dt-title { flex: 1 1 auto; display: flex; align-items: center; gap: 10px;
      font-size: 24px; font-weight: 700; color: #fff; word-break: break-word; }
    #detail-head .dt-title .dt-emoji { font-size: 24px; flex: 0 0 auto; }
    #detail-head .dt-edit { flex: 0 0 auto; padding: 6px 12px; font-size: 13px; font-weight: 600;
      color: #c8b8f0; background: #7C3AED22; border: 1px solid #7C3AED66; border-radius: 6px; cursor: pointer; }
    #detail-head .dt-edit:hover { background: #7C3AED44; color: #fff; }
    #detail-head .dt-close { flex: 0 0 auto; width: 28px; height: 28px; font-size: 18px; line-height: 1;
      color: #9a9ab0; background: transparent; border: none; cursor: pointer; }
    #detail-head .dt-close:hover { color: #fff; }
    #detail-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 18px 18px; color: #e5e5f0; }
    #detail-body .dt-sec { margin-bottom: 16px; }
    #detail-body .dt-sec-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
      color: #7C3AED; font-weight: 600; margin-bottom: 6px; }
    #detail-body .dt-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    #detail-body .dt-tag { padding: 3px 10px; font-size: 12px; background: #7C3AED22;
      border: 1px solid #7C3AED44; border-radius: 999px; color: #e5e5f0; }
    #detail-body .dt-img { width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px;
      cursor: zoom-in; display: block; background: #0a0a16; }
    #detail-body .dt-note { font-size: 14px; line-height: 1.55; color: #d8d8e8; }
    #detail-body .dt-note h1, #detail-body .dt-note h2, #detail-body .dt-note h3 { color: #fff; margin: 10px 0 6px; }
    #detail-body .dt-note h1 { font-size: 18px; } #detail-body .dt-note h2 { font-size: 16px; } #detail-body .dt-note h3 { font-size: 14px; }
    #detail-body .dt-note p { margin: 6px 0; }
    #detail-body .dt-note ul, #detail-body .dt-note ol { margin: 6px 0 6px 20px; }
    #detail-body .dt-note code { background: #0a0a16; border: 1px solid #7C3AED22; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
    #detail-body .dt-note pre { background: #0a0a16; border: 1px solid #7C3AED22; border-radius: 6px; padding: 8px 10px; overflow-x: auto; }
    #detail-body .dt-note pre code { border: none; padding: 0; }
    #detail-body .dt-note a { color: #06B6D4; }
    #detail-body .dt-note hr { border: none; border-top: 1px solid #7C3AED33; margin: 10px 0; }
    #detail-body .dt-links { display: flex; flex-wrap: wrap; gap: 6px; }
    #detail-body .dt-link { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
      font-size: 12px; color: #cfe9f2; background: #06B6D41a; border: 1px solid #06B6D444;
      border-radius: 999px; cursor: pointer; max-width: 100%; }
    #detail-body .dt-link:hover { background: #06B6D433; }
    #detail-body .dt-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #detail-body .dt-ref { display: flex; align-items: center; gap: 6px; padding: 6px 8px; margin-top: 4px;
      font-size: 13px; color: #d8d8e8; background: #0a0a16; border: 1px solid #06B6D433; border-radius: 6px; cursor: pointer; }
    #detail-body .dt-ref:hover { background: #14142a; }
    #detail-body .dt-submap { width: 100%; padding: 9px; font-size: 13px; font-weight: 600;
      color: #fff; background: #7C3AED; border: none; border-radius: 8px; cursor: pointer; }
    #detail-body .dt-submap:hover { background: #6d31d6; }
    #detail-body .dt-comments { font-size: 13px; color: #9a9ab0; }`;
  document.head.appendChild(s);
})();

export function isOpen() { return !!overlay; }

export function close() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  if (onKey) { document.removeEventListener('keydown', onKey, true); onKey = null; }
}

// Sekce s nadpisem (vrací div nebo null pokud prázdné)
function section(label, contentEl) {
  if (!contentEl) return null;
  const sec = document.createElement('div'); sec.className = 'dt-sec';
  const l = document.createElement('div'); l.className = 'dt-sec-label'; l.textContent = label;
  sec.appendChild(l); sec.appendChild(contentEl);
  return sec;
}

export function open(node) {
  close();
  overlay = document.createElement('div');
  overlay.id = 'detail-overlay';
  const modal = document.createElement('div');
  modal.id = 'detail-modal';

  // --- Hlavička: ikona + název, Editovat, × ---
  const head = document.createElement('div'); head.id = 'detail-head';
  const title = document.createElement('div'); title.className = 'dt-title';
  if (node.icon) { const em = document.createElement('span'); em.className = 'dt-emoji'; em.textContent = node.icon; title.appendChild(em); }
  const name = document.createElement('span'); name.textContent = node.label || '(bez názvu)';
  const c = nodeColors(node); name.style.borderLeft = `3px solid ${c.stroke}`; name.style.paddingLeft = '8px';
  title.appendChild(name);
  const edit = document.createElement('button'); edit.className = 'dt-edit'; edit.textContent = '✏ Editovat';
  edit.addEventListener('click', () => { close(); setEditMode(true); getState().selectedNodeId = node.id; panel.open(node); });
  const x = document.createElement('button'); x.className = 'dt-close'; x.textContent = '×';
  x.addEventListener('click', close);
  head.appendChild(title); head.appendChild(edit); head.appendChild(x);
  modal.appendChild(head);

  // --- Tělo ---
  const body = document.createElement('div'); body.id = 'detail-body';

  // Tagy
  if (node.tags && node.tags.length) {
    const wrap = document.createElement('div'); wrap.className = 'dt-tags';
    for (const t of node.tags) { const p = document.createElement('span'); p.className = 'dt-tag'; p.textContent = t; wrap.appendChild(p); }
    body.appendChild(section('Tagy', wrap));
  }

  // Obrázek (klik = fullscreen)
  if (node.imageBase64) {
    const img = document.createElement('img'); img.className = 'dt-img'; img.src = node.imageBase64;
    img.addEventListener('click', () => openFullscreen(node.imageBase64));
    body.appendChild(section('Obrázek', img));
  }

  // Poznámka (markdown)
  if (node.note && node.note.trim()) {
    const div = document.createElement('div'); div.className = 'dt-note';
    div.innerHTML = renderMarkdown(node.note);
    // Odkazy v markdownu otevři v novém okně
    div.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.open(a.href, '_blank'); }));
    body.appendChild(section('Poznámka', div));
  }

  // Odkazy: githubUrl + node.links[]
  const links = [];
  if (node.githubUrl) links.push({ url: node.githubUrl, label: 'GitHub' });
  for (const l of (node.links || [])) if (l && l.url) links.push({ url: l.url, label: l.label || l.url });
  if (links.length) {
    const wrap = document.createElement('div'); wrap.className = 'dt-links';
    for (const l of links) {
      const pill = document.createElement('span'); pill.className = 'dt-link';
      pill.innerHTML = '🔗 <span></span>'; pill.querySelector('span').textContent = l.label;
      pill.title = l.url;
      pill.addEventListener('click', () => window.open(l.url, '_blank'));
      wrap.appendChild(pill);
    }
    body.appendChild(section('Odkazy', wrap));
  }

  // Reference (cross-reference na jiné uzly/skupiny)
  if (node.references && node.references.length) {
    const wrap = document.createElement('div');
    for (const r of node.references) {
      const row = document.createElement('div'); row.className = 'dt-ref';
      row.textContent = '⬡ ' + (r.targetMapName ? r.targetMapName + ' › ' : '') + (r.targetLabel || r.targetNodeId) + (r.note ? ' — ' + r.note : '');
      row.addEventListener('click', () => {
        close();
        if (r.targetType === 'node') goToNode(r.targetMapId, r.targetNodeId);
        else goToMap(r.targetMapId);
      });
      wrap.appendChild(row);
    }
    body.appendChild(section('Odkazuje na', wrap));
  }

  // Podmapový odkaz
  if (node.linkedMapId) {
    const lm = sidebar.getMaps().find((m) => m.id === node.linkedMapId);
    const btn = document.createElement('button'); btn.className = 'dt-submap';
    btn.textContent = '→ Otevřít podmapu ' + (lm ? lm.name : '');
    btn.addEventListener('click', () => { close(); createOrOpenSubmap(node); });
    body.appendChild(section('Podmapa', btn));
  }

  // Komentáře — jen počet + náhled prvního v tooltipu
  if (node.comments && node.comments.length) {
    const div = document.createElement('div'); div.className = 'dt-comments';
    const first = node.comments[0].text || '';
    div.textContent = '💬 ' + node.comments.length + ' ' + (node.comments.length === 1 ? 'komentář' : 'komentáře/ů');
    div.title = first.length > 120 ? first.slice(0, 120) + '…' : first;
    body.appendChild(section('Komentáře', div));
  }

  if (!body.children.length) {
    const empty = document.createElement('div'); empty.className = 'dt-comments';
    empty.textContent = 'Uzel nemá žádný další obsah. Klikni na „✏ Editovat" pro úpravy.';
    body.appendChild(empty);
  }

  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
}

// Fullscreen náhled obrázku
function openFullscreen(src) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:400;background:#000000ee;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  const img = document.createElement('img');
  img.src = src; img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px';
  ov.appendChild(img);
  ov.addEventListener('click', () => ov.remove());
  document.body.appendChild(ov);
}
