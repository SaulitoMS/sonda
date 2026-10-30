import { toCurl, type CurlRequest } from './curl'
import type { FormPart } from './types'

export type CodeLang = 'curl' | 'fetch' | 'axios' | 'python'

export const CODE_LANGS: { id: CodeLang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'JavaScript (axios)' },
  { id: 'python', label: 'Python (requests)' }
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
  }
}
