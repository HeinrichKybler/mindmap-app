// Hierarchický auto-layout — postorder výpočet šířky podstromu
const SIBLING_GAP = 50;   // mezera mezi sourozenci
const ROOT_GAP = 120;     // mezera mezi stromy
const V_GAP = 70;         // svislý krok navíc k výšce uzlu
const START_Y = 60;       // počáteční y všech stromů

// --- Pomůcky pro „chytré" řazení sourozenců (méně křížení) ---
// Sousedé z VŠECH hran (hierarchie i vztahy) → seznam id
function buildAdjacency(nodes, edges) {
  const adj = {};
  nodes.forEach((n) => { adj[n.id] = []; });
  if (Array.isArray(edges)) {
    for (const e of edges) {
      if (adj[e.fromId] && adj[e.toId]) { adj[e.fromId].push(e.toId); adj[e.toId].push(e.fromId); }
    }
  }
  return adj;
}
// Cena rozložení = součet vodorovných vzdáleností konců hran (méně = související uzly blíž)
function layoutCost(nodes, edges) {
  if (!Array.isArray(edges) || !edges.length) return 0;
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  let cost = 0;
  for (const e of edges) {
    const a = byId[e.fromId], b = byId[e.toId];
    if (a && b) cost += Math.abs((a.x + a.width / 2) - (b.x + b.width / 2));
  }
  return cost;
}
// Snímek pořadí sourozenců (id) — pro návrat k nejlepší variantě
function snapshotOrder(roots, children) {
  const o = { roots: roots.map((n) => n.id), children: {} };
  for (const id in children) o.children[id] = children[id].map((n) => n.id);
  return o;
}
function restoreOrder(o, roots, children, byId) {
  roots.length = 0;
  o.roots.forEach((id) => roots.push(byId[id]));
  for (const id in o.children) children[id] = o.children[id].map((cid) => byId[cid]);
}

// Přepočítá x,y všech uzlů a vrátí stejné pole.
// Když dostane `edges`, seřadí sourozence tak, aby související uzly byly blíž (méně křížení).
export function applyLayout(nodes, edges) {
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const children = {};
  nodes.forEach((n) => { children[n.id] = []; });

  // Root = bez rodiče nebo rodič mimo množinu uzlů
  const roots = [];
  for (const n of nodes) {
    if (n.parentId == null || !byId[n.parentId]) roots.push(n);
    else children[n.parentId].push(n);
  }

  const widthCache = {};

  // Postorder: šířka podstromu = max(node.width, součet šířek potomků + mezery)
  function subtreeWidth(n) {
    const kids = children[n.id];
    if (!kids.length) return (widthCache[n.id] = n.width);
    let sum = 0;
    kids.forEach((k, i) => {
      sum += subtreeWidth(k);
      if (i) sum += SIBLING_GAP;
    });
    return (widthCache[n.id] = Math.max(n.width, sum));
  }

  // Přiřazení pozic: uzel vystředěn nad svými potomky
  function place(n, leftX, y) {
    const w = widthCache[n.id];
    n.x = leftX + (w - n.width) / 2;
    n.y = y;
    const kids = children[n.id];
    if (!kids.length) return;
    const totalKids = kids.reduce((s, k, i) => s + widthCache[k.id] + (i ? SIBLING_GAP : 0), 0);
    let cx = leftX + (w - totalKids) / 2;
    const ny = y + n.height + V_GAP;
    for (const k of kids) {
      place(k, cx, ny);
      cx += widthCache[k.id] + SIBLING_GAP;
    }
  }

  function placeAll() {
    let curX = 0;
    for (const r of roots) {
      subtreeWidth(r);
      place(r, curX, START_Y);
      curX += widthCache[r.id] + ROOT_GAP;
    }
  }

  placeAll();

  // Chytré řazení sourozenců — barycenter heuristika; ponecháme variantu s nejnižší cenou,
  // takže výsledek není nikdy horší než původní pořadí.
  if (Array.isArray(edges) && edges.length) {
    const adj = buildAdjacency(nodes, edges);
    const centerX = (n) => n.x + n.width / 2;
    const baryOf = (n) => {
      const ns = adj[n.id];
      if (!ns.length) return centerX(n);
      let s = 0;
      for (const id of ns) s += centerX(byId[id]);
      return s / ns.length;
    };
    let bestCost = layoutCost(nodes, edges);
    let bestOrder = snapshotOrder(roots, children);
    for (let iter = 0; iter < 4; iter++) {
      roots.sort((a, b) => baryOf(a) - baryOf(b));
      for (const id in children) children[id].sort((a, b) => baryOf(a) - baryOf(b));
      placeAll();
      const c = layoutCost(nodes, edges);
      if (c < bestCost) { bestCost = c; bestOrder = snapshotOrder(roots, children); }
    }
    restoreOrder(bestOrder, roots, children, byId);
    placeAll();
  }
  return nodes;
}

// Rozrazí překrývající se uzly (AABB) tak, aby měly aspoň `gap` mezeru.
// Bezpečnostní pas po jakémkoli layoutu — žádné dva uzly pak neleží přes sebe.
export function resolveOverlaps(nodes, gap = 24) {
  const MAX_ITER = 80;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let any = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);   // překryv X
        const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y); // překryv Y
        const needX = ox + gap, needY = oy + gap;  // co chybí do mezery na dané ose
        if (needX > 0 && needY > 0) {              // moc blízko na obou osách → odtlač
          any = true;
          if (needX <= needY) {
            const push = needX / 2;
            if ((a.x + a.width / 2) <= (b.x + b.width / 2)) { a.x -= push; b.x += push; }
            else { a.x += push; b.x -= push; }
          } else {
            const push = needY / 2;
            if ((a.y + a.height / 2) <= (b.y + b.height / 2)) { a.y -= push; b.y += push; }
            else { a.y += push; b.y -= push; }
          }
        }
      }
    }
    if (!any) break;
  }
  return nodes;
}

