// Fetch wrapper pro komunikaci s API - jediný soubor volající fetch na /api/

const BASE = '/api';

// Obecný request helper - parsuje JSON, vyhazuje chybu při !ok
async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Chyba ${res.status}`);
  }
  return data;
}

export const api = {
  // Seznam všech map → [{ id, name, updatedAt }]
  getMaps() {
    return request('/maps');
  },

  // Celý objekt mapy
  getMap(id) {
    return request(`/maps/${id}`);
  },

  // Vytvoření nové mapy (volitelně jako podmapa pod parentMapId)
  createMap(name, parentMapId = null) {
    return request('/maps', { method: 'POST', body: JSON.stringify({ name, parentMapId }) });
  },

  // Úprava mapy (body: celý objekt mapy)
  updateMap(id, data) {
    return request(`/maps/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // Smazání mapy
  deleteMap(id) {
    return request(`/maps/${id}`, { method: 'DELETE' });
  },

  // Nastavení aplikace
  getSettings() {
    return request('/settings');
  },
  saveSettings(data) {
    return request('/settings', { method: 'PUT', body: JSON.stringify(data) });
  },

  // Lívia akce (expand/summarize/tags/comment) — vrací JSON včetně hint i při chybě
  async livia(action, payload = {}) {
    const res = await fetch(`${BASE}/livia/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({}));
  },
};
