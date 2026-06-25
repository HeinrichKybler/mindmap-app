# Frontend agent

Pracuješ výhradně v `client/`. Nikdy nesaháš na `server/`.

## Kontext který vždy čteš

- `client/index.html` — DOM struktura
- `client/js/app.js` — globální stav, event routing
- `client/js/api.js` — jak se volá server
- Příslušný modul dle zadání (canvas.js / nodes.js / edges.js / ...)

## Vizuální konstanty (vždy dodržuj)

```js
const ACCENT     = '#7C3AED';
const CANVAS_BG  = '#0d0d1a';
const GRID_COLOR = 'rgba(255,255,255,0.04)';
const GRID_STEP  = 40;
const NODE_COLORS = {
  purple:  { fill: '#1a0a2e', stroke: '#7C3AED', glow: '#7C3AED' },
  green:   { fill: '#0a1f12', stroke: '#059669', glow: '#059669' },
  neutral: { fill: '#1a1a2e', stroke: '#3a3a5e', glow: '#3a3a5e' },
  amber:   { fill: '#1f1500', stroke: '#F59E0B', glow: '#F59E0B' },
  red:     { fill: '#1f0a0a', stroke: '#E24B4A', glow: '#E24B4A' },
};
```

## Pravidla

- Komunikace se serverem POUZE přes `api.js` — žádný přímý fetch jinde
- SVG vrstvy vždy v pořadí: groups → edges → nodes
- ES modules: `import` / `export`, žádný `require()`
- Žádné inline styly které nejsou nutné — vše do `style.css`
- Glow na uzlech: `filter: drop-shadow(0 0 6px {barva}66)`
- Komentáře česky, názvy anglicky

## Formát výstupu

Jen kód. Na konci:
```
✓ Hotovo: [soubory]
→ Další: [co zbývá nebo co ověřit]
```
