import { describe, expect, it } from 'vitest'
import { visibleResults } from './runnerView'

const rows = [
  { id: 1, status: 'pass' as const, timeMs: 5 },
  { id: 2, status: 'warn' as const, timeMs: 50 },
  { id: 3, status: 'fail' as const, timeMs: 10 }
]

describe('visibleResults', () => {
  it('"all" devuelve todo en el orden original', () => {
    expect(visibleResults(rows, 'all', false).map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('"issues" deja avisos y fallos', () => {
    expect(visibleResults(rows, 'issues', false).map((r) => r.id)).toEqual([2, 3])
  })

  it('"fail" deja solo los fallos', () => {
    expect(visibleResults(rows, 'fail', false).map((r) => r.id)).toEqual([3])
  })

  it('ordena de más lenta a más rápida sin tocar el arreglo original', () => {
    expect(visibleResults(rows, 'all', true).map((r) => r.id)).toEqual([2, 3, 1])
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('combina filtro y orden', () => {
    expect(visibleResults(rows, 'issues', true).map((r) => r.id)).toEqual([2, 3])
  })
})
