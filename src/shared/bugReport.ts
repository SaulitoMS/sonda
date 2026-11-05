import type { CurlRequest } from './curl'
import { redactBodyText } from './history'
import { REDACTED, redactRequest } from './redactRequest'

const MAX_BODY_CHARS = 3000

export interface BugReportInput {
  request: CurlRequest
  response: {
    status: number
    statusText: string
    timeMs: number
    sizeBytes: number
    headers: Record<string, string>
    body: string
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Bloque de código con una comilla invertida más que la racha más larga del texto, para no romperlo */
function fence(text: string, lang: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${text}\n${ticks}`
}

const clip = (text: string): string =>
  text.length > MAX_BODY_CHARS
    ? `${text.slice(0, MAX_BODY_CHARS)}\n… (recortado: ${text.length} caracteres en total)`
    : text

/** Si es JSON lo deja formateado; si no, tal cual */
function pretty(text: string): { text: string; lang: string } {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), lang: 'json' }
  } catch {
    return { text, lang: '' }
  }
}

/**
 * Petición y respuesta en Markdown, para pegar en un ticket o un chat. Oculta credenciales
 * en la URL, los headers y los bodies; las {{variables}} se conservan.
 */
export function buildBugReport({ request, response }: BugReportInput): string {
  const req = redactRequest(request)
  const parts: string[] = []

  const type = response.headers['content-type']?.split(';')[0].trim()
  const status = `${response.status} ${response.statusText}`.trim()
  const stats = [`${response.timeMs} ms`, formatBytes(response.sizeBytes), type].filter(Boolean)
  parts.push(`**${req.method}** \`${req.url}\` → **${status}** · ${stats.join(' · ')}`)

  if (req.headers.length > 0) {
    const lines = req.headers.map((h) => `${h.key}: ${h.value}`).join('\n')
    parts.push(`**Headers de la petición**\n\n${fence(lines, 'http')}`)
  }

  if (req.body.trim()) {
    const body = pretty(req.body)
    parts.push(`**Body de la petición**\n\n${fence(clip(body.text), body.lang)}`)
  }

  const resBody = redactBodyText(response.body, REDACTED)
  if (resBody.trim()) {
    const body = pretty(resBody)
    parts.push(`**Respuesta**\n\n${fence(clip(body.text), body.lang)}`)
  } else {
    parts.push('_La respuesta no trae body de texto._')
  }

  return parts.join('\n\n') + '\n'
}
