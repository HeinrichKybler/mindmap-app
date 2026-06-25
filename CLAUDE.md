# CLAUDE.md — mindmap-app

## Základní pravidla (čti první, vždy)

Jsi senior full-stack developer. Píšeš kód. Nevysvětluješ co děláš — děláš to.

**Nikdy:**
- Nepíšeš odstavce textu před kódem ani po něm
- Neptáš se na věci které můžeš rozhodnout sám
- Nepíšeš summary po každém souboru
- Neměníš kód který ti nebyl zadán ke změně
- Nepřidáváš featury které nebyly zadány
- Nenecháváš TODO komentáře — buď to implementuješ, nebo to není v zadání

**Vždy:**
- Rozhodneš sám, implementuješ, pokračuješ
- Ptáš se POUZE pokud skutečně chybí informace bez které kód nelze napsat
- Na konci session vypíšeš: seznam upravených/vytvořených souborů + jedna věta co je dalším krokem
- Spouštíš příkazy (npm install, npm test, node ...) automaticky bez ptání
- Pokud narazíš na konec kapacity uprostřed práce: zastav, napiš přesně který soubor/funkce je rozpracovaná a co zbývá

**Jazyk:**
- Komentáře v kódu: čeština
- Názvy funkcí, proměnných, souborů, tříd: angličtina
- Výstupy do terminálu (console.log, chybové hlášky): čeština

---

## Projekt

**Název:** mindmap-app  
**Umístění:** `C:\Users\User\Documents\Project\mindmap-app\`  
**Data:** `C:\Users\User\Documents\MindMap\` (maps/index.json + maps/{id}.json)  
**Port:** 3000 (`.env` → `PORT`)  
**Node.js** + Express backend, Vanilla JS frontend (ES modules), JSON úložiště

---

## Architektura — přehled vrstev

```
mindmap-app/
├── CLAUDE.md
├── ARCHITECTURE.md
├── package.json
├── electron-builder.yml      # konfigurace buildu (NSIS installer)
├── .env
├── .env.example
├── .gitignore
│
├── electron/                 # Desktop shell — CJS (vlastní package.json type:commonjs)
│   ├── main.js               # Entry point, fork serveru, BrowserWindow, lifecycle, quick capture
│   ├── tray.js               # Systémový tray (+ Rychlý nápad)
│   ├── quick-capture.html    # Mini okno „Rychlý nápad" (uloží uzel do skupiny Inbox)
│   └── preload.js            # Preload (contextIsolation)
│
├── build/                    # Ikony pro electron-builder
│   ├── icon.ico              # multi-size (16/32/48/256)
│   ├── icon.png              # 512×512
│   └── generate-icons.cjs    # generátor ikon (sharp)
│
├── server/                  # Backend vrstva — žádný přímý import z client/
│   ├── index.js             # Entry point, Express setup, middleware
│   ├── config.js            # Načítání .env, konstanty
│   ├── storage.js           # Veškerý přístup k souborovému systému
│   └── routes/
│       ├── maps.js          # GET/POST/PUT/DELETE /api/maps
│       ├── nodes.js         # Stub — uzly jsou součástí mapy v JSON
│       ├── livia.js         # Placeholder endpointy pro Lívii
│       └── github.js        # Placeholder pro GitHub integraci
│
├── client/                  # Frontend vrstva — žádný přímý require() na server/
│   ├── index.html
│   ├── style.css
│   ├── manifest.json        # PWA
│   ├── sw.js                # Service worker
│   └── js/
│       ├── app.js           # Entry point, inicializace, event routing
│       ├── api.js           # Veškerá komunikace se serverem (fetch wrapper)
│       ├── canvas.js        # SVG canvas, pan, zoom, mřížka, minimap
│       ├── nodes.js         # Render uzlů, drag, resize, collapse
│       ├── edges.js         # Render hran, bezier křivky, propojovací režim
│       ├── groups.js        # Skupinové rámečky
│       ├── layout.js        # Auto-layouty: hierarchie, radial, fishbone, org chart
│       ├── history.js       # Undo/redo stack
│       ├── search.js        # Fulltext hledání, Ctrl+F
│       ├── timeline.js      # Timeline režim — uzly podél časové osy (node.date)
│       ├── cheatsheet.js    # Modal klávesových zkratek (?)
│       ├── templates.js     # Šablony nových map (modal + stavba stromu)
│       ├── focus.js         # Focus mode (Ctrl+Shift+F)
│       ├── pitch.js         # Pitch mode — prezentace (Ctrl+P)
│       ├── drill.js         # Drill down — zobrazení jen vybrané větve + breadcrumb
│       ├── context-menu.js  # Nativní kontextové menu (pravý klik) v canvasu
│       ├── stats.js         # Statistiky aktuální mapy (panel v sidebaru)
│       ├── settings.js      # Modal nastavení (Obecné/Vzhled/Claude/Zkratky)
│       ├── tags.js          # Tag management, tag sidebar
│       ├── panel.js         # Pravý detail panel uzlu/hrany
│       ├── sidebar.js       # Levý sidebar (seznam map)
│       └── export.js        # PNG export, JSON export/import
│
└── server/tests/
    └── storage.test.js      # Jest unit testy pro storage.js
