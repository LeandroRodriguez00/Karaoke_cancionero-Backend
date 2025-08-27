import mongoose from "mongoose";

const SongSchema = new mongoose.Schema(
  {
    // Campos originales
    artist: { type: String, required: true, trim: true },
    title:  { type: String, required: true, trim: true },

    // NUEVO: estilos/géneros tal cual vienen del CSV (p.ej. ["Rock", "Pop"])
    styles: {
      type: [String],
      default: [],
    },

    // Campos normalizados (búsqueda sin tildes / case-insensitive)
    artistNorm: { type: String, required: true, index: true },
    titleNorm:  { type: String, required: true, index: true },

    // NUEVO: estilos normalizados (p.ej. ["rock","pop"]) para filtrar por género
    stylesNorm: {
      type: [String],
      default: [],
      index: true,
    },
  },
  { timestamps: true }
);

// Evita duplicados por artista+título normalizados
SongSchema.index({ artistNorm: 1, titleNorm: 1 }, { unique: true });

// Índice para orden estable (útil para listados grandes y cursores)
SongSchema.index({ artistNorm: 1, titleNorm: 1, _id: 1 });

// Evita OverwriteModelError con hot-reload/nodemon
export default mongoose.models.Song || mongoose.model("Song", SongSchema);
