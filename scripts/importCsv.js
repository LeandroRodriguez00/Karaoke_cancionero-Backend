// server/scripts/importcsv.js
import 'dotenv/config.js'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import mongoose from 'mongoose'
import iconv from 'iconv-lite'

import Song from '../src/models/Song.js'
import { normalizeForSearch } from '../src/utils/normalice.js' // 👈 corregido: normalice.js

// ⬇️ Config desde .env
const { MONGO_URI, CSV_PATH, CSV_ENCODING } = process.env
if (!MONGO_URI) { console.error('❌ Falta MONGO_URI en .env'); process.exit(1) }
if (!CSV_PATH)  { console.error('❌ Falta CSV_PATH en .env');  process.exit(1) }

const args = new Set(process.argv.slice(2))
const REPLACE  = args.has('--replace') || args.has('--truncate') || args.has('-r')
const DRY_RUN  = args.has('--dry-run')
const ONLY_IDX = args.has('--indexes') || args.has('--indices-only')

const csvAbs = path.resolve(process.cwd(), CSV_PATH)
if (!fs.existsSync(csvAbs)) {
  console.error(`❌ No se encontró el CSV en: ${csvAbs}`)
  process.exit(1)
}

const BATCH_SIZE = 1000
const PROGRESS_EVERY = 5000

/* =========================
   Decodificación robusta
   ========================= */
function decodeSmart(buf) {
  const forced = (CSV_ENCODING || 'auto').toLowerCase()
  if (forced !== 'auto') {
    console.log(`🔧 Forzando decodificación: ${forced}`)
    if (forced === 'utf8') return stripUtf8Bom(buf.toString('utf8'))
    if (forced === 'win1252' || forced === 'latin1') return iconv.decode(buf, 'win1252')
    if (forced === 'utf16le') return buf.toString('utf16le')
    if (forced === 'utf16be') return swapBytes(buf).toString('utf16le')
  }

  if (buf.length === 0) return ''

  // BOMs
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return stripUtf8Bom(buf.slice(3).toString('utf8'))
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le')
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return swapBytes(buf.slice(2)).toString('utf16le')
  }

  // Heurística UTF-16
  const probe = buf.slice(0, Math.min(buf.length, 512))
  const zeros = [...probe].filter((b) => b === 0x00).length
  if (zeros / probe.length > 0.1) {
    try { return buf.toString('utf16le') } catch {}
  }

  // Intento UTF-8 y fallback a Win-1252 si hay �
  const asUtf8 = buf.toString('utf8')
  if (asUtf8.includes('\uFFFD')) {
    console.log('ℹ️ UTF-8 inválido detectado → decodificando como Windows-1252.')
    return iconv.decode(buf, 'win1252')
  }
  return asUtf8
}
function stripUtf8Bom(str) { return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str }
function swapBytes(buffer) {
  const out = Buffer.alloc(buffer.length)
  for (let i = 0; i < buffer.length - 1; i += 2) { out[i] = buffer[i + 1]; out[i + 1] = buffer[i] }
  if (buffer.length % 2 === 1) out[buffer.length - 1] = buffer[buffer.length - 1]
  return out
}

/* =========================
   Detección de separador
   ========================= */
function detectDelimiterFromHeader(line) {
  const sc = (line.match(/;/g) || []).length
  const cc = (line.match(/,/g) || []).length
  if (sc === 0 && cc === 0) return ','
  return sc > cc ? ';' : ','
}
function parseWith(raw, delimiter) {
  const res = Papa.parse(raw, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    quoteChar: '"',
    escapeChar: '"',
    transformHeader: (h) => h.toLowerCase().trim(),
  })
  return {
    rows: (res.data || []).filter((r) => r && Object.keys(r).length > 0),
    fields: (res.meta?.fields || []).map((f) => (f ?? '').toString()),
  }
}

/* =========================
   Helpers de estilos/género
   ========================= */
const splitStyles = (val = '') =>
  String(val ?? '')
    .split(/[;,\/|]/g)
    .map((s) => s.trim())
    .filter(Boolean)

const dedupe = (arr = []) => Array.from(new Set(arr))

/* =========================
   Índices & Duplicados
   ========================= */
async function ensureSongIndexes() {
  console.log('🔧 Creando/asegurando índices en songs...')
  await Song.collection.createIndex({ artistNorm: 1 })
  await Song.collection.createIndex({ titleNorm: 1 })
  await Song.collection.createIndex({ stylesNorm: 1 })
  await Song.collection.createIndex({ artistNorm: 1, titleNorm: 1 }, { unique: true })
  console.log('✅ Índices OK')
}

