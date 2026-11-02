import { toCurl, type CurlRequest } from './curl'
import type { FormPart } from './types'

export type CodeLang = 'curl' | 'fetch' | 'axios' | 'python' | 'go' | 'php' | 'csharp' | 'powershell'

export const CODE_LANGS: { id: CodeLang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'JavaScript (axios)' },
  { id: 'python', label: 'Python (requests)' },
  { id: 'go', label: 'Go (net/http)' },
  { id: 'php', label: 'PHP (cURL)' },
  { id: 'csharp', label: 'C# (HttpClient)' },
  { id: 'powershell', label: 'PowerShell (Invoke-WebRequest)' }
]

// JSON.stringify produce literales de string válidos tanto en JavaScript como en Python
const str = (s: string): string => JSON.stringify(s)

const canSend = (r: CurlRequest): boolean => r.method !== 'GET' && r.method !== 'HEAD'

const hasBody = (r: CurlRequest): boolean => r.body.trim() !== '' && canSend(r)

/** Campos del multipart que realmente se enviarían (vacío si no hay form-data o el método no lleva body) */
const formParts = (r: CurlRequest): FormPart[] => (canSend(r) ? (r.formData ?? []) : [])

const hasFile = (parts: FormPart[]): boolean => parts.some((p) => p.kind === 'file')

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path

const splitUser = (user: string): [string, string] => {
  const i = user.indexOf(':')
  return i === -1 ? [user, ''] : [user.slice(0, i), user.slice(i + 1)]
}

/** FormData nativo (Node 20+ y navegadores). Los archivos se leen del disco con openAsBlob */
const formDataLines = (parts: FormPart[]): string[] => [
  'const form = new FormData()',
  ...parts.map((p) =>
    p.kind === 'file'
      ? `form.append(${str(p.key)}, await openAsBlob(${str(p.value)}), ${str(fileName(p.value))})`
      : `form.append(${str(p.key)}, ${str(p.value)})`
  )
]

function toFetch(r: CurlRequest): string {
  const parts = formParts(r)
  const headers = r.headers.map((h) => `    ${str(h.key)}: ${str(h.value)}`)
  // btoa deja los {{secretos}} legibles en vez de codificarlos sin resolver
  if (r.user) headers.push(`    "Authorization": "Basic " + btoa(${str(r.user)})`)

  const opts = [`  method: ${str(r.method)}`]
  if (headers.length) opts.push(`  headers: {\n${headers.join(',\n')}\n  }`)
  // Con FormData fetch pone solo el Content-Type con su boundary
  if (parts.length) opts.push('  body: form')
  else if (hasBody(r)) opts.push(`  body: ${str(r.body)}`)

  const lines: string[] = []
  if (hasFile(parts)) lines.push("import { openAsBlob } from 'node:fs'", '')
  if (parts.length) lines.push(...formDataLines(parts), '')
  lines.push(
    `const response = await fetch(${str(r.url)}, {`,
    opts.join(',\n'),
    '})',
    '',
    'console.log(response.status)',
    'console.log(await response.text())'
  )
  return lines.join('\n')
}

function toAxios(r: CurlRequest): string {
  const parts = formParts(r)
  const opts = [`  method: ${str(r.method.toLowerCase())}`, `  url: ${str(r.url)}`]
  if (r.headers.length) {
    const rows = r.headers.map((h) => `    ${str(h.key)}: ${str(h.value)}`)
    opts.push(`  headers: {\n${rows.join(',\n')}\n  }`)
  }
  if (r.user) {
    const [username, password] = splitUser(r.user)
    opts.push(`  auth: { username: ${str(username)}, password: ${str(password)} }`)
  }
  if (parts.length) opts.push('  data: form')
  else if (hasBody(r)) opts.push(`  data: ${str(r.body)}`)
  // Sin esto axios lanza excepción en cualquier status no 2xx
  opts.push('  validateStatus: () => true')

  const lines = ["import axios from 'axios'"]
  if (hasFile(parts)) lines.push("import { openAsBlob } from 'node:fs'")
  lines.push('')
  if (parts.length) lines.push(...formDataLines(parts), '')
  lines.push(
    'const response = await axios({',
    opts.join(',\n'),
    '})',
    '',
    'console.log(response.status)',
    'console.log(response.data)'
  )
  return lines.join('\n')
}

