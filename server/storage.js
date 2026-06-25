import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR, MAPS_DIR, INDEX_FILE } from './config.js';

// Zajistí existenci datových složek a index.json; při prázdném indexu vytvoří ukázkovou mapu
export function ensureStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
    if (!fs.existsSync(INDEX_FILE)) {
      fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    // První start: prázdný index → vytvoř ukázkovou mapu "Lívia"
    if (readIndex().length === 0) {
      const now = new Date().toISOString();
      const id = randomUUID();
      writeMap(id, {
        id,
        name: 'Lívia',
        createdAt: now,
        updatedAt: now,
        nodes: [],
        edges: [],
        groups: [],
      });
    }
  } catch (err) {
    throw new Error('Nepodařilo se inicializovat úložiště: ' + err.message);
  }
}

// Načte index všech map → [{ id, name, updatedAt }]
export function readIndex() {
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Nepodařilo se načíst index map: ' + err.message);
  }
}

// Zapíše index všech map
export function writeIndex(arr) {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    throw new Error('Nepodařilo se uložit index map: ' + err.message);
  }
}

// Načte jednu mapu podle id
export function readMap(id) {
  try {
    const file = path.join(MAPS_DIR, `${id}.json`);
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Nepodařilo se načíst mapu: ' + err.message);
  }
}

// Zapíše jednu mapu a synchronizuje index (aktualizuje updatedAt)
export function writeMap(id, data) {
  try {
    const now = new Date().toISOString();
    data.updatedAt = now;
    const file = path.join(MAPS_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');

    // Upsert záznamu v indexu
    const index = readIndex();
    const entry = index.find((m) => m.id === id);
    if (entry) {
      entry.name = data.name;
      entry.updatedAt = now;
    } else {
      index.push({ id, name: data.name, updatedAt: now });
    }
    writeIndex(index);
  } catch (err) {
    throw new Error('Nepodařilo se uložit mapu: ' + err.message);
  }
}

// Smaže jednu mapu a odstraní ji z indexu
export function deleteMap(id) {
  try {
    const file = path.join(MAPS_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    writeIndex(readIndex().filter((m) => m.id !== id));
  } catch (err) {
    throw new Error('Nepodařilo se smazat mapu: ' + err.message);
  }
}
