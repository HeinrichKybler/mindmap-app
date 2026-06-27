# Návod pro Claude: jak vytvořit import soubor pro mindmap-app

Tento dokument je **přesná specifikace** pro vygenerování souboru, který se naimportuje do
mindmap-app přes **Import → JSON**. Cílem je mapa s maximální **přehledností** (logická
hierarchie, rozestupy, barevné kódování, skupiny) a **rozmanitostí** (využití všech funkcí).

Existují **dva formáty**:

| formát | kdy | co umí | příklad |
|---|---|---|---|
| **jednomapový** | jedna mapa bez křížových odkazů | uzly, hrany, skupiny | [`priklad-mapa.json`](priklad-mapa.json) |
| **vícemapový** | více map, **podmapy** a **reference** | vše výše **+ podmapové odkazy + cross-/intra-map reference + strom map** | [`priklad-vicemapovy.json`](priklad-vicemapovy.json) |

Vícemapový formát umožní udělat přes soubor **vše, co jde v aplikaci ručně**. Když zadání
zmiňuje podmapy nebo reference, použij vícemapový formát.

---

## 1. Jak import funguje (a co z toho plyne)

Import vezme tvůj JSON, vytvoří mapu/mapy a uloží uzly/hrany/skupiny **doslova** tak, jak je
napíšeš (server nic nedoplňuje, nenormalizuje). Tvrdá pravidla:

1. **Každý uzel musí být kompletní.** Žádné pole nevynechávej — chybějící `width`/`height`/
   `x`/`y` rozbije vykreslení. Vždy vypisuj celý objekt uzlu (viz sekce 4).
2. **ID uzlů/hran/skupin si volíš sám.** Je to libovolný **řetězec**, musí být **unikátní
   v rámci své mapy**. Nemusí to být UUID — klidně `"root"`, `"n1"`, `"v_train"`. Na tato id
   se odkazuje `parentId`, `fromId`, `toId` a `targetNodeId`.
3. **ID mapy přiděluje server** až při importu — neznáš ho dopředu. Proto se na mapy
   v souboru odkazuješ **klíči** (`key`), ne ID. Import si klíče sám přeloží na reálná ID
   (viz sekce 7). Nikdy nevyplňuj `linkedMapId` / `targetMapId` ručně — od toho jsou `…Key`.
4. **Velké `imageBase64` nevkládej.** Nech `null` (zvětšuje soubor o megabajty). Pro vizuál
   používej `icon` (emoji), barvy a tvary.

---

## 2. Kostra — jednomapový formát

```json
{
  "name": "Název mapy",
  "nodes": [ /* uzly */ ],
  "edges": [ /* hrany */ ],
  "groups": [ /* skupiny */ ],
  "settings": { "autoNumber": false }
}
```

Validace vyžaduje pole `nodes`, `edges`, `groups`. `name` je volitelné. V tomto formátu nech
u uzlů `references: []` a `linkedMapId: null` (křížové odkazy potřebují vícemapový formát).

---

## 3. Kostra — vícemapový formát (podmapy + reference)

```json
{
  "format": "mindmap-multi",
  "maps": [
    {
      "key": "main",
      "name": "Hlavní mapa",
      "parentMapKey": null,
      "nodes": [ /* … */ ],
      "edges": [ /* … */ ],
      "groups": [ /* … */ ],
      "settings": { "autoNumber": false }
    },
    {
      "key": "voice",
      "name": "Podmapa",
      "parentMapKey": "main",
      "nodes": [ /* … */ ],
      "edges": [ /* … */ ],
      "groups": [ /* … */ ]
    }
  ]
}
```

Poznáš ho podle pole **`maps`** (pole map). Každá mapa má `key` + standardní `nodes`/`edges`/
`groups`. Klíče `key`, `parentMapKey`, `linkedMapKey`, `targetMapKey` jsou **jen pro import** —
do aplikace se neukládají, slouží k provázání map (sekce 7).

---

