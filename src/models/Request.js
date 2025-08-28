import mongoose from 'mongoose'

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
    // - Soporta alias "observaciones" (vía alias nativo de Mongoose)
    // - Soporta "obs" (vía virtual más abajo)
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      set: clean,
      alias: 'observaciones',
    },

    // Origen del pedido
    source: {
      type: String,
      enum: ['public', 'quick'],
      default: 'public',
      index: true,
    },

    // Quién canta
    performer: {
      type: String,
      enum: ['guest', 'host'],
      default: 'guest',
      index: true,
    },

    // Estado para el admin
    status: {
      type: String,
      enum: ['pending', 'on_stage', 'done', 'no_show'],
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

export default mongoose.models.Request || mongoose.model('Request', RequestSchema)
