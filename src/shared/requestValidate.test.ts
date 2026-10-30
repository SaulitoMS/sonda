import { describe, expect, it } from 'vitest'
import { classifyResult } from './classify'
import type { JsonSchema, SchemaValidation, SendRequestResult } from './types'
import { validateRequestBody } from './validate'

const petSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'integer', readOnly: true },
    name: { type: 'string', minLength: 2 },
    status: { type: 'string', enum: ['available', 'sold'] },
    tags: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } }
  }
}

const run = (
  body: unknown,
  method = 'POST',
  schema: JsonSchema | null = petSchema
): SchemaValidation | null =>
  validateRequestBody({
    schema,
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })

describe('validateRequestBody', () => {
  it('no valida sin schema ni en métodos sin body', () => {
    expect(run({ name: 'x' }, 'POST', null)).toBeNull()
    expect(run({ name: 'x' }, 'POST', {})).toBeNull()
    expect(run({ name: 'x' }, 'GET')).toBeNull()
    expect(run({ name: 'x' }, 'head')).toBeNull()
  })

  it('un body correcto es válido', () => {
    expect(run({ name: 'Rex', status: 'sold' })?.verdict).toBe('valid')
  })

  it('no exige los campos readOnly aunque estén en required', () => {
    // "id" es required y readOnly: el cliente no tiene que mandarlo
    expect(run({ name: 'Rex' })?.verdict).toBe('valid')
  })

  it('reporta campo requerido ausente con su ruta', () => {
    const v = run({ status: 'sold' })
    expect(v?.verdict).toBe('invalid')
    expect(v?.issues).toEqual([
      { path: '$.name', message: 'Campo requerido ausente', severity: 'error' }
    ])
  })

  it('reporta tipos y enums incorrectos, incluso anidados', () => {
    const v = run({ name: 'R', status: 'lost', tags: [{ id: 'uno' }] })
    expect(v?.verdict).toBe('invalid')
    const paths = v?.issues.map((i) => i.path)
    expect(paths).toContain('$.name')
    expect(paths).toContain('$.status')
    expect(paths).toContain('$.tags[0].id')
  })

  it('los campos no documentados son advertencia, no error', () => {
    const v = run({ name: 'Rex', color: 'negro' })
    expect(v?.verdict).toBe('valid')
    expect(v?.issues[0]).toMatchObject({ path: '$.color', severity: 'warning' })
  })

  it('un body vacío se omite y uno que no es JSON es inválido', () => {
    expect(run('   ')?.verdict).toBe('skipped')
    const bad = run('{ name: ')
    expect(bad?.verdict).toBe('invalid')
    expect(bad?.issues[0].message).toContain('JSON')
  })

  it('no modifica el schema original', () => {
    const copy = JSON.stringify(petSchema)
    run({ name: 'Rex' })
    expect(JSON.stringify(petSchema)).toBe(copy)
  })
})

describe('classifyResult con validación del request', () => {
  const ok: SendRequestResult = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '',
    timeMs: 5,
    sizeBytes: 0
  }
  const badRequest = run({ status: 'sold' })

  it('si todo salió bien pero el body enviado era inválido, avisa (warn)', () => {
    const v = classifyResult(ok, null, [], badRequest)
    expect(v.status).toBe('warn')
    expect(v.detail).toContain('$.name')
  })

  it('un fallo real sigue siendo fail', () => {
    const failed: SendRequestResult = { ok: false, error: 'ECONNREFUSED', timeMs: 1 }
    expect(classifyResult(failed, null, [], badRequest).status).toBe('fail')
  })

  it('un request válido o ausente no cambia el resultado', () => {
    expect(classifyResult(ok, null, [], run({ name: 'Rex' })).status).toBe('pass')
    expect(classifyResult(ok, null, [], null).status).toBe('pass')
  })
})
