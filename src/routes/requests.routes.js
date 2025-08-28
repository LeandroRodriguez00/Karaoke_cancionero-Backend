// server/src/routes/requests.routes.js
import { Router } from 'express'
import Request, { REQUEST_SOURCE, REQUEST_PERFORMER } from '../models/Request.js'

const router = Router()

// ---------- Helpers internos ----------
function normalizeEnums({ source, performer } = {}) {
  const src = REQUEST_SOURCE.includes(source) ? source : 'public'
  const perf = REQUEST_PERFORMER.includes(performer)
    ? performer
    : (src === 'quick' ? 'host' : 'guest')
  return { source: src, performer: perf }
}

function mapNotes(body, payload) {
  if (typeof body?.notes === 'string') payload.notes = body.notes
  if (typeof body?.observaciones === 'string') payload.observaciones = body.observaciones
  if (typeof body?.obs === 'string') payload.obs = body.obs
}

async function createRequestDoc(body) {
  const { fullName, artist, title } = body || {}
  if (!fullName || !artist || !title) {
    const error = new Error('Campos requeridos: fullName, artist, title')
    error.status = 400
    throw error
  }
  const { source, performer } = normalizeEnums(body)
  const payload = { fullName, artist, title, source, performer }
  mapNotes(body, payload)
  return Request.create(payload)
}

function emitNew(io, doc) {
  io?.emit('request:new', {
    _id: doc._id.toString(),
    fullName: doc.fullName,
    artist: doc.artist,
    title: doc.title,
    notes: doc.notes,
    source: doc.source,
    performer: doc.performer,
    status: doc.status,
    createdAt: doc.createdAt,
  })
}

// ---------- Endpoints públicos ----------

/** POST /api/requests  — crea un pedido (por defecto source='public') */
router.post('/', async (req, res) => {
  try {
    const doc = await createRequestDoc(req.body)
    emitNew(req.app.get('io'), doc)
    return res.status(201).json(doc) // usa toJSON del modelo (incluye id)
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.status === 400) {
      return res.status(400).json({ error: err.message })
    }
    console.error('POST /api/requests error:', err)
    return res.status(500).json({ error: 'Error creando el pedido' })
  }
})

/** POST /api/requests/quick — atajo “Yo canto” (host) */
router.post('/quick', async (req, res) => {
  try {
    const body = { ...req.body, source: 'quick', performer: 'host' }
    const doc = await createRequestDoc(body)
    emitNew(req.app.get('io'), doc)
    return res.status(201).json(doc)
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.status === 400) {
      return res.status(400).json({ error: err.message })
    }
    console.error('POST /api/requests/quick error:', err)
    return res.status(500).json({ error: 'Error creando el pedido rápido' })
  }
})

export default router
