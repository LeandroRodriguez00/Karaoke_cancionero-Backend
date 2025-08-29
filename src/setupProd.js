// server/src/setupProd.js
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

function parseAllowed(originsRaw) {
  return (originsRaw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export function getAllowedOrigins() {
  return parseAllowed(process.env.CORS_ORIGINS)
}

export function applyHttpMiddlewares(app) {
  const allowlist = getAllowedOrigins()

  app.set('trust proxy', 1)

  // Helmet "suave" para SPA + APIs
  app.use(
    helmet({
      contentSecurityPolicy: false,               // evitamos CSP estricto para SPA
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  )
  app.use(compression())
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // ---------- CORS con credenciales + preflight global ----------
  const corsDelegate = (req, cb) => {
    const origin = req.header('Origin')
    const isAllowed = !origin || allowlist.includes(origin)
    cb(
      null,
      {
        origin: isAllowed ? origin : false,        // devolver el origin (no "*")
        credentials: true,                         // <-- necesario por fetch { credentials:'include' }
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-admin-key'],
        exposedHeaders: ['X-Total-Count'],
        maxAge: 86400,                             // cachea el preflight 24h
      }
    )
  }

  const corsMw = cors(corsDelegate)
  app.use(corsMw)
  app.options('*', corsMw) // preflight para todas las rutas

  // ---------- Health ----------
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      time: new Date().toISOString(),
    })
  })
}

export function getSocketOptions() {
  const allowlist = getAllowedOrigins()
  return {
    path: process.env.SOCKET_PATH || '/socket.io',
    cors: {
      origin: allowlist,
      credentials: true,          // por si el client usa credenciales
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'x-admin-key'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  }
}
