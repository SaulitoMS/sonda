import { describe, expect, it } from 'vitest'
import { looksLikeCurl, parseCurl, toCurl } from './curl'

describe('looksLikeCurl', () => {
  it('detecta comandos curl', () => {
    expect(looksLikeCurl('curl https://x.com')).toBe(true)
    expect(looksLikeCurl('  CURL -X POST https://x.com')).toBe(true)
    expect(looksLikeCurl('curl')).toBe(true)
  })

  it('rechaza texto que no es curl', () => {
    expect(looksLikeCurl('wget https://x.com')).toBe(false)
    expect(looksLikeCurl('curly https://x.com')).toBe(false)
    expect(looksLikeCurl('https://x.com')).toBe(false)
  })
})

describe('parseCurl', () => {
  it('parsea un GET simple', () => {
    expect(parseCurl('curl https://api.ejemplo.com/users')).toEqual({
      method: 'GET',
      url: 'https://api.ejemplo.com/users',
      headers: [],
      body: '',
      warnings: []
    })
  })

  it('parsea método, headers y body', () => {
    const r = parseCurl(
      `curl -X POST 'https://httpbin.org/post' -H 'Content-Type: application/json' -d '{"nombre":"Sonda"}'`
    )
    expect(r.method).toBe('POST')
    expect(r.url).toBe('https://httpbin.org/post')
    expect(r.headers).toEqual([{ key: 'Content-Type', value: 'application/json' }])
    expect(r.body).toBe('{"nombre":"Sonda"}')
  })

  it('infiere POST cuando hay body y agrega Content-Type de formulario', () => {
    const r = parseCurl('curl https://x.com -d a=1')
    expect(r.method).toBe('POST')
    expect(r.headers).toContainEqual({
      key: 'Content-Type',
      value: 'application/x-www-form-urlencoded'
    })
  })

  it('une varios -d con &', () => {
    expect(parseCurl('curl https://x.com -d a=1 -d b=2').body).toBe('a=1&b=2')
  })

  it('soporta continuaciones de línea con \\', () => {
    const cmd = [
      'curl --request PUT \\',
      "  --url 'https://x.com/1' \\",
      "  --header 'Accept: text/plain'"
    ].join('\n')
    const r = parseCurl(cmd)
    expect(r.method).toBe('PUT')
    expect(r.url).toBe('https://x.com/1')
    expect(r.headers).toEqual([{ key: 'Accept', value: 'text/plain' }])
  })

  it("decodifica strings $'...' como los que genera Chrome", () => {
    const r = parseCurl(String.raw`curl https://x.com -d $'{"n":"Mar\u00eda"}'`)
    expect(r.body).toBe('{"n":"María"}')
  })

  it('convierte -u en un header Authorization Basic', () => {
    const r = parseCurl('curl -u usuario:clave https://x.com')
    expect(r.headers).toContainEqual({
      key: 'Authorization',
      value: `Basic ${btoa('usuario:clave')}`
    })
  })

  it('omite Host y Content-Length con avisos', () => {
    const r = parseCurl(
      `curl 'https://x.com' -H 'Host: x.com' -H 'Content-Length: 5' -H 'Accept: */*'`
    )
    expect(r.headers).toEqual([{ key: 'Accept', value: '*/*' }])
    expect(r.warnings).toHaveLength(2)
  })

  it('-G pasa los datos a la query string', () => {
    const r = parseCurl('curl -G https://x.com/s -d q=hola -d page=2')
    expect(r.method).toBe('GET')
    expect(r.url).toBe('https://x.com/s?q=hola&page=2')
    expect(r.body).toBe('')
  })

  it('--json agrega Content-Type y Accept', () => {
    const r = parseCurl(`curl --json '{"a":1}' https://x.com`)
    expect(r.method).toBe('POST')
    expect(r.body).toBe('{"a":1}')
    expect(r.headers).toEqual([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' }
    ])
  })

  it('codifica --data-urlencode', () => {
    expect(parseCurl(`curl --data-urlencode 'q=hola mundo' https://x.com`).body).toBe(
      'q=hola%20mundo'
    )
  })

  it('ignora flags sin efecto, incluso combinados', () => {
    const r = parseCurl('curl -sSL --compressed https://x.com')
    expect(r.method).toBe('GET')
    expect(r.url).toBe('https://x.com')
  })

  it('-I usa el método HEAD', () => {
    expect(parseCurl('curl -I https://x.com').method).toBe('HEAD')
  })

  it('agrega http:// cuando no hay esquema', () => {
    expect(parseCurl('curl example.com/api').url).toBe('http://example.com/api')
  })

  it('respeta URLs que empiezan con una variable', () => {
    expect(parseCurl(`curl '{{baseUrl}}/pet/1'`).url).toBe('{{baseUrl}}/pet/1')
  })

  it('-F separa campos de texto y archivos en un form-data', () => {
    const r = parseCurl(`curl -F 'name=Ana' -F 'avatar=@/tmp/a.png;type=image/png' https://x.com`)
    expect(r.method).toBe('POST')
    expect(r.body).toBe('')
    expect(r.bodyForm).toEqual({
      mode: 'form-data',
      fields: [
        { key: 'name', value: 'Ana', type: 'text', enabled: true },
        { key: 'avatar', value: '/tmp/a.png', type: 'file', enabled: true }
      ]
    })
    expect(r.warnings).toEqual([])
  })

  it('-F quita las comillas que pone Postman alrededor de la ruta', () => {
    const r = parseCurl(`curl --form 'doc=@"/tmp/mi archivo.pdf"' https://x.com`)
    expect(r.bodyForm?.fields[0]).toMatchObject({ type: 'file', value: '/tmp/mi archivo.pdf' })
  })

  it('--form-string no interpreta @ ni <', () => {
    const r = parseCurl(`curl --form-string 'mail=@ana' https://x.com`)
    expect(r.bodyForm?.fields[0]).toMatchObject({ type: 'text', value: '@ana' })
  })

  it('-F avisa de los campos que no puede importar', () => {
    const r = parseCurl(`curl -F 'a=<in.txt' -F 'sinvalor' https://x.com`)
    expect(r.method).toBe('POST')
    expect(r.bodyForm).toBeUndefined()
    expect(r.warnings).toHaveLength(2)
  })

  describe('errores', () => {
    it('rechaza texto que no empieza con curl', () => {
      expect(() => parseCurl('wget https://x.com')).toThrow(/empezar con "curl"/)
    })

    it('falla si no hay URL', () => {
      expect(() => parseCurl('curl -X POST')).toThrow(/URL/)
    })

    it('falla con comillas sin cerrar', () => {
      expect(() => parseCurl(`curl 'https://x.com`)).toThrow(/comilla sin cerrar/)
    })

    it('falla con métodos no soportados', () => {
      expect(() => parseCurl('curl -X TRACE https://x.com')).toThrow(/no soportado/)
    })
  })
})

