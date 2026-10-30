export type DiffKind = 'added' | 'removed' | 'changed'

export interface DiffChange {
  /** Ruta en el mismo formato que el filtro y las aserciones: data.items[0].name ("$" = raíz) */
  path: string
  kind: DiffKind
  before?: unknown
  after?: unknown
}

export const MAX_DIFF_CHANGES = 200

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Compara dos JSON y lista lo que se agregó, se quitó o cambió de valor */
export function diffJson(
  before: unknown,
  after: unknown,
  path = '',
  out: DiffChange[] = []
): DiffChange[] {
  if (out.length >= MAX_DIFF_CHANGES) return out

  if (Array.isArray(before) && Array.isArray(after)) {
    const max = Math.max(before.length, after.length)
    for (let i = 0; i < max && out.length < MAX_DIFF_CHANGES; i++) {
      const p = `${path}[${i}]`
      if (i >= before.length) out.push({ path: p, kind: 'added', after: after[i] })
      else if (i >= after.length) out.push({ path: p, kind: 'removed', before: before[i] })
      else diffJson(before[i], after[i], p, out)
    }
    return out
  }

  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      if (out.length >= MAX_DIFF_CHANGES) break
      const p = path ? `${path}.${key}` : key
      if (!(key in before)) out.push({ path: p, kind: 'added', after: after[key] })
      else if (!(key in after)) out.push({ path: p, kind: 'removed', before: before[key] })
      else diffJson(before[key], after[key], p, out)
    }
    return out
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    out.push({ path: path || '$', kind: 'changed', before, after })
  }
  return out
}
