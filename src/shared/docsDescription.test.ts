import { describe, expect, it } from 'vitest'
import { buildMarkdownDocs } from './docsExport'

describe('buildMarkdownDocs con descripción', () => {
  it('pone la descripción después de la Base URL y antes del índice', () => {
    const md = buildMarkdownDocs('API', 'http://x', [], '  Hola **mundo**\n\nSegundo  ')
    expect(md).toContain('**Base URL:** `http://x`\n\nHola **mundo**\n\nSegundo\n\n0 peticiones.')
    expect(md.indexOf('Hola')).toBeLessThan(md.indexOf('## Índice'))
  })

  it('sin descripción el documento queda igual que antes', () => {
    expect(buildMarkdownDocs('API', undefined, [])).toBe('# API\n\n0 peticiones.\n\n## Índice\n')
  })
})
