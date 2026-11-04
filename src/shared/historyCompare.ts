import type { HistoryEntry } from './history'
import type { DiffChange } from './responseDiff'
import { compareSnapshot } from './snapshot'

export type EntryComparison =
  | { state: 'invalid'; reason: string }
  | {
      state: 'ready'
      /** La entrada más antigua de las dos */
      before: HistoryEntry
      /** La más reciente */
      after: HistoryEntry
      statusBefore: number
      statusAfter: number
      changes: DiffChange[]
      identical: boolean
    }

/**
 * Compara los bodies JSON de dos entradas del historial (da igual el orden en que se elijan:
 * la más antigua es siempre "antes"). `ignore` son nombres de campo que no cuentan como cambio.
 */
export function compareEntries(
  a: HistoryEntry,
  b: HistoryEntry,
  ignore: string[] = []
): EntryComparison {
  const [before, after] = a.at <= b.at ? [a, b] : [b, a]
  const resBefore = before.response
  const resAfter = after.response

  if (!resBefore.ok || !resAfter.ok) {
    return {
      state: 'invalid',
      reason: 'Una de las dos peticiones no obtuvo respuesta (error de red).'
    }
  }

  const result = compareSnapshot(
    {
      key: before.id,
      method: before.method,
      url: before.url,
      status: resBefore.status,
      body: resBefore.body,
      savedAt: before.at,
      ignore
    },
    { status: resAfter.status, body: resAfter.body }
  )

  if (result.state === 'invalid') {
    return {
      state: 'invalid',
      reason:
        'Solo se comparan respuestas JSON completas (el historial guarda hasta 30 000 caracteres).'
    }
  }

  return {
    state: 'ready',
    before,
    after,
    statusBefore: result.statusBefore,
    statusAfter: result.statusAfter,
    changes: result.changes,
    identical: result.identical
  }
}