// server/src/routes/admin.js
import { Router } from 'express'
import mongoose from 'mongoose'

import adminAuth from '../middleware/adminAuth.js'
import Request, { REQUEST_STATUS } from '../models/Request.js'

const router = Router()

// Todas las rutas bajo /api/admin requieren ADMIN_KEY
router.use(adminAuth)

/**
 * GET /api/admin/ping
 * Ping simple (útil para Postman)
 */
router.get('/ping', (_req, res) => {
  res.status(200).json({ ok: true, at: new Date().toISOString() })
})

/**
 * GET /api/admin/requests?status=pending,on_stage
 * Lista pedidos (con filtro opcional por uno o varios estados).
 * Devuelve { data, counts } donde counts trae contadores por estado.
 */
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query

    // Filtro por estados válidos
    let filter = {}
    if (status) {
      const requested = String(status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const allowed = requested.filter((s) => REQUEST_STATUS.includes(s))
      if (allowed.length) filter.status = { $in: allowed }
    }

    // Lista (más nuevos primero)
    const data = await Request.find(filter).sort({ createdAt: -1 }).lean()

    // Contadores por estado (aseguramos todas las claves)
    const agg = await Request.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    const counts = REQUEST_STATUS.reduce((acc, s) => {
      const hit = agg.find((it) => it._id === s)
      acc[s] = hit ? hit.count : 0
      return acc
    }, {})

    return res.json({ data, counts })
  } catch (err) {
    console.error('GET /api/admin/requests error:', err)
    return res.status(500).json({ error: 'Error listando pedidos' })
  }
})

/**
 * PATCH /api/admin/requests/:id/status
 * Body: { status: 'pending' | 'on_stage' | 'done' | 'no_show' }
 * Cambia estado y emite 'request:update' por Socket.IO.
 */
router.patch('/requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body || {}

    // Validaciones rápidas
    if (!REQUEST_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    // Update
    const doc = await Request.findByIdAndUpdate(id, { $set: { status } }, { new: true })

    if (!doc) return res.status(404).json({ error: 'Pedido no encontrado' })

    // Emitir evento en vivo
    const io = req.app.get('io')
    io?.emit('request:update', {
      _id: doc._id.toString(),
      status: doc.status,
      updatedAt: doc.updatedAt,
    })

    return res.json(doc) // usa toJSON del modelo (incluye id)
  } catch (err) {
    console.error('PATCH /api/admin/requests/:id/status error:', err)
    return res.status(500).json({ error: 'Error actualizando estado' })
  }
})

/**
 * DELETE /api/admin/requests/:id
 * Elimina un pedido y emite 'request:delete'
 */
router.delete('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    const doc = await Request.findByIdAndDelete(id)
    if (!doc) return res.status(404).json({ error: 'Pedido no encontrado' })

    const io = req.app.get('io')
    io?.emit('request:delete', { _id: id })

    return res.json({ ok: true, deleted: 1 })
  } catch (err) {
    console.error('DELETE /api/admin/requests/:id error:', err)
    return res.status(500).json({ error: 'Error eliminando pedido' })
  }
})

/**
 * DELETE /api/admin/requests
 * Elimina TODOS los pedidos y emite 'requests:clear'
 */
router.delete('/requests', async (_req, res) => {
  try {
    const { deletedCount } = await Request.deleteMany({})
    const io = _req.app.get('io')
    io?.emit('requests:clear')
    return res.json({ ok: true, deleted: deletedCount || 0 })
  } catch (err) {
    console.error('DELETE /api/admin/requests error:', err)
    return res.status(500).json({ error: 'Error eliminando todos los pedidos' })
  }
})

export default router
