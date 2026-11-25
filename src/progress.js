// Repeticion espaciada sencilla (cajas de Leitner): caja 0 = no lo sabes, caja 4 = dominado.
export const MAX_BOX = 4;
export const MASTERED_BOX = 3;

const KEY = 'paises-progreso-v1';

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function createProgress(load = readStorage, save = (data) => localStorage.setItem(KEY, JSON.stringify(data))) {
  const data = load();
  const persist = () => {
    try {
      save(data);
    } catch {
      // Sin almacenamiento disponible: el progreso dura solo esta sesion.
    }
  };

  return {
    box: (id) => data[id] ?? 0,
    seen: (id) => id in data,
    // ok = acierto sin ayuda; hinted = acierto con pista; fallo en otro caso.
    record(id, result) {
      const box = data[id] ?? 0;
      if (result === 'ok') data[id] = Math.min(MAX_BOX, box + 1);
      else if (result === 'hinted') data[id] = box;
      else data[id] = 0;
      persist();
    },
    mastered(ids) {
      return ids.filter((id) => (data[id] ?? 0) >= MASTERED_BOX).length;
    },
    reset() {
      for (const k of Object.keys(data)) delete data[k];
      persist();
    },
  };
}

// Elige el siguiente pais a practicar: los de caja baja salen mucho mas a menudo.
export function pickNext(ids, progress, recent = [], random = Math.random) {
  const pool = ids.length > recent.length ? ids.filter((id) => !recent.includes(id)) : ids;
  const weights = pool.map((id) => 2 ** (MAX_BOX - progress.box(id)) * (progress.seen(id) ? 1 : 1.5));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
