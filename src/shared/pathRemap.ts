/**
 * Devuelve una función para `remapFiles` o `remapPaths`: cambia el prefijo de una ruta
 * ("col/vieja/" → "col/nueva/") y deja las demás igual (null = sin cambios).
 */
export const remapPrefix =
  (oldPrefix: string, newPrefix: string) =>
  (path: string): string | null =>
    path.startsWith(oldPrefix) ? newPrefix + path.slice(oldPrefix.length) : null

/** Reescribe las rutas de una lista sin repetir ninguna. Si nada cambia, devuelve la misma lista */
export function remapPaths(list: string[], map: (path: string) => string | null): string[] {
  const out: string[] = []
  for (const path of list) {
    const next = map(path) ?? path
    if (!out.includes(next)) out.push(next)
  }
  return out.length === list.length && out.every((p, i) => p === list[i]) ? list : out
}
