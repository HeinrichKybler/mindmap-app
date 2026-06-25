# ARCHITECTURE.md — mindmap-app

> Živý dokument. Aktualizuj při každé změně datového modelu nebo API kontraktu.
> Poslední update: 2026-06-25 (Electron; vlastní barva, timeline; zkratky, emoji/styl/opacity, layouty, šablony, task/focus/pitch mode)

---

## Stack

| Vrstva | Technologie | Soubory |
|--------|------------|---------|
| Desktop shell | Electron 28 (+ electron-builder) | `electron/` |
| Backend | Node.js 20+ + Express 4 | `server/` |
| Frontend | Vanilla JS ES modules | `client/js/` |
| Storage | JSON soubory na disku | `~/Documents/MindMap/` |
| Testy | Jest | `server/tests/` |
| PWA | manifest.json + service worker | `client/` |

### Electron shell

```
electron/main.js  ──fork──▶  server/index.js  (Express, port 3000)
       │                            │ process.send('ready')
       │ po 'ready' ◀──────────────┘
       ▼
  BrowserWindow → loadURL('http://localhost:3000')   (contextIsolation, preload)
  Tray (electron/tray.js): klik = zobraz/skryj, menu Otevřít | Ukončit
```

- `electron/package.json` = `{ "type": "commonjs" }` — Electron soubory jsou CJS, přestože root je ESM (kvůli sandboxed preloadu a fork serveru).
- Zavření okna pouze skryje do trayu; „Ukončit" zabije server proces a teprve poté `app.quit()`.
- Build: `electron-builder.yml` → `dist/MindMap Setup x.x.x.exe` (NSIS). `asar: false` kvůli `fork` serveru.
- Ikony: `build/icon.ico` / `build/icon.png` generuje `build/generate-icons.cjs` (sharp).

---

## Tok dat

```
Uživatel
  │ klik/drag/klávesa
  ▼
client/js/app.js          ← globální stav, event routing
  │ import
  ├── canvas.js           ← SVG pan/zoom/mřížka/minimap
  ├── nodes.js            ← render uzlů, drag, resize, collapse
  ├── edges.js            ← render hran, bezier, propojovací režim
  ├── groups.js           ← skupinové rámečky
  ├── layout.js           ← auto-layout (hierarchický strom)
  ├── history.js          ← undo/redo stack (max 50)
  ├── search.js           ← fulltext, Ctrl+F
  ├── timeline.js         ← timeline režim (uzly podél časové osy dle node.date)
  ├── tags.js             ← tag management + sidebar
  ├── panel.js            ← pravý detail panel
  ├── sidebar.js          ← levý seznam map
  └── export.js           ← PNG + JSON export/import
        │
        │ fetch (pouze přes api.js)
        ▼
client/js/api.js
        │
        │ HTTP JSON
        ▼
server/index.js → routes/*.js → storage.js → disk
```

---

## Modul odpovědnosti (frontend)

| Modul | Vlastní stav | Volá | Je voláno z |
|-------|-------------|------|-------------|
| app.js | `currentMap`, `selectedNode`, `selectedEdge`, `viewTransform` | vše | nikdo (entry point) |
| canvas.js | `panX`, `panY`, `scale` | — | app.js |
| nodes.js | `dragging`, `resizing` | history.js | app.js, canvas.js |
| edges.js | `connecting`, `connectFrom` | history.js | app.js |
| groups.js | `draggingGroup` | history.js | app.js |
| layout.js | — | nodes.js, history.js | app.js (on button click) |
| history.js | `undoStack[]`, `redoStack[]` | api.js (save) | app.js, nodes.js, edges.js, groups.js |
| search.js | `results[]`, `currentIdx` | canvas.js (pan to) | app.js |
| timeline.js | `active`, `snapshot` | app.js (renderMap) | app.js, panel.js |
| cheatsheet.js | `overlay` | — | app.js |
| templates.js | — | nodes.js (makeNode), layout.js | sidebar.js |
| focus.js | `active` | app.js (renderMap) | app.js |
| pitch.js | `active`, `slides`, `idx` | app.js (getState) | app.js |
| drill.js | `stack[]` | app.js (renderMap) | app.js, nodes.js, edges.js |
| context-menu.js | `menuEl` | nodes/edges/groups/panel/focus/drill | app.js (import) |
| stats.js | `collapsed` | app.js (getState) | sidebar.js, app.js (autoSave) |
| settings.js | `settings` | api.js, app.js, cheatsheet.js | app.js (⚙ + load) |
| tags.js | — | sidebar.js | panel.js |
| panel.js | `open`, `mode` (node/edge/group) | api.js | app.js |
| sidebar.js | `maps[]` | api.js | app.js |
| api.js | — | fetch | vše ostatní |
| export.js | — | canvas.js | app.js |

---

## Globální stav (app.js)

