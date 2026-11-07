import { parseStoredRuns, type RunSnapshot, type RunSnapshotRow } from '../../../shared/runCompare'

const KEY = 'sonda.lastRuns.v1'
const MAX_SCOPES = 30

function read(): Record<string, RunSnapshot> {
  try {
    return parseStoredRuns(localStorage.getItem(KEY))
  } catch {
    return {}
  }
}

/** Una referencia por colección y carpeta (o toda la colección) */
export const runScope = (collectionId: string, folder: string | null): string =>
  `${collectionId}::${folder ?? '*'}`

export function loadLastRun(scope: string): RunSnapshot | null {
  return read()[scope] ?? null
}

export function saveLastRun(scope: string, rows: RunSnapshotRow[]): void {
  const all = read()
  delete all[scope] // se vuelve a insertar al final: así es la más reciente
  all[scope] = { savedAt: new Date().toISOString(), rows }
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SCOPES))) delete all[old]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* almacenamiento lleno: se omite la referencia */
  }
}
