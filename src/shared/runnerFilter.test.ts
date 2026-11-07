import { describe, expect, it } from 'vitest'
import { passesFilter, splitTerms } from './runnerFilter'

describe('splitTerms', () => {
  it('separa por coma, recorta y pasa a minúsculas', () => {
    expect(splitTerms(' Login, ,USERS ')).toEqual(['login', 'users'])
    expect(splitTerms('')).toEqual([])
  })
})

describe('passesFilter', () => {
  it('sin filtros entra todo', () => {
    expect(passesFilter('pet GET find', '', '')).toBe(true)
  })

  it('include acepta varios términos (basta con uno)', () => {
    expect(passesFilter('pet GET find', 'find, users', '')).toBe(true)
    expect(passesFilter('pet GET find', 'users', '')).toBe(false)
  })

  it('exclude gana sobre include', () => {
    expect(passesFilter('auth POST login', 'auth', 'login')).toBe(false)
    expect(passesFilter('pet DELETE x', '', 'delete, logout')).toBe(false)
    expect(passesFilter('auth POST login', 'login', 'logout')).toBe(true)
  })
})
