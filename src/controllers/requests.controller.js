import Request from '../models/Request.js'

const MAX = {
  fullName: 80,
  artist: 120,
  title: 180,
  notes: 500,
}

// Sanitizador cortito
const s = (v) => (typeof v === 'string' ? v.trim() : '')

const validate = ({ fullName, artist, title, notes, source }) => {
  const errors = []

  if (!s(fullName)) errors.push({ field: 'fullName', message: 'fullName es requerido' })
  if (!s(artist))   errors.push({ field: 'artist',   message: 'artist es requerido' })
  if (!s(title))    errors.push({ field: 'title',    message: 'title es requerido' })

  if (s(fullName) && s(fullName).length < 2) errors.push({ field: 'fullName', message: 'fullName muy corto' })

  if (s(fullName).length > MAX.fullName) errors.push({ field: 'fullName', message: `Máximo ${MAX.fullName} chars` })
  if (s(artist).length   > MAX.artist)   errors.push({ field: 'artist',   message: `Máximo ${MAX.artist} chars` })
  if (s(title).length    > MAX.title)    errors.push({ field: 'title',    message: `Máximo ${MAX.title} chars` })
  if (s(notes).length    > MAX.notes)    errors.push({ field: 'notes',    message: `Máximo ${MAX.notes} chars` })

  if (source && !['public', 'quick'].includes(source)) {
    errors.push({ field: 'source', message: 'source inválido' })
  }

  return errors
}

export async function createRequest(req, res) {
  try {
    const { fullName, artist, title, notes, source } = req.body || {}

    const errors = validate({ fullName, artist, title, notes, source })
    if (errors.length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors })
    }

    const doc = await Request.create({
      fullName: s(fullName),
      artist: s(artist),
      title: s(title),
      notes: s(notes) || undefined,
      source: source === 'quick' ? 'quick' : 'public',
    })

    // Emitimos para la Etapa 5 (admin en vivo)
    const io = req.app.get('io')
    if (io) {
      io.emit('request:new', {
        _id: doc._id.toString(),
        fullName: doc.fullName,
        artist: doc.artist,
        title: doc.title,
        source: doc.source,
        status: doc.status,
        createdAt: doc.createdAt,
      })
    }

    return res.status(201).json({ ok: true, request: doc })
  } catch (err) {
    // Si cae una ValidationError de Mongoose, devolvemos 400 prolijo
    if (err?.name === 'ValidationError') {
      const details = Object.entries(err.errors).map(([field, e]) => ({
        field,
        message: e.message || 'Inválido',
      }))
      return res.status(400).json({ error: 'VALIDATION_ERROR', details })
    }
    console.error('Error creando request:', err)
    return res.status(500).json({ error: 'SERVER_ERROR' })
  }
}
