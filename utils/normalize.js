// Normaliza: minúsculas, quita tildes/diacríticos, símbolos y colapsa espacios
export function normalizeForSearch(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    // á->a, ñ->n, ü->u
    .replace(/[^\p{L}\p{N}\s]+/gu, " ") // deja letras/números/espacios
    .replace(/\s+/g, " ")
    .trim();
}

// Para armar RegExp seguro con el q del usuario
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
