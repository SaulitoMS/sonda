import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_VARIABLES,
  getDynamicVariable,
  isDynamicVariable,
  resolveDynamic
} from './dynamicVariables'

const now = new Date('2026-10-29T12:34:56.789Z')
const lowest = { now, random: () => 0 }
const highest = { now, random: () => 0.9999999 }

describe('resolveDynamic', () => {
  it('$uuid genera un UUID v4 distinto cada vez', () => {
    const a = resolveDynamic('$uuid')
    const b = resolveDynamic('$uuid')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('las fechas salen de la hora indicada', () => {
    expect(resolveDynamic('$timestamp', lowest)).toBe('1793277296')
    expect(resolveDynamic('$timestampMs', lowest)).toBe('1793277296789')
    expect(resolveDynamic('$isoTimestamp', lowest)).toBe('2026-10-29T12:34:56.789Z')
    expect(resolveDynamic('$date', lowest)).toBe('2026-10-29')
  })

  it('$randomInt queda entre 0 y 1000', () => {
    expect(resolveDynamic('$randomInt', lowest)).toBe('0')
    expect(resolveDynamic('$randomInt', highest)).toBe('1000')
  })

  it('$randomBool devuelve true o false', () => {
    expect(resolveDynamic('$randomBool', lowest)).toBe('true')
    expect(resolveDynamic('$randomBool', highest)).toBe('false')
  })

  it('$randomString y $randomEmail tienen el formato esperado', () => {
    expect(resolveDynamic('$randomString', lowest)).toBe('aaaaaaaaaa')
    expect(resolveDynamic('$randomString')).toMatch(/^[a-z0-9]{10}$/)
    expect(resolveDynamic('$randomEmail')).toMatch(/^sonda\.[a-z0-9]{8}@example\.com$/)
  })

  it('devuelve undefined si no existe', () => {
    expect(resolveDynamic('$nope')).toBeUndefined()
    expect(resolveDynamic('uuid')).toBeUndefined()
  })
})

describe('catálogo', () => {
  it('todos los nombres empiezan con $ y no se repiten', () => {
    const names = DYNAMIC_VARIABLES.map((v) => v.name)
    expect(names.every((n) => n.startsWith('$'))).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('isDynamicVariable y getDynamicVariable concuerdan', () => {
    expect(isDynamicVariable('$uuid')).toBe(true)
    expect(isDynamicVariable('$nope')).toBe(false)
    expect(getDynamicVariable('$uuid')?.description).toBeTruthy()
  })
})

describe('variables de registro aleatorio', () => {
  it('generan el formato esperado', () => {
    expect(resolveDynamic('$randomFullName')).toMatch(/^\S+ \S+$/)
    expect(resolveDynamic('$randomUsername')).toMatch(/^[a-z]+_[a-z0-9]{4}$/)
    expect(resolveDynamic('$randomPhone')).toMatch(/^[1-9]\d{9}$/)
    expect(resolveDynamic('$randomPassword')).toMatch(/^[A-Z][a-z0-9]{8}\d!$/)
    expect(resolveDynamic('$randomIp')).toMatch(/^(\d{1,3}\.){3}\d{1,3}$/)
    expect(resolveDynamic('$randomColor')).toMatch(/^#[0-9a-f]{6}$/)
    expect(resolveDynamic('$randomDecimal')).toMatch(/^\d{1,4}\.\d{2}$/)
  })

  it('las fechas pasada y futura quedan a los lados de hoy', () => {
    expect(resolveDynamic('$randomPastDate', lowest)! < '2026-10-29').toBe(true)
    expect(resolveDynamic('$randomFutureDate', lowest)! > '2026-10-29').toBe(true)
  })
})