describe('toCurl', () => {
  it('genera un GET', () => {
    expect(toCurl({ method: 'GET', url: 'https://x.com', headers: [], body: '' })).toBe(
      "curl --request GET \\\n  --url 'https://x.com'"
    )
  })

  it('incluye headers y body', () => {
    const out = toCurl({
      method: 'POST',
      url: 'https://x.com/users',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{"a":1}'
    })
    expect(out).toContain('--request POST')
    expect(out).toContain("--header 'Content-Type: application/json'")
    expect(out).toContain(`--data-raw '{"a":1}'`)
  })

  it('escapa comillas simples', () => {
    const out = toCurl({ method: 'POST', url: 'https://x.com', headers: [], body: "it's" })
    expect(out).toContain(`--data-raw 'it'\\''s'`)
  })

  it('usa --head para HEAD', () => {
    expect(toCurl({ method: 'HEAD', url: 'https://x.com', headers: [], body: '' })).toMatch(
      /^curl --head/
    )
  })

  it('no envía body en GET', () => {
    const out = toCurl({ method: 'GET', url: 'https://x.com', headers: [], body: '{"a":1}' })
    expect(out).not.toContain('--data-raw')
  })

  it('ida y vuelta: parseCurl(toCurl(x)) devuelve lo mismo', () => {
    const req = {
      method: 'POST' as const,
      url: 'https://x.com/users?x=1',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'X-Id', value: 'abc' }
      ],
      body: `{"name":"O'Neil"}`
    }
    expect(parseCurl(toCurl(req))).toMatchObject(req)
  })
})

describe('toCurl con --user', () => {
  it('exporta las credenciales Basic con --user', () => {
    const out = toCurl({
      method: 'GET',
      url: 'https://x.com',
      headers: [],
      body: '',
      user: 'ana:1234'
    })
    expect(out).toContain("--user 'ana:1234'")
  })
})

describe('toCurl con form-data', () => {
  const formData = [
    { key: 'name', kind: 'text' as const, value: 'Ana' },
    { key: 'avatar', kind: 'file' as const, value: '/tmp/a.png' },
    { key: 'mail', kind: 'text' as const, value: '@ana' }
  ]

  it('genera --form para texto y archivos, y --form-string si el texto empieza con @', () => {
    const out = toCurl({ method: 'POST', url: 'https://x.com', headers: [], body: '', formData })
    expect(out).toContain(`--form 'name=Ana'`)
    expect(out).toContain(`--form 'avatar=@/tmp/a.png'`)
    expect(out).toContain(`--form-string 'mail=@ana'`)
  })

  it('ida y vuelta conserva los campos', () => {
    const out = toCurl({ method: 'POST', url: 'https://x.com', headers: [], body: '', formData })
    const fields = parseCurl(out).bodyForm?.fields.map(({ key, value, type }) => ({
      key,
      value,
      type
    }))
    expect(fields).toEqual([
      { key: 'name', value: 'Ana', type: 'text' },
      { key: 'avatar', value: '/tmp/a.png', type: 'file' },
      { key: 'mail', value: '@ana', type: 'text' }
    ])
  })

  it('no envía form-data en GET', () => {
    const out = toCurl({ method: 'GET', url: 'https://x.com', headers: [], body: '', formData })
    expect(out).not.toContain('--form')
  })
})
