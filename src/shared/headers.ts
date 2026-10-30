import type { KeyValueData } from './types'

/**
 * Headers que heredan las peticiones. Los de la carpeta pisan a los de la colección
 * (la clave se compara sin distinguir mayúsculas). Solo cuentan los activos con clave.
 */
export function inheritedHeaders(
  folder: KeyValueData[] | null | undefined,
  collection: KeyValueData[] | null | undefined
): { key: string; value: string }[] {
  const merged = new Map<string, { key: string; value: string }>()
  for (const list of [collection, folder]) {
    for (const h of list ?? []) {
      const key = h.key.trim()
      if (!h.enabled || !key) continue
      merged.set(key.toLowerCase(), { key, value: h.value })
    }
  }
  return [...merged.values()]
}