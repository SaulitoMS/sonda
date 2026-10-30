import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  filterHistory,
  parseStored,
  pushEntry,
  truncateResponse,
  type HistoryEntry
} from './history'

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: crypto.randomUUID(),
  at: Date.now(),
  method: 'GET',
  url: 'https://api.com/users',
  headers: [],
  body: '',
  response: {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    timeMs: 10,
    sizeBytes: 2
  },
  ...over
})

describe('pushEntry', () => {
  it('pone lo más reciente primero', () => {
    const a = entry({ url: 'a' })
    const b = entry({ url: 'b' })
    expect(pushEntry([a], b).map((e) => e.url)).toEqual(['b', 'a'])
  })

  it('respeta el límite descartando lo más viejo', () => {
    const list = [entry({ url: '1' }), entry({ url: '2' })]
    expect(pushEntry(list, entry({ url: '3' }), 2).map((e) => e.url)).toEqual(['3', '1'])
  })
})

describe('truncateResponse', () => {
  it('recorta bodies largos', () => {
    const r = truncateResponse(
      {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'x'.repeat(100),
        timeMs: 1,
        sizeBytes: 100
      },
      10
    )
    expect(r.ok && r.body).toHaveLength(10)
  })

  it('deja intactos los bodies cortos y los errores', () => {
    const err = { ok: false as const, error: 'boom', timeMs: 5 }
    expect(truncateResponse(err, 1)).toBe(err)
  })
})

describe('filterHistory', () => {
  const list = [
    entry({ method: 'POST', url: 'https://api.com/pets' }),
    entry({ url: 'https://api.com/users', response: { ok: false, error: 'x', timeMs: 3 } })
  ]

  it('devuelve todo sin búsqueda', () => {
    expect(filterHistory(list, '  ')).toHaveLength(2)
  })

  it('busca por método, URL y status', () => {
    expect(filterHistory(list, 'post')).toHaveLength(1)
    expect(filterHistory(list, 'users')).toHaveLength(1)
    expect(filterHistory(list, 'error')).toHaveLength(1)
    expect(filterHistory(list, '200')).toHaveLength(1)
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 9, 29, 15, 0)

  it('distingue hoy y ayer', () => {
    expect(dayLabel(new Date(2026, 9, 29, 1, 0).getTime(), now)).toBe('Hoy')
    expect(dayLabel(new Date(2026, 9, 28, 23, 0).getTime(), now)).toBe('Ayer')
  })

  it('usa la fecha para días anteriores', () => {
    expect(dayLabel(new Date(2026, 9, 1).getTime(), now)).toMatch(/2026/)
  })
})

describe('parseStored', () => {
  it('tolera null, JSON roto y formas inesperadas', () => {
    expect(parseStored(null)).toEqual([])
    expect(parseStored('{no es json')).toEqual([])
    expect(parseStored('{"a":1}')).toEqual([])
  })

  it('descarta entradas inválidas y conserva las válidas', () => {
    const ok = entry()
    expect(parseStored(JSON.stringify([ok, { id: 1 }, null]))).toEqual([ok])
  })
})