```js
const state = {
  currentMapId: null,      // string UUID nebo null
  map: {                   // aktuálně načtená mapa
    id, name, nodes, edges, groups
  },
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedGroupId: null,
  viewTransform: { x: 0, y: 0, scale: 1 },
  isDirty: false,          // neuložené změny
  isConnecting: false,     // propojovací režim
  connectFromId: null,
};
```

**Pravidlo:** Žádný jiný modul nemá vlastní kopii `nodes[]` ani `edges[]`.
Vždy čtou z `app.getState().map.nodes` a zapisují přes `app.setState(patch)`.

---

## Storage layout (disk)

```
C:\Users\User\Documents\MindMap\
├── maps/
│   ├── index.json         ← [{ id, name, updatedAt }]
│   ├── {uuid-1}.json      ← plná mapa (nodes + edges + groups)
│   └── {uuid-2}.json
└── uploads/               ← (rezervováno, zatím nepoužito — obrázky jsou Base64 v JSON)
```

---

## SVG DOM struktura (canvas)

```html
<svg id="canvas">
  <defs>
    <pattern id="grid">...</pattern>
    <marker id="arrowhead">...</marker>
    <filter id="glow-purple">...</filter>
    <!-- filter pro každou barvu uzlu -->
  </defs>
  <rect id="canvas-bg" fill="url(#grid)"/>   <!-- pan target, zachytává mousedown -->
  <g id="pan-group" transform="translate(x,y) scale(s)">
    <g id="groups-layer"/>   <!-- skupiny první (pod vším) -->
    <g id="edges-layer"/>    <!-- hrany druhé -->
    <g id="nodes-layer"/>    <!-- uzly nahoře -->
  </g>
</svg>
```

---

## Klávesové zkratky (kompletní seznam)

| Zkratka | Akce | Modul |
|---------|------|-------|
| Ctrl+Z | Undo | history.js |
| Ctrl+Y / Ctrl+Shift+Z | Redo | history.js |
| Ctrl+F | Hledání | search.js |
| Ctrl+Shift+F | Focus mode | focus.js |
| Delete / Backspace | Smaž vybrané | app.js |
| Escape | Deselect / zavři panel / overlay / zruš akci | app.js |
| N / Tab | Nový potomek vybraného uzlu | nodes.js |
| Enter | Nový sourozenec | nodes.js |
| F2 | Přejmenuj (fokus na název) | panel.js |
| Ctrl+Enter | Otevři poznámku | panel.js |
| Ctrl+D | Duplikuj uzel i s větví | nodes.js |
| Ctrl+G | Seskup uzel do skupiny | groups.js |
| Ctrl+B | Záložka na uzlu (toggle) | nodes.js |
| Ctrl+Shift+B | Záložky napříč mapami | sidebar.js |
| Ctrl+L | Propojovací režim | edges.js |
| Ctrl+M | Skrýt/zobrazit minimapu | app.js |
| Ctrl+P | Pitch mode | pitch.js |
| Ctrl+0 | Fit all | app.js |
| Ctrl+1..9 | Přepni mapu 1–9 | sidebar.js |
| Alt+↑/↓ | Přesun mezi sourozenci | nodes.js |
| Alt+←/→ | O úroveň výš / níž | nodes.js |
| Space | Collapse/expand vybraného uzlu | nodes.js |
| ? | Cheatsheet zkratek | cheatsheet.js |

---

## Lívia integrace (placeholder)

**Endpointy:** `server/routes/livia.js`  
**Port Lívie:** `process.env.LIVIA_PORT` (default 8000)  
**Volání:** `http://localhost:{LIVIA_PORT}/api/...`

Až bude Lívia připojená — vyplň tyto funkce:

```js
// server/routes/livia.js
router.post('/expand',    (req, res) => { /* volej Lívii */ });
router.post('/summarize', (req, res) => { /* volej Lívii */ });
router.post('/tags',      (req, res) => { /* volej Lívii */ });
router.post('/comment',   (req, res) => { /* volej Lívii */ });
```

---

## Rozhodnutí a jejich důvody

| Rozhodnutí | Alternativa | Proč takhle |
|-----------|------------|-------------|
| JSON soubory místo SQLite | SQLite, PostgreSQL | Git-friendly, plain text, snadné zálohování, žádný setup |
| Vanilla JS místo React | React, Vue, Svelte | Žádný bundler, okamžité načítání, čitelné pro debug, SVG canvas je stejně imperativní |
| Synchronní fs.* | Async/await | Jednoduchost, žádné race conditions při auto-save |
| Base64 obrázky v JSON | Separátní uploads/ složka | Vše v jednom souboru = snadný export/backup jedním souborem |
| ES modules bez bundleru | Webpack, Vite | Žádný build krok, okamžitý start, Claude Code to snadno čte |
| Přísné oddělení vrstev | Pragmatické | Agenti pracují v izolaci — backend-agent nikdy nerozlomí frontend |
