import { Router } from 'express';
import adminAuth from '../middleware/adminAuth.js';
const router = Router();

// Todas las rutas bajo /api/admin requieren ADMIN_KEY
router.use(adminAuth);

router.get('/ping', (req, res) => {
  res.status(200).json({ ok: true, at: new Date().toISOString() });
});

export default router;
