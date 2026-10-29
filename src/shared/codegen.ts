import { toCurl, type CurlRequest } from './curl'

export type CodeLang = 'curl' | 'fetch' | 'axios' | 'python'

export const CODE_LANGS: { id: CodeLang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'JavaScript (axios)' },
  { id: 'python', label: 'Python (requests)' }
]

// JSON.stringify produce literales de string válidos tanto en JavaScript como en Python
const str = (s: string): string => JSON.stringify(s)

const hasBody = (r: CurlRequest): boolean =>
  r.body.trim() !== '' && r.method !== 'GET' && r.method !== 'HEAD'

const splitUser = (user: string): [string, string] => {
  const i = user.indexOf(':')
  return i === -1 ? [user, ''] : [user.slice(0, i), user.slice(i + 1)]
}

function toFetch(r: CurlRequest): string {
  const headers = r.headers.map((h) => `    ${str(h.key)}: ${str(h.value)}`)
  // btoa deja los {{secretos}} legibles en vez de codificarlos sin resolver
  if (r.user) headers.push(`    "Authorization": "Basic " + btoa(${str(r.user)})`)

  const opts = [`  method: ${str(r.method)}`]
  if (headers.length) opts.push(`  headers: {\n${headers.join(',\n')}\n  }`)
  if (hasBody(r)) opts.push(`  body: ${str(r.body)}`)

  return [
    `const response = await fetch(${str(r.url)}, {`,
    opts.join(',\n'),
    '})',
    '',
    'console.log(response.status)',
    'console.log(await response.text())'
  ].join('\n')
}

function toAxios(r: CurlRequest): string {
  const opts = [`  method: ${str(r.method.toLowerCase())}`, `  url: ${str(r.url)}`]
  if (r.headers.length) {
    const rows = r.headers.map((h) => `    ${str(h.key)}: ${str(h.value)}`)
    opts.push(`  headers: {\n${rows.join(',\n')}\n  }`)
  }
  if (r.user) {
    const [username, password] = splitUser(r.user)
    opts.push(`  auth: { username: ${str(username)}, password: ${str(password)} }`)
  }
  if (hasBody(r)) opts.push(`  data: ${str(r.body)}`)
  // Sin esto axios lanza excepción en cualquier status no 2xx
  opts.push('  validateStatus: () => true')

  return [
    "import axios from 'axios'",
    '',
    'const response = await axios({',
    opts.join(',\n'),
    '})',
    '',
    'console.log(response.status)',
    'console.log(response.data)'
  ].join('\n')
}

function toPython(r: CurlRequest): string {
  const args = [`    ${str(r.method)},`, `    ${str(r.url)},`]
  if (r.headers.length) {
    const rows = r.headers.map((h) => `        ${str(h.key)}: ${str(h.value)},`)
    args.push(`    headers={\n${rows.join('\n')}\n    },`)
  }
  if (r.user) {
    const [username, password] = splitUser(r.user)
    args.push(`    auth=(${str(username)}, ${str(password)}),`)
  }
  if (hasBody(r)) args.push(`    data=${str(r.body)}.encode("utf-8"),`)

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