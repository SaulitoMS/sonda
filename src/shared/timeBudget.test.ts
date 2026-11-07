import { describe, expect, it } from 'vitest'
import { applyTimeBudget } from './timeBudget'

const pass = { status: 'pass' as const, detail: '' }

describe('applyTimeBudget', () => {
  it('sin límite (0) no cambia nada', () => {
    expect(applyTimeBudget(pass, 5000, 0)).toBe(pass)
  })

  it('dentro del límite, incluso justo en él, no cambia nada', () => {
    expect(applyTimeBudget(pass, 300, 300)).toBe(pass)
  })

  it('pasar el límite convierte un pass en fail con el detalle', () => {
    expect(applyTimeBudget(pass, 301, 300)).toEqual({
      status: 'fail',
      detail: 'Tardó 301 ms (límite 300 ms)'
    })
  })

  it('un aviso que además es lento falla y conserva el aviso', () => {
    expect(applyTimeBudget({ status: 'warn', detail: 'schema' }, 999, 300)).toEqual({
      status: 'fail',
      detail: 'Tardó 999 ms (límite 300 ms). schema'
    })
  })

  it('lo que ya fallaba se deja como está', () => {
    const failed = { status: 'fail' as const, detail: 'x' }
    expect(applyTimeBudget(failed, 9999, 300)).toBe(failed)
  })
})
