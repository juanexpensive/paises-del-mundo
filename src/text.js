// Normaliza un nombre para compararlo: sin mayusculas, tildes, articulos iniciales ni signos.
export function norm(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/^(el|la|las|los)\s+/, '')
    .replace(/[^a-z]/g, '');
}

// Crea un buscador de paises por nombre o alias.
export function createMatcher(countries) {
  const entries = [];
  for (const c of countries) {
    for (const name of [c.name, ...c.alt]) entries.push({ key: norm(name), id: c.id });
  }
  const exact = new Map(entries.map((e) => [e.key, e.id]));

  return {
    // Devuelve el id del pais cuyo nombre coincide exactamente con el texto.
    find(text) {
      return exact.get(norm(text)) ?? null;
    },
    // Indica si el texto es el principio de otro nombre todavia pendiente (p. ej. "Niger" -> "Nigeria").
    isPrefixOfOther(text, id, isPending) {
      const key = norm(text);
      return entries.some((e) => e.id !== id && isPending(e.id) && e.key.length > key.length && e.key.startsWith(key));
    },
  };
}
