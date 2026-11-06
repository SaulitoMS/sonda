import { describe, expect, it } from 'vitest'
import { parseDiff, parseGitStatus } from './git'

const z = (...parts: string[]): string => parts.join('\0') + '\0'

describe('parseGitStatus', () => {
  it('lee la rama y cuántos commits va por delante o por detrás', () => {
    const s = parseGitStatus(z('## main...origin/main [ahead 2, behind 1]'))
    expect(s).toEqual({ branch: 'main', ahead: 2, behind: 1, files: [] })
  })

  it('reconoce un repositorio sin commits y sin remoto', () => {
    expect(parseGitStatus(z('## No commits yet on main')).branch).toBe('main')
    expect(parseGitStatus(z('## dev')).ahead).toBe(0)
    expect(parseGitStatus(z('## HEAD (no branch)')).branch).toBe('HEAD (no branch)')
  })

  it('ramas con puntos y remoto desaparecido', () => {
    expect(parseGitStatus(z('## release/1.2...origin/release/1.2 [gone]')).branch).toBe(
      'release/1.2'
    )
  })

  it('clasifica los cambios y respeta rutas con espacios', () => {
    const s = parseGitStatus(
      z(
        '## main',
        ' M petstore/get pet.json',
        'A  petstore/post-pet.json',
        '?? nueva/otra.json',
        ' D vieja.json',
        'UU choque.json'
      )
    )
    expect(s.files).toEqual([
      { path: 'petstore/get pet.json', change: 'modified', staged: false },
      { path: 'petstore/post-pet.json', change: 'new', staged: true },
      { path: 'nueva/otra.json', change: 'new', staged: false },
      { path: 'vieja.json', change: 'deleted', staged: false },
      { path: 'choque.json', change: 'conflict', staged: true }
    ])
  })

  it('une el renombrado con su ruta anterior', () => {
    const s = parseGitStatus(z('## main', 'R  nuevo.json', 'viejo.json', ' M otro.json'))
    expect(s.files).toEqual([
      { path: 'nuevo.json', change: 'renamed', staged: true, from: 'viejo.json' },
      { path: 'otro.json', change: 'modified', staged: false }
    ])
  })
})

describe('parseDiff', () => {
  const diff = [
    'diff --git a/x.json b/x.json',
    'index 111..222 100644',
    '--- a/x.json',
    '+++ b/x.json',
    '@@ -1,3 +1,3 @@',
    ' {',
    '-  "a": 1',
    '+  "a": 2',
    ' }',
    ''
  ].join('\n')

  it('separa cabecera, bloques, líneas añadidas y quitadas', () => {
    expect(parseDiff(diff).map((l) => l.kind)).toEqual([
      'meta',
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'del',
      'add',
      'context'
    ])
  })

  it('no confunde una línea quitada que empieza con "--" con la cabecera', () => {
    const lines = parseDiff('@@ -1 +1 @@\n--- vieja\n+++ nueva')
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'del', 'add'])
  })
})