## 4. Schéma uzlu (`nodes[]`) — vypiš VŠECHNA pole

| pole | typ | povolené hodnoty / význam |
|---|---|---|
| `id` | string | unikátní v rámci své mapy |
| `parentId` | string \| null | id rodiče; kořen = `null` |
| `label` | string | krátký text uzlu (detaily patří do `note`) |
| `x`, `y` | number | **levý horní roh** v px (ne střed) |
| `width`, `height` | number | rozměr; běžně `160×48`, kořen `200–220×56–60` |
| `color` | string | `purple` \| `green` \| `neutral` \| `amber` \| `red` \| `custom` |
| `customColor` | null \| object | jen když `color="custom"`: `{ "fill":"#hex", "stroke":"#hex", "glow":"#hex" }` |
| `icon` | null \| string | jedno emoji (libovolné; doporučená sada níže) |
| `shape` | string | `rectangle` \| `rounded` \| `ellipse` \| `diamond` \| `hexagon` \| `cloud` |
| `borderStyle` | string | `solid` \| `dashed` \| `dotted` \| `double` (double jen u hranatých tvarů) |
| `opacity` | number | `0`–`1` |
| `bookmarked` | bool | záložka (rychlý skok) |
| `isSummary` | bool | „souhrnný" styl uzlu |
| `tags` | string[] | štítky, např. `["fáze","ai"]` |
| `note` | string | delší text, **podporuje Markdown** (nadpisy, **tučné**, seznamy, odkazy, kód) — zobrazí se v detailu uzlu |
| `imageBase64` | null \| string | nech `null` (viz pravidlo 4) |
| `githubUrl` | string | odkaz na issue/PR (`""` když nic) |
| `date` | null \| string | ISO `"YYYY-MM-DD"` — uzel se objeví v **Timeline** režimu |
| `links` | array | `[{ "url":"https://…", "label":"text" }]` |
| `comments` | array | `[{ "id":"…", "text":"…", "createdAt":"ISO", "color":"#hex" }]` (barva z palety níže) |
| `references` | array | křížové odkazy — **jednomapový: `[]`**; vícemapový: viz sekce 7 |
| `linkedMapId` | null | **vždy `null`** — podmapu řeš přes `linkedMapKey` (sekce 7) |
| `locked` | bool | zamčený uzel nejde táhnout/resizovat |
| `task` | object | `{ "enabled":bool, "checked":bool, "priority":"high"\|"medium"\|"low"\|null, "dueDate":null\|"YYYY-MM-DD", "progress":0-100 }` |
| `collapsed` | bool | `true` skryje potomky (musí mít potomky, ať to dává smysl) |
| `createdAt` | string | ISO datum, např. `"2026-06-26T09:00:00.000Z"` |
| `linkedMapKey` | string (volitelné, jen vícemapový) | klíč mapy, na kterou je uzel podmapový odkaz — viz sekce 7 |
| `groupId` | string (volitelné) | příslušnost uzlu ke skupině (id skupiny). **Nemusíš uvádět** — import přiřadí členství automaticky podle toho, ve které skupině leží střed uzlu (viz sekce 6) |

**Číselníky k vložení:**
- Emoji (doporučená sada z appky): `📌 🔥 ⚡ 💡 🎯 🔧 🐛 ✅ ❌ ⚠️ 🟣 🟢 🔵 🟡 🔴 📝 🖼️ 🔗 📊 🎮` (jiné emoji taky fungují).
- Barvy komentářů: `#F59E0B` (oranžová), `#3B82F6` (modrá), `#059669` (zelená), `#E24B4A` (červená).
- Pojmenované barvy uzlů (stroke pro orientaci): purple `#7C3AED`, green `#059669`, neutral `#3a3a5e`, amber `#F59E0B`, red `#E24B4A`.

---

## 5. Schéma hrany (`edges[]`)

```json
{ "id": "e1", "fromId": "root", "toId": "dev", "label": "", "isRelationship": false }
```

