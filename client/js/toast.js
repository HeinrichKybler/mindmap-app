// Toast notifikace — pravý dolní roh, max 3 najednou, fade in/out
// Typy: info (#7C3AED), success (#059669), error (#E24B4A)

const COLORS = { info: '#7C3AED', success: '#059669', error: '#E24B4A' };
const MAX = 3;

let wrap = null;

// --- Injekce stylů (jen jednou) ---
(function injectStyles() {
  if (document.getElementById('toast-style')) return;
  const s = document.createElement('style');
  s.id = 'toast-style';
  s.textContent = `
    #toast-wrap {
      position: fixed; right: 16px; bottom: 16px; z-index: 400;
      display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
      pointer-events: none;
    }
    .toast {
      font-family: 'Inter', system-ui, sans-serif; font-size: 13px; color: #e5e5f0;
      background: #15152a; border: 1px solid #7C3AED33; border-left: 3px solid #7C3AED;
      border-radius: 8px; padding: 10px 14px; box-shadow: 0 6px 24px #0009;
      max-width: 320px; word-break: break-word;
      opacity: 0; transform: translateY(8px);
      transition: opacity .15s ease, transform .15s ease;  /* fade in 150ms */
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.hide {
      opacity: 0; transform: translateY(8px);
      transition: opacity .2s ease, transform .2s ease;    /* fade out 200ms */
    }`;
  document.head.appendChild(s);
})();

function ensureWrap() {
  if (wrap && document.body.contains(wrap)) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'toast-wrap';
  document.body.appendChild(wrap);
  return wrap;
}

// Zobrazí toast daného typu; nejstarší se odstraní při překročení MAX
export function toast(msg, type = 'info') {
  const w = ensureWrap();
  while (w.children.length >= MAX) w.firstChild.remove();

  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderLeftColor = COLORS[type] || COLORS.info;
  t.textContent = msg;
  w.appendChild(t);

  requestAnimationFrame(() => t.classList.add('show'));
  // Zobrazení 2.5s, pak fade out 200ms a odstranění
  setTimeout(() => {
    t.classList.remove('show');
    t.classList.add('hide');
    setTimeout(() => t.remove(), 200);
  }, 2500);
}