```

---

## Datový model

### maps/index.json
```json
[
  { "id": "uuid", "name": "Lívia", "updatedAt": "ISO" }
]
```

### maps/{id}.json
```json
{
  "id": "uuid",
  "name": "Lívia",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "nodes": [
    {
      "id": "uuid",
      "parentId": null,
      "label": "Lívia",
      "x": 400, "y": 300,
      "width": 160, "height": 48,
      "color": "purple",
      "customColor": null,
      "icon": null,
      "borderStyle": "solid",
      "opacity": 1.0,
      "bookmarked": false,
      "isSummary": false,
      "tags": ["ai", "projekt"],
      "note": "",
      "imageBase64": null,
      "githubUrl": "",
      "date": null,
      "task": { "enabled": false, "checked": false, "priority": null, "dueDate": null, "progress": 0 },
      "collapsed": false,
      "createdAt": "ISO"
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "fromId": "nodeId",
      "toId": "nodeId",
      "label": "",
      "isRelationship": false
    }
  ],
  "settings": { "autoNumber": false },
  "groups": [
    {
      "id": "uuid",
      "label": "Fáze 0",
      "color": "#7C3AED",
      "x": 100, "y": 100,
      "width": 400, "height": 300
    }
  ]
}
```

---

## API kontrakt

```
GET    /api/maps           → [{ id, name, updatedAt }]
POST   /api/maps           → { id, name, ... }          body: { name }
GET    /api/maps/:id       → celý objekt mapy
PUT    /api/maps/:id       → { ok: true }               body: celý objekt mapy
DELETE /api/maps/:id       → { ok: true }

GET    /api/settings       → { general, appearance, claude }
PUT    /api/settings       → { ok: true }              body: částečné nastavení (merge)

POST   /api/livia/expand   → { error: "not implemented" }
POST   /api/livia/summarize
POST   /api/livia/tags
POST   /api/livia/comment

GET    /api/github/issue   → { error: "not implemented" }
```

Chyby vždy: `{ error: "popis" }` + správný HTTP kód.  
Úspěch vždy: data nebo `{ ok: true }`.

---

## Komunikační pravidla mezi vrstvami

```
client/js/api.js  ──fetch──▶  server/routes/*.js  ──▶  server/storage.js  ──▶  disk
       ▲                                                        │
       └────────────────── JSON response ──────────────────────┘
```

- `client/` nikdy neimportuje nic ze `server/`
- `server/routes/` nikdy nevolá DOM ani `document`
- `server/storage.js` je jediný soubor který čte/píše na disk
- `client/js/api.js` je jediný soubor který volá `fetch` na `/api/`

---

## Vizuální konstanty (používej všude konzistentně)

```js
// Barvy uzlů
const NODE_COLORS = {
  purple:  { fill: '#1a0a2e', stroke: '#7C3AED', glow: '#7C3AED' },
  green:   { fill: '#0a1f12', stroke: '#059669', glow: '#059669' },
  neutral: { fill: '#1a1a2e', stroke: '#3a3a5e', glow: '#3a3a5e' },
  amber:   { fill: '#1f1500', stroke: '#F59E0B', glow: '#F59E0B' },
  red:     { fill: '#1f0a0a', stroke: '#E24B4A', glow: '#E24B4A' },
};

// Canvas
const CANVAS_BG        = '#0d0d1a';
const GRID_COLOR       = 'rgba(255,255,255,0.04)';
const GRID_STEP        = 40;
const ACCENT           = '#7C3AED';

// Glow filtr na uzlech (SVG filter)
// filter="drop-shadow(0 0 6px {glow}66)"

// Typografie
const FONT_FAMILY      = 'Inter, system-ui, sans-serif';
const FONT_NODE        = '13px';
const FONT_LABEL       = '11px';
```

---

## Kritické implementační detaily

**Storage (server/storage.js):**
- Vše synchronní: `fs.readFileSync` / `fs.writeFileSync`
- Data složka: `path.join(os.homedir(), 'Documents', 'MindMap')`
- Vytvoř složku při startu pokud neexistuje (`fs.mkdirSync(..., { recursive: true })`)
- Při každém `writeMap()` aktualizuj `updatedAt` v indexu

**Canvas (client/js/canvas.js):**
- SVG vrstvy v pořadí: `#groups-layer` → `#edges-layer` → `#nodes-layer`
- Pan: `mousedown` na `#canvas-bg` (ne na uzlech) + `mousemove` na `window`
- Zoom k pozici kurzoru: `panX = mouseX - (mouseX - panX) * delta`
- Mřížka: SVG `<pattern>` s `patternTransform` aktualizovaným při pan/zoom

**Bezier hrany (client/js/edges.js):**
```js
function cubicBezierPath(x1, y1, x2, y2) {
  const cy = (y2 - y1) * 0.5;
  return `M${x1},${y1} C${x1},${y1+cy} ${x2},${y2-cy} ${x2},${y2}`;
}
```

**Auto-save (client/js/app.js):**
- Debounce 300ms po každé změně stavu
- Volá `api.saveMap(currentMapId, getState())`
- Indikátor: zelená tečka v toolbaru zmizí po 2s

**Undo/redo (client/js/history.js):**
- Stack max 50 stavů, každý stav = `JSON.parse(JSON.stringify(state))` (deep clone)
- Push při: drag end, resize end, label blur, tag add/remove, color change, delete, create

**Minimap (client/js/canvas.js):**
- Pozice: `position: absolute`, top 60px, right 12px, 200×140px
- Aktualizace: throttle 100ms přes `requestAnimationFrame`
- Viewport rect = aktuální pan/zoom přepočítaný do minimap souřadnic

---

## Co dělat když narazíš na konec kapacity

```
⚠ KAPACITA: Zastavuji.
Dokončeno: [seznam souborů]
Rozpracováno: [soubor] → [funkce/sekce kde jsem skončil]
Zbývá: [stručný seznam]
Pokračuj příkazem: "Pokračuj od [soubor] funkce [název]"
```
