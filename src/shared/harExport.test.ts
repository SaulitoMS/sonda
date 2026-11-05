import { describe, expect, it } from 'vitest'
import { buildHar } from './harExport'
import type { HistoryEntry } from './history'

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: '1',
  at: Date.UTC(2026, 9, 29, 12, 0, 0),
  method: 'POST',
  url: 'https://api.com/pets?limit=5&q=a%20b',
  headers: [
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'X-Off', value: '1', enabled: false }
  ],
  body: '{"name":"Rex"}',
  response: {
    ok: true,
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json' },
    body: '{"id":1}',
    timeMs: 100,
    ttfbMs: 60,
    sizeBytes: 8
  },
  ...over
})

describe('buildHar', () => {
  it('arma un HAR 1.2 con la petición y la respuesta', () => {
    const har = JSON.parse(buildHar([entry()]))
    expect(har.log.version).toBe('1.2')
    expect(har.log.entries).toHaveLength(1)

    const [e] = har.log.entries
    expect(e._resourceType).toBe('fetch')
    expect(e.startedDateTime).toBe('2026-10-29T12:00:00.000Z')
    expect(e.request.method).toBe('POST')
    expect(e.request.queryString).toEqual([
      { name: 'limit', value: '5' },
      { name: 'q', value: 'a b' }
    ])
    expect(e.request.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }])
    expect(e.request.postData).toEqual({ mimeType: 'application/json', text: '{"name":"Rex"}' })
    expect(e.response.status).toBe(201)
    expect(e.response.content.text).toBe('{"id":1}')
    expect(e.timings).toEqual({ send: 0, wait: 60, receive: 40 })
  })

  it('representa un error de red con status 0', () => {
    const failed = entry({ response: { ok: false, error: 'ECONNREFUSED', timeMs: 30 } })
    const [e] = JSON.parse(buildHar([failed])).log.entries
    expect(e.response.status).toBe(0)
    expect(e.response.statusText).toBe('ECONNREFUSED')
  })

  it('ordena de la más antigua a la más reciente', () => {
    const newer = entry({ id: '2', at: 2000 })
    const older = entry({ id: '3', at: 1000 })
    const times = JSON.parse(buildHar([newer, older])).log.entries.map(
      (e: { startedDateTime: string }) => e.startedDateTime
    )
    expect(times).toEqual([new Date(1000).toISOString(), new Date(2000).toISOString()])
  })

  it('no exporta credenciales', () => {
    const secret = entry({
      headers: [{ key: 'Authorization', value: 'Bearer super-secreto', enabled: true }]
    })
    expect(buildHar([secret])).not.toContain('super-secreto')
  })

  it('omite postData si no hay body', () => {
    const [e] = JSON.parse(buildHar([entry({ body: '' })])).log.entries
    expect(e.request.postData).toBeUndefined()
  })
})
