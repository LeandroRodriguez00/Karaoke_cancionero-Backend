// server/src/index.js
import 'dotenv/config.js'
import express from 'express'
import http from 'http'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import compression from 'compression'
import { Server as SocketIOServer } from 'socket.io'

import { connectDB } from './config/db.js'
import healthRouter from './routes/health.js'
import adminRouter from './routes/admin.js'
import songsRouter from './routes/songs.js'
import artistsRouter from './routes/artists.js'
import requestsRouter from './routes/requests.routes.js' // 👈 plural y nombre exacto
import registerSocket from './socket.js'
import nocache from './middleware/nocache.js'            // ⬅️ nuevo

const PORT = process.env.PORT || 4000
const ORIGIN = process.env.CLIENT_ORIGIN || '*'
const SOCKET_PATH = process.env.SOCKET_PATH || '/socket.io' // ⬅️ opcional, coordina con el client

// ⚙️ CORS: si ORIGIN es "*", no mandamos credenciales; si es un dominio, sí.
// Exponemos X-Total-Count para paginado en el cliente.
const corsOptions = {
  origin: ORIGIN === '*' ? '*' : ORIGIN,
  credentials: ORIGIN !== '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
  exposedHeaders: ['X-Total-Count'],
}

// ⬇️ Conexión a DB (top-level await OK en Node 18+)
await connectDB()

const app = express()

// ---------- Middlewares base ----------
app.set('trust proxy', 1)
app.set('etag', 'strong')

app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())

app.use(cors(corsOptions))
app.options('*', cors(corsOptions)) // ✅ preflight explícito

app.use(express.json({ limit: '1mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'))

// ---------- Rutas API ----------
// Health
app.use('/api', healthRouter) // /api/health

// Admin (no-cache + rutas)
app.use('/api/admin', nocache)        // ⬅️ evita cache para datos en vivo
app.use('/api/admin', adminRouter)

// Público
app.use('/api/songs', songsRouter)
app.use('/api/artists', artistsRouter)

// (Opcional) Evitar cache en pedidos públicos también
// app.use('/api/requests', nocache)
app.use('/api/requests', requestsRouter)

// 404 para rutas no encontradas (solo API)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ---------- HTTP + Socket.IO ----------
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  path: SOCKET_PATH, // ⬅️ configurable
  cors: {
    origin: corsOptions.origin,
    credentials: corsOptions.credentials,
    methods: corsOptions.methods,
    allowedHeaders: corsOptions.allowedHeaders,
  },
  pingInterval: 20000,
  pingTimeout: 20000,
})
app.set('io', io)        // req.app.get('io') en controladores
registerSocket(io)       // handlers centralizados

// ---------- Manejo centralizado de errores ----------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ error: 'SERVER_ERROR' })
})

// ---------- Arranque del server ----------
server.listen(PORT, () => {
  console.log(`✅ Server escuchando en http://localhost:${PORT}`)
  console.log(`🌐 CORS origin: ${corsOptions.origin} (credenciales: ${corsOptions.credentials})`)
  console.log(`🔌 Socket.IO path: ${SOCKET_PATH}`)
})

// ---------- Manejo básico de errores no atrapados ----------
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

// ---------- Apagado limpio ----------
const shutdown = (signal) => () => {
  console.log(`\n${signal} recibido. Cerrando server...`)
  server.close(() => {
    console.log('🔻 HTTP cerrado.')
    process.exit(0)
  })
}
process.on('SIGINT', shutdown('SIGINT'))
process.on('SIGTERM', shutdown('SIGTERM'))
