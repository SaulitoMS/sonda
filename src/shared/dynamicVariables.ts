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