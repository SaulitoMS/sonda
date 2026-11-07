import { describe, expect, it } from 'vitest'
import { MAX_DESCRIPTION, cleanDescription, previewDescription } from './collectionDescription'

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

describe('previewDescription', () => {
  it('devuelve vacío si no hay texto', () => {
    expect(previewDescription(undefined)).toBe('')
    expect(previewDescription('   ')).toBe('')
  })

  it('deja intacto un texto corto y recorta uno largo', () => {
    expect(previewDescription('Hola')).toBe('Hola')
    expect(previewDescription('a'.repeat(10), 5)).toBe('aaaaa…')
    expect(previewDescription('a'.repeat(5), 5)).toBe('aaaaa')
  })
})
