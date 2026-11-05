import type { EnvVariable } from './types'

export interface MergeResult {
  variables: EnvVariable[]
  added: number
  updated: number
  /** Ya existían y no cambiaron (o no se sobrescribieron) */
  skipped: number
}

/**
 * Mezcla variables pegadas con las que ya hay. Las existentes conservan su id (y su marca de secreto);
 * solo se cambia su valor, y solo si `overwrite` está activo. No deja filas vacías.
 */
export function mergeVariables(
  existing: EnvVariable[],
  incoming: EnvVariable[],
  overwrite: boolean
): MergeResult {
  const out = existing.filter((v) => v.key.trim() !== '' || v.value !== '')
  const index = new Map<string, number>()
  out.forEach((v, i) => {
    const key = v.key.trim()
    if (key && !index.has(key)) index.set(key, i)
  })

  let added = 0
  let updated = 0
  let skipped = 0

  for (const inc of incoming) {
    const key = inc.key.trim()
    if (!key) continue

    const at = index.get(key)
    if (at === undefined) {
      index.set(key, out.length)
      out.push({ ...inc, key })
      added++
      continue
    }

    const current = out[at]
    if (!overwrite || current.value === inc.value) {
      skipped++
      continue
    }
    out[at] = { ...current, value: inc.value, enabled: true, secret: current.secret || inc.secret }
    updated++
  }

  return { variables: out, added, updated, skipped }
}
