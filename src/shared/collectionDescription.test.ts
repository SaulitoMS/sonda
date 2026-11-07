import { describe, expect, it } from 'vitest'
import { MAX_DESCRIPTION, cleanDescription } from './collectionDescription'

describe('cleanDescription', () => {
  it('recorta los bordes y unifica los saltos de línea', () => {
    expect(cleanDescription('  a\r\nb  ')).toBe('a\nb')
  })

  it('devuelve null si está vacía o no es texto', () => {
    expect(cleanDescription('   ')).toBeNull()
    expect(cleanDescription(5)).toBeNull()
    expect(cleanDescription(null)).toBeNull()
  })

  it('corta en el tope', () => {
    expect(cleanDescription('x'.repeat(MAX_DESCRIPTION + 5))).toHaveLength(MAX_DESCRIPTION)
  })
})
