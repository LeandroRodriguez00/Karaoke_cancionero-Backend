import mongoose from 'mongoose';

const RequestSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    artist:   { type: String, required: true, trim: true },
    title:    { type: String, required: true, trim: true },

    // Opcional en el formulario
    notes:    { type: String, trim: true, maxlength: 500 },

    // Quién lo originó (público o “Yo canto” del host)
    source:   { type: String, enum: ['public', 'quick'], default: 'public', index: true },

    // Estado para el admin (Etapa 5)
    status:   { type: String, enum: ['pending','on_stage','done','no_show'], default: 'pending', index: true },
  },
  { timestamps: true }
);

// Orden típico para la cola: más recientes primero, filtrables por estado
RequestSchema.index({ status: 1, createdAt: -1 });

// Evita OverwriteModelError con hot-reload
export default mongoose.models.Request || mongoose.model('Request', RequestSchema);
