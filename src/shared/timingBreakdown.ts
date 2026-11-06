import type { ConnectionTiming } from './types'

export interface TimingPhase {
  id: 'dns' | 'connect' | 'wait' | 'download'
  label: string
  ms: number
}

/**
 * Divide el tiempo total en fases. Devuelve [] si no hay TTFB (no se puede desglosar).
 * Con conexión reutilizada o proxy no hay DNS ni conexión: solo espera y descarga.
 */
export function timingBreakdown(
  timeMs: number,
  ttfbMs: number | undefined,
  connection?: ConnectionTiming
): TimingPhase[] {
  if (ttfbMs === undefined) return []

  const dns = connection && !connection.reused ? connection.dnsMs : 0
  const connect = connection && !connection.reused ? connection.connectMs : 0
  const wait = Math.max(0, ttfbMs - dns - connect)
  const download = Math.max(0, timeMs - ttfbMs)

  const phases: TimingPhase[] = []
  if (dns > 0) phases.push({ id: 'dns', label: 'DNS', ms: dns })
  if (connect > 0) {
    phases.push({
      id: 'connect',
      label: connection?.secure ? 'TCP + TLS' : 'TCP',
      ms: connect
    })
  }
  phases.push({ id: 'wait', label: 'Espera del servidor', ms: wait })
  phases.push({ id: 'download', label: 'Descarga', ms: download })
  return phases
}
