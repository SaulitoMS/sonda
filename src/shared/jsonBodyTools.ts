export type BodyTransform = 'format' | 'minify' | 'sort'

/** Ordena las claves de los objetos de forma recursiva. Los arrays conservan su orden */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)])
    )
  }
  return value
}

/** Aplica la transformación al texto JSON. Devuelve null si no es JSON válido */
export function transformJson(text: string, mode: BodyTransform): string | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (mode === 'minify') return JSON.stringify(parsed)
    if (mode === 'sort') return JSON.stringify(sortKeysDeep(parsed), null, 2)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}
