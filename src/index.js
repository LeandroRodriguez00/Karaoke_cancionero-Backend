// server/src/index.js
import 'dotenv/config.js'
import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { connectDB } from './config/db.js'

// Middlewares/opts de producción centralizados
import { applyHttpMiddlewares, getSocketOptions } from './setupProd.js'

// Rutas y middlewares propios
import healthRouter from './routes/health.js'
import adminRouter from './routes/admin.js'
import songsRouter from './routes/songs.js'
import artistsRouter from './routes/artists.js'
import requestsRouter from './routes/requests.routes.js'
import registerSocket from './socket.js'
import nocache from './middleware/nocache.js'

const PORT = process.env.PORT || 4000

// ⬇️ Conexión a DB (top-level await)
await connectDB()

const app = express()

// ---------- Middlewares base (prod-ready) ----------
applyHttpMiddlewares(app)              // Helmet + Compression + CORS + /api/health
app.set('etag', 'strong')
app.use(express.json({ limit: '1mb' }))

// Exponer header de paginado (como usabas antes)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')
  next()
})

// ---------- Rutas API ----------
app.use('/api', healthRouter)          // /api/health (sigue válido si tu router agrega más checks)

app.use('/api/admin', nocache)         // evitar cache para datos en vivo
app.use('/api/admin', adminRouter)

app.use('/api/songs', songsRouter)
app.use('/api/artists', artistsRouter)
// Si querés evitar cache también en pedidos públicos, descomentá:
// app.use('/api/requests', nocache)
app.use('/api/requests', requestsRouter)

// 404 para rutas no encontradas (solo API)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ---------- HTTP + Socket.IO ----------
const httpServer = http.createServer(app)
const io = new SocketIOServer(httpServer, getSocketOptions()) // usa CORS_ORIGINS y SOCKET_PATH
app.set('io', io)
registerSocket(io)

// ---------- Manejo centralizado de errores ----------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ error: 'SERVER_ERROR' })
})

// ---------- Arranque del server ----------
httpServer.listen(PORT, () => {
  console.log(`✅ Server escuchando en port ${PORT} (env: ${process.env.NODE_ENV})`)
})

// ---------- Errores no atrapados ----------
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

// ---------- Apagado limpio ----------
const shutdown = (signal) => () => {
  console.log(`\n${signal} recibido. Cerrando server...`)
  httpServer.close(() => {
    console.log('🔻 HTTP cerrado.')
    process.exit(0)
  })
}
process.on('SIGINT', shutdown('SIGINT'))
process.on('SIGTERM', shutdown('SIGTERM'))
