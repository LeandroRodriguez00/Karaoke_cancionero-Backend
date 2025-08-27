import { Router } from "express";
import Song from "../models/Song.js";
import { normalizeForSearch, escapeRegex } from "../../utils/normalize.js";

const router = Router();

// Tope configurable por .env (fallback razonable)
const MAX_LIMIT = Number(process.env.SONGS_MAX_LIMIT ?? 2000);

/**
 * GET /api/songs
 * Query:
 *   q      -> string de búsqueda (opcional) - busca en artist/title/styles
 *   page   -> número de página (1 por defecto)
 *   limit  -> ítems por página (20 por defecto).
 *            Acepta "all" o "0" para traer TODO hasta MAX_LIMIT.
 *
 * Respuesta:
 *   { page, perPage, total, totalPages, items: [{ artist, title, styles, _id }] }
 */
router.get("/", async (req, res) => {
  try {
    const { q = "", page = "1", limit = "20" } = req.query;

    // page y perPage (con soporte "all")
    let pageNum = Math.max(parseInt(page, 10) || 1, 1);
    let perPage;
    if (String(limit).toLowerCase() === "all" || String(limit) === "0") {
      perPage = MAX_LIMIT;   // traer TODO (hasta el tope)
      pageNum = 1;           // página única cuando pedimos todo
    } else {
      const parsed = Math.max(parseInt(limit, 10) || 20, 1);
      perPage = Math.min(parsed, MAX_LIMIT);
    }

    // Filtro de búsqueda (todas las palabras deben aparecer en algún campo)
    let filter = {};
    const norm = normalizeForSearch(q);
    if (norm) {
      const tokens = norm.split(" ").map(escapeRegex).filter(Boolean);
      filter = {
        $and: tokens.map((t) => ({
          $or: [
            { artistNorm: { $regex: t, $options: "i" } },
            { titleNorm:  { $regex: t, $options: "i" } },
            { stylesNorm: { $regex: t, $options: "i" } }, // género/estilo
          ],
        })),
      };
    }

    const [items, total] = await Promise.all([
      Song.find(filter, { artist: 1, title: 1, styles: 1 })
        .sort({ artistNorm: 1, titleNorm: 1, _id: 1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
      Song.countDocuments(filter),
    ]);

    res.json({
      page: pageNum,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      items,
    });
  } catch (err) {
    console.error("GET /api/songs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
