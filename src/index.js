import 'dotenv/config.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';

import { connectDB } from './config/db.js';
import healthRouter from './routes/health.js';
import adminRouter from './routes/admin.js';
import songsRouter from './routes/songs.js';
import artistsRouter from './routes/artists.js';
import registerSocket from './socket.js';

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

// ⬇️ Conexión a DB (top-level await OK en Node 18+)
await connectDB();

const app = express();

// Middlewares base
app.set('trust proxy', 1);
app.use(cors({ origin: ORIGIN, methods: ['GET','POST','PUT','PATCH','DELETE'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Rutas API
app.use('/api', healthRouter);
app.use('/api/admin', adminRouter);
app.use('/api/songs', songsRouter);
app.use('/api/artists', artistsRouter);

// 404 para rutas no encontradas (solo API)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: ORIGIN, methods: ['GET','POST','PUT','PATCH','DELETE'] }
});

// Registro de eventos Socket.IO
registerSocket(io);

// Arranque del server
server.listen(PORT, () => {
  console.log(`✅ Server escuchando en http://localhost:${PORT}`);
});

// Manejo básico de errores no atrapados
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Apagado limpio
const shutdown = (signal) => () => {
  console.log(`\n${signal} recibido. Cerrando server...`);
  server.close(() => {
    console.log('🔻 HTTP cerrado.');
    process.exit(0);
  });
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));
