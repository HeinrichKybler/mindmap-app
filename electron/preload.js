// Preload — bezpečný most do rendereru (contextIsolation:true).
// Frontend komunikuje se serverem přes HTTP (fetch na localhost:3000),
// takže stačí drobná příznaková informace, že běžíme v Electronu.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mindmapDesktop', {
  isElectron: true,
  platform: process.platform,
});
