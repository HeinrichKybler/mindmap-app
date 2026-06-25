# Skill: nový JS modul

Použij když: potřebuješ nový soubor v `client/js/`

## Šablona nového modulu

```js
// client/js/{name}.js
// Popis: co tento modul dělá (1 věta)

import { getState, setState } from './app.js';

let _privateState = null;

export function init() {
  // Inicializace, volá se z app.js při startu
}

export function handleX(param) {
  // Logika
}
```

## Pravidla

- Každý modul exportuje `init()` který app.js volá při startu
- Globální stav aplikace je POUZE v `app.js` — ostatní moduly čtou přes import
- Žádné `document.getElementById` v modulech — přijímají DOM reference jako parametr
- Přidej `<script type="module" src="js/{name}.js">` do `index.html`