| pole | typ | význam |
|---|---|---|
| `id` | string | unikátní |
| `fromId`, `toId` | string | **musí odkazovat na existující `node.id` v téže mapě** |
| `label` | string | popisek na čáře (`""` = bez popisku) |
| `isRelationship` | bool | `false` = hierarchická čára rodič→potomek; `true` = volný vztah napříč stromem |
| `style` | object (volitelné) | `{ "width":1.5, "dash":"solid"\|"dashed"\|"dotted", "color":null\|"#hex", "arrowType":"arrow"\|"diamond"\|"circle"\|"none", "animated":false }` |

**Dvě klíčová pravidla pro hrany:**

1. **Hierarchie potřebuje obojí.** Aby se mezi rodičem a potomkem nakreslila čára, musí
   potomek mít `parentId` rodiče **A SOUČASNĚ** existovat hrana `{ fromId: rodič, toId: potomek, isRelationship: false }`.
   Jen `parentId` (bez hrany) řídí sbalování/drilldown, ale čáru nenakreslí.
2. **Vztahy** (závislosti, „viz", „API") dělej hranou s `isRelationship: true` a klidně
   barevným `style` + `label`. Spojuj jimi libovolné dva uzly **v rámci jedné mapy**.
   (Propojení **mezi mapami** = reference, sekce 7.)

---

## 6. Schéma skupiny (`groups[]`)

Skupiny jsou barevné rámečky **na pozadí** (vizuální seskupení podle souřadnic — nejsou
vázané na uzly přes id, jen je opticky obklopují).

```json
{ "id": "g1", "label": "Fáze 1", "color": "#7C3AED", "shape": "rectangle", "x": 80, "y": 240, "width": 540, "height": 320 }
```

| pole | typ | hodnoty |
|---|---|---|
| `id` | string | unikátní |
| `label` | string | název skupiny |
| `color` | string | `#hex` (klidně barvy uzlů: `#7C3AED`, `#059669`, `#F59E0B`, `#E24B4A`) |
| `shape` | string | `rectangle` \| `ellipse` \| `diamond` \| `hexagon` \| `cloud` (custom NEPOUŽÍVEJ — vyžaduje ruční SVG path) |
| `x`, `y`, `width`, `height` | number | obdélník, který má obklopit cluster uzlů (přidej ~40 px okraj kolem nich) |

**Členství uzlů ve skupině.** Uzel je „ve skupině", pokud jeho **střed** leží uvnitř obdélníku
skupiny — to import vyhodnotí automaticky a nastaví `node.groupId`. Členské uzly se pak hýbou
se skupinou (přesun skupiny je vezme s sebou) a auto-layout skupinu přizpůsobí jejich pozicím.
Takže stačí umístit uzly dovnitř rámečku skupiny; `groupId` ručně psát nemusíš (ale můžeš —
explicitní `groupId` se respektuje). Leží-li střed uzlu ve více skupinách, vyhraje ta poslední
(nejvrchnější) v pořadí.

---

## 7. Podmapy a reference (jen vícemapový formát)

V aplikaci se podmapy i reference vážou na **ID jiné mapy**, které vznikne až při importu.
Proto v souboru odkazuješ **klíči map** (`key`) a import si je sám přeloží na reálná ID:
nejdřív vytvoří všechny mapy, pak doplní `linkedMapId`, `references[].targetMapId`
a `parentMapId` podle klíčů. **Ty řešíš jen klíče.**

### 7.1 Strom map — `parentMapKey`
Každá mapa má `key`. `parentMapKey` určuje nadřazenou mapu v sidebaru (strom map):
- kořenová mapa: `"parentMapKey": null`,
- podmapa: `"parentMapKey": "<key nadřazené mapy>"`.

### 7.2 Podmapový odkaz z uzlu — `linkedMapKey`
Na uzel, který má být „vstupem" do podmapy, přidej pole `linkedMapKey` s klíčem cílové mapy:

