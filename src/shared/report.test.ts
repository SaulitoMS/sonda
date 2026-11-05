import { describe, expect, it } from 'vitest'
import {
  buildReport,
  reportFileName,
  reportToCsv,
  reportToHtml,
  reportToJson,
  type ReportInput
} from './report'

const now = new Date('2026-10-29T12:34:56.000Z')

const rows: ReportInput[] = [
  {
    group: 'pet',
    name: 'Listar mascotas',
    method: 'GET',
    path: 'petstore/pet/get-pet.json',
    status: 'pass',
    detail: '',
    httpStatus: 200,
    timeMs: 120,
    assertionResults: [{ id: 'a1', label: 'Status es igual a 200', passed: true, message: '' }],
    validation: { verdict: 'valid', matched: '200', issues: [], truncated: false }
  },
  {
    group: '',
    name: 'Crear <script>',
    method: 'POST',
    path: 'petstore/post-pet.json',
    status: 'fail',
    detail: '1 aserción fallida',
    httpStatus: 500,
    timeMs: 80,
    assertionResults: [
      {
        id: 'a2',
        label: 'Status es igual a 201',
        passed: false,
        actual: '500',
        message: 'se obtuvo 500'
      }
    ],
    validation: {
      verdict: 'invalid',
      matched: '201',
      issues: [{ severity: 'error', path: '$.id', message: 'falta id' }],
      truncated: false
    }
  },
  {
    group: '',
    name: 'Sin respuesta',
    method: 'GET',
    path: 'x.json',
    status: 'fail',
    detail: 'ECONNREFUSED',
    timeMs: 0
  }
]

const report = buildReport({ collection: 'Petstore API', environment: 'Dev', rows, now })

describe('buildReport', () => {
  it('cuenta los resultados por estado y suma los tiempos', () => {
    expect(report.summary).toEqual({ total: 3, pass: 1, warn: 0, fail: 2, timeMs: 200 })
  })

  it('conserva colección, entorno y fecha', () => {
    expect(report.collection).toBe('Petstore API')
    expect(report.environment).toBe('Dev')
    expect(report.generatedAt).toBe('2026-10-29T12:34:56.000Z')
  })

  it('usa null cuando no hubo respuesta ni schema', () => {
    expect(report.results[2].httpStatus).toBeNull()
    expect(report.results[2].schema).toBeNull()
    expect(report.results[2].assertions).toEqual([])
  })

  it('incluye aserciones y problemas de schema', () => {
    expect(report.results[1].assertions[0]).toEqual({
      label: 'Status es igual a 201',
      passed: false,
      message: 'se obtuvo 500'
    })
    expect(report.results[1].schema?.issues).toEqual([
      { severity: 'error', path: '$.id', message: 'falta id' }
    ])
  })

  it('no incluye bodies ni headers', () => {
    const json = reportToJson(report)
    expect(json).not.toContain('"body"')
    expect(json).not.toContain('"headers"')
  })
})

describe('reportToJson', () => {
  it('genera JSON válido que se puede leer de vuelta', () => {
    expect(JSON.parse(reportToJson(report))).toEqual(report)
  })
})

describe('reportToHtml', () => {
  const html = reportToHtml(report)

  it('escapa el HTML de los nombres', () => {
    expect(html).not.toContain('<script>')
    expect(html).toContain('Crear &lt;script&gt;')
  })

  it('muestra el resumen y el entorno', () => {
    expect(html).toContain('3 peticiones · 200 ms')
    expect(html).toContain('Entorno: Dev')
  })

  it('muestra el detalle de aserciones y schema', () => {
    expect(html).toContain('Status es igual a 201')
    expect(html).toContain('falta id')
  })
})

describe('reportFileName', () => {
  it('arma el nombre con la colección y la fecha', () => {
    expect(reportFileName(report, 'html')).toBe('sonda-petstore-api-20261029-123456.html')
  })

  it('limpia acentos y usa un valor por defecto', () => {
    const named = buildReport({ collection: 'Colección Ñandú', environment: null, rows: [], now })
    expect(reportFileName(named, 'json')).toBe('sonda-coleccion-nandu-20261029-123456.json')
    const empty = buildReport({ collection: '***', environment: null, rows: [], now })
    expect(reportFileName(empty, 'json')).toBe('sonda-coleccion-20261029-123456.json')
  })
})

describe('reportToCsv', () => {
  const csvRows: ReportInput[] = [
    {
      group: 'pet',
      name: 'Listar, mascotas',
      method: 'GET',
      path: 'p/get.json',
      status: 'pass',
      detail: '',
      httpStatus: 200,
      timeMs: 120,
      assertionResults: [{ id: 'a', label: 'Status es igual a 200', passed: true, message: '' }]
    },
    {
      group: '',
      name: '=HYPERLINK("x")',
      method: 'POST',
      path: 'p/post.json',
      status: 'fail',
      detail: 'dijo "no"',
      httpStatus: 500,
      timeMs: 80,
      assertionResults: [{ id: 'b', label: 'Tiempo menor a 50', passed: false, message: 'fue 80' }]
    }
  ]
  const csv = reportToCsv(
    buildReport({ collection: 'petstore', environment: null, rows: csvRows, now })
  )
  const lines = csv.slice(1).trim().split('\r\n')

  it('empieza con BOM y trae encabezado más una línea por petición', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'Carpeta,Petición,Método,Ruta,Estado,HTTP,Tiempo (ms),Aserciones OK,Aserciones fallidas,Qué falló,Errores de schema,Detalle'
    )
  })

  it('pone entre comillas las celdas con comas', () => {
    expect(lines[1]).toBe('pet,"Listar, mascotas",GET,p/get.json,pass,200,120,1,0,,0,')
  })

  it('escapa comillas y neutraliza fórmulas', () => {
    expect(lines[2]).toContain('"\'=HYPERLINK(""x"")"')
    expect(lines[2]).toContain('Tiempo menor a 50')
    expect(lines[2]).toContain('"dijo ""no"""')
  })
})

describe('reportFileName csv', () => {
  it('acepta la extensión csv', () => {
    const report = buildReport({ collection: 'petstore', environment: null, rows: [], now })
    expect(reportFileName(report, 'csv')).toBe('sonda-petstore-20261029-123456.csv')
  })
})
