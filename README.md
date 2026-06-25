# MindMap

Desktopová aplikace na myšlenkové mapy (Electron). Uzly, hrany, skupiny, časová osa,
prezentační režim, šablony, tasky a víc. Data se ukládají jako čitelné JSON soubory,
vše běží lokálně — žádný cloud, žádný účet.

---

## Instalace a spuštění

```bash
npm install        # jednorázově
npm start          # spustí desktop aplikaci (Electron)
```

| Příkaz | Co dělá |
|--------|---------|
| `npm start` | Desktop aplikace (Express server běží uvnitř jako child proces) |
| `npm run dev` | Totéž + otevřené DevTools |
| `npm run build` | Vytvoří instalátor `dist/MindMap Setup x.x.x.exe` |
| `npm run server-only` | Jen server na `http://localhost:3000` (bez okna — pro prohlížeč / LAN) |
| `npm run icons` | Přegeneruje ikony aplikace |
| `npm test` | Spustí testy (Jest) |

**Tray:** Zavření okna aplikaci neukončí — schová ji do systémového traye.
Klik na ikonu v trayi okno zobrazí/skryje, pravý klik → **Otevřít** / **Ukončit**.

**Data:** `C:\Users\<jméno>\Documents\MindMap\` — `maps/index.json` + jedna `.json`
na každou mapu. Lze otevřít v jakémkoli textovém editoru, zálohovat zkopírováním složky.

---

## Rychlý start (5 kroků)

1. **Vytvoř mapu** — v levém sidebaru klikni **+ Nová mapa**, vyber šablonu (nebo *Prázdná*).
2. **Přidej uzel** — dvojklik do prázdné plochy = nový kořenový uzel.
3. **Uprav uzel** — klikni na uzel → vpravo se otevře panel (název, barva, ikona, tagy, …).
4. **Větvi** — vybraný uzel + klávesa **Tab** (potomek) nebo **Enter** (sourozenec).
5. **Ukládá se samo** — zelená tečka v toolbaru potvrdí auto-save. Nic neukládáš ručně.

---

## Mapy a šablony

- **+ Nová mapa** otevře výběr šablony:
  - **Prázdná** — čistá plocha
  - **Projekt** — Projekt → Fáze 1/2 → úkoly + Poznámky
  - **Brainstorming** — Téma → 4 nápady
  - **SWOT** — silné/slabé stránky, příležitosti, hrozby
  - **Lívia arch.** — kostra architektury (Brain, TTS, STT, Wake Word, API)
- **⋯** u mapy → Přejmenovat / Smazat.
- **Ctrl+1 … 9** přepne na mapu podle pořadí v sidebaru.
- Pod seznamem map je **sbalitelný panel statistik** aktuální mapy (uzly, hloubka,
  skupiny, top tagy, záložky, tasky) — aktualizuje se při každé změně.

---

## Uzly

**Vytvoření**
- Dvojklik do prázdna → kořenový uzel.
- Vybraný uzel + **Tab** / **N** / panel „**+ Potomek**" → potomek.
- Vybraný uzel + **Enter** → sourozenec.
- **Ctrl+D** → duplikuje uzel i s celou větví.

**Pohyb a velikost**
- Táhni tělo uzlu = přesun (potomci se posunou s ním v rámci skupiny).
- Táhni pravý dolní roh = změna velikosti.
- **Alt+↑ / Alt+↓** → přesun mezi sourozenci.
- **Alt+← / Alt+→** → o úroveň výš (k dědovi) / níž (k předchozímu sourozenci).

**Detail panel (vpravo)** — otevře se kliknutím na uzel:
- **Název** (dvojklik na uzel = rychlý inline edit, nebo **F2**)
- **Barva** — 8 přednastavených odstínů + vlastní (paleta `barva` / hex), živý náhled
- **Ikona** — mřížka emoji (zobrazí se vlevo v uzlu), × odebere
- **Styl hranice** — plná / čárkovaná / tečkovaná / dvojitá
- **Průhlednost** — posuvník 20–100 %
- **Tagy** — Enter přidá; klik na tag otevře přehled uzlů s tím tagem
- **Poznámka** — víceřádkový text (**Ctrl+Enter** skočí rovnou sem)
- **Obrázek** — nahraj (max 2 MB, uloží se jako miniatura vlevo, klik = zvětšení)
- **GitHub** — odkaz (ikonka v uzlu otevře odkaz)
- **Datum** — pro Timeline režim
- **Task** — viz níže

**Mazání:** vyber uzel + **Delete**, nebo táhni uzel na **koš** (vpravo dole).
Smaže se i s potomky a jejich hranami.

**Sbalení:** **Space** nebo ▾/▸ vlevo v uzlu sbalí/rozbalí potomky (badge `+N` ukáže počet skrytých).

---

## Hrany

- **⟶ Propojit** (toolbar) nebo **Ctrl+L** → klikni zdrojový a cílový uzel.
- Hrana mezi rodičem a potomkem vzniká automaticky při větvení.
- **Vztahová hrana** (spojení napříč větvemi, ne rodič‑potomek) se vykreslí
  fialově čárkovaně a při vytvoření se zeptá na popis.
- Klik na hranu → panel s **popiskem** + smazání. **Delete** smaže vybranou hranu.

---

## Skupiny

- **+ Skupina** (toolbar) → rámeček doprostřed plochy.
- **Ctrl+G** → obalí vybraný uzel i s podstromem do nové skupiny.
- Táhni uzel dovnitř/ven = přidání/odebrání ze skupiny. Táhni skupinu = pohne i členy.
- Klik na rámeček → panel (název, barva, smazání).

---

## Kontextové menu (pravý klik)

Pravý klik v ploše otevře nabídku podle toho, na co klikneš:

- **Na uzel** — Přejmenovat · Přidat potomka · Duplikovat · **Záložka ⭐** (přidat/odebrat) ·
  Focus na větev · **Drill down** · Změnit barvu (8 odstínů) · Smazat
- **Na hranu** — Upravit popisek · Smazat
- **Na skupinu** — Přejmenovat · Změnit barvu · Smazat
- **Na prázdno** — Nový uzel zde · Nová skupina zde · Fit all

**Záložka ⭐** — označí uzel hvězdičkou v pravém horním rohu (`node.bookmarked`);
**Ctrl+B** přepíná na vybraném uzlu, **Ctrl+Shift+B** otevře v sidebaru seznam záložek
napříč **všemi** mapami (klik = přepne mapu a skočí na uzel).

**Summary** (pravý klik na uzel → *Přidat summary*) vytvoří souhrnný uzel
napojený hranami na sourozence vybraného uzlu.

**Drill down** — schová vše kromě vybrané větve a zobrazí ji jako samostatný strom.
Nahoře se objeví **breadcrumb** („Hlavní mapa › … "); klik na úroveň se tam vrátí,
**Escape** vyjede o úroveň výš.

---

## Task mode

V panelu uzlu zapni **Task mode**:
- **☐/☑** vlevo v uzlu — klik odškrtne úkol (splněný = přeškrtnutý + ztlumený).
- **Priorita** 🔴 / 🟡 / 🟢 (vysoká / střední / nízká) — určuje barvu pruhu.
- **Termín** (datum) a **Postup** 0–100 % (tenký pruh na spodní hraně uzlu).
- Toolbar **✓ Tasky** zobrazí na ploše jen uzly s tasky (zbytek skryje).

---

## Layouty (auto-uspořádání)

Toolbar **⟳ Layout ▾** → vyber:
- **Hierarchie** — strom shora dolů
- **Radial** — kruhy kolem kořene
- **Fishbone** — rybí kost (příčina → důsledek)
- **Org chart** — organizační schéma s uniformními řádky

Uzly se animovaně přeskládají; akce jde vrátit přes **Ctrl+Z**.

---

## Timeline režim

Toolbar **⏱ Timeline** seřadí uzly s vyplněným **Datem** podél vodorovné časové osy
(datum pod osou, abecedně řazené nedatované vlevo). Vypnutím se uzly vrátí na původní
pozice — timeline nic trvale nepřepisuje.

---

## Focus mode

**Ctrl+Shift+F** nebo toolbar **👁** — zvýrazní vybraný uzel, jeho přímé potomky a
cestu ke kořeni; vše ostatní ztlumí. **Escape** ukončí.

---

## Pitch mode (prezentace)

**Ctrl+P** nebo toolbar **▶** — fullscreen prezentace, uzly v pořadí stromu (DFS).
Velký název, pod ním poznámka, ikona, číslo slidu a navigační tečky.
Posun **← →** nebo klikem, **Escape** ukončí.

---

## Hledání, minimapa, zoom

- **Ctrl+F** — fulltext přes názvy/poznámky/tagy, skáče mezi výsledky.
- **Minimapa** (vpravo nahoře) — přehled + klik = pan. **Ctrl+M** skryje/zobrazí.
- **Zoom** — kolečko myši, tlačítka **+ / − / Fit**, **Ctrl+0** = vše do view.
- **Pan** — táhni prázdnou plochu.

---

## Export / Import

Toolbar (rozbalovací menu):
- **⬇ Export** → **PNG** · **JSON** · **Markdown** · **OPML** · **SVG**
- **⬆ Import** → **JSON** · **Markdown** (odrážky/headingy → strom)

## Nastavení (⚙)

Toolbar **⚙** otevře nastavení (uloží se do `Documents\MindMap\settings.json`):
- **Obecné** — auto‑číslování, výchozí barva/layout
- **Vzhled** — barva pozadí, mřížka (čáry/tečky/žádná), animace
- **Claude** — info (klíč v `.env`), **Zkratky** — odkaz na cheatsheet

## Rychlý nápad (tray)

Pravý klik na ikonu v trayi → **Rychlý nápad** otevře malé okno: napiš text,
vyber mapu, **Enter** uloží uzel do skupiny **Inbox** dané mapy a okno se zavře.

---

## Undo / auto-save

- Každá změna se ukládá automaticky (debounce, zelená tečka = uloženo).
- **Ctrl+Z** zpět, **Ctrl+Y** / **Ctrl+Shift+Z** vpřed (historie max 50 kroků na mapu).
- **Ctrl+S** vynutí okamžité uložení.

---

## Klávesové zkratky

Kompletní přehled zobrazíš kdykoli klávesou **?**.

| Zkratka | Akce | | Zkratka | Akce |
|---------|------|-|---------|------|
| Tab / N | Nový potomek | | Ctrl+M | Skrýt/zobrazit minimapu |
| Enter | Nový sourozenec | | Ctrl+0 | Vše do view (Fit) |
| F2 | Přejmenovat | | Ctrl+1…9 | Přepni mapu 1–9 |
| Ctrl+Enter | Otevři poznámku | | Alt+↑ / ↓ | Přesun mezi sourozenci |
| Ctrl+D | Duplikuj větev | | Alt+← / → | O úroveň výš / níž |
| Ctrl+B | Záložka na uzlu | | Space | Sbalit / rozbalit |
| Ctrl+G | Seskup do skupiny | | № | Číslování uzlů (toolbar) |
| Ctrl+L | Propojovací režim | | Delete | Smaž vybrané |
| Ctrl+F | Hledání | | Ctrl+Z / Y | Zpět / Vpřed |
| Ctrl+Shift+F | Focus mode | | Ctrl+S | Uložit |
| Ctrl+P | Pitch mode | | Escape | Zruš akci / zavři |
| ? | Tato nápověda | | | |

---

## LAN přístup (telefon / tablet)

1. `npm run server-only`
2. Na PC v příkazovém řádku: `ipconfig` → najdi **IPv4** (např. `192.168.0.42`)
3. Na telefonu otevři `http://192.168.0.42:3000` (stejná Wi-Fi).

Aplikace je PWA — v prohlížeči ji lze „nainstalovat" na plochu.

---

## Sestavení instalátoru

```bash
npm run build      # → dist/MindMap Setup x.x.x.exe (NSIS, Windows x64)
```

Instalátor umožní zvolit cílovou složku a vytvoří zástupce na ploše i v nabídce Start.

---

## Smazání aplikace (beze zbytku)

1. Pokud je nainstalovaná: odinstaluj přes **Nastavení → Aplikace → MindMap**.
2. Smaž projekt: `C:\Users\User\Documents\Project\mindmap-app\`
3. Smaž data: `C:\Users\User\Documents\MindMap\`

Nic jiného se nikam neukládá.

---

## Lívia integrace (připraveno)

Endpointy v `server/routes/livia.js` jsou placeholder. Až poběží Lívia, nastav v `.env`:

```
LIVIA_PORT=8000
```
