import 'dotenv/config';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port ze .env, fallback 3000
export const PORT = parseInt(process.env.PORT, 10) || 3000;

// Datová složka: ~/Documents/MindMap
export const DATA_DIR = path.join(os.homedir(), 'Documents', 'MindMap');
export const MAPS_DIR = path.join(DATA_DIR, 'maps');
export const INDEX_FILE = path.join(MAPS_DIR, 'index.json');

// Statické soubory klienta
export const CLIENT_DIR = path.join(__dirname, '..', 'client');
