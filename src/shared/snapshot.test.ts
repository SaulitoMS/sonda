import { describe, expect, it } from 'vitest'
import {
  compareSnapshot,
  parseIgnore,
  parseStoredSnapshots,
  snapshotKey,
  type Snapshot,
  type SnapshotComparison
} from './snapshot'

const snap = (body: unknown, over: Partial<Snapshot> = {}): Snapshot => ({
  key: 'req:GET /x',
  method: 'GET',
  url: '/x',
  status: 200,
  body: JSON.stringify(body),
  savedAt: 1,
  ignore: [],
  ...over
})

const cmp = (
  s: Snapshot,
  status: number,
  body: string
): Extract<SnapshotComparison, { state: 'ready' }> => {
  const r = compareSnapshot(s, { status, body })
  if (r.state !== 'ready') throw new Error('se esperaba una comparación lista')
  return r
}

describe('compareSnapshot', () => {
  it('respuestas idénticas', () => {
    const r = cmp(snap({ id: 1, name: 'a' }), 200, '{"id":1,"name":"a"}')
    expect(r.identical).toBe(true)
    expect(r.changes).toHaveLength(0)
  })

  it('detecta campos agregados, quitados y cambiados', () => {
    const r = cmp(snap({ id: 1, name: 'a', old: true }), 200, '{"id":2,"name":"a","extra":1}')
    const byKind = (k: string): string[] => r.changes.filter((c) => c.kind === k).map((c) => c.path)
    expect(byKind('changed')).toEqual(['id'])
    expect(byKind('added')).toEqual(['extra'])
    expect(byKind('removed')).toEqual(['old'])
    expect(r.identical).toBe(false)
  })

  it('un cambio de status rompe la igualdad aunque el body coincida', () => {
    const r = cmp(snap({ ok: true }), 500, '{"ok":true}')
    expect(r.changes).toHaveLength(0)
    expect(r.identical).toBe(false)
    expect(r.statusBefore).toBe(200)
    expect(r.statusAfter).toBe(500)
  })

  it('ignora campos volátiles en cualquier nivel y sin distinguir mayúsculas', () => {
    const base = snap(
      { id: 1, CreatedAt: 'ayer', items: [{ id: 1, updatedAt: 'a' }] },
      { ignore: ['createdAt', 'UPDATEDAT'] }
    )
    const r = cmp(base, 200, '{"id":1,"createdAt":"hoy","items":[{"id":1,"updatedAt":"b"}]}')
    expect(r.identical).toBe(true)
  })

  it('lo ignorado no esconde otros cambios', () => {
    const base = snap({ id: 1, ts: 1 }, { ignore: ['ts'] })
    const r = cmp(base, 200, '{"id":9,"ts":2}')
    expect(r.changes.map((c) => c.path)).toEqual(['id'])
  })

  it('avisa si la línea base o la respuesta no son JSON', () => {
    expect(compareSnapshot(snap({}, { body: 'no json' }), { status: 200, body: '{}' }).state).toBe(
      'invalid'
    )
    expect(compareSnapshot(snap({}), { status: 200, body: '<html>' }).state).toBe('invalid')
  })
})

describe('snapshotKey', () => {
  it('usa el archivo si existe y método + URL si no', () => {
    expect(snapshotKey('col/get-a.json', 'GET', '/x')).toBe('file:col/get-a.json')
    expect(snapshotKey(null, 'POST', '  /y ')).toBe('req:POST /y')
  })
})

describe('parseIgnore', () => {
  it('separa por coma o salto de línea, sin vacíos ni repetidos', () => {
    expect(parseIgnore(' a, b ,\nc,,a ')).toEqual(['a', 'b', 'c'])
    expect(parseIgnore('')).toEqual([])
  })
})

describe('parseStoredSnapshots', () => {
  it('lee entradas válidas y descarta las corruptas', () => {
    const raw = JSON.stringify({
      'req:GET /a': {
        status: 200,
        body: '{}',
        savedAt: 5,
        ignore: ['x', 3],
        method: 'GET',
        url: '/a'
      },
      roto: { status: 'no' },
      otro: null
    })
    const out = parseStoredSnapshots(raw)
    expect(Object.keys(out)).toEqual(['req:GET /a'])
    expect(out['req:GET /a'].key).toBe('req:GET /a')
    expect(out['req:GET /a'].ignore).toEqual(['x'])
  })

  it('tolera null, JSON inválido y formas inesperadas', () => {
    expect(parseStoredSnapshots(null)).toEqual({})
    expect(parseStoredSnapshots('{')).toEqual({})
    expect(parseStoredSnapshots('[]')).toEqual({})
  })
})
