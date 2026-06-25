// Cheatsheet klávesových zkratek — tmavý modal, zavře Escape nebo klik mimo (klávesa ?)

const SHORTCUTS = [
  ['Tab', 'Nový potomek vybraného uzlu'],
  ['Enter', 'Nový sourozenec'],
  ['N', 'Nový potomek (alternativa)'],
  ['F2', 'Přejmenovat vybraný uzel'],
  ['Ctrl+Enter', 'Otevři poznámku uzlu'],
  ['Ctrl+D', 'Duplikuj uzel i s větví'],
  ['Ctrl+G', 'Seskup uzel do nové skupiny'],
  ['Ctrl+B', 'Záložka na uzlu (toggle)'],
  ['Ctrl+Shift+B', 'Záložky napříč mapami'],
  ['Ctrl+L', 'Propojovací režim'],
  ['Alt+↑ / Alt+↓', 'Přesuň mezi sourozenci'],
  ['Alt+←', 'O úroveň výš'],
  ['Alt+→', 'O úroveň níž'],
  ['Space', 'Sbalit / rozbalit uzel'],
  ['Delete', 'Smaž vybrané'],
  ['Ctrl+M', 'Skrýt / zobrazit minimapu'],
  ['Ctrl+0', 'Vše do view (Fit)'],
  ['Ctrl+1 … 9', 'Přepni na mapu 1–9'],
  ['Ctrl+Shift+F', 'Focus mode'],
  ['Ctrl+P', 'Pitch mode (prezentace)'],
  ['Ctrl+F', 'Hledání'],
  ['Ctrl+Z / Ctrl+Y', 'Zpět / Vpřed'],
  ['Ctrl+S', 'Uložit'],
  ['Escape', 'Zruš akci / zavři'],
  ['?', 'Tato nápověda'],
];

let overlay = null;

(function injectStyles() {
  if (document.getElementById('cheatsheet-style')) return;
  const s = document.createElement('style');
  s.id = 'cheatsheet-style';
  s.textContent = `
    #cheatsheet-overlay {
      position: fixed; inset: 0; z-index: 500; background: #000000cc;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #cheatsheet {
      background: #15152a; border: 1px solid #7C3AED44; border-radius: 12px;
      padding: 24px 28px; max-height: 80vh; overflow-y: auto;
      box-shadow: 0 20px 60px #000a;
      scrollbar-width: thin; scrollbar-color: #7C3AED44 transparent;
    }
    #cheatsheet h2 { color: #7C3AED; font-size: 16px; margin-bottom: 16px; font-weight: 700; }
    #cheatsheet .cs-grid {
      display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 6px 28px;
    }
    #cheatsheet .cs-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
    #cheatsheet kbd {
      flex: 0 0 auto; min-width: 96px; text-align: center;
      font-family: 'Inter', monospace; font-size: 12px; color: #e5e5f0;
      background: #0a0a16; border: 1px solid #7C3AED55; border-radius: 5px; padding: 3px 8px;
    }
    #cheatsheet .cs-desc { color: #c8c8da; font-size: 13px; }`;
  document.head.appendChild(s);
})();

export function isOpen() { return !!overlay; }

export function close() {
  if (overlay) { overlay.remove(); overlay = null; }
}

export function open() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'cheatsheet-overlay';
  const box = document.createElement('div');
  box.id = 'cheatsheet';
  const rows = SHORTCUTS.map(([k, d]) =>
    `<div class="cs-row"><kbd>${k}</kbd><span class="cs-desc">${d}</span></div>`).join('');
  box.innerHTML = `<h2>Klávesové zkratky</h2><div class="cs-grid">${rows}</div>`;
  box.addEventListener('mousedown', (e) => e.stopPropagation());
  overlay.addEventListener('mousedown', close);  // klik mimo
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function toggle() { overlay ? close() : open(); }
