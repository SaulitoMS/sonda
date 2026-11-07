import { describe, expect, it } from 'vitest'
import type { CurlRequest } from './curl'
import { generateCode } from './codegen'

const post: CurlRequest = {
  method: 'POST',
  url: 'https://api.ejemplo.com/users',
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: '{"name":"Sonda","note":"línea\\n\\"dos\\""}'
}

describe('generateCode', () => {
  it('curl delega en toCurl', () => {
    expect(generateCode('curl', post)).toContain('--request POST')
  })

  it('fetch incluye método, headers y body', () => {
    const code = generateCode('fetch', post)
    expect(code).toContain('await fetch("https://api.ejemplo.com/users"')
    expect(code).toContain('method: "POST"')
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('body: ')
  })

  it('fetch omite el body en GET', () => {
    const code = generateCode('fetch', { ...post, method: 'GET' })
    expect(code).not.toContain('body:')
  })

  it('fetch usa btoa para Basic', () => {
    const code = generateCode('fetch', { ...post, user: 'ana:{{pass}}' })
    expect(code).toContain('btoa("ana:{{pass}}")')
  })

  it('axios usa auth separando solo en el primer ":"', () => {
    const code = generateCode('axios', { ...post, user: 'ana:a:b' })
    expect(code).toContain('auth: { username: "ana", password: "a:b" }')
    expect(code).toContain('method: "post"')
  })

  it('python genera requests.request con headers y auth', () => {
    const code = generateCode('python', { ...post, user: 'ana:123' })
    expect(code).toContain('requests.request(')
    expect(code).toContain('auth=("ana", "123")')
    expect(code).toContain('.encode("utf-8")')
  })

  it('el body queda como literal fiel (sin reformatear JSON)', () => {
    const code = generateCode('fetch', post)
    expect(code).toContain(`body: ${JSON.stringify(post.body)}`)
  })
})

describe('generateCode con form-data', () => {
  const form: CurlRequest = {
    method: 'POST',
    url: 'https://api.ejemplo.com/upload',
    headers: [],
    body: '',
    formData: [
      { key: 'name', kind: 'text', value: 'Ana' },
      { key: 'avatar', kind: 'file', value: '/tmp/a.png' }
    ]
  }

  it('fetch arma un FormData y lo envía como body', () => {
    const code = generateCode('fetch', form)
    expect(code).toContain('const form = new FormData()')
    expect(code).toContain('form.append("name", "Ana")')
    expect(code).toContain('openAsBlob("/tmp/a.png")')
    expect(code).toContain('body: form')
  })

  it('axios envía el FormData en data', () => {
    const code = generateCode('axios', form)
    expect(code).toContain('data: form')
    expect(code).toContain("import { openAsBlob } from 'node:fs'")
  })

  it('python manda texto y archivos juntos en files=', () => {
    const code = generateCode('python', form)
    expect(code).toContain('("name", (None, "Ana"))')
    expect(code).toContain('("avatar", ("a.png", open("/tmp/a.png", "rb")))')
  })

  it('no importa openAsBlob si no hay archivos', () => {
    const code = generateCode('fetch', {
      ...form,
      formData: [{ key: 'name', kind: 'text', value: 'Ana' }]
    })
    expect(code).not.toContain('openAsBlob')
  })

  it('no genera form-data en GET', () => {
    expect(generateCode('fetch', { ...form, method: 'GET' })).not.toContain('FormData')
  })
})

