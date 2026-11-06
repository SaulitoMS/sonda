import type { HeaderInsight } from './headerInsights'

interface ServerTimingEntry {
  name: string
  durMs: number | null
  desc: string
}

/** Parsea `Server-Timing: db;dur=53.2;desc="Postgres", cache;dur=2` */
export function parseServerTiming(raw: string | undefined): ServerTimingEntry[] {
  if (!raw) return []
  const out: ServerTimingEntry[] = []
  for (const part of raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const [name, ...params] = part.split(';').map((s) => s.trim())
    if (!name) continue
    let durMs: number | null = null
    let desc = ''
    for (const p of params) {
      const [k, ...v] = p.split('=')
      const value = v.join('=').replace(/^"|"$/g, '')
      if (k.toLowerCase() === 'dur') {
        const n = Number(value)
        durMs = Number.isFinite(n) ? n : null
      } else if (k.toLowerCase() === 'desc') {
        desc = value
      }
    }
    out.push({ name, durMs, desc })
  }
  return out
}

const formatBytes = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`

export function analyzePerformance(
  headers: Record<string, string>,
  sizeBytes: number,
  timeMs: number
): HeaderInsight[] {
  const out: HeaderInsight[] = []

  /* ---------- Server-Timing ---------- */
  const entries = parseServerTiming(headers['server-timing'])
  const timed = entries.filter((e) => e.durMs !== null)
  if (timed.length > 0) {
    const total = timed.reduce((sum, e) => sum + (e.durMs ?? 0), 0)
    const biggest = timed.reduce((a, b) => ((b.durMs ?? 0) > (a.durMs ?? 0) ? b : a))
    const share = timeMs > 0 ? Math.round(((biggest.durMs ?? 0) / timeMs) * 100) : 0
    out.push({
      id: 'perf-server-timing',
      group: 'performance',
      level: share >= 70 ? 'warn' : 'info',
      title: `Server-Timing: ${Math.round(total)} ms medidos por el servidor`,
      detail: timed
        .map((e) => `${e.name}${e.desc ? ` (${e.desc})` : ''}: ${e.durMs} ms`)
        .join(' · ')
        .concat(share >= 70 ? ` — "${biggest.name}" ocupa el ${share}% del tiempo total.` : '')
    })
  }

  /* ---------- Compresión ---------- */
  const encoding = headers['content-encoding']
  const wire = Number(headers['content-length'])
  if (encoding && Number.isFinite(wire) && wire > 0 && sizeBytes > 0) {
    const saved = Math.round((1 - wire / sizeBytes) * 100)
    out.push({
      id: 'perf-compression',
      group: 'performance',
      level: 'ok',
      title: `Comprimida con ${encoding}: ${formatBytes(wire)} en red de ${formatBytes(sizeBytes)}`,
      detail: `Ahorro aproximado del ${Math.max(0, saved)}%.`
    })
  } else if (!encoding && sizeBytes > 10 * 1024) {
    const type = (headers['content-type'] ?? '').toLowerCase()
    if (/json|text|xml|javascript|html|csv/.test(type)) {
      out.push({
        id: 'perf-no-compression',
        group: 'performance',
        level: 'warn',
        title: `Respuesta de ${formatBytes(sizeBytes)} sin comprimir`,
        detail:
          'Es texto y pesa más de 10 KB pero no trae Content-Encoding. Activar gzip o br en el servidor reduciría mucho el tamaño.'
      })
    }
  }

  return out
}
