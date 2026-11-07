import { sampleFromSchema } from './mock'
import type { SavedRequest } from './types'

export interface DocsFile {
  /** Ruta relativa a la colección, con "/" (ej: "pet/get-pet.json" o "get-pet.json") */
  path: string
  request: SavedRequest
}

const SENSITIVE = /authorization|cookie|api[-_]?key|token|secret|password/i

const AUTH_LABEL: Record<string, string> = {
  bearer: 'Bearer token',
  basic: 'Basic',
  apikey: 'API Key',
  oauth2: 'OAuth 2.0 (client credentials)'
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function requestToMarkdown(req: SavedRequest): string[] {
  const out: string[] = [
    `### ${req.method} ${req.name}`,
    '',
    '```http',
    `${req.method} ${req.url}`,
    '```',
    ''
  ]

  if (req.description?.trim()) out.push(req.description.trim(), '')

  const auth = req.auth
  if (auth && auth.type !== 'none') {
    const label =
      auth.type === 'inherit'
        ? 'heredada de la colección o carpeta'
        : (AUTH_LABEL[auth.type] ?? auth.type)
    out.push(`**Autenticación:** ${label}`, '')
  }

  const headers = req.headers.filter((h) => h.enabled && h.key.trim())
  if (headers.length > 0) {
    out.push('**Headers**', '', '| Nombre | Valor |', '| --- | --- |')
    for (const h of headers) {
      const value = SENSITIVE.test(h.key) ? '`<oculto>`' : `\`${cell(h.value)}\``
      out.push(`| ${cell(h.key.trim())} | ${value} |`)
    }
    out.push('')
  }

  const form = req.bodyForm
  if (form && form.mode !== 'raw') {
    const fields = form.fields.filter((f) => f.enabled && f.key.trim())
    if (fields.length > 0) {
      out.push(`**Body** (${form.mode})`, '', '| Campo | Tipo | Valor |', '| --- | --- | --- |')
      for (const f of fields) {
        const type = f.type === 'file' ? 'archivo' : 'texto'
        out.push(`| ${cell(f.key.trim())} | ${type} | \`${cell(f.value)}\` |`)
      }
      out.push('')
    }
  } else if (req.body.trim()) {
    let lang = ''
    try {
      JSON.parse(req.body)
      lang = 'json'
    } catch {
      // no es JSON: se muestra como texto plano
    }
    out.push('**Body**', '', '```' + lang, req.body.trim(), '```', '')
  }

  const schemas = req.responseSchemas
  if (schemas && Object.keys(schemas).length > 0) {
    out.push('**Respuestas**', '')
    for (const [status, schema] of Object.entries(schemas)) {
      if (schema === null) {
        out.push(`- \`${status}\`: sin body JSON`)
        continue
      }
      out.push(`- \`${status}\`:`, '', '  ```json')
      const example = JSON.stringify(sampleFromSchema(schema), null, 2) ?? ''
      out.push(...example.split('\n').map((line) => `  ${line}`), '  ```')
    }
    out.push('')
  }

  return out
}

/**
 * Genera la documentación de una colección en Markdown: un índice y, por cada petición,
 * método, URL, auth, headers, body y ejemplos de respuesta sacados de los schemas.
 * Los headers sensibles (Authorization, Cookie, API keys…) salen ocultos.
 */
export function buildMarkdownDocs(
  name: string,
  baseUrl: string | undefined,
  files: DocsFile[],
  description?: string
): string {
  const byName = (a: DocsFile, b: DocsFile): number => a.request.name.localeCompare(b.request.name)
  const folders = new Map<string, DocsFile[]>()
  const root: DocsFile[] = []

  for (const file of files) {
    const slash = file.path.indexOf('/')
    if (slash === -1) root.push(file)
    else {
      const folder = file.path.slice(0, slash)
      folders.set(folder, [...(folders.get(folder) ?? []), file])
    }
  }

  const sections = [
    ...[...folders.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ...(root.length > 0 ? ([['General', root]] as [string, DocsFile[]][]) : [])
  ].map(([folder, list]) => [folder, [...list].sort(byName)] as const)

  const out: string[] = [`# ${name}`, '']
  if (baseUrl) out.push(`**Base URL:** \`${baseUrl}\``, '')
  if (description?.trim()) out.push(description.trim(), '')
  out.push(`${files.length} peticiones.`, '', '## Índice', '')
  for (const [folder, list] of sections) {
    out.push(`- **${folder}**`)
    for (const f of list) out.push(`  - ${f.request.method} ${f.request.name}`)
  }
  out.push('')

  for (const [folder, list] of sections) {
    out.push(`## ${folder}`, '')
    for (const f of list) out.push(...requestToMarkdown(f.request), '---', '')
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}
