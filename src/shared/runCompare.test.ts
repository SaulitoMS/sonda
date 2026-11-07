import { describe, expect, it } from 'vitest'
import {
  compareRuns,
  parseReportRows,
  parseStoredRuns,
  reportRowKey,
  reportRows,
  rowKey,
  summarizeComparison,
  type RunSnapshotRow
} from './runCompare'
import { buildReport, reportToJson, type RunReport } from './report'

const row = (key: string, status: RunSnapshotRow['status'], timeMs = 100): RunSnapshotRow => ({
  key,
  status,
  timeMs
})

describe('rowKey', () => {
  it('une la ruta con la vuelta o fila (0 si no hay)', () => {
    expect(rowKey('a.json')).toBe('a.json#0')
    expect(rowKey('a.json', 3)).toBe('a.json#3')
  })
})

describe('compareRuns', () => {
  it('detecta regresiones, mejoras, lentitud y peticiones nuevas', () => {
    const before = [row('a', 'pass'), row('b', 'fail'), row('c', 'pass'), row('d', 'pass', 40)]
    const after = [
      row('a', 'fail'),
      row('b', 'pass'),
      row('c', 'pass', 300),
      row('d', 'pass', 120),
      row('e', 'pass')
    ]
    const c = compareRuns(before, after)
    expect(c.changes).toEqual({ a: 'regression', b: 'fixed', c: 'slower', e: 'new' })
    expect([c.regressions, c.fixed, c.slower, c.added]).toEqual([1, 1, 1, 1])
  })

  it('pasar a aviso también es una regresión, y salir de aviso una mejora', () => {
    expect(compareRuns([row('a', 'pass')], [row('a', 'warn')]).changes).toEqual({ a: 'regression' })
    expect(compareRuns([row('a', 'warn')], [row('a', 'pass')]).changes).toEqual({ a: 'fixed' })
  })

  it('exige 1.5× y al menos 100 ms más para marcar una petición como más lenta', () => {
    expect(compareRuns([row('a', 'pass', 40)], [row('a', 'pass', 130)]).changes).toEqual({})
    expect(compareRuns([row('a', 'pass', 1000)], [row('a', 'pass', 1400)]).changes).toEqual({})
    expect(compareRuns([row('a', 'pass', 100)], [row('a', 'pass', 250)]).changes).toEqual({
      a: 'slower'
    })
  })

  it('ignora las peticiones que ya no se ejecutaron', () => {
    expect(compareRuns([row('a', 'pass'), row('b', 'pass')], [row('a', 'pass')]).changes).toEqual(
      {}
    )
  })
})

describe('summarizeComparison', () => {
  it('resume en español con singular y plural', () => {
    const c = compareRuns(
      [row('a', 'pass'), row('b', 'pass'), row('c', 'fail')],
      [row('a', 'fail'), row('b', 'fail'), row('c', 'pass'), row('d', 'pass')]
    )
    expect(summarizeComparison(c)).toBe('2 empeoraron · 1 mejoró · 1 nueva')
  })

  it('dice "sin cambios" cuando todo igual', () => {
    expect(summarizeComparison(compareRuns([row('a', 'pass')], [row('a', 'pass')]))).toBe(
      'sin cambios'
    )
  })
})

describe('parseStoredRuns', () => {
  it('devuelve vacío ante basura o nada', () => {
    expect(parseStoredRuns(null)).toEqual({})
    expect(parseStoredRuns('no es json')).toEqual({})
    expect(parseStoredRuns('5')).toEqual({})
  })

  it('descarta entradas y filas con forma inválida', () => {
    const raw = JSON.stringify({
      ok: [
        { savedAt: '2026-11-07', rows: [row('a', 'pass'), { key: 1 }, row('b', 'raro' as never)] }
      ],
      mal: [{ savedAt: 3, rows: [] }],
      peor: 5
    })
    expect(parseStoredRuns(raw)).toEqual({
      ok: [{ savedAt: '2026-11-07', rows: [row('a', 'pass')] }]
    })
  })

  it('conserva el orden de varias ejecuciones', () => {
    const raw = JSON.stringify({
      s: [
        { savedAt: '2026-11-07T10:00', rows: [] },
        { savedAt: '2026-11-06T10:00', rows: [] }
      ]
    })
    expect(parseStoredRuns(raw).s.map((r) => r.savedAt)).toEqual([
      '2026-11-07T10:00',
      '2026-11-06T10:00'
    ])
  })

  it('acepta el formato anterior de una sola ejecución', () => {
    const raw = JSON.stringify({ s: { savedAt: '2026-11-07', rows: [row('a', 'pass')] } })
    expect(parseStoredRuns(raw)).toEqual({
      s: [{ savedAt: '2026-11-07', rows: [row('a', 'pass')] }]
    })
  })
})

describe('reportes JSON (CLI --baseline)', () => {
  const make = (status: 'pass' | 'fail', timeMs: number): RunReport =>
    buildReport({
      collection: 'c',
      environment: null,
      rows: [
        {
          group: '',
          name: 'A',
          method: 'GET',
          path: 'a.json',
          status: 'pass',
          detail: '',
          timeMs: 10
        },
        {
          group: '',
          name: 'B [vuelta 2]',
          method: 'GET',
          path: 'b.json',
          status,
          detail: '',
          timeMs
        }
      ]
    })

  it('la clave incluye ruta y nombre (con la vuelta o fila)', () => {
    expect(reportRowKey({ path: 'b.json', name: 'B [vuelta 2]' })).toBe('b.json#B [vuelta 2]')
  })

  it('lee un reporte escrito con --json y lo compara con otro', () => {
    const before = parseReportRows(reportToJson(make('pass', 50)))
    const c = compareRuns(before, reportRows(make('fail', 500)))
    expect(c.changes).toEqual({ 'b.json#B [vuelta 2]': 'regression' })
  })

  it('rechaza lo que no es un reporte', () => {
    let a = ''
    let b = ''
    try {
      parseReportRows('x')
    } catch (e) {
      a = (e as Error).message
    }
    try {
      parseReportRows('{"a":1}')
    } catch (e) {
      b = (e as Error).message
    }
    expect(a).toContain('JSON')
    expect(b).toContain('reporte')
  })

  it('salta resultados incompletos', () => {
    const text =
      '{"results":[null,{"path":"a"},{"path":"a","name":"n","status":"pass","timeMs":1}]}'
    expect(parseReportRows(text)).toHaveLength(1)
  })
})
