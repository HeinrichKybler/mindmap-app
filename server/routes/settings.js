// Nastavení aplikace — GET/PUT /api/settings, uloženo v Documents/MindMap/settings.json
import express from 'express';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config.js';

const router = express.Router();
const FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULTS = {
  general: { autoNumber: false, saveNav: true, defaultColor: 'purple', defaultLayout: 'hierarchy' },
  appearance: { bgColor: '#0d0d1a', gridStyle: 'lines', animations: true },
  claude: { contextEnabled: true, maxTokens: 1000 },
};

// Přečte settings.json (sloučené s výchozími), nebo výchozí
function read() {
  try {
    if (fs.existsSync(FILE)) {
      const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return {
        general: { ...DEFAULTS.general, ...(saved.general || {}) },
        appearance: { ...DEFAULTS.appearance, ...(saved.appearance || {}) },
        claude: { ...DEFAULTS.claude, ...(saved.claude || {}) },
      };
    }
  } catch (err) {
    console.error('Chyba čtení settings.json:', err.message);
  }
  return DEFAULTS;
}

router.get('/', (req, res) => res.json(read()));

router.put('/', (req, res) => {
  try {
    const cur = read();
    const body = req.body || {};
    const merged = {
      general: { ...cur.general, ...(body.general || {}) },
      appearance: { ...cur.appearance, ...(body.appearance || {}) },
      claude: { ...cur.claude, ...(body.claude || {}) },
    };
    fs.writeFileSync(FILE, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Nelze uložit nastavení: ' + err.message });
  }
});

export default router;