function toPython(r: CurlRequest): string {
  const parts = formParts(r)
  const args = [`    ${str(r.method)},`, `    ${str(r.url)},`]
  if (r.headers.length) {
    const rows = r.headers.map((h) => `        ${str(h.key)}: ${str(h.value)},`)
    args.push(`    headers={\n${rows.join('\n')}\n    },`)
  }
  if (r.user) {
    const [username, password] = splitUser(r.user)
    args.push(`    auth=(${str(username)}, ${str(password)}),`)
  }
  if (parts.length) {
    // Todo va en files=: es la forma de que requests envíe multipart aunque no haya archivos
    const rows = parts.map((p) =>
      p.kind === 'file'
        ? `        (${str(p.key)}, (${str(fileName(p.value))}, open(${str(p.value)}, "rb"))),`
        : `        (${str(p.key)}, (None, ${str(p.value)})),`
    )
    args.push(`    files=[\n${rows.join('\n')}\n    ],`)
  } else if (hasBody(r)) {
    args.push(`    data=${str(r.body)}.encode("utf-8"),`)
  }

  return [
    'import requests',
    '',
    'response = requests.request(',
    args.join('\n'),
    ')',
    '',
    'print(response.status_code)',
    'print(response.text)'
  ].join('\n')
}

/** Literal entre comillas simples de PHP: no interpola `$` ni `{$`, solo se escapan \ y ' */
const phpStr = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Literal entre comillas simples de PowerShell. Las comillas tipográficas también cierran la cadena */
const psStr = (s: string): string => `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, (m) => m + m)}'`

const isContentType = (h: { key: string }): boolean => h.key.toLowerCase() === 'content-type'

function toGo(r: CurlRequest): string {
  const parts = formParts(r)
  const body = parts.length === 0 && hasBody(r)
  const files = parts.filter((p) => p.kind === 'file')

  const imports = ['fmt', 'io', 'net/http']
  if (parts.length) imports.push('bytes', 'mime/multipart')
  if (files.length) imports.push('os')
  if (body) imports.push('strings')
  imports.sort()

  const main: string[] = []
  let bodyArg = 'nil'
  if (parts.length) {
    main.push('\tvar buf bytes.Buffer', '\twriter := multipart.NewWriter(&buf)')
    parts.forEach((p, i) => {
      if (p.kind === 'file') {
        main.push(
          `\tfile${i}, err := os.Open(${str(p.value)})`,
          '\tif err != nil {',
          '\t\tpanic(err)',
          '\t}',
          `\tdefer file${i}.Close()`,
          `\tpart${i}, _ := writer.CreateFormFile(${str(p.key)}, ${str(fileName(p.value))})`,
          `\t_, _ = io.Copy(part${i}, file${i})`
        )
      } else {
        main.push(`\t_ = writer.WriteField(${str(p.key)}, ${str(p.value)})`)
      }
    })
    main.push('\twriter.Close()', '')
    bodyArg = '&buf'
  } else if (body) {
    bodyArg = `strings.NewReader(${str(r.body)})`
  }

  main.push(
    `\treq, err := http.NewRequest(${str(r.method)}, ${str(r.url)}, ${bodyArg})`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}'
  )
  for (const h of r.headers) {
    // Con multipart el Content-Type lo pone el writer (lleva el boundary)
    if (parts.length && isContentType(h)) continue
    main.push(`\treq.Header.Set(${str(h.key)}, ${str(h.value)})`)
  }
  if (parts.length) main.push('\treq.Header.Set("Content-Type", writer.FormDataContentType())')
  if (r.user) {
    const [username, password] = splitUser(r.user)
    main.push(`\treq.SetBasicAuth(${str(username)}, ${str(password)})`)
  }
  main.push(
    '',
    '\tres, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer res.Body.Close()',
    '',
    '\tout, _ := io.ReadAll(res.Body)',
    '\tfmt.Println(res.StatusCode)',
    '\tfmt.Println(string(out))'
  )

  return [
    'package main',
    '',
    'import (',
    ...imports.map((i) => `\t"${i}"`),
    ')',
    '',
    'func main() {',
    ...main,
    '}'
  ].join('\n')
}

function toPhp(r: CurlRequest): string {
  const parts = formParts(r)
  const opts = [`    CURLOPT_URL => ${phpStr(r.url)},`]
  // En HEAD, sin NOBODY cURL se queda esperando un body que nunca llega
  if (r.method === 'HEAD') opts.push('    CURLOPT_NOBODY => true,')
  else opts.push(`    CURLOPT_CUSTOMREQUEST => ${phpStr(r.method)},`)
  opts.push('    CURLOPT_RETURNTRANSFER => true,')

  const headers = parts.length ? r.headers.filter((h) => !isContentType(h)) : r.headers
  if (headers.length) {
    const rows = headers.map((h) => `        ${phpStr(`${h.key}: ${h.value}`)},`)
    opts.push(`    CURLOPT_HTTPHEADER => [\n${rows.join('\n')}\n    ],`)
  }
  if (r.user) opts.push(`    CURLOPT_USERPWD => ${phpStr(r.user)},`)
  if (parts.length) {
    // Con un array, cURL arma el multipart solo (y pone el boundary)
    const rows = parts.map((p) =>
      p.kind === 'file'
        ? `        ${phpStr(p.key)} => new CURLFile(${phpStr(p.value)}, '', ${phpStr(fileName(p.value))}),`
        : `        ${phpStr(p.key)} => ${phpStr(p.value)},`
    )
    opts.push(`    CURLOPT_POSTFIELDS => [\n${rows.join('\n')}\n    ],`)
  } else if (hasBody(r)) {
    opts.push(`    CURLOPT_POSTFIELDS => ${phpStr(r.body)},`)
  }

  return [
    '<?php',
    '',
    '$ch = curl_init();',
    'curl_setopt_array($ch, [',
    ...opts,
    ']);',
    '',
    '$response = curl_exec($ch);',
    'if ($response === false) {',
    '    die(curl_error($ch));',
    '}',
    '',
    'echo curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;',
    'echo $response . PHP_EOL;',
    'curl_close($ch);'
  ].join('\n')
}

