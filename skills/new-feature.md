# Skill: přidání nové featury

Použij když: "přidej X", "implementuj Y", "chci aby Z"

## Checklist před implementací

- [ ] Která vrstva se mění? (server / client / obě)
- [ ] Zasahuje to datový model (JSON)? → aktualizuj ARCHITECTURE.md
- [ ] Potřebuje nový endpoint? → backend-agent první
- [ ] Potřebuje nový JS modul? → použij skill add-module

## Postup

1. Pokud obě vrstvy: orchestrator → backend-agent → frontend-agent
2. Pokud jen jedna: přímo příslušný agent
3. Po implementaci: přidej odpovídající test do storage.test.js pokud se mění storage
4. Auto-save: každá změna stavu musí triggerovat debounced save (viz CLAUDE.md)

## Co NESMÍŠ

- Přidat featuru která nebyla zadána ("to by se ti mohlo hodit")
- Změnit existující chování jiného modulu
- Přidat novou npm závislost bez explicitního souhlasu
