import { Router } from "express";
import Song from "../models/Song.js";
import { normalizeForSearch, escapeRegex } from "../../utils/normalize.js";

const router = Router();

/**
 * GET /api/artists
 * Lista completa de artistas (agrupados), ordenados alfabéticamente.
 * Query opcional: q (filtro por texto, insensible a tildes/mayúsculas)
 *
 * Respuesta: [{ artist, count }]
 */
router.get("/", async (req, res) => {
  try {
    const { q = "" } = req.query;

    // Filtro por tokens sobre artistNorm (opcional)
    const norm = normalizeForSearch(q);
    const match = {};
    if (norm) {
      const tokens = norm.split(" ").map(escapeRegex).filter(Boolean);
      match.$and = tokens.map((t) => ({ artistNorm: { $regex: t, $options: "i" } }));
    }

    const pipeline = [
      ...(norm ? [{ $match: match }] : []),
      {
        // Agrupamos por artista normalizado y elegimos una variante estable del nombre
        $group: {
          _id: "$artistNorm",
          artist: { $min: "$artist" }, // usa la variante lexicográficamente "menor"
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, artist: 1, count: 1 } },
      { $sort: { artist: 1 } }, // orden alfabético por nombre visible
    ];

    const artists = await Song.aggregate(pipeline);
    res.json({ items: artists });
  } catch (err) {
    console.error("GET /api/artists error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/artists/:artist/songs
 * Devuelve todas las canciones de un artista
 * Match por artistNorm (insensible a tildes/mayúsculas)
 *
 * Respuesta: { artist: "Nombre", items: [{ title }] }
 */
router.get("/:artist/songs", async (req, res) => {
  try {
    const artistParam = req.params.artist || "";
    const norm = normalizeForSearch(artistParam);
    if (!norm) return res.json({ artist: artistParam, items: [] });

    const songs = await Song.find(
      { artistNorm: norm },
      { title: 1, artist: 1, titleNorm: 1 }
    )
      .sort({ titleNorm: 1, title: 1 })
      .lean();

    const visibleName = songs[0]?.artist ?? artistParam;

    res.json({
      artist: visibleName,
      items: songs.map((s) => ({ title: s.title })),
    });
  } catch (err) {
    console.error("GET /api/artists/:artist/songs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
