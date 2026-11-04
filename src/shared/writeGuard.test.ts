import { describe, expect, it } from 'vitest'
import type { Environment } from './types'
import {
  confirmBulkMessage,
  confirmRunMessage,
  confirmSendMessage,
  isWriteMethod
} from './writeGuard'

const env = (over: Partial<Environment> = {}): Environment => ({
  id: 'e1',
  name: 'Producción',
  variables: [],
  protected: true,
  ...over
})

describe('isWriteMethod', () => {
  it('trata GET, HEAD y OPTIONS como seguros', () => {
    expect(isWriteMethod('GET')).toBe(false)
    expect(isWriteMethod('HEAD')).toBe(false)
    expect(isWriteMethod('OPTIONS')).toBe(false)
  })

  it('trata POST, PUT, PATCH y DELETE como escritura', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(isWriteMethod(m)).toBe(true)
    }
  })
})

describe('confirmSendMessage', () => {
  it('pide confirmar una escritura en un entorno protegido', () => {
    const msg = confirmSendMessage(env(), 'DELETE', 'https://api.test/users/1')
    expect(msg).toContain('Producción')
    expect(msg).toContain('DELETE')
    expect(msg).toContain('https://api.test/users/1')
  })

  it('no pregunta por lecturas', () => {
    expect(confirmSendMessage(env(), 'GET', 'https://api.test')).toBeNull()
  })

  it('no pregunta si el entorno no está protegido, no existe o no tiene la marca', () => {
    expect(confirmSendMessage(env({ protected: false }), 'POST', 'https://api.test')).toBeNull()
    expect(
      confirmSendMessage(env({ protected: undefined }), 'POST', 'https://api.test')
    ).toBeNull()
    expect(confirmSendMessage(null, 'POST', 'https://api.test')).toBeNull()
  })
})

describe('confirmRunMessage', () => {
  it('menciona cuántas peticiones modifican datos', () => {
    expect(confirmRunMessage(env(), 3)).toContain('3')
  })

  it('no pregunta si no hay escrituras o el entorno no está protegido', () => {
    expect(confirmRunMessage(env(), 0)).toBeNull()
    expect(confirmRunMessage(env({ protected: false }), 5)).toBeNull()
    expect(confirmRunMessage(null, 5)).toBeNull()
  })
})

describe('confirmBulkMessage', () => {
  it('incluye la herramienta, la cantidad y el método', () => {
    const msg = confirmBulkMessage(env(), 'POST', 'https://api.test/x', 50, 'El fuzzing')
    expect(msg).toContain('El fuzzing')
    expect(msg).toContain('50')
    expect(msg).toContain('POST')
  })

  it('no pregunta por lecturas ni en entornos sin proteger', () => {
    expect(confirmBulkMessage(env(), 'GET', 'https://api.test', 50, 'El fuzzing')).toBeNull()
    expect(
      confirmBulkMessage(env({ protected: false }), 'POST', 'https://api.test', 50, 'El fuzzing')
    ).toBeNull()
  })
})