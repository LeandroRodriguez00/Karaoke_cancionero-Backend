// server/src/models/Request.js
import mongoose from 'mongoose'

// ================= Constantes públicas (reutilizables en rutas)
export const REQUEST_STATUS = ['pending', 'on_stage', 'done', 'no_show']
export const REQUEST_SOURCE = ['public', 'quick']
export const REQUEST_PERFORMER = ['guest', 'host']

// Conjuntos para validación rápida
const STATUS_SET = new Set(REQUEST_STATUS)
const SOURCE_SET = new Set(REQUEST_SOURCE)
const PERFORMER_SET = new Set(REQUEST_PERFORMER)

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
      set: clean,
    },

    // Quién canta
    performer: {
      type: String,
      enum: REQUEST_PERFORMER,
      default: 'guest',
      index: true,
      set: clean,
    },

    // Estado para el admin
    status: {
      type: String,
      enum: REQUEST_STATUS,
      default: 'pending',
      index: true,
      set: clean,
    },
  },
  {
    timestamps: true,
    versionKey: false, // saca __v
    minimize: true,
    strict: true,
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

/**
 * Normalización/robustez antes de validar:
 * - Si source/performer/status vienen fuera de catálogo, caen a defaults
 * - Revalida strings "vacíos" tras clean()
 */
RequestSchema.pre('validate', function (next) {
  // Defaults seguros para enums
  if (!SOURCE_SET.has(this.source)) this.source = 'public'
  if (!PERFORMER_SET.has(this.performer)) this.performer = 'guest'
  if (!STATUS_SET.has(this.status)) this.status = 'pending'

  // Validar campos obligatorios no vacíos después de clean()
  if (!this.fullName || !this.artist || !this.title) {
    const err = new mongoose.Error.ValidationError(this)
    if (!this.fullName) err.addError('fullName', new mongoose.Error.ValidatorError({ message: 'fullName requerido' }))
    if (!this.artist) err.addError('artist', new mongoose.Error.ValidatorError({ message: 'artist requerido' }))
    if (!this.title) err.addError('title', new mongoose.Error.ValidatorError({ message: 'title requerido' }))
    return next(err)
  }
  next()
})

// Índices útiles para cola y filtros
RequestSchema.index({ createdAt: -1 })
RequestSchema.index({ status: 1, createdAt: -1 })
RequestSchema.index({ source: 1, createdAt: -1 })
RequestSchema.index({ performer: 1, createdAt: -1 })

// Exponer listas permitidas como statics (para usar en rutas/controladores)
RequestSchema.statics.ALLOWED_STATUS = REQUEST_STATUS
RequestSchema.statics.ALLOWED_SOURCE = REQUEST_SOURCE
RequestSchema.statics.ALLOWED_PERFORMER = REQUEST_PERFORMER

// Export default y named para evitar problemas de import
const Request =
  mongoose.models.Request || mongoose.model('Request', RequestSchema)

export { Request }
export default Request
