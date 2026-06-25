// Minimapa — přehledové vykreslení uzlů + viewport rámeček, klik = pan
import { nodeColors, getState, getCanvasRect, applyTransform } from './app.js';

const MW = 200;   // šířka minimapy
const MH = 140;   // výška minimapy
const PAD = 8;    // vnitřní okraj

let cvs = null, ctx = null;
let lastNodes = [], lastView = null;
let scheduled = false, lastTime = 0;
let bbox = null, mscale = 1;
const moff = { x: 0, y: 0 };

// Lazy vytvoření <canvas> uvnitř #minimap
function ensure() {
  if (cvs) return;
  const mini = document.getElementById('minimap');
  cvs = document.createElement('canvas');
  cvs.width = MW;
  cvs.height = MH;
  cvs.style.display = 'block';
  cvs.style.borderRadius = '8px';
  mini.appendChild(cvs);
  ctx = cvs.getContext('2d');
  cvs.addEventListener('click', onClick);
}

// Vykreslení obsahu minimapy
function draw() {
  ensure();
  ctx.clearRect(0, 0, MW, MH);
  const nodes = lastNodes;
  if (!nodes.length) { bbox = null; return; }

  // 1. Bounding box všech uzlů
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  bbox = { minX, minY, maxX, maxY };
  const bw = (maxX - minX) || 1;
  const bh = (maxY - minY) || 1;

  // 2. Škálování do plochy s paddingem
  mscale = Math.min((MW - 2 * PAD) / bw, (MH - 2 * PAD) / bh);
  moff.x = PAD + ((MW - 2 * PAD) - bw * mscale) / 2;
  moff.y = PAD + ((MH - 2 * PAD) - bh * mscale) / 2;
  const tx = (x) => moff.x + (x - minX) * mscale;
  const ty = (y) => moff.y + (y - minY) * mscale;

  // 3. Uzly jako barevné obdélníky
  ctx.globalAlpha = 0.8;
  for (const n of nodes) {
    const c = nodeColors(n);
    ctx.fillStyle = c.stroke;
    ctx.fillRect(tx(n.x), ty(n.y), Math.max(1, n.width * mscale), Math.max(1, n.height * mscale));
  }
  ctx.globalAlpha = 1;

  // 4. Viewport rámeček (aktuální view přepočítaný do svg souřadnic)
  const v = lastView;
  const rect = getCanvasRect();
  const vx = (0 - v.x) / v.scale;
  const vy = (0 - v.y) / v.scale;
  const vw = rect.width / v.scale;
  const vh = rect.height / v.scale;
  ctx.strokeStyle = '#7C3AED';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx(vx), ty(vy), vw * mscale, vh * mscale);
}

// Throttle přes rAF, max 1× za 100ms
export function updateMinimap(nodes, viewTransform) {
  lastNodes = nodes || [];
  lastView = viewTransform;
  if (scheduled) return;
  scheduled = true;
  const now = performance.now();
  const wait = Math.max(0, 100 - (now - lastTime));
  const run = () => {
    lastTime = performance.now();
    scheduled = false;
    requestAnimationFrame(draw);
  };
  if (wait <= 0) run();
  else setTimeout(run, wait);
}

// Klik na minimapu → animovaný pan na danou pozici
function onClick(e) {
  if (!bbox) return;
  const r = cvs.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  // Zpět do svg souřadnic
  const sx = bbox.minX + (px - moff.x) / mscale;
  const sy = bbox.minY + (py - moff.y) / mscale;

  const v = getState().viewTransform;
  const rect = getCanvasRect();
  // Vystředit kliknutý bod ve viewportu
  v.x = rect.width / 2 - sx * v.scale;
  v.y = rect.height / 2 - sy * v.scale;

  const pg = document.getElementById('pan-group');
  pg.style.transition = 'transform 0.3s ease';
  applyTransform();
  setTimeout(() => { pg.style.transition = ''; }, 300);
}
