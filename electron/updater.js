// Auto-update přes electron-updater + GitHub Releases.
// Při startu (jen v zabalené aplikaci) zkontroluje nové vydání, stáhne ho
// na pozadí a po dokončení nabídne restart s instalací.
const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

// getWindow = vrací hlavní okno (kvůli modalu), setQuitting = nastaví isQuitting=true
// (aby restart aplikaci skutečně ukončil, ne jen schoval do trayu).
function initAutoUpdate(getWindow, setQuitting) {
  autoUpdater.autoDownload = true;              // stáhni novou verzi automaticky
  autoUpdater.autoInstallOnAppQuit = true;      // kdyby uživatel odložil, nainstaluj při příštím ukončení
  autoUpdater.disableDifferentialDownload = true;  // vždy plný installer — diferenciální stahování přes blockmap se zaseklává

  autoUpdater.on('error', (err) => {
    console.error('Auto-update chyba:', (err && err.message) || 'neznámá');
  });
  autoUpdater.on('update-available', (info) => {
    console.log('K dispozici je aktualizace:', info && info.version);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('Aplikace je aktuální.');
  });
  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow && getWindow();
    const { response } = await dialog.showMessageBox(win || undefined, {
      type: 'info',
      buttons: ['Restartovat a aktualizovat', 'Později'],
      defaultId: 0,
      cancelId: 1,
      title: 'Aktualizace připravena',
      message: `Nová verze ${info && info.version} je stažená.`,
      detail: 'Aplikace se restartuje a aktualizace se nainstaluje. Tvoje mapy zůstanou zachované.',
    });
    if (response === 0) {
      if (setQuitting) setQuitting();   // povol skutečné ukončení (ne jen skrytí do trayu)
      autoUpdater.quitAndInstall();
    }
  });

  // Spusť kontrolu; případnou chybu spolkne 'error' handler výše
  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { initAutoUpdate };
