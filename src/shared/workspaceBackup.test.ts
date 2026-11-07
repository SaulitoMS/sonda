import { describe, expect, it } from 'vitest'
import {
  buildBackup,
  isBackupPath,
  isSafeRelPath,
  parseBackup,
  planRestore
} from './workspaceBackup'

describe('isSafeRelPath', () => {
  it('acepta rutas relativas normales', () => {
    expect(isSafeRelPath('col/pet/get.json')).toBe(true)
  })

  it('rechaza escapes, rutas absolutas y rarezas', () => {
    for (const p of ['../x.json', '/etc/x.json', 'a//b.json', 'a/./b.json', 'a/../b.json']) {
      expect(isSafeRelPath(p)).toBe(false)
    }
    for (const p of ['C:/x.json', 'a\\b.json', '', 'a/\u0000b.json']) {
      expect(isSafeRelPath(p)).toBe(false)
    }
  })
})

describe('isBackupPath', () => {
  it('incluye JSON del workspace y los entornos', () => {
    expect(isBackupPath('col/get.json')).toBe(true)
    expect(isBackupPath('.sonda/environments.json')).toBe(true)
  })

  it('excluye papelera, .git, node_modules y lo que no es JSON', () => {
    expect(isBackupPath('.sonda/trash/x.json')).toBe(false)
    expect(isBackupPath('.git/c.json')).toBe(false)
    expect(isBackupPath('col/node_modules/x.json')).toBe(false)
    expect(isBackupPath('col/notas.txt')).toBe(false)
  })
})

describe('buildBackup y parseBackup', () => {
  const now = new Date('2026-11-07T00:00:00Z')

  it('ordena por ruta, descarta rutas inválidas y se puede leer de vuelta', () => {
    const raw = buildBackup(
      [
        { path: 'b/z.json', content: '{}' },
        { path: 'a/y.json', content: '{"a":1}' },
        { path: '../evil.json', content: '{}' }
      ],
      now
    )
    const { files, ignored } = parseBackup(raw)
    expect(files.map((f) => f.path)).toEqual(['a/y.json', 'b/z.json'])
    expect(ignored).toBe(0)
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('ignora entradas dudosas y cuenta cuántas', () => {
    const raw = JSON.stringify({
      format: 'sonda-backup',
      version: 1,
      files: [
        { path: '../x.json', content: '{}' },
        { path: 'a.json', content: 'no es json' },
        { path: 'ok.json', content: '{}' },
        { path: 'ok.json', content: '{}' },
        { path: 5, content: '{}' },
        null
      ]
    })
    const { files, ignored } = parseBackup(raw)
    expect(files.map((f) => f.path)).toEqual(['ok.json'])
    expect(ignored).toBe(5)
  })

  it('rechaza archivos que no son un backup', () => {
    expect(() => parseBackup('no json')).toThrow('JSON válido')
    expect(() => parseBackup('{"format":"x"}')).toThrow('No es un backup')
    expect(() => parseBackup('{"format":"sonda-backup","version":2,"files":[]}')).toThrow('versión')
    expect(() => parseBackup('{"format":"sonda-backup","version":1}')).toThrow('archivos')
  })
})

describe('planRestore', () => {
  it('no escribe lo que ya existe', () => {
    const files = [
      { path: 'a.json', content: '{}' },
      { path: 'b.json', content: '{}' }
    ]
    const plan = planRestore(files, new Set(['a.json']))
    expect(plan.write.map((f) => f.path)).toEqual(['b.json'])
    expect(plan.skipped).toBe(1)
  })
})
