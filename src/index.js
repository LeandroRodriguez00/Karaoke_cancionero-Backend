// server/src/index.js
import 'dotenv/config.js'
import express from 'express'
import http from 'http'
import cors from 'cors'
import morgan from 'morgan'
import { Server as SocketIOServer } from 'socket.io'

import { connectDB } from './config/db.js'
import healthRouter from './routes/health.js'
import adminRouter from './routes/admin.js'
import songsRouter from './routes/songs.js'
import artistsRouter from './routes/artists.js'
import requestsRouter from './routes/requests.routes.js' // 👈 plural y nombre exacto
import registerSocket from './socket.js'

const PORT = process.env.PORT || 4000
const ORIGIN = process.env.CLIENT_ORIGIN || '*'

// ⚙️ CORS: si ORIGIN es "*", no mandamos credenciales; si es un dominio, sí.
const corsOptions = {
  origin: ORIGIN === '*' ? '*' : ORIGIN,
  credentials: ORIGIN !== '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
}

// ⬇️ Conexión a DB (top-level await OK en Node 18+)
await connectDB()

const app = express()

// Middlewares base
app.set('trust proxy', 1)
app.use(cors(corsOptions))
app.options('*', cors(corsOptions)) // ✅ preflight explícito
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

// Rutas API
app.use('/api', healthRouter)
app.use('/api/admin', adminRouter)
app.use('/api/songs', songsRouter)
app.use('/api/artists', artistsRouter)
app.use('/api/requests', requestsRouter) // público

// 404 para rutas no encontradas (solo API)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// HTTP + Socket.IO
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: corsOptions.credentials,
    methods: corsOptions.methods,
    allowedHeaders: corsOptions.allowedHeaders, // 👈 también acá
  },
})

// Exponer io para controladores (req.app.get('io'))
app.set('io', io)

// Handlers centralizados de sockets
registerSocket(io)

// (Opcional) Middleware de error JSON al final
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ error: 'SERVER_ERROR' })
})

// Arranque del server
server.listen(PORT, () => {
  console.log(`✅ Server escuchando en http://localhost:${PORT}`)
})

// Manejo básico de errores no atrapados
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

// Apagado limpio
const shutdown = (signal) => () => {
  console.log(`\n${signal} recibido. Cerrando server...`)
  server.close(() => {
    console.log('🔻 HTTP cerrado.')
    process.exit(0)
  })
}
process.on('SIGINT', shutdown('SIGINT'))
process.on('SIGTERM', shutdown('SIGTERM'))
