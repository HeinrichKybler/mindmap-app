// Timeline režim — uzly rozmístěné podél vodorovné časové osy podle node.date.
// Aktivace uloží původní pozice, deaktivace je obnoví.
import { getState, renderMap, getCanvasRect } from './app.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const AXIS_COLOR = '#7C3AED44';
const DATE_COLOR = '#7C3AED';
const FONT = "'Inter', system-ui, sans-serif";

let active = false;
let snapshot = null;   // { nodeId: { x, y } } — pozice před vstupem do timeline
let axisInfo = null;   // { left, right, y, dated[] } pro vykreslení osy

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export function isActive() { return active; }

export function toggle() {
  if (active) deactivate();
  else activate();
}

// ISO 'YYYY-MM-DD' → 'DD.MM.YYYY'
function formatDate(iso) {
  const datePart = String(iso).split('T')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}.${m}.${y}`;
}

// --- Rozmístění uzlů podél osy (v mapových souřadnicích aktuálního viewportu) ---
function layout() {
  const nodes = getState().map.nodes;
  const v = getState().viewTransform;
  const rect = getCanvasRect();

  // Hranice viditelné plochy přepočtené do mapových souřadnic
  const left = (-v.x) / v.scale;
  const right = (rect.width - v.x) / v.scale;
  const centerY = (rect.height / 2 - v.y) / v.scale;

  const margin = 120;
  const usableL = left + margin;
  const usableR = right - margin;
  const usableW = Math.max(200, usableR - usableL);

  const dated = nodes
    .filter((n) => n.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const undated = nodes
    .filter((n) => !n.date)
    .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'cs'));

  // Datované rovnoměrně podél osy, nad ní, se svislou spojnicí dolů
  const gap = usableW / (dated.length + 1);
  dated.forEach((n, i) => {
    const cx = usableL + gap * (i + 1);
    n.x = cx - n.width / 2;
    n.y = centerY - 90 - n.height;
  });

  // Nedatované do sloupce vlevo nad osou, abecedně
  undated.forEach((n, i) => {
    n.x = left + 20;
    n.y = centerY - 110 - n.height - i * (n.height + 16);
  });

  axisInfo = { left: usableL - 40, right: usableR + 40, y: centerY, dated };
}

function activate() {
  const nodes = getState().map.nodes;
  if (!nodes.length) return;
  snapshot = {};
  for (const n of nodes) snapshot[n.id] = { x: n.x, y: n.y };
  active = true;
  layout();
  renderMap();  // renderMap zavolá drawAxis() přes hook
  const btn = document.getElementById('timeline-btn');
  if (btn) btn.classList.add('active');
}

export function deactivate() {
  active = false;
  const nodes = getState().map.nodes;
  if (snapshot) {
    for (const n of nodes) {
      const p = snapshot[n.id];
      if (p) { n.x = p.x; n.y = p.y; }
    }
  }
  snapshot = null;
  axisInfo = null;
  removeAxis();
  renderMap();
  const btn = document.getElementById('timeline-btn');
  if (btn) btn.classList.remove('active');
}

// Vrátí hlubokou kopii mapy s pozicemi uzlů vrácenými na snapshot (před-timeline)
// hodnoty. Timeline je čistě prezentační — na disk se nikdy nesmí uložit layout
// souřadnice; datové změny (date, label, color, …) přitom zůstanou zachované.
export function mapForSave(map) {
  const copy = JSON.parse(JSON.stringify(map));
  if (snapshot) {
    for (const n of copy.nodes) {
      const p = snapshot[n.id];
      if (p) { n.x = p.x; n.y = p.y; }
    }
  }
  return copy;
}

// Přepočítá rozmístění (např. po změně data uzlu, je-li timeline aktivní)
export function refresh() {
  if (!active) return;
  layout();
  renderMap();
}

function removeAxis() {
  const old = document.getElementById('timeline-layer');
  if (old) old.remove();
}

// Vykreslí osu, svislé spojnice a popisky dat. Volá se z app.renderMap().
export function drawAxis() {
  if (!active || !axisInfo) return;
  const pg = document.getElementById('pan-group');
  if (!pg) return;
  removeAxis();

  const layer = el('g', { id: 'timeline-layer' });

  // Vodorovná osa
  layer.appendChild(el('line', {
    x1: axisInfo.left, y1: axisInfo.y, x2: axisInfo.right, y2: axisInfo.y,
    stroke: AXIS_COLOR, 'stroke-width': 2,
  }));

  // Pro každý datovaný uzel svislá spojnice + datum pod osou
  for (const n of axisInfo.dated) {
    const cx = n.x + n.width / 2;
    layer.appendChild(el('line', {
      x1: cx, y1: n.y + n.height, x2: cx, y2: axisInfo.y,
      stroke: AXIS_COLOR, 'stroke-width': 1.5,
    }));
    const label = el('text', {
      x: cx, y: axisInfo.y + 16, 'text-anchor': 'middle',
      fill: DATE_COLOR, 'font-size': 10, 'font-family': FONT,
    });
    label.textContent = formatDate(n.date);
    layer.appendChild(label);
  }

  // Pod ostatní vrstvy (grid → timeline → groups → edges → nodes)
  pg.insertBefore(layer, pg.firstChild);
}
