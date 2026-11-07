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

describe('$randomRfc y $randomClabe', () => {
  it('$randomRfc tiene 13 caracteres con fecha válida', () => {
    expect(resolveDynamic('$randomRfc', lowest)).toBe('AAAA500101AAA')
    expect(resolveDynamic('$randomRfc', highest)).toBe('ZZZZ051228999')
    expect(resolveDynamic('$randomRfc')).toMatch(/^[A-Z]{4}\d{6}[A-Z0-9]{3}$/)
  })

  it('$randomClabe tiene 18 dígitos y un verificador correcto', () => {
    expect(resolveDynamic('$randomClabe', lowest)).toBe('000000000000000000')
    expect(resolveDynamic('$randomClabe', highest)).toBe('999999999999999995')
    expect(resolveDynamic('$randomClabe')).toMatch(/^\d{18}$/)
  })
})

describe('fechas relativas', () => {
  it('suma y resta tiempo a la fecha base', () => {
    expect(resolveDynamic('$date+7d', lowest)).toBe('2026-11-05')
    expect(resolveDynamic('$date-1w', lowest)).toBe('2026-10-22')
    expect(resolveDynamic('$isoTimestamp-2h', lowest)).toBe('2026-10-29T10:34:56.789Z')
    expect(resolveDynamic('$timestamp+30m', lowest)).toBe('1793279096')
    expect(resolveDynamic('$timestampMs+1s', lowest)).toBe('1793277297789')
  })

  it('rechaza formatos inválidos o variables sin fecha', () => {
    for (const n of ['$date+7x', '$date+', '$uuid+1d', '$randomInt+1d', '$date+9999999d']) {
      expect(isDynamicVariable(n)).toBe(false)
      expect(resolveDynamic(n, lowest)).toBeUndefined()
    }
    expect(getDynamicVariable('$date+7d')?.description).toContain('+7d')
  })
})

describe('variables de pruebas técnicas', () => {
  const real = { ...lowest, random: Math.random }

  const luhnOk = (n: string): boolean => {
    let sum = 0
    ;[...n].reverse().forEach((c, i) => {
      let d = Number(c)
      if (i % 2 === 1) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    })
    return sum % 10 === 0
  }

  it('$randomCard empieza con 4, tiene 16 dígitos y pasa Luhn', () => {
    for (let i = 0; i < 100; i++) {
      const card = resolveDynamic('$randomCard', real) as string
      expect(card).toMatch(/^4\d{15}$/)
      expect(luhnOk(card)).toBe(true)
    }
    expect(luhnOk(resolveDynamic('$randomCard', lowest) as string)).toBe(true)
  })

  it('$randomHex, $randomMac y $randomPostalCode respetan su formato', () => {
    for (let i = 0; i < 100; i++) {
      expect(resolveDynamic('$randomHex', real)).toMatch(/^[0-9a-f]{32}$/)
      expect(resolveDynamic('$randomMac', real)).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)
      expect(resolveDynamic('$randomPostalCode', real)).toMatch(/^\d{5}$/)
    }
    expect(resolveDynamic('$randomPostalCode', lowest)).toBe('01000')
  })

  it('$randomLatitude y $randomLongitude quedan dentro de rango', () => {
    for (let i = 0; i < 100; i++) {
      const lat = Number(resolveDynamic('$randomLatitude', real))
      const lon = Number(resolveDynamic('$randomLongitude', real))
      expect(Math.abs(lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(lon)).toBeLessThanOrEqual(180)
    }
  })

  it('$randomJwt tiene tres partes y un payload con exp a 1 hora', () => {
    const [header, payload, signature] = (resolveDynamic('$randomJwt', real) as string).split('.')
    const decode = (part: string): Record<string, unknown> =>
      JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    expect(decode(header)).toEqual({ alg: 'HS256', typ: 'JWT' })
    const body = decode(payload) as { iat: number; exp: number }
    expect(body.exp - body.iat).toBe(3600)
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})
