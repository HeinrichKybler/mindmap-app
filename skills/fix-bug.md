# Skill: oprava bugu

Použij když: error message, "nefunguje X", "crashes when Y"

## Co dostaneš

- Error message nebo stack trace
- Popis co uživatel dělal
- (Volitelně) název souboru

## Postup

1. Předej debug-agentovi
2. Debug-agent: najdi příčinu, implementuj fix
3. Ověř: spusť `npm test` — musí projít
4. Pokud test neexistuje pro tuto část: přidej ho

## Kritické bugy (priorita 1 — fix okamžitě)

- Data loss (ztráta uzlů/hran při save/load)
- Crash při startu serveru
- Nekonečná smyčka v auto-save
- CORS error (LAN přístup z telefonu)
