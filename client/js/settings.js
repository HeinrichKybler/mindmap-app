// Nastavení aplikace — modal (Obecné / Vzhled / Claude / Zkratky), persistováno přes /api/settings
import { api } from './api.js';
import { getState, applyTransform, renderMap, autoSave, setDefaultColor } from './app.js';
import * as cheatsheet from './cheatsheet.js';
import { toast } from './toast.js';

let settings = null;  // aktuální načtené nastavení
let modalOpen = false;  // je modal otevřený? (kvůli guardu globálních zkratek v app.js)
export function isOpen() { return modalOpen; }

(function injectStyles() {
  if (document.getElementById('settings-style')) return;
  const s = document.createElement('style');
  s.id = 'settings-style';
  s.textContent = `
    #set-overlay { position: fixed; inset: 0; z-index: 500; background: #000000cc;
      display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif; }
    #set-modal { width: 480px; max-width: 92vw; background: #15152a; border: 1px solid #7C3AED44;
      border-radius: 12px; box-shadow: 0 20px 60px #000a; overflow: hidden; }
    #set-modal h2 { color: #7C3AED; font-size: 16px; font-weight: 700; padding: 18px 22px 12px; }
    #set-tabs { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid #7C3AED22; }
    #set-tabs .set-tab { padding: 8px 14px; font-size: 13px; color: #9a9ab0; cursor: pointer; border-bottom: 2px solid transparent; }
    #set-tabs .set-tab.active { color: #e5e5f0; border-bottom-color: #7C3AED; }
    #set-body { padding: 18px 22px; min-height: 180px; }
    #set-body .set-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; font-size: 13px; color: #e5e5f0; }
    #set-body label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    #set-body input[type=checkbox], #set-body input[type=radio] { accent-color: #7C3AED; cursor: pointer; }
    #set-body input[type=color] { width: 40px; height: 26px; background: #0a0a16; border: 1px solid #7C3AED33; border-radius: 6px; cursor: pointer; }
    #set-body select { background: #0a0a16; color: #e5e5f0; border: 1px solid #7C3AED33; border-radius: 6px; padding: 5px 8px; font-family: inherit; }
    #set-body .set-info { font-size: 13px; color: #9a9ab0; line-height: 1.6; }
    #set-body .set-radios { display: flex; gap: 14px; }
    #set-btn { padding: 6px 12px !important; }`;
  document.head.appendChild(s);
})();

// --- Aplikace nastavení na UI ---
function applyBg(color) {
  const c = document.getElementById('canvas');
  if (c) c.style.background = color;
}
function applyGrid(style) {
  const bg = document.getElementById('grid-bg');
  const pattern = document.getElementById('grid');
  if (!bg || !pattern) return;
  if (style === 'none') { bg.style.display = 'none'; return; }
  bg.style.display = '';
  const NS = 'http://www.w3.org/2000/svg';
  pattern.innerHTML = '';
  if (style === 'dots') {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '1'); c.setAttribute('cy', '1'); c.setAttribute('r', '1.2');
    c.setAttribute('fill', 'rgba(255,255,255,0.07)');
    pattern.appendChild(c);
  } else {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'rgba(255,255,255,0.04)');
    p.setAttribute('stroke-width', '1');
    p.setAttribute('d', 'M 40 0 L 0 0 0 40');
    pattern.appendChild(p);
  }
  applyTransform();  // přepočítá rozměry patternu
}
function applyAnimations(on) {
  document.body.classList.toggle('no-anim', !on);
}

// Aplikuje vizuální + obecná nastavení (volá se po načtení i změně)
export function apply() {
  if (!settings) return;
  applyBg(settings.appearance.bgColor);
  applyGrid(settings.appearance.gridStyle);
  applyAnimations(settings.appearance.animations);
  setDefaultColor(settings.general.defaultColor);
}

// Načte nastavení ze serveru a aplikuje (start aplikace)
export async function load() {
  try {
    settings = await api.getSettings();
  } catch (err) {
    console.error('Nepodařilo se načíst nastavení:', err.message);
  }
  apply();
}

function save() {
  api.saveSettings(settings).catch((err) => {
    console.error('Uložení nastavení selhalo:', err.message);
    toast('Uložení nastavení selhalo', 'error');
  });
}

// --- Modal ---
const TABS = ['Obecné', 'Vzhled', 'Claude', 'Zkratky'];

