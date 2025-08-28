// server/src/middlewares/adminAuth.js
import { timingSafeEqual } from 'crypto';

export default function adminAuth(req, res, next) {
  // Permite preflight CORS (OPTIONS) sin exigir header
  if (req.method === 'OPTIONS') return next();

  const headerKeyRaw = req.header('x-admin-key');
  const adminKeyRaw = process.env.ADMIN_KEY;

  if (!adminKeyRaw) {
    return res.status(500).json({ error: 'ADMIN_KEY no configurada en el servidor' });
  }

  if (!headerKeyRaw || typeof headerKeyRaw !== 'string') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Evita falsos negativos por espacios y usa comparación constante
  const headerKey = headerKeyRaw.trim();
  const adminKey = adminKeyRaw.trim();

  const a = Buffer.from(headerKey, 'utf8');
  const b = Buffer.from(adminKey, 'utf8');

  // Si difieren en longitud o no son iguales, rechazamos
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Marcar request como admin (útil por si lo necesitás más adelante)
  req.isAdmin = true;
  return next();
}
