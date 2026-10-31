import { describe, expect, it } from 'vitest'
import { buildFuzzCases, classifyFuzzResponse, type FuzzCase, type FuzzPlan } from './fuzz'
import { validateRequestBody } from './validate'

const schema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 10 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 120 },
    status: { type: 'string', enum: ['active', 'inactive'] },
    nick: { type: 'string', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 }
  }
}

const baseBody = JSON.stringify({
  name: 'Sonda',
  email: 'a@b.com',
  age: 30,
  status: 'active',
  nick: 'son',
  tags: ['x']
})

const plan = (over: Partial<Parameters<typeof buildFuzzCases>[0]> = {}): FuzzPlan =>
  buildFuzzCases({ schema, method: 'POST', baseBody, ...over })

const find = (path: string, category: string): FuzzCase | undefined =>
  plan().cases.find((c) => c.path === path && c.category === category)

describe('buildFuzzCases: casos que no se pueden generar', () => {
  it('GET y HEAD no llevan body', () => {
    expect(plan({ method: 'GET' }).cases).toHaveLength(0)
    expect(plan({ method: 'head' }).error).toContain('HEAD')
  })

  it('sin schema avisa que hay que importar de OpenAPI', () => {
    expect(plan({ schema: null }).error).toContain('schema')
    expect(plan({ schema: {} }).cases).toHaveLength(0)
  })

  it('un body base que no es JSON da error', () => {
    expect(plan({ baseBody: '{"a":' }).error).toContain('JSON')
  })

  it('un body base que no es objeto ni array da error', () => {
    expect(plan({ baseBody: '42' }).error).toContain('objeto o un array')
  })
})

describe('buildFuzzCases: casos generados', () => {
  it('incluye body vacío y JSON malformado', () => {
    const titles = plan().cases.map((c) => c.title)
    expect(titles).toContain('Body vacío')
    expect(titles).toContain('JSON malformado')
  })

  it('quita cada campo requerido', () => {
    const name = find('$.name', 'requerido')
    expect(name).toBeDefined()
    expect('name' in JSON.parse(name!.body)).toBe(false)
    expect(find('$.email', 'requerido')).toBeDefined()
    // age no es requerido: quitarlo es válido y no debe generar caso
    expect(find('$.age', 'requerido')).toBeUndefined()
  })

  it('cambia el tipo de cada campo', () => {
    expect(JSON.parse(find('$.age', 'tipo')!.body).age).toBeDefined()
    const typeCases = plan().cases.filter((c) => c.path === '$.name' && c.category === 'tipo')
    expect(JSON.parse(typeCases[0].body).name).toBe(12345)
  })

  it('sale del rango numérico', () => {
    const ages = plan()
      .cases.filter((c) => c.path === '$.age' && c.category === 'rango')
      .map((c) => JSON.parse(c.body).age)
    expect(ages).toContain(121)
    expect(ages).toContain(-1)
  })

  it('usa un valor fuera del enum', () => {
    expect(JSON.parse(find('$.status', 'enum')!.body).status).toBe('__valor_invalido__')
  })

  it('rompe el formato del email', () => {
    expect(JSON.parse(find('$.email', 'formato')!.body).email).toBe('no-es-un-email')
  })

  it('excede longitudes de string y de array', () => {
    const lengths = plan().cases.filter((c) => c.category === 'longitud')
    const longName = lengths.find((c) => c.path === '$.name' && JSON.parse(c.body).name.length > 10)
    expect(JSON.parse(longName!.body).name).toHaveLength(11)
    const tooMany = lengths.find((c) => c.path === '$.tags')
    expect(JSON.parse(tooMany!.body).tags).toHaveLength(4)
  })

  it('no manda null a un campo nullable, pero sí a los demás', () => {
    expect(find('$.nick', 'nulo')).toBeUndefined()
    expect(find('$.name', 'nulo')).toBeDefined()
  })

  it('baja por los items de los arrays', () => {
    const nested = plan().cases.find((c) => c.path === '$.tags[0]' && c.category === 'tipo')
    expect(JSON.parse(nested!.body).tags[0]).toBe(12345)
  })

  it('todos los casos (salvo el body vacío) violan realmente el schema', () => {
    for (const c of plan().cases) {
      if (c.body === '') continue
      const verdict = validateRequestBody({ schema, method: 'POST', body: c.body })?.verdict
      expect(verdict).toBe('invalid')
    }
  })

  it('no repite bodies ni ids y respeta el tope', () => {
    const { cases } = plan()
    expect(new Set(cases.map((c) => c.body)).size).toBe(cases.length)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    expect(cases.length <= 80).toBe(true)
  })

  it('ordena: estructura primero', () => {
    expect(plan().cases[0].category).toBe('estructura')
  })

  it('une allOf para encontrar los requeridos', () => {
    const merged = {
      allOf: [
        { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
        { type: 'object', properties: { label: { type: 'string' } } }
      ]
    }
    const result = buildFuzzCases({
      schema: merged,
      method: 'POST',
      baseBody: '{"id":1,"label":"x"}'
    })
    expect(result.cases.some((c) => c.path === '$.id' && c.category === 'requerido')).toBe(true)
  })
})

describe('classifyFuzzResponse', () => {
  it('interpreta el status', () => {
    expect(classifyFuzzResponse(400)).toBe('rechazada')
    expect(classifyFuzzResponse(422)).toBe('rechazada')
    expect(classifyFuzzResponse(200)).toBe('aceptada')
    expect(classifyFuzzResponse(201)).toBe('aceptada')
    expect(classifyFuzzResponse(500)).toBe('fallo')
    expect(classifyFuzzResponse(503)).toBe('fallo')
  })

  it('401, 403, 404, 405, 429 y la falta de respuesta no son concluyentes', () => {
    for (const s of [401, 403, 404, 405, 429, null]) {
      expect(classifyFuzzResponse(s)).toBe('dudosa')
    }
  })
})
