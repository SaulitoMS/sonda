import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'vm'
import { cleanScopeScripts, composeScripts, scriptForPhase } from './scopeScripts'

describe('scopeScripts', () => {
  it('sin scripts devuelve vacío y con uno lo deja tal cual', () => {
    expect(composeScripts([undefined, '  ', null])).toBe('')
    expect(composeScripts([undefined, 'a = 1', ''])).toBe('a = 1')
  })

  it('ejecuta colección, carpeta y petición en orden, aunque repitan const', () => {
    const code = scriptForPhase(
      'pre',
      'const x = 3\nlog.push("req" + x)',
      { pre: 'const x = 2\nlog.push("folder" + x)' },
      { pre: 'const x = 1\nlog.push("col" + x)\n// comentario final' }
    )
    const log: string[] = []
    runInNewContext(code, { log })
    expect(log).toEqual(['col1', 'folder2', 'req3'])
  })

  it('no mezcla la fase pre con la post', () => {
    expect(scriptForPhase('post', 'p', undefined, { pre: 'solo pre' })).toBe('p')
  })

  it('cleanScopeScripts quita lo vacío', () => {
    expect(cleanScopeScripts({ pre: ' ', post: '' })).toBeUndefined()
    expect(cleanScopeScripts({ pre: 'a', post: ' ' })).toEqual({ pre: 'a' })
  })
})
