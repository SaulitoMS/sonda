export type Place = 'before' | 'after'

/**
 * Nuevo orden de `names` al soltar `dragged` arriba o abajo de `target`.
 * Si `dragged` no estaba en la lista (vino de otra carpeta), simplemente se inserta.
 * Devuelve null si no hay nada que hacer.
 */
export function placeItem(
  names: string[],
  dragged: string,
  target: string,
  place: Place
): string[] | null {
  if (dragged === target) return null
  const without = names.filter((n) => n !== dragged)
  const i = without.indexOf(target)
  if (i === -1) return null
  without.splice(place === 'before' ? i : i + 1, 0, dragged)
  return without
}

/**
 * Ordena según la lista guardada. Lo que no aparece en ella (archivos nuevos)
 * va al final, en orden alfabético. Sin lista, todo queda alfabético.
 */
export function sortByOrder<T>(
  items: T[],
  order: unknown,
  key: (item: T) => string,
  label: (item: T) => string
): T[] {
  const list = Array.isArray(order) ? order : []
  const rank = (item: T): number => {
    const i = list.indexOf(key(item))
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...items].sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)))
}