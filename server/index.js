import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT, CLIENT_DIR } from './config.js';
import { ensureStorage } from './storage.js';
import mapsRouter from './routes/maps.js';
import liviaRouter from './routes/livia.js';
import settingsRouter from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vendored knihovny pro klienta (např. dom-to-image-more pro PNG export)
const VENDOR_DIR = path.join(__dirname, '..', 'node_modules', 'dom-to-image-more', 'dist');

// Inicializace úložiště při startu
ensureStorage();

const app = express();

// CORS pro LAN přístup z telefonu
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routy
app.use('/api/maps', mapsRouter);
app.use('/api/livia', liviaRouter);
app.use('/api/settings', settingsRouter);

// Vendored klientské knihovny
app.use('/vendor', express.static(VENDOR_DIR));

// Statické soubory klienta
app.use(express.static(CLIENT_DIR));

// Globální error handler
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Chyba serveru: ' + err.message });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MindMap server běží na http://localhost:${PORT}`);
  // Signál pro Electron main proces vč. skutečného portu (jen jako child_process.fork)
  if (process.send) process.send({ type: 'ready', port: PORT });
});

server.on('error', (err) => {
  console.error('Server se nepodařilo spustit:', err.message);
});