function toCSharp(r: CurlRequest): string {
  const parts = formParts(r)
  const lines = [
    'using System;',
    'using System.IO;',
    'using System.Net.Http;',
    'using System.Net.Http.Headers;',
    'using System.Text;',
    '',
    'using var client = new HttpClient();',
    `using var request = new HttpRequestMessage(new HttpMethod(${str(r.method)}), ${str(r.url)});`
  ]

  const contentType = parts.length ? undefined : r.headers.find(isContentType)
  for (const h of r.headers) {
    if (isContentType(h)) continue
    // Los headers de contenido (Content-Length…) los rechaza sin error: los pone HttpClient
    lines.push(`request.Headers.TryAddWithoutValidation(${str(h.key)}, ${str(h.value)});`)
  }
  if (r.user) {
    lines.push(
      `request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(${str(r.user)})));`
    )
  }

  if (parts.length) {
    lines.push('', 'var form = new MultipartFormDataContent();')
    for (const p of parts) {
      lines.push(
        p.kind === 'file'
          ? `form.Add(new StreamContent(File.OpenRead(${str(p.value)})), ${str(p.key)}, ${str(fileName(p.value))});`
          : `form.Add(new StringContent(${str(p.value)}), ${str(p.key)});`
      )
    }
    lines.push('request.Content = form;')
  } else if (hasBody(r)) {
    lines.push('', `request.Content = new StringContent(${str(r.body)}, Encoding.UTF8);`)
    if (contentType) {
      lines.push(
        'request.Content.Headers.Remove("Content-Type");',
        `request.Content.Headers.TryAddWithoutValidation("Content-Type", ${str(contentType.value)});`
      )
    }
  }

  lines.push(
    '',
    'using var response = await client.SendAsync(request);',
    'Console.WriteLine((int)response.StatusCode);',
    'Console.WriteLine(await response.Content.ReadAsStringAsync());'
  )
  return lines.join('\n')
}

function toPowerShell(r: CurlRequest): string {
  const parts = formParts(r)
  const contentType = parts.length ? undefined : r.headers.find(isContentType)
  const headers = r.headers
    .filter((h) => !isContentType(h))
    .map((h) => [psStr(h.key), psStr(h.value)])
  if (r.user) {
    headers.push([
      "'Authorization'",
      `('Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(${psStr(r.user)})))`
    ])
  }

  const lines: string[] = []
  const args = [`-Method ${psStr(r.method)}`, `-Uri ${psStr(r.url)}`]
  if (headers.length) {
    lines.push('$headers = @{', ...headers.map(([k, v]) => `    ${k} = ${v}`), '}', '')
    args.push('-Headers $headers')
  }
  if (parts.length) {
    // -Form necesita PowerShell 7+
    lines.push(
      '$form = @{',
      ...parts.map((p) =>
        p.kind === 'file'
          ? `    ${psStr(p.key)} = Get-Item -Path ${psStr(p.value)}`
          : `    ${psStr(p.key)} = ${psStr(p.value)}`
      ),
      '}',
      ''
    )
    args.push('-Form $form')
  } else if (hasBody(r)) {
    if (contentType) args.push(`-ContentType ${psStr(contentType.value)}`)
    args.push(`-Body ${psStr(r.body)}`)
  }
  // Sin esto PowerShell lanza excepción en cualquier status no 2xx (requiere PowerShell 7+)
  args.push('-SkipHttpErrorCheck')

  lines.push(
    `$response = Invoke-WebRequest ${args.join(' ')}`,
    '',
    '$response.StatusCode',
    '$response.Content'
  )
  return lines.join('\n')
}

export function generateCode(lang: CodeLang, request: CurlRequest): string {
  switch (lang) {
    case 'curl':
      return toCurl(request)
    case 'fetch':
      return toFetch(request)
    case 'axios':
      return toAxios(request)
    case 'python':
      return toPython(request)
    case 'go':
      return toGo(request)
    case 'php':
      return toPhp(request)
    case 'csharp':
      return toCSharp(request)
    case 'powershell':
      return toPowerShell(request)
  }
}