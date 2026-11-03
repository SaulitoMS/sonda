import type { SavedRequest } from './types'

/** none: sin aserciones · basic: algo, pero no status y body · good: revisa status y body */
export type CoverageLevel = 'none' | 'basic' | 'good'

export interface RequestCoverage {
  /** Aserciones activas */
  assertions: number
  hasStatus: boolean
  hasBody: boolean
  /** Status que la spec documenta (sin contar "default") */
  documented: string[]
  /** De esos, los que alguna aserción de status comprueba */
  tested: string[]
  /** Documentados que ninguna aserción comprueba */
  untested: string[]
  level: CoverageLevel
}

/** Códigos que las aserciones "status es igual a N" dan por esperados */
function assertedCodes(req: SavedRequest): number[] {
  const codes: number[] = []
  for (const a of req.assertions ?? []) {
    if (!a.enabled || a.kind !== 'status' || a.op !== 'eq') continue
    const n = Number.parseInt(a.expected.trim(), 10)
    if (Number.isFinite(n)) codes.push(n)
  }
  return codes
}

/** ¿Algún código esperado cae en este status de la spec? Acepta rangos como 4XX */
function covers(status: string, codes: number[]): boolean {
  const range = /^([1-5])XX$/i.exec(status)
  if (range) return codes.some((c) => String(c)[0] === range[1])
  return codes.some((c) => String(c) === status)
}

export function coverageOf(req: SavedRequest): RequestCoverage {
  const active = (req.assertions ?? []).filter((a) => a.enabled)
  const hasStatus = active.some((a) => a.kind === 'status')
  const hasBody = active.some((a) => a.kind === 'body')

  const codes = assertedCodes(req)
  const documented = Object.keys(req.responseSchemas ?? {}).filter((s) => s !== 'default')
  const tested = documented.filter((s) => covers(s, codes))
  const untested = documented.filter((s) => !covers(s, codes))

  const level: CoverageLevel =
    active.length === 0 ? 'none' : hasStatus && hasBody ? 'good' : 'basic'

  return { assertions: active.length, hasStatus, hasBody, documented, tested, untested, level }
}

export interface CoverageSummary {
  total: number
  withAssertions: number
  good: number
  statusesDocumented: number
  statusesTested: number
}

export function summarizeCoverage(items: RequestCoverage[]): CoverageSummary {
  return {
    total: items.length,
    withAssertions: items.filter((c) => c.level !== 'none').length,
    good: items.filter((c) => c.level === 'good').length,
    statusesDocumented: items.reduce((n, c) => n + c.documented.length, 0),
    statusesTested: items.reduce((n, c) => n + c.tested.length, 0)
  }
}
