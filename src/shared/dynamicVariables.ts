export interface DynamicContext {
  now: Date
  random: () => number
}

export interface DynamicVariable {
  /** Nombre completo, con el prefijo $ (se usa como {{$uuid}}) */
  name: string
  description: string
  generate: (ctx: DynamicContext) => string
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'

const randomString = (length: number, random: () => number): string => {
  let out = ''
  for (let i = 0; i < length; i++) out += ALNUM[Math.floor(random() * ALNUM.length)]
  return out
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'
const CURP_STATES = [
  'AS',
  'BC',
  'BS',
  'CC',
  'CL',
  'CM',
  'CS',
  'CH',
  'DF',
  'DG',
  'GT',
  'GR',
  'HG',
  'JC',
  'MC',
  'MN',
  'MS',
  'NT',
  'NL',
  'OC',
  'PL',
  'QT',
  'QR',
  'SP',
  'SL',
  'SR',
  'TC',
  'TS',
  'TL',
  'VZ',
  'YN',
  'ZS'
] as const
const LOREM = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua'
] as const

const pad2 = (n: number): string => String(n).padStart(2, '0')

const FIRST_NAMES = [
  'Ana',
  'Luis',
  'María',
  'Carlos',
  'Sofía',
  'Jorge',
  'Valeria',
  'Diego',
  'Camila',
  'Andrés'
] as const

const LAST_NAMES = [
  'García',
  'Martínez',
  'López',
  'Hernández',
  'Pérez',
  'Ramírez',
  'Torres',
  'Flores',
  'Rivera',
  'Gómez'
] as const

const CITIES = [
  'Los Mochis',
  'Culiacán',
  'Guadalajara',
  'Monterrey',
  'Ciudad de México',
  'Puebla',
  'Mérida',
  'Tijuana',
  'Querétaro',
  'León'
] as const

const COMPANIES = [
  'Acme',
  'Globex',
  'Initech',
  'Umbrella',
  'Soylent',
  'Hooli',
  'Stark',
  'Wayne',
  'Wonka',
  'Cyberdyne'
] as const

const pick = <T>(list: readonly T[], random: () => number): T =>
  list[Math.floor(random() * list.length)]

const randomDigits = (length: number, random: () => number): string => {
  let out = ''
  for (let i = 0; i < length; i++) out += Math.floor(random() * 10)
  return out
}

const DAY_MS = 24 * 60 * 60 * 1000

export const DYNAMIC_VARIABLES: DynamicVariable[] = [
  {
    name: '$uuid',
    description: 'UUID v4 aleatorio',
    generate: () => crypto.randomUUID()
  },
  {
    name: '$timestamp',
    description: 'Hora actual en segundos (Unix)',
    generate: ({ now }) => String(Math.floor(now.getTime() / 1000))
  },
  {
    name: '$timestampMs',
    description: 'Hora actual en milisegundos (Unix)',
    generate: ({ now }) => String(now.getTime())
  },
  {
    name: '$isoTimestamp',
    description: 'Fecha y hora actual en ISO 8601 (UTC)',
    generate: ({ now }) => now.toISOString()
  },
  {
    name: '$date',
    description: 'Fecha actual en formato YYYY-MM-DD (UTC)',
    generate: ({ now }) => now.toISOString().slice(0, 10)
  },
  {
    name: '$randomInt',
    description: 'Entero aleatorio entre 0 y 1000',
    generate: ({ random }) => String(Math.floor(random() * 1001))
  },
  {
    name: '$randomBool',
    description: 'true o false al azar',
    generate: ({ random }) => (random() < 0.5 ? 'true' : 'false')
  },
  {
    name: '$randomString',
    description: 'Texto aleatorio de 10 caracteres (a-z, 0-9)',
    generate: ({ random }) => randomString(10, random)
  },
  {
    name: '$randomEmail',
    description: 'Correo aleatorio con dominio example.com',
    generate: ({ random }) => `sonda.${randomString(8, random)}@example.com`
  },
  {
    name: '$randomFirstName',
    description: 'Nombre de pila aleatorio',
    generate: ({ random }) => pick(FIRST_NAMES, random)
  },
  {
    name: '$randomLastName',
    description: 'Apellido aleatorio',
    generate: ({ random }) => pick(LAST_NAMES, random)
  },
  {
    name: '$randomFullName',
    description: 'Nombre y apellido aleatorios',
    generate: ({ random }) => `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`
  },
  {
    name: '$randomUsername',
    description: 'Usuario aleatorio, ej: ana_k3x9',
    generate: ({ random }) =>
      `${pick(FIRST_NAMES, random)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')}_${randomString(4, random)}`
  },
  {
    name: '$randomPhone',
    description: 'Teléfono aleatorio de 10 dígitos',
    generate: ({ random }) => `${1 + Math.floor(random() * 9)}${randomDigits(9, random)}`
  },
  {
    name: '$randomCity',
    description: 'Ciudad aleatoria',
    generate: ({ random }) => pick(CITIES, random)
  },
  {
    name: '$randomCompany',
    description: 'Nombre de empresa aleatorio',
    generate: ({ random }) => pick(COMPANIES, random)
  },
  {
    name: '$randomPassword',
    description: 'Contraseña aleatoria de 11 caracteres (mayúscula, minúsculas, número y símbolo)',
    generate: ({ random }) =>
      `${String.fromCharCode(65 + Math.floor(random() * 26))}${randomString(8, random)}${Math.floor(random() * 10)}!`
  },
  {
    name: '$randomIp',
    description: 'Dirección IPv4 aleatoria',
    generate: ({ random }) =>
      Array.from({ length: 4 }, () => 1 + Math.floor(random() * 254)).join('.')
  },
  {
    name: '$randomUrl',
    description: 'URL aleatoria con dominio example.com',
    generate: ({ random }) => `https://${randomString(8, random)}.example.com`
  },
  {
    name: '$randomColor',
    description: 'Color hexadecimal aleatorio, ej: #a1b2c3',
    generate: ({ random }) =>
      `#${Math.floor(random() * 0x1000000)
        .toString(16)
        .padStart(6, '0')}`
  },
  {
    name: '$randomDecimal',
    description: 'Número decimal aleatorio entre 0 y 1000 con 2 decimales',
    generate: ({ random }) => (random() * 1000).toFixed(2)
  },
  {
    name: '$randomPastDate',
    description: 'Fecha aleatoria de los últimos 365 días (YYYY-MM-DD)',
    generate: ({ now, random }) =>
      new Date(now.getTime() - (1 + Math.floor(random() * 365)) * DAY_MS).toISOString().slice(0, 10)
  },
  {
    name: '$randomFutureDate',
    description: 'Fecha aleatoria de los próximos 365 días (YYYY-MM-DD)',
    generate: ({ now, random }) =>
      new Date(now.getTime() + (1 + Math.floor(random() * 365)) * DAY_MS).toISOString().slice(0, 10)
  },
  {
    name: '$randomSlug',
    description: 'Slug aleatorio de 3 palabras, ej: dolor-sit-amet',
    generate: ({ random }) => Array.from({ length: 3 }, () => pick(LOREM, random)).join('-')
  },
  {
    name: '$randomLorem',
    description: 'Frase aleatoria de 8 palabras en lorem ipsum',
    generate: ({ random }) => {
      const s = Array.from({ length: 8 }, () => pick(LOREM, random)).join(' ')
      return s.charAt(0).toUpperCase() + s.slice(1) + '.'
    }
  },
  {
    name: '$randomCurp',
    description: 'CURP aleatoria con formato válido (18 caracteres). No es una persona real',
    generate: ({ random }) => {
      const letter = (): string => LETTERS[Math.floor(random() * LETTERS.length)]
      const consonant = (): string => CONSONANTS[Math.floor(random() * CONSONANTS.length)]
      const year = 1950 + Math.floor(random() * 56)
      const month = 1 + Math.floor(random() * 12)
      const day = 1 + Math.floor(random() * 28)
      const sex = random() < 0.5 ? 'H' : 'M'
      const homoclave = `${ALNUM[Math.floor(random() * ALNUM.length)].toUpperCase()}${Math.floor(random() * 10)}`
      return (
        letter() +
        letter() +
        letter() +
        letter() +
        String(year).slice(2) +
        pad2(month) +
        pad2(day) +
        sex +
        pick(CURP_STATES, random) +
        consonant() +
        consonant() +
        consonant() +
        homoclave
      )
    }
  },
  {
    name: '$randomRfc',
    description:
      'RFC de persona física aleatorio con formato válido (13 caracteres). No es una persona real',
    generate: ({ random }) => {
      const letter = (): string => LETTERS[Math.floor(random() * LETTERS.length)]
      const year = 1950 + Math.floor(random() * 56)
      const month = 1 + Math.floor(random() * 12)
      const day = 1 + Math.floor(random() * 28)
      const homoclave = Array.from({ length: 3 }, () =>
        ALNUM[Math.floor(random() * ALNUM.length)].toUpperCase()
      ).join('')
      return (
        letter() +
        letter() +
        letter() +
        letter() +
        String(year).slice(2) +
        pad2(month) +
        pad2(day) +
        homoclave
      )
    }
  },
  {
    name: '$randomClabe',
    description:
      'CLABE interbancaria aleatoria con dígito verificador válido (18 dígitos). No es una cuenta real',
    generate: ({ random }) => {
      const base = randomDigits(17, random)
      const weights = [3, 7, 1]
      const sum = [...base].reduce((acc, d, i) => acc + ((Number(d) * weights[i % 3]) % 10), 0)
      return base + String((10 - (sum % 10)) % 10)
    }
  }
]

const BY_NAME = new Map(DYNAMIC_VARIABLES.map((v) => [v.name, v]))

export const getDynamicVariable = (name: string): DynamicVariable | undefined => BY_NAME.get(name)

export const isDynamicVariable = (name: string): boolean => BY_NAME.has(name)

/** Genera el valor de una variable dinámica, o undefined si el nombre no existe */
export function resolveDynamic(
  name: string,
  ctx: DynamicContext = { now: new Date(), random: Math.random }
): string | undefined {
  return BY_NAME.get(name)?.generate(ctx)
}
