import { describe, expect, it } from 'vitest'
import { buildReport, reportToMarkdown } from './report'

const report = buildReport({
  collection: 'Petstore',
  environment: 'Dev',
  now: new Date('2026-11-07T00:00:00.000Z'),
  rows: [
    {
      group: 'pet',
      name: 'Listar',
      method: 'GET',
      path: 'p.json',
      status: 'pass',
      detail: '',
      httpStatus: 200,
      timeMs: 12
    },
    {
      group: '',
      name: 'Crear | x\nlinea',
      method: 'POST',
      path: 'q.json',
      status: 'fail',
      detail: 'falló | mal',
      httpStatus: 500,
      timeMs: 80
    }
  ]
})

describe('reportToMarkdown', () => {
  const md = reportToMarkdown(report)

  it('muestra título, entorno y resumen', () => {
    expect(md).toContain('# Reporte de ejecución: Petstore')
    expect(md).toContain('Entorno: Dev')
    expect(md).toContain('**✓ 1** · **⚠ 0** · **✗ 1** — 2 peticiones, 92 ms')
  })

  it('separa los problemas de la tabla completa', () => {
    expect(md).toContain('## Con problemas')
    expect(md).toContain('## Todas')
  })

  it('escapa | y saltos de línea para no romper la tabla', () => {
    expect(md).toContain('POST Crear \\| x linea')
    expect(md).toContain('falló \\| mal')
  })

  it('sin problemas no incluye la sección "Con problemas"', () => {
    const ok = buildReport({
      collection: 'C',
      environment: null,
      rows: [
        { group: '', name: 'A', method: 'GET', path: 'a', status: 'pass', detail: '', timeMs: 1 }
      ]
    })
    expect(reportToMarkdown(ok)).not.toContain('## Con problemas')
  })
})