```json
{ "id": "m_voice", "parentId": "m_root", "label": "Hlasový model", "linkedMapKey": "voice",
  "...": "...ostatní povinná pole uzlu..." }
```

Po importu uzel dostane 🔗 a **Ctrl+klik** na něj otevře propojenou mapu (`voice`).
`linkedMapId` nech `null` — naplní ho import z `linkedMapKey`.

### 7.3 Reference — `references[]` s `targetMapKey`
Reference je odkaz z uzlu na **uzel nebo skupinu** jiné (i téže) mapy. Objekt reference:

```json
{
  "targetMapKey": "voice",
  "targetNodeId": "v_train",
  "targetType": "node",
  "note": "viz trénink"
}
```

| pole | hodnoty |
|---|---|
| `targetMapKey` | `key` cílové mapy (i **vlastní** mapy = reference uvnitř jedné mapy) |
| `targetNodeId` | `id` cílového **uzlu** (nebo `id` skupiny při `targetType:"group"`) |
| `targetType` | `"node"` \| `"group"` |
| `note` | volitelná poznámka |
| `targetLabel`, `targetMapName` | **nemusíš uvádět** — import je dopočítá z dat souboru (můžeš je i napsat) |

`targetNodeId` musí být skutečné `id` uzlu/skupiny v cílové mapě (id se při importu zachovávají,
takže navigace funguje). `targetMapId` nevyplňuj — naplní ho import z `targetMapKey`.

> Shrnutí: `key` (identita mapy), `parentMapKey` (strom map), `linkedMapKey` (podmapa z uzlu),
> `targetMapKey` (reference). Vše ostatní = ID; ta řeší import.

---

## 8. Souřadnice a rozložení (pro PŘEHLEDNOST)

- `x`,`y` je **levý horní roh**. Celý strom umísti do kladných souřadnic kolem `0–1400 × 0–900`.
- **Stromová mapa shora dolů:** kořen nahoře na střed, úrovně po `~190 px` dolů
  (`y`: kořen 80 → úroveň 1 ≈ 280 → úroveň 2 ≈ 470 → …).
- **Sourozenci vedle sebe** s mezerou `~100–120 px` (u `width 160` dávej rozteč středů `~280 px`).
  Potomky **vycentruj pod rodiče** (rodič `x=720,w=180` → střed 810; potomky rozmísti symetricky kolem 810).
- **Nepřekrývej uzly.** Drž rozestupy, ať jsou čáry čitelné. Každá mapa má vlastní plátno (souřadnice počítej v rámci mapy).

**Jak appka kreslí hrany (verze 1.1.4) — umísti uzly tak, ať to vypadá dobře:**
- Potomek **pod/nad** rodičem → čára vychází ze **spodního/horního středu** (i když je posunutý do strany).
- Uzel **vedle** ve skoro stejné výšce → čára vychází z **bočního středu**.
- Přesně pod / přesně vedle (do 20 px) → **rovná čára**.
→ Pro klasický strom dávej potomky **pod** rodiče. Pro „vztahové" hrany umisťuj cíl **vedle**.

---

## 9. Checklist ROZMANITOSTI (pokryj co nejvíc)

Dobrý ukázkový import by měl obsahovat alespoň po jednom:

