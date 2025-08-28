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

    // Opcional en el formulario
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      set: clean,
    },

    // Quién lo originó (público o atajo del host)
    source: {
      type: String,
      enum: ['public', 'quick'],
      default: 'public',
      index: true,
    },

    // QUIÉN CANTA (NUEVO): invitado (guest) o host/cantante
    performer: {
      type: String,
      enum: ['guest', 'host'],
      default: 'guest',
      index: true,
    },

    // Estado para el admin (Etapa 5)
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

// Índices útiles para cola y filtros
RequestSchema.index({ createdAt: -1 })                 // ordenar por recientes
RequestSchema.index({ status: 1, createdAt: -1 })      // típico en admin
RequestSchema.index({ source: 1, createdAt: -1 })      // filtrar pedidos por origen
RequestSchema.index({ performer: 1, createdAt: -1 })   // filtrar host vs invitado

export default mongoose.models.Request || mongoose.model('Request', RequestSchema)
