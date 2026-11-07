import { describe, expect, it } from 'vitest'
import { buildCliCommand, shellQuote, type CliCommandOptions } from './cliCommand'

const base: CliCommandOptions = {
  collection: 'petstore',
  env: null,
  folder: null,
  includeWrites: false,
  bail: false,
  retries: 0,
  delayMs: 0,
  maxTimeMs: 0,
  only: '',
  exclude: '',
  repeat: 1,
  hasData: false,
  retryAny: false,
  skipFolderOnFail: false
}

describe('shellQuote', () => {
  it('deja tal cual el texto seguro', () => {
    expect(shellQuote('petstore')).toBe('petstore')
    expect(shellQuote('a/b-c_d.json')).toBe('a/b-c_d.json')
  })

  it('envuelve en comillas simples lo que tenga espacios o símbolos', () => {
    expect(shellQuote('pet store')).toBe("'pet store'")
    expect(shellQuote('a;b')).toBe("'a;b'")
  })

  it('escapa la comilla simple', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })
})

describe('buildCliCommand', () => {
  it('sin opciones es solo "run <colección>"', () => {
    expect(buildCliCommand(base)).toEqual({ command: 'sonda-cli run petstore', notes: [] })
  })

  it('traduce todas las opciones', () => {
    const { command, notes } = buildCliCommand({
      ...base,
      env: 'Producción',
      folder: 'pet store',
      includeWrites: true,
      bail: true,
      retries: 5,
      delayMs: 200,
      maxTimeMs: 800,
      only: ' login, users ',
      exclude: 'delete',
      repeat: 3
    })
    expect(command).toBe(
      "sonda-cli run petstore -e 'Producción' -f 'pet store' --include-writes --bail --retries 3 --delay 200 --max-time 800 --only 'login, users' --exclude delete --repeat 3"
    )
    expect(notes).toEqual(['La CLI permite hasta 3 reintentos.'])
  })

  it('con archivo de datos no usa --repeat y avisa de --data', () => {
    const { command, notes } = buildCliCommand({ ...base, hasData: true, repeat: 4 })
    expect(command).not.toContain('--repeat')
    expect(notes).toEqual(['Agrega --data <archivo> con tu CSV o JSON.'])
  })

  it('avisa de lo que la CLI no puede reproducir', () => {
    const { notes } = buildCliCommand({
      ...base,
      folder: '',
      retryAny: true,
      skipFolderOnFail: true
    })
    expect(notes).toHaveLength(3)
  })
})
