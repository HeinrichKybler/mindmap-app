// Undo/redo zásobník — drží hluboké snapshoty stavu mapy
const undoStack = [];
const redoStack = [];
const MAX = 50;

// Hluboká kopie snapshotu (oddělí data od živého stavu)
function clone(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

// Uloží snapshot aktuálního stavu na vrchol undo zásobníku (po seedu baseline
// drží vrchol vždy aktuální stav), vymaže redo, omezí na MAX
export function push(snapshot) {
  undoStack.push(clone(snapshot));
  redoStack.length = 0;
  if (undoStack.length > MAX) undoStack.shift();
}

// Vyčistí historii (volá se při načtení/přepnutí mapy, pak se hned seedne baseline)
export function reset() {
  undoStack.length = 0;
  redoStack.length = 0;
}

// Krok zpět: sundá aktuální stav (na redo) a aplikuje PŘEDCHOZÍ snapshot
export function undo(applyFn) {
  if (undoStack.length < 2) return;  // potřebujeme baseline + aspoň 1 změnu
  const current = undoStack.pop();
  redoStack.push(current);
  applyFn(clone(undoStack[undoStack.length - 1]));
}

// Krok vpřed: vezme snapshot z redo, vrátí ho na undo a aplikuje
export function redo(applyFn) {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(snapshot);
  applyFn(clone(snapshot));
}

export function canUndo() { return undoStack.length > 1; }
export function canRedo() { return redoStack.length > 0; }
