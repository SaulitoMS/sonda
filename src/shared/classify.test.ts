import { describe, expect, it } from 'vitest'
import { classifyResult } from './classify'
import type { SchemaValidation, SendRequestResult } from './types'

const okRes = (status: number): SendRequestResult => ({
  ok: true,
  status,
  statusText: '',
  headers: {},
  body: '',
  timeMs: 5,
  sizeBytes: 0
})

const val = (v: Partial<SchemaValidation>): SchemaValidation => ({
  verdict: 'valid',
  issues: [],
  truncated: false,
  ...v
})

describe('classifyResult', () => {
  it('falla ante un error de red', () => {
    const r = classifyResult({ ok: false, error: 'ECONNREFUSED', timeMs: 1 }, null)
    expect(r).toEqual({ status: 'fail', detail: 'ECONNREFUSED' })
  })

  it('pasa con schema válido', () => {
    expect(classifyResult(okRes(200), val({ verdict: 'valid' })).status).toBe('pass')
  })

  it('falla con schema inválido y explica el primer error', () => {
    const r = classifyResult(
      okRes(200),
      val({
        verdict: 'invalid',
        issues: [{ path: '$.id', message: 'debe ser integer', severity: 'error' }]
      })
    )
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('$.id')
  })

  it('advierte si el status no está documentado', () => {
    expect(classifyResult(okRes(418), val({ verdict: 'undocumented' })).status).toBe('warn')
  })

  it('sin schema, decide por status', () => {
    expect(classifyResult(okRes(200), null).status).toBe('pass')
    expect(classifyResult(okRes(404), val({ verdict: 'no-schema' })).status).toBe('fail')
  })
})