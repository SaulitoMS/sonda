import { describe, expect, it } from 'vitest'
import { mergeVariables } from './envMerge'
import type { EnvVariable } from './types'

const v = (key: string, value: string, extra: Partial<EnvVariable> = {}): EnvVariable => ({
  id: `id-${key}`,
  key,
  value,
  secret: false,
  enabled: true,
  ...extra
})

describe('mergeVariables', () => {
  it('agrega las variables nuevas y quita filas vacías', () => {
    const r = mergeVariables([v('a', '1'), v('', '')], [v('b', '2')], false)
    expect(r.variables.map((x) => x.key)).toEqual(['a', 'b'])
    expect(r).toMatchObject({ added: 1, updated: 0, skipped: 0 })
  })

  it('sin sobrescribir, las existentes no cambian', () => {
    const r = mergeVariables([v('a', '1')], [v('a', '9')], false)
    expect(r.variables[0].value).toBe('1')
    expect(r.skipped).toBe(1)
  })

  it('sobrescribe conservando id y la marca de secreto', () => {
    const r = mergeVariables([v('a', '1', { secret: true })], [v('a', '9')], true)
    expect(r.variables[0]).toMatchObject({ id: 'id-a', value: '9', secret: true })
    expect(r.updated).toBe(1)
  })

  it('reactiva una variable desactivada al actualizarla', () => {
    const r = mergeVariables([v('a', '1', { enabled: false })], [v('a', '9')], true)
    expect(r.variables[0].enabled).toBe(true)
  })

  it('un valor idéntico cuenta como sin cambios', () => {
    const r = mergeVariables([v('a', '1')], [v('a', '1')], true)
    expect(r).toMatchObject({ added: 0, updated: 0, skipped: 1 })
  })

  it('ignora claves vacías', () => {
    expect(mergeVariables([], [v('  ', 'x')], true).variables).toEqual([])
  })
})
