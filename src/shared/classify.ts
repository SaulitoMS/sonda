import type { AssertionResult, SchemaValidation, SendRequestResult } from './types'

export type RunStatus = 'pass' | 'warn' | 'fail'

export interface RunVerdict {
  status: RunStatus
  /** Texto corto que explica el resultado (vacío si todo salió bien) */
  detail: string
}

/**
 * Decide si una petición "pasó" en una ejecución por lote.
 * - Error de red, aserción fallida o schema inválido → fail
 * - Status no documentado o validación omitida → warn
 * - Sin schema: pasa si el status es < 400, salvo que haya aserciones propias
 *   y todas pasen (ahí manda lo que el usuario definió, ej: esperar un 404)
 */
export function classifyResult(
  response: SendRequestResult,
  validation: SchemaValidation | null,
  assertions: AssertionResult[] = []
): RunVerdict {
  if (!response.ok) return { status: 'fail', detail: response.error }

  const failed = assertions.filter((a) => !a.passed)
  if (failed.length > 0) {
    const count = `${failed.length} ${failed.length === 1 ? 'aserción fallida' : 'aserciones fallidas'}`
    return { status: 'fail', detail: `${count}: ${failed[0].label} (${failed[0].message})` }
  }

  if (validation) {
    switch (validation.verdict) {
      case 'valid':
        return { status: 'pass', detail: '' }
      case 'invalid': {
        const errors = validation.issues.filter((i) => i.severity === 'error')
        const first = errors[0]
        const count = `${errors.length} ${errors.length === 1 ? 'error' : 'errores'} de schema`
        return {
          status: 'fail',
          detail: first ? `${count}: ${first.path} ${first.message}` : count
        }
      }
      case 'undocumented':
        return {
          status: 'warn',
          detail: validation.message ?? `El status ${response.status} no está documentado`
        }
      case 'skipped':
        return { status: 'warn', detail: validation.message ?? 'Validación omitida' }
      // 'no-schema' cae al criterio por status
    }
  }

  if (assertions.length > 0) return { status: 'pass', detail: '' }

  return response.status >= 400
    ? { status: 'fail', detail: `HTTP ${response.status} ${response.statusText}`.trim() }
    : { status: 'pass', detail: '' }
}