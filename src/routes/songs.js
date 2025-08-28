// server/src/routes/songs.js
import { Router } from "express";
import Song from "../models/Song.js";
import { normalizeForSearch, escapeRegex } from "../utils/normalice.js";

const router = Router();

// Tope configurable por .env (fallback razonable)
const MAX_LIMIT = Number(process.env.SONGS_MAX_LIMIT ?? 2000);

// Parse seguro de enteros (con mínimo)
function toInt(v, def, min = 1) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(n, min) : def;
}

// Admite ?style=rock&style=cumbia o ?styles=rock,cumbia
function parseStylesQuery(query) {
  const list = [];
  const single = query.style;
  const multi = query.styles;

  if (typeof single === "string" && single.trim()) list.push(single.trim());
  if (Array.isArray(single)) list.push(...single);
  if (typeof multi === "string") {
    list.push(...multi.split(",").map((s) => s.trim()).filter(Boolean));
  }

  // normaliza a stylesNorm
  const norm = list
    .map((s) => normalizeForSearch(s))
    .filter(Boolean);

  // unique
  return [...new Set(norm)];
}

/**
 * GET /api/songs
 * Query:
 *   q        -> string de búsqueda (opcional) - busca en artist/title/styles
 *   page     -> número de página (1 por defecto)
 *   limit    -> ítems por página (20 por defecto).
 *               Acepta "all" o "0" para traer TODO (hasta MAX_LIMIT).
 *   style    -> repetible (p.ej. ?style=rock&style=cumbia)
 *   styles   -> lista separada por coma (p.ej. ?styles=rock,cumbia)
 *
 * Respuesta:
 *   { page, perPage, total, totalPages, hasNext, items: [{ artist, title, styles, _id }] }
 */
router.get("/", async (req, res, next) => {
  try {
    const { q = "", page = "1", limit = "20" } = req.query;

    // page y perPage (con soporte "all")
    let pageNum = toInt(page, 1, 1);
    let perPage;
    if (String(limit).toLowerCase() === "all" || String(limit) === "0") {
      perPage = MAX_LIMIT; // traer TODO (hasta el tope)
      pageNum = 1;         // página única cuando pedimos todo
    } else {
      const parsed = toInt(limit, 20, 1);
      perPage = Math.min(parsed, MAX_LIMIT);
    }

    // Filtro de búsqueda (todas las palabras deben aparecer en algún campo)
    const filter = {};
    const norm = normalizeForSearch(q);
    if (norm) {
      const tokens = norm.split(" ").map(escapeRegex).filter(Boolean);
      if (tokens.length) {
        filter.$and = tokens.map((t) => ({
          $or: [
            { artistNorm: { $regex: t, $options: "i" } },
            { titleNorm:  { $regex: t, $options: "i" } },
            { stylesNorm: { $regex: t, $options: "i" } }, // género/estilo
          ],
        }));
      }
    }

    // Filtro por estilos normalizados (coteja contra stylesNorm)
    const stylesNorm = parseStylesQuery(req.query);
    if (stylesNorm.length) {
      // $in: si coinciden con cualquiera de los estilos pedidos
      filter.stylesNorm = { $in: stylesNorm };
      // Si querés "todos los estilos" simultáneos, sería: { $all: stylesNorm }
    }

    const skip = (pageNum - 1) * perPage;

    // Proyección mínima para aligerar payload
    const projection = { artist: 1, title: 1, styles: 1 };

    const [items, total] = await Promise.all([
      Song.find(filter, projection)
        .sort({ artistNorm: 1, titleNorm: 1, _id: 1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Song.countDocuments(filter),
    ]);

    const hasNext = skip + items.length < total;

    // Cache corto y conteo total en header (útil para tablas/paginadores)
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.set("X-Total-Count", String(total));

    res.json({
      page: pageNum,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      hasNext,
      items,
    });
  } catch (err) {
    console.error("GET /api/songs error:", err);
    next(err); // middleware de error centralizado responderá 500
  }
});

export default router;
