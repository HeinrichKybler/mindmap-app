// Inline modal pro textový vstup — náhrada za window.prompt(), které v Electronu nefunguje.
// Vrací Promise<string|null> (null = zrušeno přes Esc / Zrušit / klik mimo).

(function injectStyles() {
  if (document.getElementById('prompt-style')) return;
  const s = document.createElement('style');
  s.id = 'prompt-style';
  s.textContent = `
    #prompt-overlay { position: fixed; inset: 0; z-index: 600; background: #000000cc;
      display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif; }
    #prompt-box { width: 360px; max-width: 92vw; background: #15152a; border: 1px solid #7C3AED44;
      border-radius: 12px; box-shadow: 0 20px 60px #000a; padding: 20px; }
    #prompt-box .prompt-msg { color: #e5e5f0; font-size: 14px; margin-bottom: 12px; }
    #prompt-box input { width: 100%; padding: 9px 11px; font-size: 14px; color: #e5e5f0;
      background: #0a0a16; border: 1px solid #7C3AED55; border-radius: 6px; outline: none; }
    #prompt-box input:focus { border-color: #7C3AED; }
    #prompt-box .prompt-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    #prompt-box button { padding: 7px 16px; font-size: 13px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; }
    #prompt-box .prompt-ok { color: #fff; background: #7C3AED; }
    #prompt-box .prompt-ok:hover { background: #6d28d9; }
    #prompt-box .prompt-cancel { color: #c5c5d8; background: #2a2a44; }
    #prompt-box .prompt-cancel:hover { background: #34344f; }`;
  document.head.appendChild(s);
})();

// message = popisek nad polem, def = předvyplněná hodnota
export function promptText(message, def = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'prompt-overlay';
    const box = document.createElement('div');
    box.id = 'prompt-box';

    const msg = document.createElement('div');
    msg.className = 'prompt-msg';
    msg.textContent = message;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = def;

    const actions = document.createElement('div');
    actions.className = 'prompt-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'prompt-cancel';
    cancelBtn.textContent = 'Zrušit';
    const okBtn = document.createElement('button');
    okBtn.className = 'prompt-ok';
    okBtn.textContent = 'OK';
    actions.append(cancelBtn, okBtn);

    box.append(msg, input, actions);
    overlay.appendChild(box);

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve(val);
    };

    // Vstup izolujeme od globálních zkratek (app.js poslouchá keydown na document)
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
    });
    cancelBtn.addEventListener('click', () => finish(null));
    okBtn.addEventListener('click', () => finish(input.value));
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(null); });

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}