describe('generateCode: Go, PHP, C# y PowerShell', () => {
  const basic = { ...post, user: 'ana:123' }
  const form: CurlRequest = {
    method: 'POST',
    url: 'https://api.ejemplo.com/upload',
    headers: [{ key: 'Content-Type', value: 'multipart/form-data' }],
    body: '',
    formData: [
      { key: 'name', kind: 'text', value: 'Ana' },
      { key: 'avatar', kind: 'file', value: '/tmp/a.png' }
    ]
  }

  it('go arma la petición con Basic y solo importa lo que usa', () => {
    const code = generateCode('go', basic)
    expect(code).toContain('http.NewRequest("POST", "https://api.ejemplo.com/users"')
    expect(code).toContain('req.SetBasicAuth("ana", "123")')
    expect(code).toContain('"strings"')
    expect(code).not.toContain('"os"')
  })

  it('go usa multipart.Writer y deja el Content-Type al writer', () => {
    const code = generateCode('go', form)
    expect(code).toContain('writer.WriteField("name", "Ana")')
    expect(code).toContain('writer.CreateFormFile("avatar", "a.png")')
    expect(code).toContain('writer.FormDataContentType()')
    expect(code).not.toContain('multipart/form-data"')
  })

  it('php escapa las comillas simples y no interpola $', () => {
    const code = generateCode('php', {
      ...post,
      headers: [{ key: 'X-Tok', value: "it's $a" }]
    })
    expect(code).toContain("'X-Tok: it\\'s $a'")
    expect(code).toContain("CURLOPT_CUSTOMREQUEST => 'POST'")
  })

  it('php usa CURLFile en multipart y NOBODY en HEAD', () => {
    expect(generateCode('php', form)).toContain("new CURLFile('/tmp/a.png', '', 'a.png')")
    expect(generateCode('php', { ...post, method: 'HEAD' })).toContain('CURLOPT_NOBODY => true')
  })

  it('csharp pone el Content-Type en el contenido, no en los headers de la petición', () => {
    const code = generateCode('csharp', post)
    expect(code).toContain('request.Content.Headers.TryAddWithoutValidation("Content-Type"')
    expect(code).not.toContain('request.Headers.TryAddWithoutValidation("Content-Type"')
  })

  it('csharp usa MultipartFormDataContent con archivos', () => {
    const code = generateCode('csharp', form)
    expect(code).toContain('new MultipartFormDataContent()')
    expect(code).toContain('File.OpenRead("/tmp/a.png")')
  })

  it('powershell duplica las comillas simples y usa -Form en multipart', () => {
    const code = generateCode('powershell', {
      ...post,
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'X-Tok', value: "it's" }
      ]
    })
    expect(code).toContain("'X-Tok' = 'it''s'")
    expect(code).toContain('-ContentType')
    expect(generateCode('powershell', form)).toContain('-Form $form')
  })
})

describe('generateCode con Digest', () => {
  const digest: CurlRequest = {
    method: 'GET',
    url: 'https://api.ejemplo.com/me',
    headers: [],
    body: '',
    user: 'ana:secreta',
    digest: true
  }

  it('cURL, HTTPie, PHP y Python lo firman de forma nativa', () => {
    expect(generateCode('curl', digest)).toContain('--digest')
    expect(generateCode('httpie', digest)).toContain('--auth-type digest')
    expect(generateCode('php', digest)).toContain('CURLOPT_HTTPAUTH => CURLAUTH_DIGEST')
    const py = generateCode('python', digest)
    expect(py).toContain('from requests.auth import HTTPDigestAuth')
    expect(py).toContain('auth=HTTPDigestAuth("ana", "secreta")')
  })

  it('wget no salta el desafío del servidor', () => {
    expect(generateCode('wget', digest)).not.toContain('--auth-no-challenge')
    expect(generateCode('wget', { ...digest, digest: false })).toContain('--auth-no-challenge')
  })

  it('los demás lenguajes avisan y no mandan las credenciales como Basic', () => {
    const out = generateCode('fetch', digest)
    expect(out.startsWith('// Auth Digest')).toBe(true)
    expect(out).not.toContain('Basic')
    expect(out).not.toContain('secreta')
    expect(generateCode('ruby', digest).startsWith('# Auth Digest')).toBe(true)
  })

  it('sin digest, Basic sigue igual', () => {
    expect(generateCode('curl', { ...digest, digest: undefined })).not.toContain('--digest')
  })
})
