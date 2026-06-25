# Skill: refaktoring

Použij když: "přejmenuj X", "přesuň Y do Z", "rozdělej tento soubor"

## Zlaté pravidlo

Chování aplikace se nesmí změnit. Žádná nová funkce, žádné opravené bugy.

## Postup

1. Spusť `npm test` PŘED refactoringem — zapamatuj si výsledek
2. Proveď změnu
3. Spusť `npm test` PO — výsledek musí být identický
4. Pokud testy selžou: vrať změnu, reportuj

## Co aktualizovat po refactoringu

- Importy ve všech souborech které používají přejmenovanou věc
- CLAUDE.md pokud se mění struktura složek nebo API kontrakt
- ARCHITECTURE.md pokud se mění datový model
