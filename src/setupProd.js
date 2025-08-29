import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

export function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS || ''
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function applyHttpMiddlewares(app) {
  const allowed = getAllowedOrigins()
  app.set('trust proxy', 1)

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  )
  app.use(compression())
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true) // curl/healthchecks
        if (allowed.includes(origin)) return cb(null, true)
        return cb(new Error('Not allowed by CORS'))
      },
      credentials: false,
    })
  )

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      time: new Date().toISOString(),
    })
  })
}

export function getSocketOptions() {
  const allowed = getAllowedOrigins()
  return {
    path: process.env.SOCKET_PATH || '/socket.io',
    cors: { origin: allowed, methods: ['GET','POST'] },
    transports: ['websocket','polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  }
}
