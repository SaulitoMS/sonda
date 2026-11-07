import type { RunStatus } from './classify'

/** Lo mínimo de cada petición que se guarda para comparar la siguiente ejecución */
export interface RunSnapshotRow {
  key: string
  status: RunStatus
  timeMs: number
}

export interface RunSnapshot {
  savedAt: string
  rows: RunSnapshotRow[]
}

export type RowChange = 'regression' | 'fixed' | 'slower' | 'new'

export interface RunComparison {
  /** Cambio de cada petición, por su clave. Las que no cambiaron no aparecen */
  changes: Record<string, RowChange>
  regressions: number
  fixed: number
  slower: number
  added: number
}

const RANK: Record<RunStatus, number> = { pass: 0, warn: 1, fail: 2 }

/** Una petición cuenta como más lenta si tarda 1.5× o más y al menos 100 ms más que antes */
export const SLOWER_FACTOR = 1.5
export const SLOWER_MIN_DELTA_MS = 100

/** Identifica una petición dentro de una ejecución (la misma ruta puede repetirse por vuelta o fila) */
export const rowKey = (path: string, iteration?: number): string => `${path}#${iteration ?? 0}`

export function compareRuns(previous: RunSnapshotRow[], current: RunSnapshotRow[]): RunComparison {
  const before = new Map(previous.map((r) => [r.key, r]))
  const out: RunComparison = { changes: {}, regressions: 0, fixed: 0, slower: 0, added: 0 }

  for (const row of current) {
    const old = before.get(row.key)
    if (!old) {
      out.changes[row.key] = 'new'
      out.added++
    } else if (RANK[row.status] > RANK[old.status]) {
      out.changes[row.key] = 'regression'
      out.regressions++
    } else if (RANK[row.status] < RANK[old.status]) {
      out.changes[row.key] = 'fixed'
      out.fixed++
    } else if (
      row.timeMs >= old.timeMs * SLOWER_FACTOR &&
      row.timeMs - old.timeMs >= SLOWER_MIN_DELTA_MS
    ) {
      out.changes[row.key] = 'slower'
      out.slower++
    }
  }
  return out
}

/** "2 empeoraron · 1 mejoró · 3 más lentas · 1 nueva", o "sin cambios" */
export function summarizeComparison(c: RunComparison): string {
  const parts: string[] = []
  if (c.regressions)
    parts.push(`${c.regressions} ${c.regressions === 1 ? 'empeoró' : 'empeoraron'}`)
  if (c.fixed) parts.push(`${c.fixed} ${c.fixed === 1 ? 'mejoró' : 'mejoraron'}`)
  if (c.slower) parts.push(`${c.slower} ${c.slower === 1 ? 'más lenta' : 'más lentas'}`)
  if (c.added) parts.push(`${c.added} ${c.added === 1 ? 'nueva' : 'nuevas'}`)
  return parts.length > 0 ? parts.join(' · ') : 'sin cambios'
}

const isRow = (v: unknown): v is RunSnapshotRow => {
  const r = v as Partial<RunSnapshotRow> | null
  return (
    !!r &&
    typeof r.key === 'string' &&
    typeof r.status === 'string' &&
    r.status in RANK &&
    typeof r.timeMs === 'number' &&
    Number.isFinite(r.timeMs)
  )
}

/** Lee lo guardado en localStorage descartando cualquier cosa que no tenga la forma esperada */
export function parseStoredRuns(raw: string | null): Record<string, RunSnapshot> {
  if (!raw) return {}
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, RunSnapshot> = {}
    for (const [scope, value] of Object.entries(data)) {
      const v = value as Partial<RunSnapshot> | null
      if (!v || typeof v.savedAt !== 'string' || !Array.isArray(v.rows)) continue
      out[scope] = { savedAt: v.savedAt, rows: v.rows.filter(isRow) }
    }
    return out
  } catch {
    return {}
  }
}