// --- Sdílená stavba stromu (byId, children, roots, depth) ---
function buildTree(nodes) {
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const children = {};
  nodes.forEach((n) => { children[n.id] = []; });
  const roots = [];
  for (const n of nodes) {
    if (n.parentId == null || !byId[n.parentId]) roots.push(n);
    else children[n.parentId].push(n);
  }
  const depth = {};
  const setDepth = (n, d) => { depth[n.id] = d; children[n.id].forEach((k) => setDepth(k, d + 1)); };
  roots.forEach((r) => setDepth(r, 0));
  return { byId, children, roots, depth };
}

// --- Radial: root ve středu, potomci po kružnicích (poloměr = hloubka * 180) ---
export function applyRadial(nodes) {
  const { children, roots, depth } = buildTree(nodes);
  const RING = 180;
  let cursorX = 0;
  for (const root of roots) {
    // Posbírej uzly tohoto stromu (a podle hloubky pro rozmístění na kružnice)
    const tree = [];
    const byDepth = {};
    const collect = (n) => {
      tree.push(n);
      (byDepth[depth[n.id]] = byDepth[depth[n.id]] || []).push(n);
      children[n.id].forEach(collect);
    };
    collect(root);

    // Rozmísti kolem lokálního středu (0,0)
    for (const d in byDepth) {
      const ring = Number(d);
      const r = ring * RING;
      const arr = byDepth[d];
      if (ring === 0) {
        arr[0].x = -arr[0].width / 2;
        arr[0].y = -arr[0].height / 2;
        continue;
      }
      arr.forEach((n, i) => {
        const ang = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
        n.x = r * Math.cos(ang) - n.width / 2;
        n.y = r * Math.sin(ang) - n.height / 2;
      });
    }

    // Posuň celý strom tak, aby jeho levý okraj navázal na předchozí (garance nepřekrytí)
    let minX = Infinity, maxX = -Infinity;
    for (const n of tree) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.width); }
    const shift = cursorX - minX;
    for (const n of tree) n.x += shift;
    cursorX = maxX + shift + ROOT_GAP;
  }
  return nodes;
}

// --- Fishbone: centrální osa, hlavní větve střídavě 45°, detaily vodorovně ---
export function applyFishbone(nodes) {
  const { children, roots } = buildTree(nodes);
  const BRANCH_DX = 240;   // krok hlavních větví po ose
  const BRANCH_DY = 150;   // svislé odsazení větve od osy
  const DETAIL_DX = 170;   // vodorovný krok detailů
  const DETAIL_DY = 56;    // svislý krok mezi detaily
  let originX = 0;

  for (const root of roots) {
    root.x = originX; root.y = -root.height / 2;
    let maxX = originX + root.width;
    // Detaily doprava, vertikálně centrované kolem své souřadnice (jako hlavní větve);
    // první potomek odsazen o krok, ať nepřekrývá rodiče. maxX sleduje skutečný pravý okraj.
    const placeDetail = (n, x, y, dir) => {
      n.x = x; n.y = y - n.height / 2;
      maxX = Math.max(maxX, x + n.width);
      children[n.id].forEach((k, i) => placeDetail(k, x + DETAIL_DX, y + dir * (i + 1) * DETAIL_DY, dir));
    };
    children[root.id].forEach((m, i) => {
      const up = i % 2 === 0 ? -1 : 1;
      const bx = originX + root.width + BRANCH_DX * (Math.floor(i / 2) + 1);
      const by = up * BRANCH_DY;
      m.x = bx; m.y = by - m.height / 2;
      maxX = Math.max(maxX, bx + m.width);
      children[m.id].forEach((d, j) => placeDetail(d, bx + DETAIL_DX, by + up * (j + 1) * DETAIL_DY, up));
    });
    originX = maxX + ROOT_GAP;
  }
  return nodes;
}

// --- Org chart: jako hierarchie, ale uniformní výška řádků dle hloubky ---
export function applyOrgChart(nodes) {
  const { children, roots, depth } = buildTree(nodes);
  const widthCache = {};
  const subtreeWidth = (n) => {
    const kids = children[n.id];
    if (!kids.length) return (widthCache[n.id] = n.width);
    let sum = 0;
    kids.forEach((k, i) => { sum += subtreeWidth(k); if (i) sum += SIBLING_GAP; });
    return (widthCache[n.id] = Math.max(n.width, sum));
  };
  // Uniformní řádky: nejvyšší uzel určuje krok
  const rowH = Math.max(...nodes.map((n) => n.height), 48) + V_GAP;

  const place = (n, leftX) => {
    const w = widthCache[n.id];
    n.x = leftX + (w - n.width) / 2;
    n.y = START_Y + depth[n.id] * rowH;
    const kids = children[n.id];
    if (!kids.length) return;
    const total = kids.reduce((s, k, i) => s + widthCache[k.id] + (i ? SIBLING_GAP : 0), 0);
    let cx = leftX + (w - total) / 2;
    for (const k of kids) { place(k, cx); cx += widthCache[k.id] + SIBLING_GAP; }
  };

  let curX = 0;
  for (const r of roots) { subtreeWidth(r); place(r, curX); curX += widthCache[r.id] + ROOT_GAP; }
  return nodes;
}
