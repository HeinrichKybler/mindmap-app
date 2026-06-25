// Placeholder endpointy pro Lívii — zatím není připojena, vrací 501 + hint
import express from 'express';

const router = express.Router();

// Jednotná odpověď "není připojeno" s nápovědou na konfiguraci
function notConnected(req, res) {
  res.status(501).json({
    error: 'Lívia není připojena',
    hint: `Nastav LIVIA_PORT v .env (aktuálně: ${process.env.LIVIA_PORT || 8000})`,
  });
}

router.post('/expand', notConnected);
router.post('/summarize', notConnected);
router.post('/tags', notConnected);
router.post('/comment', notConnected);

export default router;