- [ ] všech **5 pojmenovaných barev** + jeden uzel `color:"custom"` s `customColor`
- [ ] **více tvarů** (`rectangle`, `rounded`, `ellipse`, `diamond`, `hexagon`, `cloud`)
- [ ] **ikony** (emoji) na klíčových uzlech
- [ ] **borderStyle** varianty (`solid`, `dashed`, `dotted`, `double`)
- [ ] **tagy** na několika uzlech
- [ ] **note s Markdownem** alespoň u kořene (nadpis, tučné, odrážky)
- [ ] **links** (externí odkaz) a **githubUrl** na vhodném uzlu
- [ ] **comments** (sticky poznámka) s barvou z palety
- [ ] **task**: aspoň jeden rozpracovaný (`progress`, `priority:"medium"`) a jeden hotový (`checked:true, progress:100, priority:"high"`)
- [ ] **bookmarked** kořen nebo důležitý uzel
- [ ] **isSummary** na shrnujícím uzlu
- [ ] **date** na uzlech, které mají smysl v časové ose (Timeline)
- [ ] **collapsed:true** na větvi, která má potomky
- [ ] **skupiny** různých tvarů a barev kolem clusterů
- [ ] **vztahové hrany** (`isRelationship:true`) s rozmanitým `style` (dashed/dotted, barva, `arrowType` diamond/circle, `animated:true`) a **popiskem**
- [ ] (vícemapový) **podmapa** přes `linkedMapKey` + **reference** přes `targetMapKey` (cross-map i intra-map)

## 10. Checklist PŘEHLEDNOSTI

- [ ] jeden jasný kořen v každé mapě, logická hierarchie (`parentId` + odpovídající hrana u každého potomka)
- [ ] konzistentní rozestupy, žádné překryvy
- [ ] **barva kóduje význam** (např. zelená = hotovo/výzkum, červená = vývoj/riziko, amber = rozpracováno) — drž se zvoleného klíče
- [ ] krátké `label` (detaily do `note`), max ~3 slova
- [ ] skupiny obkreslují tematické celky a mají `~40 px` okraj
- [ ] vztahové (nehierarchické) hrany odlišené čárkovaně/barevně, ať se nepletou se stromem
- [ ] podmapy používej pro „zoom do detailu" tématu, ať hlavní mapa nezhoustne

---

## 11. Validace PŘED odevzdáním

1. Soubor je **jeden validní JSON** (žádné komentáře, žádné koncové čárky).
   - **Uvozovky uvnitř textu escapuj!** Rovná ASCII `"` uvnitř hodnoty (např. v `note`) musí být `\"`,
     jinak parser řetězec ukončí předčasně. Pro česká uvozování raději používej typografické
     `„ … "` (U+201E / U+201C) — ty se escapovat nemusí. Častá chyba: otevřeš `„`, ale zavřeš rovnou `"`.
2. Top-level: buď `nodes`/`edges`/`groups` (jednomapový), nebo `maps` (vícemapový).
3. Každý uzel má **všechna** pole ze sekce 4 (zejm. číselné `x,y,width,height`).
4. `id` jsou **unikátní v rámci své mapy**; každý `parentId` ukazuje na existující uzel nebo je `null`.
5. Každá hrana má `fromId`/`toId` na **existující** uzly téže mapy.
6. Pro každý vztah rodič→potomek existuje **i hrana** (ne jen `parentId`).
7. `imageBase64: null`; `linkedMapId: null` (podmapu řeš `linkedMapKey`); `targetMapId` neuvádět (řeš `targetMapKey`).
8. (vícemapový) `key` map jsou **unikátní**; každý `parentMapKey`/`linkedMapKey`/`targetMapKey`
   ukazuje na existující `key`; každý `targetNodeId` na existující uzel/skupinu v cílové mapě.

---

## 12. Jak tento návod použít (meta-prompt pro uživatele)

Zadej Claudovi např.:

> Vytvoř mi **import soubor pro mindmap-app** na téma _„…"_.
> Dodrž přesně `docs/IMPORT_GUIDE.md`. Pokud má být víc map / podmapy / reference, použij
> **vícemapový format** (`maps[]` + `key`/`parentMapKey`/`linkedMapKey`/`targetMapKey`).
> Kompletní uzly se všemi poli, hierarchii dělej `parentId` **i** hranou, využij co nejvíc
> funkcí (sekce 9) a drž přehlednost (sekce 10). Vrať jeden validní JSON ke stažení.

Hotový soubor pak v appce naimportuješ: **toolbar → Import → JSON → vyber soubor**.
Vznikne nová mapa (nebo více map s provázanými podmapami a referencemi).
