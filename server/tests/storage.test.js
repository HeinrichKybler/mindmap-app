// Jest unit testy pro storage.js — operace nad reálnou datovou složkou s úklidem
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { jest } from '@jest/globals';
import { MAPS_DIR, INDEX_FILE } from '../config.js';
import {
  ensureStorage, readIndex, readMap, writeMap, deleteMap,
} from '../storage.js';

// Krátká pauza, aby se lišil updatedAt (ISO timestamp v ms)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const id = randomUUID();
const mapFile = path.join(MAPS_DIR, `${id}.json`);

const baseMap = {
  id,
  name: 'Testovací mapa',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [{ id: 'n1', parentId: null, label: 'Kořen', x: 0, y: 0, width: 160, height: 48 }],
  edges: [],
  groups: [],
};

beforeAll(() => {
  ensureStorage();  // zajistí existenci složek a indexu
});

afterAll(() => {
  // Úklid: odstraň testovací mapu i z indexu, pokud zůstala
  if (fs.existsSync(mapFile)) fs.unlinkSync(mapFile);
  const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx.filter((m) => m.id !== id), null, 2), 'utf-8');
});

test('vytvoření mapy → soubor maps/{id}.json existuje', () => {
  writeMap(id, baseMap);
  expect(fs.existsSync(mapFile)).toBe(true);
});

test('čtení mapy → data odpovídají', () => {
  const read = readMap(id);
  expect(read.id).toBe(id);
  expect(read.name).toBe('Testovací mapa');
  expect(read.nodes).toHaveLength(1);
  expect(read.nodes[0].label).toBe('Kořen');
});

test('index.json obsahuje záznam mapy', () => {
  const entry = readIndex().find((m) => m.id === id);
  expect(entry).toBeDefined();
  expect(entry.name).toBe('Testovací mapa');
});

test('update mapy → updatedAt se změní a data se aktualizují', async () => {
  const before = readMap(id).updatedAt;
  await sleep(10);
  writeMap(id, { ...baseMap, name: 'Přejmenovaná', nodes: [] });
  const after = readMap(id);
  expect(after.updatedAt).not.toBe(before);
  expect(after.name).toBe('Přejmenovaná');
  expect(after.nodes).toHaveLength(0);
  // Index sleduje novou změnu
  const entry = readIndex().find((m) => m.id === id);
  expect(entry.name).toBe('Přejmenovaná');
  expect(entry.updatedAt).toBe(after.updatedAt);
});

test('smazání mapy → soubor neexistuje a je odstraněn z index.json', () => {
  deleteMap(id);
  expect(fs.existsSync(mapFile)).toBe(false);
  expect(readIndex().some((m) => m.id === id)).toBe(false);
});
