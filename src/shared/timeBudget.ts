import type { RunVerdict } from './classify'

/**
 * Presupuesto de tiempo: si la respuesta tardó más de `maxMs`, una petición que pasaba (o que solo
 * tenía avisos) pasa a fallar. 0 = sin límite. Lo que ya fallaba se deja como está.
 */
export function applyTimeBudget(verdict: RunVerdict, timeMs: number, maxMs: number): RunVerdict {
  if (maxMs <= 0 || timeMs <= maxMs || verdict.status === 'fail') return verdict
  const over = `Tardó ${timeMs} ms (límite ${maxMs} ms)`
  return { status: 'fail', detail: verdict.detail ? `${over}. ${verdict.detail}` : over }
}
