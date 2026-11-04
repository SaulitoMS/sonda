import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from './history'
import { compareEntries } from './historyCompare'

const entry = (id: string, at: number, body: string, status = 200): HistoryEntry => ({
  id,
  at,
  method: 'GET',
  url: 'https://api.test/users/1',
  headers: [],
  body: '',
  response: {
    ok: true,
    status,
    statusText: 'OK',
    headers: {},
    body,
    timeMs: 10,
    sizeBytes: body.length
  }
})

describe('compareEntries', () => {
  it('detecta cambios entre dos respuestas', () => {
    const r = compareEntries(
      entry('a', 1, '{"name":"Ana","age":30}'),
      entry('b', 2, '{"name":"Ana","age":31,"vip":true}')
    )
    if (r.state !== 'ready') throw new Error('debía estar lista')
    expect(r.identical).toBe(false)
    expect(r.changes.map((c) => `${c.kind}:${c.path}`)).toEqual(['changed:age', 'added:vip'])
  })

  it('la más antigua es siempre "antes", sin importar el orden en que se pasen', () => {
    const old = entry('old', 1, '{"v":1}')
    const recent = entry('new', 2, '{"v":2}')
    const r = compareEntries(recent, old)
    if (r.state !== 'ready') throw new Error('debía estar lista')
    expect(r.before.id).toBe('old')
    expect(r.after.id).toBe('new')
    expect(r.changes[0].before).toBe(1)
    expect(r.changes[0].after).toBe(2)
  })

  it('avisa si cambió el status aunque el body sea igual', () => {
    const r = compareEntries(entry('a', 1, '{"x":1}', 200), entry('b', 2, '{"x":1}', 500))
    if (r.state !== 'ready') throw new Error('debía estar lista')
    expect(r.changes).toHaveLength(0)
    expect(r.identical).toBe(false)
    expect(r.statusBefore).toBe(200)
    expect(r.statusAfter).toBe(500)
  })

  it('ignora los campos pedidos en cualquier nivel', () => {
    const r = compareEntries(
      entry('a', 1, '{"id":1,"meta":{"createdAt":"x"}}'),
      entry('b', 2, '{"id":1,"meta":{"createdAt":"y"}}'),
      ['createdAt']
    )
    if (r.state !== 'ready') throw new Error('debía estar lista')
    expect(r.identical).toBe(true)
  })

  it('es inválida si alguna respuesta no es JSON', () => {
    expect(compareEntries(entry('a', 1, '<html>'), entry('b', 2, '{"a":1}')).state).toBe('invalid')
  })

  it('es inválida si una de las peticiones falló en red', () => {
    const failed: HistoryEntry = {
      ...entry('b', 2, ''),
      response: { ok: false, error: 'timeout', timeMs: 30000 }
    }
    expect(compareEntries(entry('a', 1, '{"a":1}'), failed).state).toBe('invalid')
  })
})