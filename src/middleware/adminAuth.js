export default function adminAuth(req, res, next) {
  const headerKey = req.header('x-admin-key');
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: 'ADMIN_KEY no configurada en el servidor' });
  }
  if (!headerKey || headerKey !== adminKey) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}