async function reportDuplicates(limit = 10) {
  const dups = await Song.aggregate([
    { $group: { _id: { a: '$artistNorm', t: '$titleNorm' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
    { $limit: limit },
  ])
  if (dups.length) {
    console.warn(`⚠️ Duplicados por (artistNorm,titleNorm): ${dups.length} grupos (mostrando hasta ${limit})`)
    for (const d of dups) {
      console.warn(` - "${d._id.a}" | "${d._id.t}" → ${d.n} docs (ids: ${d.ids.slice(0, 5).join(', ')}${d.ids.length > 5 ? '…' : ''})`)
    }
  } else {
    console.log('✅ Sin duplicados por (artistNorm,titleNorm)')
  }
}

/* =========================
   Import masivo
   ========================= */
async function bulkImport(rows) {
  let buffer = []
  const totals = { read: 0, upserted: 0, modified: 0, skipped: 0 }
  const t0 = process.hrtime.bigint()

  async function flushBatch() {
    if (!buffer.length) return
    const ops = buffer.map(({ artist, title, artistNorm, titleNorm, styles, stylesNorm }) => ({
      updateOne: {
        filter: { artistNorm, titleNorm },
        update: { $set: { artist, title, artistNorm, titleNorm, styles, stylesNorm } },
        upsert: true,
      },
    }))
    buffer = []
    try {
      const res = await Song.bulkWrite(ops, { ordered: false })
      totals.upserted += res.upsertedCount || 0
      totals.modified += res.modifiedCount || 0
    } catch (err) {
      // Si hay E11000 (duplicado), avisamos y seguimos
      console.warn('⚠️ batch error (continuamos):', err?.code || err?.message)
    }
  }

  for (const row of rows) {
    totals.read++

    const rawArtist =
      row.artist ?? row.artista ?? row['artist name'] ?? row.autor ?? row.author ?? row.intérprete ?? row.interprete ?? ''
    const rawTitle =
      row.title ?? row.cancion ?? row['song title'] ?? row.tema ?? row.name ?? row['song name'] ?? ''
    const rawStyles =
      row.styles ?? row.style ?? row.genre ?? row.genres ?? row.genero ?? row.género ?? ''

    const artist = String(rawArtist || '').trim()
    const title  = String(rawTitle  || '').trim()
    if (!artist || !title) { totals.skipped++; continue }

    const styles = dedupe(splitStyles(rawStyles))
    const stylesNorm = dedupe(styles.map(normalizeForSearch)).filter(Boolean)

    const artistNorm = normalizeForSearch(artist)
    const titleNorm  = normalizeForSearch(title)

    buffer.push({ artist, title, artistNorm, titleNorm, styles, stylesNorm })

    if (buffer.length >= BATCH_SIZE) await flushBatch()
    if (totals.read % PROGRESS_EVERY === 0) {
      const ms = Number((process.hrtime.bigint() - t0) / 1000000n)
      console.log(`… procesadas ${totals.read} filas (${ms} ms)`)
    }
  }

  await flushBatch()
  return totals
}

/* =========================
   Programa principal
   ========================= */
async function main() {
  console.log('🔌 Conectando a Mongo...')
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })

  if (ONLY_IDX) {
    await ensureSongIndexes()
    await mongoose.disconnect()
    return
  }

  if (REPLACE && !DRY_RUN) {
    const { deletedCount } = await Song.deleteMany({})
    console.log(`🧹 Colección 'songs' limpiada. Documentos eliminados: ${deletedCount}`)
  }

  console.log(`📄 Importando CSV: ${csvAbs}`)
  const buf = fs.readFileSync(csvAbs)
  let raw = decodeSmart(buf)

  let lines = raw.split(/\r?\n/)
  if (/^sep=./i.test(lines[0] || '')) {
    console.log("ℹ️ Detectado 'sep=;' de Excel → se ignora la primera línea.")
    lines.shift()
    raw = lines.join('\n')
  }

  console.log('🔍 Primeras líneas:')
  console.log(lines.slice(0, 3).join('\n') || '(vacío)')

  const headerLine = lines.find((l) => l && !/^sep=/i.test(l)) || ''
  let delimiter = detectDelimiterFromHeader(headerLine)
  console.log(`🔎 Delimitador estimado: ${delimiter === ';' ? 'punto y coma ;' : 'coma ,'}`)

  let attempt = parseWith(raw, delimiter)
  console.log('🔎 Encabezados:', attempt.fields)

  const hasTA = (f) => {
    const lower = f.map((x) => x.toLowerCase())
    return lower.includes('title') && lower.includes('artist')
  }

  if (!hasTA(attempt.fields) || attempt.rows.length === 0) {
    delimiter = delimiter === ';' ? ',' : ';'
    console.log(`↪️ Reintentando con ${delimiter === ';' ? 'punto y coma ;' : 'coma ,'}...`)
    attempt = parseWith(raw, delimiter)
    console.log('🔎 Encabezados (reintento):', attempt.fields)
  }

  if (!hasTA(attempt.fields) || attempt.rows.length === 0) {
    console.error("❌ No se detectaron columnas 'Title' y 'Artist' o no hay filas. Revisá exportación.")
    await mongoose.disconnect()
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log(`🧪 DRY RUN: leeríamos ${attempt.rows.length} filas. No se escribe en DB.`)
    await mongoose.disconnect()
    return
  }

  const totals = await bulkImport(attempt.rows)

  console.log('🔧 Asegurando índices…')
  await ensureSongIndexes()

  console.log('🔎 Reporte de duplicados (top 10)…')
  await reportDuplicates(10)

  console.log('✅ Importación completa:')
  console.log(`   Leídas:      ${totals.read}`)
  console.log(`   Upsertadas:  ${totals.upserted}`)
  console.log(`   Modificadas: ${totals.modified}`)
  console.log(`   Omitidas:    ${totals.skipped}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ Error en importación:', err)
  process.exit(1)
})
