import express from 'express';
import { randomUUID } from 'crypto';
import { readIndex, readMap, writeMap, deleteMap } from '../storage.js';

const router = express.Router();

// GET /api/maps - seznam map → [{ id, name, updatedAt }]
router.get('/', (req, res) => {
  try {
    res.status(200).json(readIndex());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/maps/:id - celý objekt mapy
router.get('/:id', (req, res) => {
  try {
    if (!readIndex().some((m) => m.id === req.params.id)) {
      return res.status(404).json({ error: 'Mapa nenalezena.' });
    }
    res.status(200).json(readMap(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/maps - vytvoření nové mapy, body: { name }
router.post('/', (req, res) => {
  try {
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = (req.body && req.body.name) ? String(req.body.name) : 'Nová mapa';
    const map = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
      groups: [],
    };
    writeMap(id, map);
    res.status(201).json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/maps/:id - úprava mapy, body: celý objekt mapy
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!readIndex().some((m) => m.id === id)) {
      return res.status(404).json({ error: 'Mapa nenalezena.' });
    }
    const existing = readMap(id);
    const body = req.body || {};
    // Sloučení; id a createdAt zůstávají, updatedAt řeší writeMap
    const map = { ...existing, ...body, id, createdAt: existing.createdAt };
    writeMap(id, map);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/maps/:id - smazání mapy
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!readIndex().some((m) => m.id === id)) {
      return res.status(404).json({ error: 'Mapa nenalezena.' });
    }
    deleteMap(id);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