function tabContent(tab, body, close) {
  body.innerHTML = '';
  const g = settings.general, a = settings.appearance;
  const row = (labelHtml, control) => {
    const r = document.createElement('div');
    r.className = 'set-row';
    const l = document.createElement('div');
    l.innerHTML = labelHtml;
    r.appendChild(l);
    r.appendChild(control);
    body.appendChild(r);
    return control;
  };
  const checkbox = (checked, on) => {
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = checked;
    c.addEventListener('change', () => { on(c.checked); save(); });
    return c;
  };

  if (tab === 'Obecné') {
    row('Automatické číslování uzlů (aktuální mapa)', checkbox(
      !!(getState().map.settings && getState().map.settings.autoNumber),
      (v) => { const m = getState().map; if (!m.settings) m.settings = {}; m.settings.autoNumber = v; g.autoNumber = v; renderMap(); autoSave(); }));
    row('Ukládat historii navigace', checkbox(g.saveNav, (v) => { g.saveNav = v; }));
    const colSel = document.createElement('select');
    [['purple', 'Fialová'], ['green', 'Zelená'], ['neutral', 'Neutrální'], ['amber', 'Oranžová'], ['red', 'Červená']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (g.defaultColor === v) o.selected = true; colSel.appendChild(o); });
    colSel.addEventListener('change', () => { g.defaultColor = colSel.value; setDefaultColor(colSel.value); save(); });
    row('Výchozí barva nového uzlu', colSel);
    const laySel = document.createElement('select');
    [['hierarchy', 'Hierarchie'], ['radial', 'Radial'], ['fishbone', 'Fishbone'], ['orgchart', 'Org chart']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (g.defaultLayout === v) o.selected = true; laySel.appendChild(o); });
    laySel.addEventListener('change', () => { g.defaultLayout = laySel.value; save(); });
    row('Výchozí layout', laySel);
  } else if (tab === 'Vzhled') {
    const bg = document.createElement('input'); bg.type = 'color'; bg.value = a.bgColor;
    bg.addEventListener('input', () => { a.bgColor = bg.value; applyBg(bg.value); });
    bg.addEventListener('change', save);
    row('Barva pozadí mapy', bg);
    const radios = document.createElement('div'); radios.className = 'set-radios';
    [['lines', 'Čáry'], ['dots', 'Tečky'], ['none', 'Žádná']].forEach(([v, t]) => {
      const lab = document.createElement('label');
      const rb = document.createElement('input'); rb.type = 'radio'; rb.name = 'gridstyle'; rb.value = v; rb.checked = a.gridStyle === v;
      rb.addEventListener('change', () => { if (rb.checked) { a.gridStyle = v; applyGrid(v); save(); } });
      lab.appendChild(rb); lab.appendChild(document.createTextNode(t)); radios.appendChild(lab);
    });
    row('Mřížka', radios);
    row('Animace', checkbox(a.animations, (v) => { a.animations = v; applyAnimations(v); }));
  } else if (tab === 'Claude') {
    const info = document.createElement('div'); info.className = 'set-info';
    info.innerHTML = 'API klíč: nastav <b>ANTHROPIC_API_KEY</b> v souboru <code>.env</code> na serveru.<br>'
      + 'Model: <b>claude-sonnet-4-6</b> (pevné).<br>Integrace Lívia / Claude zatím není aktivní.';
    body.appendChild(info);
  } else if (tab === 'Zkratky') {
    const info = document.createElement('div'); info.className = 'set-info';
    info.textContent = 'Kompletní přehled klávesových zkratek:';
    body.appendChild(info);
    const btn = document.createElement('button');
    btn.className = 'tb-btn'; btn.id = 'set-btn'; btn.textContent = 'Zobrazit cheatsheet (?)';
    btn.style.marginTop = '12px';
    btn.addEventListener('click', () => { close(); cheatsheet.open(); });
    body.appendChild(btn);
  }
}

export function open() {
  if (!settings) { toast('Nastavení se ještě nenačetlo', 'info'); return; }
  if (modalOpen) return;
  modalOpen = true;
  const overlay = document.createElement('div');
  overlay.id = 'set-overlay';
  const modal = document.createElement('div');
  modal.id = 'set-modal';
  modal.innerHTML = '<h2>Nastavení</h2><div id="set-tabs"></div><div id="set-body"></div>';
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { modalOpen = false; overlay.remove(); document.removeEventListener('keydown', onKey); };
  const tabsEl = modal.querySelector('#set-tabs');
  const bodyEl = modal.querySelector('#set-body');
  let active = TABS[0];
  const renderTabs = () => {
    tabsEl.innerHTML = '';
    for (const t of TABS) {
      const el = document.createElement('div');
      el.className = 'set-tab' + (t === active ? ' active' : '');
      el.textContent = t;
      el.addEventListener('click', () => { active = t; renderTabs(); tabContent(t, bodyEl, close); });
      tabsEl.appendChild(el);
    }
  };
  renderTabs();
  tabContent(active, bodyEl, close);
  modal.addEventListener('mousedown', (e) => e.stopPropagation());
  overlay.addEventListener('mousedown', close);
  document.addEventListener('keydown', onKey);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
