// Electron entry point — spustí Express server jako child_process, vytvoří okno a tray
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { createTray } = require('./tray.js');

const DEV = process.argv.includes('--dev');
const ROOT = path.join(__dirname, '..');          // kořen aplikace
const DEFAULT_PORT = 3000;
let appURL = `http://localhost:${DEFAULT_PORT}`;  // sestaví se z portu, který server ohlásí

let win = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
let serverPort = DEFAULT_PORT;
let quickWin = null;

// Cesta k ikoně — v produkci z extraResources (resources/build), jinak z build/
function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.ico')
    : path.join(ROOT, 'build', 'icon.ico');
}

// --- Spuštění Express serveru jako child_process.fork ---
// Vrací Promise, který se resolvuje po zprávě 'ready' ze serveru (pojistka 8 s)
function startServer() {
  const serverPath = path.join(ROOT, 'server', 'index.js');
  serverProcess = fork(serverPath, [], {
    cwd: ROOT,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env },
  });

  serverProcess.on('exit', (code) => {
    if (!isQuitting) console.error('Server proces neočekávaně skončil, kód:', code);
  });
  serverProcess.on('error', (err) => {
    console.error('Chyba serverového procesu:', err.message);
  });

  // Resolvuje portem, na kterém server poslouchá; null = 'ready' nedorazil (pojistka 8 s)
  return new Promise((resolve) => {
    let done = false;
    const go = (port) => { if (!done) { done = true; resolve(port); } };
    serverProcess.on('message', (m) => {
      if (m && m.type === 'ready') go(m.port || DEFAULT_PORT);
    });
    setTimeout(() => go(null), 8000);
  });
}

// Statická chybová stránka, když se server nepodaří načíst
function loadErrorPage() {
  if (!win || win.isDestroyed()) return;
  const html =
    '<body style="margin:0;background:#0d0d1a;color:#e5e5f0;font-family:Inter,system-ui,sans-serif;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center">' +
    '<h1 style="color:#7C3AED">MindMap se nepodařilo spustit</h1>' +
    '<p>Server neodpovídá. Zkontroluj, zda port není obsazený, a aplikaci restartuj.</p></body>';
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

// --- Vytvoření hlavního okna ---
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0d0d1a',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(appURL);
  win.once('ready-to-show', () => win.show());
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  // Kdyby se server ještě nestihl rozběhnout, zkus načíst znovu — max 20× (~10 s), pak chybová stránka
  let loadRetries = 0;
  win.webContents.on('did-finish-load', () => { loadRetries = 0; });
  win.webContents.on('did-fail-load', (e, code, desc, failedURL, isMainFrame) => {
    if (!isMainFrame) return;  // ignoruj selhání podřízených rámců
    if (loadRetries++ < 20) {
      setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(appURL); }, 500);
    } else {
      loadErrorPage();
    }
  });

  // Zavření okna jen skryje aplikaci do trayu (neukončí ji)
  win.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); win.hide(); }
  });
}

// --- Quick capture okno (Rychlý nápad z trayu) ---
function openQuickCapture() {
  if (quickWin && !quickWin.isDestroyed()) { quickWin.show(); quickWin.focus(); return; }
  quickWin = new BrowserWindow({
    width: 400, height: 120, show: false,
    frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
    backgroundColor: '#15152a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  quickWin.loadFile(path.join(__dirname, 'quick-capture.html'), { query: { port: String(serverPort) } });
  quickWin.once('ready-to-show', () => { quickWin.show(); quickWin.focus(); });
  quickWin.on('closed', () => { quickWin = null; });
}

// --- Ukončení: nejdřív zabij server, pak ukonči app ---
function killServer() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  serverProcess = null;
}

function quitApp() {
  isQuitting = true;
  killServer();
  app.quit();
}

app.on('before-quit', () => { isQuitting = true; killServer(); });
// Tray drží aplikaci naživu i bez otevřeného okna
app.on('window-all-closed', () => {});

// --- Single-instance lock: druhý spuštěný proces jen zobrazí existující okno ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);  // skryj výchozí menu bar
    const port = await startServer();
    serverPort = port || DEFAULT_PORT;
    appURL = `http://localhost:${serverPort}`;  // port = jediný zdroj pravdy
    createWindow();
    tray = createTray({ app, iconPath, getWindow: () => win, onQuit: quitApp, onQuickCapture: openQuickCapture });
    // Auto-update jen v zabalené aplikaci (v devu by electron-updater hlásil chybu)
    if (app.isPackaged) {
      const { initAutoUpdate } = require('./updater.js');
      initAutoUpdate(() => win, () => { isQuitting = true; });
    }
  });
}
