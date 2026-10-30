import { useMemo } from 'react'
import { diffJson, type DiffChange } from '../../../shared/responseDiff'
import type { SendRequestResult } from '../../../shared/types'
import { useHistoryStore } from '../store/useHistoryStore'

export type PreviousDiff =
  | { state: 'none' }
  | { state: 'unavailable'; reason: string }
  | {
      state: 'ready'
      changes: DiffChange[]
      /** Momento en que se recibió la respuesta anterior (ms desde epoch) */
      at: number
      statusBefore: number
      statusAfter: number
    }

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/** Compara la respuesta actual con la última vez que se envió esta misma petición (método + URL) */
export function usePreviousDiff(
  response: SendRequestResult | null,
  method: string,
  url: string
): PreviousDiff {
  const entries = useHistoryStore((s) => s.entries)

  return useMemo<PreviousDiff>(() => {
    if (!response || !response.ok) return { state: 'none' }

    const same = entries.filter((e) => e.response.ok && e.method === method && e.url === url.trim())
    // Justo después de enviar, la respuesta actual ya puede estar en el historial: se salta
    const first = same[0]
    const firstIsCurrent =
      first?.response.ok === true &&
      first.response.timeMs === response.timeMs &&
      first.response.sizeBytes === response.sizeBytes &&
      first.response.status === response.status
    const previous = firstIsCurrent ? same[1] : first

    if (!previous || !previous.response.ok) return { state: 'none' }

    const before = parseJson(previous.response.body)
    const after = parseJson(response.body)
    if (!before.ok || !after.ok) {
      return {
        state: 'unavailable',
        reason:
          'Solo se comparan respuestas JSON completas (el historial guarda hasta 30 000 caracteres).'
      }
    }

    return {
      state: 'ready',
      changes: diffJson(before.value, after.value),
      at: previous.at,
      statusBefore: previous.response.status,
      statusAfter: response.status
    }
  }, [entries, response, method, url])
}