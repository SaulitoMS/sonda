import { describe, expect, it } from 'vitest'
import { validateFolderName } from './folderName'

describe('validateFolderName', () => {
  it('acepta nombres normales, con espacios y acentos, y recorta los bordes', () => {
    expect(validateFolderName('  pet  ')).toEqual({ ok: true, name: 'pet' })
    expect(validateFolderName('Usuarios y roles')).toEqual({ ok: true, name: 'Usuarios y roles' })
    expect(validateFolderName('Autenticación')).toEqual({ ok: true, name: 'Autenticación' })
  })

  it('rechaza vacío y nombres demasiado largos', () => {
    expect(validateFolderName('   ').ok).toBe(false)
    expect(validateFolderName('x'.repeat(80)).ok).toBe(true)
    expect(validateFolderName('x'.repeat(81)).ok).toBe(false)
  })

  it('rechaza caracteres que no valen en todos los sistemas', () => {
    for (const name of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a|b', 'a\tb']) {
      expect(validateFolderName(name).ok).toBe(false)
    }
  })

  it('rechaza puntos en los extremos y nombres reservados de Windows', () => {
    for (const name of ['.oculta', 'fin.', 'CON', 'nul', 'COM1']) {
      expect(validateFolderName(name).ok).toBe(false)
    }
    expect(validateFolderName('nul2').ok).toBe(true)
  })
})
