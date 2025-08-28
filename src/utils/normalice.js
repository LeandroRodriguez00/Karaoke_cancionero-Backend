// server/src/utils/normalice.js
// Normalización para búsqueda: minúsculas, sin diacríticos, sin símbolos, espacios colapsados
// + helpers para regex seguros y patrón "loose match" (espacios -> .*)
//
// Compat: Node 18+ (Unicode property escapes). Si el runtime no soporta \p{Diacritic},
// caemos a un fallback [\u0300-\u036f].

// Detecta soporte de \p{Diacritic} y define el regex adecuado
const DIACRITICS_RE = (() => {
  try {
    // Si esto no tira error, usamos la clase de propiedad Unicode
    // eslint-disable-next-line no-new
    new RegExp('\\p{Diacritic}', 'u')
    return /\p{Diacritic}/gu
  } catch {
    // Fallback: rango básico de diacríticos combinantes
    return /[\u0300-\u036f]/g
  }
})()

// Ligaduras comunes que conviene aplanar explícitamente
const LIGATURES = [
  [/ß/g, 'ss'],
  [/Æ/g, 'AE'],
  [/æ/g, 'ae'],
  [/Œ/g, 'OE'],
  [/œ/g, 'oe'],
]

/**
 * Normaliza un string para indexar/buscar:
 * - toLowerCase
 * - NFD + remove diacritics (incluye ñ -> n)
 * - reemplaza ligaduras comunes
 * - elimina símbolos dejando solo letras/números/espacios (Unicode-aware)
 * - colapsa espacios
 */
export function normalizeForSearch(str = '') {
  if (str == null) return ''
  let s = String(str).toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '') // á->a, ñ->n, ü->u

  // Aplica ligaduras (rápido y seguro)
  for (const [re, rep] of LIGATURES) s = s.replace(re, rep)

  // Deja letras, números y espacios (todas las escrituras soportadas por \p{L}\p{N})
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ') // quita símbolos/puntuación
    .replace(/\s+/g, ' ')
    .trim()

  return s
}

/**
 * Escapa un string para uso como literal en RegExp.
 */
export function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Crea un RegExp "suelto" para buscar el query normalizado:
 * - Normaliza el query
 * - Escapa especiales
 * - Convierte espacios a '.*' para coincidir términos separados
 * - Flag 'i' (insensible a mayúsculas)
 * Ej: "Fito Paéz" -> /fito.*paez/i
 */
export function buildSearchRegex(q = '') {
  const qNorm = normalizeForSearch(q)
  if (!qNorm) return null
  const pattern = escapeRegex(qNorm).replace(/\s+/g, '.*')
  return new RegExp(pattern, 'i')
}

// Aliases para mantener compatibilidad con otros módulos
export const normalize = normalizeForSearch
export const escapeRegExp = escapeRegex
