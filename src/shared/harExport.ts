import { redactEntry, type HistoryEntry } from './history'

interface HarPair {
  name: string
  value: string
}

const safeDecode = (text: string): string => {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

/** Parámetros de la URL como pares. Funciona aunque la URL tenga {{variables}} sin resolver */
function queryOf(url: string): HarPair[] {
  const query = url.split('#')[0].split('?').slice(1).join('?')
  if (!query) return []
  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [key, ...rest] = pair.split('=')
      return { name: safeDecode(key), value: safeDecode(rest.join('=')) }
    })
}

function toHarEntry(entry: HistoryEntry): object {
  const e = redactEntry(entry)
  const reqHeaders: HarPair[] = e.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => ({ name: h.key.trim(), value: h.value }))
  const reqType = reqHeaders.find((h) => h.name.toLowerCase() === 'content-type')?.value
  const res = e.response
  const time = Math.round(res.timeMs)

  const request = {
    method: e.method,
    url: e.url,
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: reqHeaders,
    queryString: queryOf(e.url),
    headersSize: -1,
    bodySize: e.body ? new TextEncoder().encode(e.body).length : 0,
    ...(e.body.trim() ? { postData: { mimeType: reqType ?? 'text/plain', text: e.body } } : {})
  }

  const wait = res.ok ? Math.min(res.ttfbMs ?? time, time) : time
  const response = res.ok
    ? {
        status: res.status,
        statusText: res.statusText,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: Object.entries(res.headers).map(([name, value]) => ({ name, value })),
        content: {
          size: res.sizeBytes,
          mimeType: res.headers['content-type'] ?? 'text/plain',
          text: res.body
        },
        redirectURL: res.headers['location'] ?? '',
        headersSize: -1,
        bodySize: res.sizeBytes
      }
    : {
        status: 0,
        statusText: res.error,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: [],
        content: { size: 0, mimeType: 'text/plain', text: '' },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1
      }

  return {
    // Sonda al importar HAR solo conserva llamadas XHR/fetch
    _resourceType: 'fetch',
    startedDateTime: new Date(e.at).toISOString(),
    time,
    request,
    response,
    cache: {},
    timings: { send: 0, wait, receive: Math.max(0, time - wait) }
  }
}

/** Historial en formato HAR 1.2, en orden cronológico. Las credenciales salen ocultas */
export function buildHar(entries: HistoryEntry[]): string {
  const ordered = [...entries].sort((a, b) => a.at - b.at)
  return (
    JSON.stringify(
      {
        log: {
          version: '1.2',
          creator: { name: 'Sonda', version: '0.1.0' },
          entries: ordered.map(toHarEntry)
        }
      },
      null,
      2
    ) + '\n'
  )
}