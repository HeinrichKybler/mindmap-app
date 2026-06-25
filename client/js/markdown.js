// Minimalistický bezpečný markdown → HTML renderer (bez závislostí).
// Pokrývá: nadpisy, tučné/kurzíva, inline code, code blocky, odkazy, seznamy, čáry, odstavce.
// HTML se vždy escapuje, takže vstup nelze zneužít k injekci.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline formátování uvnitř řádku (vstup už escapovaný proti HTML)
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);                 // `code`
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,                       // [text](url)
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');                    // **tučně**
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');                      // *kurzíva*
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');                        // _kurzíva_
  return s;
}

// Je řádek začátkem blokového prvku? (kvůli spojování odstavců)
function isBlockStart(line) {
  return /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|(---|\*\*\*|___)\s*$)/.test(line);
}

export function renderMarkdown(text) {
  if (!text) return '';
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let html = '', i = 0, listType = null;  // listType: 'ul' | 'ol' | null
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    // Code block ``` … ```
    if (/^```/.test(line)) {
      closeList();
      i++;
      let code = '';
      while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + '\n'; i++; }
      i++;  // přeskoč uzavírací ```
      html += `<pre><code>${esc(code)}</code></pre>`;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lv = h[1].length; html += `<h${lv}>${inline(h[2])}</h${lv}>`; i++; continue; }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) { closeList(); html += '<hr>'; i++; continue; }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) { if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; } html += `<li>${inline(ul[1])}</li>`; i++; continue; }
    if (ol) { if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; } html += `<li>${inline(ol[1])}</li>`; i++; continue; }

    if (!line.trim()) { closeList(); i++; continue; }

    // Odstavec — spoj následující neprázdné ne-blokové řádky
    closeList();
    let para = line; i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para += ' ' + lines[i]; i++; }
    html += `<p>${inline(para)}</p>`;
  }
  closeList();
  return html;
}
