// server/src/models/Request.js
import mongoose from 'mongoose'

// ================= Constantes públicas (reutilizables en rutas)
export const REQUEST_STATUS = ['pending', 'on_stage', 'done', 'no_show']
export const REQUEST_SOURCE = ['public', 'quick']
export const REQUEST_PERFORMER = ['guest', 'host']

// Normalizador suave: quita dobles espacios, NBSP y recorta extremos
const clean = (s) =>
  typeof s === 'string'
    ? s.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
    : s

const RequestSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
      set: clean,
    },
    artist: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
      set: clean,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 180,
      set: clean,
    },

    // Observaciones: guarda en "notes"
    // - Soporta alias "observaciones" (alias nativo de Mongoose)
    // - Soporta "obs" (virtual más abajo)
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      set: clean,
      alias: 'observaciones',
    },

    // Origen del pedido (público o carga rápida del host)
    source: {
      type: String,
      enum: REQUEST_SOURCE,
      default: 'public',
      index: true,
    },

    // Quién canta
    performer: {
      type: String,
      enum: REQUEST_PERFORMER,
      default: 'guest',
      index: true,
    },

    // Estado para el admin
    status: {
      type: String,
      enum: REQUEST_STATUS,
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false, // saca __v
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        return ret
      },
    },
    toObject: { virtuals: true },
  }
)

/* ========= Virtual adicional: "obs" → notes =========
   Permite crear/actualizar usando { obs: '...' } */
RequestSchema.virtual('obs')
  .get(function () {
    return this.notes
  })
  .set(function (v) {
    this.notes = clean(v)
  })

// Índices útiles para cola y filtros
RequestSchema.index({ createdAt: -1 })
RequestSchema.index({ status: 1, createdAt: -1 })
RequestSchema.index({ source: 1, createdAt: -1 })
RequestSchema.index({ performer: 1, createdAt: -1 })

// Exponer lista de estados permitidos para usar en rutas (validación)
RequestSchema.statics.ALLOWED_STATUS = REQUEST_STATUS

// Export default y named para evitar problemas de import
const Request =
  mongoose.models.Request || mongoose.model('Request', RequestSchema)

export { Request }
export default Request
