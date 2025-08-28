// server/src/models/song.js
import mongoose from "mongoose";
import { normalizeForSearch as normalize } from "../utils/normalice.js";

// Limpia, normaliza y deduplica estilos manteniendo el texto original "lindo"
function normalizeStyleArray(styles) {
  const originals = Array.isArray(styles) ? styles : [];
  const outOriginal = [];
  const seen = new Set();

  for (const s of originals) {
    if (typeof s !== "string") continue;
    const pretty = s.trim();
    if (!pretty) continue;
    const n = normalize(pretty);
    if (!n) continue;
    if (seen.has(n)) continue; // dedupe por normalizado
    seen.add(n);
    outOriginal.push(pretty); // conservamos el original prolijo
  }
  const outNorm = Array.from(seen); // ej: ["rock", "pop"]
  return { outOriginal, outNorm };
}

const SongSchema = new mongoose.Schema(
  {
    // Campos originales
    artist: { type: String, required: true, trim: true },
    title:  { type: String, required: true, trim: true },

    // Estilos/géneros tal cual vienen del CSV (p.ej. ["Rock", "Pop"])
    styles: { type: [String], default: [] },

    // Campos normalizados (búsqueda sin tildes / case-insensitive)
    artistNorm: { type: String, required: true, index: true },
    titleNorm:  { type: String, required: true, index: true },

    // Estilos normalizados (p.ej. ["rock","pop"]) para filtrar por género
    stylesNorm: { type: [String], default: [], index: true },
  },
  {
    timestamps: true,
    strict: true,
    minimize: true,
    versionKey: false,
  }
);

// Auto-normalización por si faltan Norm o cambian artist/title/styles
SongSchema.pre("validate", function (next) {
  // artist/title -> Norm
  if (this.isModified("artist") || !this.artistNorm) {
    this.artistNorm = normalize(this.artist || "");
  }
  if (this.isModified("title") || !this.titleNorm) {
    this.titleNorm = normalize(this.title || "");
  }

  // styles -> styles (limpios) + stylesNorm (normalizados y únicos)
  if (this.isModified("styles") || !Array.isArray(this.stylesNorm) || this.stylesNorm.length === 0) {
    const { outOriginal, outNorm } = normalizeStyleArray(this.styles);
    this.styles = outOriginal;
    this.stylesNorm = outNorm;
  }

  next();
});

// Evita duplicados por artista+título normalizados
SongSchema.index({ artistNorm: 1, titleNorm: 1 }, { unique: true });

// Índice para orden estable (útil para listados grandes y cursores)
SongSchema.index({ artistNorm: 1, titleNorm: 1, _id: 1 });

// (Ya tenemos índices simples por field-level: artistNorm, titleNorm, stylesNorm)

export default mongoose.models.Song || mongoose.model("Song", SongSchema);
