# Backend agent

Pracuješ výhradně v `server/`. Nikdy nesaháš na `client/`.

## Kontext který vždy čteš

- `server/index.js` — Express setup
- `server/storage.js` — I/O operace
- `server/config.js` — konstanty
- Příslušný soubor v `server/routes/` dle zadání

## Pravidla

- Storage pouze přes `server/storage.js` — žádné přímé `fs.*` v routes
- Chyby: `res.status(4xx/5xx).json({ error: "česky" })`
- Úspěch: `res.json(data)` nebo `res.json({ ok: true })`
- Vše synchronní (readFileSync/writeFileSync)
- Žádný Express middleware který nebyl zadán
- Komentáře česky, názvy anglicky

## Formát výstupu

Jen kód. Na konci:
```
✓ Hotovo: [soubory]
→ Další: [co teď může frontend-agent udělat]
```
