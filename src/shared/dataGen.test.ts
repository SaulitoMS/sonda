import { describe, expect, it } from 'vitest'
import { generateRows, parseColumns, toCsv } from './dataGen'

describe('dataGen', () => {
  it('parsea columnas e ignora líneas inválidas', () => {
    const cols = parseColumns('nombre={{$randomFirstName}}\n\nsin igual\n=vacio\nrol=admin')
    expect(cols).toEqual([
      { name: 'nombre', template: '{{$randomFirstName}}' },
      { name: 'rol', template: 'admin' }
    ])
  })

  it('genera el número de filas pedido, con tope de 1000', () => {
    const cols = parseColumns('rol=admin')
    expect(generateRows(cols, 3)).toHaveLength(3)
    expect(generateRows(cols, 99999)).toHaveLength(1000)
    expect(generateRows(cols, 0)).toHaveLength(1)
  })

  it('genera valores distintos con variables dinámicas', () => {
    const rows = generateRows(parseColumns('id={{$uuid}}'), 5)
    expect(new Set(rows.map((r) => r.id)).size).toBe(5)
  })

  it('escapa comillas, comas y saltos de línea en el CSV', () => {
    const cols = parseColumns('texto=a,"b"')
    expect(toCsv(cols, generateRows(cols, 1))).toBe('texto\n"a,""b"""\n')
  })
})
