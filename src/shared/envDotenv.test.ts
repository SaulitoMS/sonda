import { describe, expect, it } from 'vitest'
import {
  envNameFromFile,
  exportDotenv,
  parseDotenv,
  parseEnvironmentFile
} from './envTransfer'
import type { Environment } from './types'

const vars = (text: string): Record<string, string> => {
  const { environments } = parseDotenv(text, 'x')
  return Object.fromEntries(environments[0].variables.map((v) => [v.key, v.value]))
}

describe('envNameFromFile', () => {
  it('saca el nombre del archivo', () => {
    expect(envNameFromFile('staging.env')).toBe('staging')
    expect(envNameFromFile('.env.production')).toBe('production')
    expect(envNameFromFile('.env')).toBe('env')
    expect(envNameFromFile('prod.sonda-env.json')).toBe('prod.sonda-env')
    expect(envNameFromFile('C:\\tmp\\dev.env')).toBe('dev')
  })
})

describe('parseDotenv', () => {
  it('lee claves, comentarios y export', () => {
    expect(vars('# hola\n\nexport A=1\nB = dos # nota\nC=')).toEqual({ A: '1', B: 'dos', C: '' })
  })
  it('respeta comillas dobles, simples y escapes', () => {
    expect(vars('A="x # y"\nB=\'a\\nb\'\nC="l1\\nl2 \\"q\\""')).toEqual({
      A: 'x # y',
      B: 'a\\nb',
      C: 'l1\nl2 "q"'
    })
  })
  it('lee valores entre comillas en varias líneas', () => {
    expect(vars('KEY="linea1\nlinea2"\nOTRA=1')).toEqual({ KEY: 'linea1\nlinea2', OTRA: '1' })
  })
  it('acepta CRLF y BOM', () => {
    expect(vars('\uFEFFA=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })
  it('marca como secreto lo que parece una credencial', () => {
    const v = parseDotenv('API_TOKEN=abc\nBASE_URL=http://x', 'x').environments[0].variables
    expect(v.map((x) => [x.key, x.secret])).toEqual([
      ['API_TOKEN', true],
      ['BASE_URL', false]
    ])
  })
  it('avisa de líneas inválidas, repetidas, comillas sin cerrar y ${VAR}', () => {
    const { warnings, environments } = parseDotenv(
      'sin igual\nA=1\nA=2\n1MALA=x\nURL=${HOST}/api\nROTA="abierta',
      'x'
    )
    expect(environments[0].variables.map((v) => v.key)).toEqual(['A', 'URL'])
    expect(warnings.some((w) => w.includes('formato CLAVE=valor'))).toBe(true)
    expect(warnings.some((w) => w.includes('repetida'))).toBe(true)
    expect(warnings.some((w) => w.includes('1MALA'))).toBe(true)
    expect(warnings.some((w) => w.includes('sin cerrar'))).toBe(true)
    expect(warnings.some((w) => w.includes('${VAR}'))).toBe(true)
  })
  it('falla si no hay variables', () => {
    expect(() => parseDotenv('# solo comentarios', 'x')).toThrow()
  })
})

describe('exportDotenv', () => {
  const env: Environment = {
    id: '1',
    name: 'Staging',
    variables: [
      { id: 'a', key: 'BASE_URL', value: 'https://x.test', secret: false, enabled: true },
      { id: 'b', key: 'TOKEN', value: 'abc', secret: true, enabled: true },
      { id: 'c', key: 'NOTA', value: 'hola "mundo"\nlinea 2', secret: false, enabled: true },
      { id: 'd', key: 'APAGADA', value: '1', secret: false, enabled: false },
      { id: 'e', key: 'mala clave', value: '1', secret: false, enabled: true }
    ]
  }
  it('deja los secretos vacíos salvo que se pida', () => {
    expect(exportDotenv(env, false)).toContain('TOKEN=\n')
    expect(exportDotenv(env, true)).toContain('TOKEN=abc\n')
  })
  it('comenta las apagadas y omite las claves inválidas', () => {
    const out = exportDotenv(env, true)
    expect(out).toContain('# APAGADA=1')
    expect(out).toContain('omitida: "mala clave"')
  })
  it('ida y vuelta conserva los valores', () => {
    const back = vars(exportDotenv(env, true))
    expect(back.BASE_URL).toBe('https://x.test')
    expect(back.NOTA).toBe('hola "mundo"\nlinea 2')
    expect(back.TOKEN).toBe('abc')
  })
})

describe('parseEnvironmentFile', () => {
  it('detecta JSON y .env por el contenido', () => {
    expect(
      parseEnvironmentFile('{"name":"J","variables":[{"key":"a","value":"1"}]}', 'x.json')
        .environments[0].name
    ).toBe('J')
    expect(parseEnvironmentFile('A=1', '.env.dev').environments[0].name).toBe('dev')
  })
})