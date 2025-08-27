import "dotenv/config.js";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import mongoose from "mongoose";
import iconv from "iconv-lite";

import Song from "../src/models/Song.js";
import { normalizeForSearch } from "../utils/normalize.js";

const { MONGO_URI, CSV_PATH } = process.env;
if (!MONGO_URI) { console.error("❌ Falta MONGO_URI en .env"); process.exit(1); }
if (!CSV_PATH)  { console.error("❌ Falta CSV_PATH en .env");  process.exit(1); }

const csvAbs = path.resolve(process.cwd(), CSV_PATH);
if (!fs.existsSync(csvAbs)) {
  console.error(`❌ No se encontró el CSV en: ${csvAbs}`);
  process.exit(1);
}

const BATCH_SIZE = 1000;

/* =========================
   Decodificación robusta
   ========================= */
function decodeSmart(buf) {
  if (buf.length === 0) return "";

  // BOM UTF-8
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString("utf8");
  }
  // UTF-16 LE BOM (FF FE)
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString("utf16le");
  }
  // UTF-16 BE BOM (FE FF) -> swap y decodificar como LE
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const sliced = buf.slice(2);
    const swapped = swapBytes(sliced);
    return swapped.toString("utf16le");
  }

  // Heurística de UTF-16 (muchos 0x00)
  const probe = buf.slice(0, Math.min(buf.length, 512));
  const zeros = [...probe].filter(b => b === 0x00).length;
  if (zeros / probe.length > 0.1) {
    try { return buf.toString("utf16le"); } catch {}
  }

  // Intento UTF-8 legible
  const asUtf8 = buf.toString("utf8");
  if (/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(asUtf8)) return asUtf8;

  // Fallback ANSI/Win-1252
  return iconv.decode(buf, "win1252");
}
function swapBytes(buffer) {
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length - 1; i += 2) { out[i] = buffer[i+1]; out[i+1] = buffer[i]; }
  if (buffer.length % 2 === 1) out[buffer.length - 1] = buffer[buffer.length - 1];
  return out;
}

/* =========================
   Detección de separador
   ========================= */
function detectDelimiterFromHeader(line) {
  // usa la primera línea con contenido (header). Cuenta ; y ,
  const sc = (line.match(/;/g) || []).length;
  const cc = (line.match(/,/g) || []).length;
  if (sc === 0 && cc === 0) return ","; // default
  return sc > cc ? ";" : ",";
}

function parseWith(raw, delimiter) {
  const res = Papa.parse(raw, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    quoteChar: '"',
    escapeChar: '"',
    transformHeader: (h) => h.toLowerCase().trim(),
  });
  return {
    rows: (res.data || []).filter(r => r && Object.keys(r).length > 0),
    fields: (res.meta?.fields || []).map(f => (f ?? "").toString())
  };
}

/* =========================
   Helpers de estilos/género
   ========================= */
const splitStyles = (val = "") =>
  String(val ?? "")
    .split(/[;,\/|]/g)     // soporta ; , / |
    .map(s => s.trim())
    .filter(Boolean);

const dedupe = (arr = []) => Array.from(new Set(arr));

/* =========================
   Import masivo
   ========================= */
async function bulkImport(rows) {
  let buffer = [];
  let totals = { read: 0, upserted: 0, modified: 0, skipped: 0 };

  async function flushBatch() {
    if (!buffer.length) return;

    const ops = buffer.map(({ artist, title, artistNorm, titleNorm, styles, stylesNorm }) => ({
      updateOne: {
        filter: { artistNorm, titleNorm },
        update: {
          $set: {
            artist,
            title,
            artistNorm,
            titleNorm,
            // NUEVO: guardamos estilos y su versión normalizada
            styles,
            stylesNorm,
          }
        },
        upsert: true
      }
    }));

    buffer = [];
    const res = await Song.bulkWrite(ops, { ordered: false });
    totals.upserted += res.upsertedCount || 0;
    totals.modified += res.modifiedCount || 0;
  }

  for (const row of rows) {
    totals.read++;

    // alias comunes
    const rawArtist =
      row.artist ?? row.artista ?? row["artist name"] ?? row.autor ?? row.author ?? row.intérprete ?? row.interprete ?? "";
    const rawTitle  =
      row.title  ?? row.cancion ?? row["song title"]   ?? row.tema  ?? row.name   ?? row["song name"] ?? "";

    // NUEVO: alias para styles/género
    const rawStyles =
      row.styles ?? row.style ?? row.genre ?? row.genres ?? row.genero ?? row.género ?? "";

    const artist = String(rawArtist || "").trim();
    const title  = String(rawTitle  || "").trim();
    if (!artist || !title) { totals.skipped++; continue; }

    // Estilos/genres
    const styles = dedupe(splitStyles(rawStyles));
    const stylesNorm = dedupe(styles.map(normalizeForSearch)).filter(Boolean);

    const artistNorm = normalizeForSearch(artist);
    const titleNorm  = normalizeForSearch(title);

    buffer.push({ artist, title, artistNorm, titleNorm, styles, stylesNorm });

    if (buffer.length >= BATCH_SIZE) await flushBatch();
  }

  await flushBatch();
  return totals;
}

/* =========================
   Programa principal
   ========================= */
async function main() {
  console.log("🔌 Conectando a Mongo...");
  await mongoose.connect(MONGO_URI);

  console.log(`📄 Importando CSV: ${csvAbs}`);
  const buf = fs.readFileSync(csvAbs);
  let raw = decodeSmart(buf);

  // Partimos por líneas para detectar header y manejar "sep=;"
  let lines = raw.split(/\r?\n/);
  if (/^sep=./i.test(lines[0] || "")) {
    console.log("ℹ️ Detectado 'sep=;' de Excel → se ignora la primera línea.");
    lines.shift();
    raw = lines.join("\n");
  }

  // Preview
  console.log("🔍 Primeras líneas:");
  console.log(lines.slice(0, 3).join("\n") || "(vacío)");

  // Delimitador
  const headerLine = (lines.find(l => l && !/^sep=/i.test(l)) || "");
  let delimiter = detectDelimiterFromHeader(headerLine);
  console.log(`🔎 Delimitador estimado: ${delimiter === ";" ? "punto y coma ;" : "coma ,"}`);

  // Parse principal
  let attempt = parseWith(raw, delimiter);
  console.log("🔎 Encabezados:", attempt.fields);

  // Si no vino title/artist o no hay filas, reintento con el otro separador
  const hasTA = (f) => f.map(x => x.toLowerCase()).includes("title") && f.map(x => x.toLowerCase()).includes("artist");
  if (!hasTA(attempt.fields) || attempt.rows.length === 0) {
    delimiter = delimiter === ";" ? "," : ";";
    console.log(`↪️ Reintentando con ${delimiter === ";" ? "punto y coma ;" : "coma ,"}...`);
    attempt = parseWith(raw, delimiter);
    console.log("🔎 Encabezados (reintento):", attempt.fields);
  }

  if (!hasTA(attempt.fields) || attempt.rows.length === 0) {
    console.error("❌ No se detectaron columnas 'Title' y 'Artist' o no hay filas. Revisá exportación.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // Import
  const totals = await bulkImport(attempt.rows);

  console.log("✅ Importación completa:");
  console.log(`   Leídas:      ${totals.read}`);
  console.log(`   Upsertadas:  ${totals.upserted}`);
  console.log(`   Modificadas: ${totals.modified}`);
  console.log(`   Omitidas:    ${totals.skipped}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error en importación:", err);
  process.exit(1);
});
