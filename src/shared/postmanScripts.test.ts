import { describe, expect, it } from 'vitest'
import { parsePostmanCollection } from './postman'

const collection = {
  info: { name: 'Demo' },
  event: [{ listen: 'prerequest', script: { exec: ['// global'] } }],
  item: [
    {
      name: 'Carpeta',
      event: [{ listen: 'test', script: { exec: ['pm.test("f")'] } }],
      item: [
        {
          name: 'Login',
          event: [
            {
              listen: 'prerequest',
              script: { exec: ['pm.environment.set("a", 1);', 'console.log("x");'] }
            },
            {
              listen: 'test',
              script: {
                exec: ['pm.test("ok", () => {', '  pm.response.to.have.status(200);', '});']
              }
            }
          ],
          request: { method: 'POST', url: { raw: 'https://x.test/login' }, header: [] }
        },
        { name: 'SinScript', request: { method: 'GET', url: 'https://x.test/a' } },
        {
          name: 'Vacio',
          event: [{ listen: 'test', script: { exec: ['   '] } }],
          request: { method: 'GET', url: 'https://x.test/b' }
        }
      ]
    },
    {
      name: 'Suelta',
      event: [{ listen: 'test', script: { exec: 'pm.test("s", () => {})' } }],
      request: { method: 'GET', url: 'https://x.test/c' }
    }
  ]
}

describe('scripts al importar una colección de Postman', () => {
  const parsed = parsePostmanCollection(collection)
  const get = (name: string): (typeof parsed.requests)[number]['request'] =>
    parsed.requests.find((r) => r.request.name === name)!.request

  it('importa pre-request y tests de cada petición', () => {
    expect(get('Login').preScript).toBe('pm.environment.set("a", 1);\nconsole.log("x");')
    expect(get('Login').postScript).toBe(
      'pm.test("ok", () => {\n  pm.response.to.have.status(200);\n});'
    )
    expect(get('Suelta').postScript).toBe('pm.test("s", () => {})')
  })

  it('no agrega scripts a las peticiones sin ellos o con scripts vacíos', () => {
    expect(get('SinScript').preScript).toBeUndefined()
    expect('postScript' in get('Vacio')).toBe(false)
  })

  it('avisa de lo que se importó y de lo que no (colección y carpetas)', () => {
    expect(parsed.warnings).toHaveLength(2)
    expect(parsed.warnings[0]).toContain('2 petición(es)')
    expect(parsed.warnings[1]).toContain('colección o de carpeta')
  })
})
