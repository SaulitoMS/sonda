import { describe, expect, it } from 'vitest'
import { createFolderSkipper, shouldRetryRow } from './runFlow'

describe('createFolderSkipper', () => {
  it('salta el resto de la carpeta después de un fallo', () => {
    const s = createFolderSkipper(true)
    expect(s.shouldSkip('Usuarios')).toBe(false)
    s.markFailed('Usuarios')
    expect(s.shouldSkip('Usuarios')).toBe(true)
  })

  it('no afecta a otras carpetas', () => {
    const s = createFolderSkipper(true)
    s.markFailed('Usuarios')
    expect(s.shouldSkip('Pedidos')).toBe(false)
  })

  it('nunca salta las peticiones sin carpeta', () => {
    const s = createFolderSkipper(true)
    s.markFailed('')
    expect(s.shouldSkip('')).toBe(false)
  })

  it('cada fila de datos lleva su propia cuenta', () => {
    const s = createFolderSkipper(true)
    s.markFailed('Usuarios', 1)
    expect(s.shouldSkip('Usuarios', 1)).toBe(true)
    expect(s.shouldSkip('Usuarios', 2)).toBe(false)
  })

  it('no hace nada si la opción está desactivada', () => {
    const s = createFolderSkipper(false)
    s.markFailed('Usuarios')
    expect(s.shouldSkip('Usuarios')).toBe(false)
  })
})

describe('shouldRetryRow', () => {
  it('por defecto solo reintenta fallos pasajeros', () => {
    expect(shouldRetryRow('fail', true, false)).toBe(true)
    expect(shouldRetryRow('fail', false, false)).toBe(false)
  })

  it('con retryAny reintenta cualquier fallo', () => {
    expect(shouldRetryRow('fail', false, true)).toBe(true)
  })

  it('nunca reintenta lo que pasó o dio aviso', () => {
    expect(shouldRetryRow('pass', true, true)).toBe(false)
    expect(shouldRetryRow('warn', true, true)).toBe(false)
  })
})
