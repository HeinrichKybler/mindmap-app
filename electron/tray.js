// Systémový tray — ikona, tooltip, klik = zobraz/skryj okno, kontextové menu
const { Tray, Menu, nativeImage } = require('electron');

// Zobraz / skryj okno
function toggleWindow(win) {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else { win.show(); win.focus(); }
}

function showWindow(win) {
  if (!win) return;
  win.show();
  win.focus();
}

// Vytvoří tray. opts: { app, iconPath, getWindow, onQuit, onQuickCapture }
function createTray({ iconPath, getWindow, onQuit, onQuickCapture }) {
  const img = nativeImage.createFromPath(iconPath());
  const tray = new Tray(img);
  tray.setToolTip('MindMap');

  const menu = Menu.buildFromTemplate([
    { label: 'Otevřít', click: () => showWindow(getWindow()) },
    { label: 'Rychlý nápad', click: () => onQuickCapture && onQuickCapture() },
    { type: 'separator' },
    { label: 'Ukončit', click: () => onQuit() },
  ]);
  tray.setContextMenu(menu);

  tray.on('click', () => toggleWindow(getWindow()));
  return tray;
}

module.exports = { createTray };
