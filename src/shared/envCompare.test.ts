import { describe, expect, it } from 'vitest'
import { compareResponses } from './envCompare'
import type { SendRequestResult } from './types'

const ok = (
  status: number,
  body: string,
  headers: Record<string, string> = {}
): SendRequestResult => ({
  ok: true,
  status,
  statusText: '',
  headers,
  body,
  timeMs: 10,
  sizeBytes: body.length
})

describe('compareResponses', () => {
  it('ignora headers volátiles y mayúsculas', () => {
    const r = compareResponses(
      ok(200, '{"a":1}', { Date: 'x', 'Content-Type': 'application/json' }),
      ok(200, '{"a":1}', { date: 'y', 'content-type': 'application/json' })
    )
    expect(r.kind === 'compared' && r.identical).toBe(true)
  })

  it('detecta diferencias de status, body y headers', () => {
    const r = compareResponses(
      ok(200, '{"a":1,"b":[1]}'),
      ok(500, '{"a":2,"b":[1,2]}', { 'x-new': '1' })
    )
    expect(r.kind).toBe('compared')
    if (r.kind !== 'compared') return
    expect(r.identical).toBe(false)
    expect(r.bodyChanges).toHaveLength(2)
    expect(r.headerDiffs).toEqual([{ name: 'x-new', kind: 'added', b: '1' }])
  })

  it('compara como texto si no es JSON', () => {
    const r = compareResponses(ok(200, 'hola'), ok(200, 'hola2'))
    expect(r.kind === 'compared' && r.bodyMode === 'text' && !r.bodyEqual).toBe(true)
  })

  it('reporta el error de un lado', () => {
    const r = compareResponses({ ok: false, error: 'timeout', timeMs: 5 }, ok(200, '{}'))
    expect(r).toEqual({ kind: 'error', errorA: 'timeout', errorB: null })
  })
})
