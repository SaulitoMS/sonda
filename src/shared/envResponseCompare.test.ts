import { describe, expect, it } from 'vitest'
import { compareResponses } from './envResponseCompare'
import type { SendRequestResult } from './types'

const res = (
  status: number,
  body: string,
  headers: Record<string, string> = {}
): SendRequestResult => ({
  ok: true,
  status,
  statusText: '',
  headers,
  body,
  timeMs: 1,
  sizeBytes: body.length
})

describe('compareResponses', () => {
  it('ignora headers volátiles', () => {
    const r = compareResponses(
      res(200, '{"a":1}', { Date: 'x' }),
      res(200, '{"a":1}', { date: 'y' })
    )
    expect(r.identical).toBe(true)
  })

  it('detecta cambios de status, body y headers', () => {
    const r = compareResponses(
      res(200, '{"a":1,"b":{"c":2}}'),
      res(404, '{"a":2,"b":{"c":2}}', { 'X-Env': 'qa' })
    )
    expect(r.statusSame).toBe(false)
    expect(r.bodyChanges.map((c) => c.path)).toEqual(['a'])
    expect(r.headerChanges).toEqual([
      { name: 'x-env', kind: 'added', before: undefined, after: 'qa' }
    ])
  })

  it('respeta las rutas ignoradas, también con índices', () => {
    const r = compareResponses(
      res(200, '{"items":[{"id":1}],"u":{"at":1,"id":2}}'),
      res(200, '{"items":[{"id":2}],"u":{"at":9,"id":3}}'),
      ['items', 'u.at']
    )
    expect(r.bodyChanges.map((c) => c.path)).toEqual(['u.id'])
  })

  it('compara texto plano', () => {
    const r = compareResponses(res(200, 'hola'), res(200, 'adiós'))
    expect(r.bodyKind).toBe('text')
    expect(r.bodyChanges).toHaveLength(1)
  })

  it('reporta qué lado falló', () => {
    const r = compareResponses({ ok: false, error: 'timeout', timeMs: 1 }, res(200, '{}'))
    expect(r.errors).toEqual(['Entorno A: timeout'])
  })
})
