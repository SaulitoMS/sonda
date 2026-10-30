import type { RunStatus } from './classify'
import type { AssertionResult, HttpMethod, SchemaIssue, SchemaValidation } from './types'

/** Lo que el runner sabe de cada petición ejecutada */
export interface ReportInput {
  group: string
  name: string
  method: HttpMethod
  path: string
  status: RunStatus
  detail: string
  httpStatus?: number
  timeMs: number
  assertionResults?: AssertionResult[]
  validation?: SchemaValidation | null
}

export interface ReportResult {
  group: string
  name: string
  method: HttpMethod
  path: string
  status: RunStatus
  detail: string
  httpStatus: number | null
  timeMs: number
  assertions: { label: string; passed: boolean; message: string }[]
  schema: {
    verdict: SchemaValidation['verdict']
    matched: string | null
    message: string | null
    issues: Pick<SchemaIssue, 'severity' | 'path' | 'message'>[]
  } | null
}

export interface RunReport {
  collection: string
  environment: string | null
  generatedAt: string
  summary: { total: number; pass: number; warn: number; fail: number; timeMs: number }
  results: ReportResult[]
}

/**
 * Arma el reporte de una ejecución. Deliberadamente no incluye bodies, headers ni valores del
 * entorno: el archivo se puede compartir o subir a un repositorio sin filtrar secretos.
 */
export function buildReport(input: {
  collection: string
  environment: string | null
  rows: ReportInput[]
  now?: Date
}): RunReport {
  const results = input.rows.map((r): ReportResult => ({
    group: r.group,
    name: r.name,
    method: r.method,
    path: r.path,
    status: r.status,
    detail: r.detail,
    httpStatus: r.httpStatus ?? null,
    timeMs: r.timeMs,
    assertions: (r.assertionResults ?? []).map((a) => ({
      label: a.label,
      passed: a.passed,
      message: a.message
    })),
    schema: r.validation
      ? {
          verdict: r.validation.verdict,
          matched: r.validation.matched ?? null,
          message: r.validation.message ?? null,
          issues: r.validation.issues.map((i) => ({
            severity: i.severity,
            path: i.path,
            message: i.message
          }))
        }
      : null
  }))

  const count = (s: RunStatus): number => results.filter((r) => r.status === s).length

  return {
    collection: input.collection,
    environment: input.environment,
    generatedAt: (input.now ?? new Date()).toISOString(),
    summary: {
      total: results.length,
      pass: count('pass'),
      warn: count('warn'),
      fail: count('fail'),
      timeMs: results.reduce((sum, r) => sum + r.timeMs, 0)
    },
    results
  }
}

export const reportToJson = (report: RunReport): string => JSON.stringify(report, null, 2) + '\n'

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const MARK: Record<RunStatus, string> = { pass: '✓', warn: '⚠', fail: '✗' }

function resultDetails(r: ReportResult): string {
  const parts: string[] = []

  if (r.assertions.length > 0) {
    const items = r.assertions
      .map(
        (a) =>
          `<li class="${a.passed ? 'pass' : 'fail'}">${a.passed ? '✓' : '✗'} ${escapeHtml(a.label)}${
            a.passed || !a.message ? '' : ` · ${escapeHtml(a.message)}`
          }</li>`
      )
      .join('')
    parts.push(`<p class="sub">Aserciones</p><ul>${items}</ul>`)
  }

  if (r.schema) {
    const head = r.schema.matched
      ? `${r.schema.verdict} (status ${escapeHtml(r.schema.matched)})`
      : r.schema.verdict
    const note = r.schema.message ? ` · ${escapeHtml(r.schema.message)}` : ''
    const items = r.schema.issues
      .map(
        (i) =>
          `<li class="${i.severity === 'error' ? 'fail' : 'warn'}">${i.severity === 'error' ? '✗' : '⚠'} <code>${escapeHtml(i.path)}</code> ${escapeHtml(i.message)}</li>`
      )
      .join('')
    parts.push(`<p class="sub">Schema: ${head}${note}</p>${items ? `<ul>${items}</ul>` : ''}`)
  }

  if (parts.length === 0) return ''
  return `<tr class="more"><td colspan="5"><details><summary>Detalle</summary>${parts.join('')}</details></td></tr>`
}

/** Reporte en un solo archivo HTML, sin dependencias, listo para abrir o adjuntar */
export function reportToHtml(report: RunReport): string {
  const { summary } = report
  const rows = report.results
    .map((r) => {
      const name = `${r.group ? `${escapeHtml(r.group)} / ` : ''}${escapeHtml(r.name)}`
      const detail = r.detail ? `<div class="detail">${escapeHtml(r.detail)}</div>` : ''
      return (
        `<tr class="${r.status}"><td class="mark">${MARK[r.status]}</td>` +
        `<td class="method">${escapeHtml(r.method)}</td>` +
        `<td>${name}${detail}</td>` +
        `<td class="num">${r.httpStatus ?? '—'}</td>` +
        `<td class="num">${r.timeMs} ms</td></tr>` +
        resultDetails(r)
      )
    })
    .join('\n')

  const env = report.environment ? ` · Entorno: ${escapeHtml(report.environment)}` : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte: ${escapeHtml(report.collection)}</title>
<style>
  :root { color-scheme: light dark; --pass: #059669; --warn: #d97706; --fail: #dc2626; --line: #8884; }
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; margin-bottom: .2rem; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 1rem; }
  .summary { display: flex; gap: 1.5rem; font-weight: 600; margin-bottom: 1rem; }
  .pass, .summary .p { color: var(--pass); } .warn, .summary .w { color: var(--warn); } .fail, .summary .f { color: var(--fail); }
  table { width: 100%; border-collapse: collapse; }
  td { padding: .4rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.mark { width: 1.5rem; font-weight: 700; } td.method { width: 4.5rem; font-weight: 700; font-family: ui-monospace, monospace; }
  td.num { text-align: right; white-space: nowrap; width: 5rem; }
  .detail { color: #888; font-size: .8rem; }
  tr.more td { border-bottom: 1px solid var(--line); padding-top: 0; font-size: .85rem; }
  .sub { margin: .4rem 0 .1rem; font-weight: 600; } ul { margin: 0; padding-left: 1.2rem; list-style: none; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>Reporte de ejecución: ${escapeHtml(report.collection)}</h1>
<div class="meta">${escapeHtml(report.generatedAt)}${env}</div>
<div class="summary">
  <span class="p">✓ ${summary.pass}</span><span class="w">⚠ ${summary.warn}</span><span class="f">✗ ${summary.fail}</span>
  <span>${summary.total} peticiones · ${summary.timeMs} ms</span>
</div>
<table>
${rows}
</table>
</body>
</html>
`
}

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'coleccion'

/** Escapa texto para XML y quita caracteres de control que vuelven inválido el archivo */
const xmlEscape = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Reporte en formato JUnit XML: lo entienden GitHub Actions, GitLab CI, Jenkins, etc. */
export function reportToJunit(report: RunReport): string {
  const { summary } = report
  const seconds = (ms: number): string => (ms / 1000).toFixed(3)

  const cases = report.results.map((r) => {
    const classname = xmlEscape(report.collection + (r.group ? `.${r.group}` : ''))
    const name = xmlEscape(`${r.method} ${r.name}`)
    const open = `    <testcase classname="${classname}" name="${name}" time="${seconds(r.timeMs)}"`

    if (r.status === 'fail') {
      const lines = [
        ...r.assertions
          .filter((a) => !a.passed)
          .map((a) => `✗ ${a.label}${a.message ? ` · ${a.message}` : ''}`),
        ...(r.schema?.issues ?? [])
          .filter((i) => i.severity === 'error')
          .map((i) => `✗ schema ${i.path} ${i.message}`)
      ]
      const message = r.detail || lines[0] || 'La petición falló'
      const type = r.httpStatus !== null ? `HTTP ${r.httpStatus}` : 'Error'
      return (
        `${open}>\n` +
        `      <failure message="${xmlEscape(message)}" type="${type}">${xmlEscape(lines.join('\n'))}</failure>\n` +
        `    </testcase>`
      )
    }

    if (r.status === 'warn' && r.detail) {
      return `${open}>\n      <system-out>${xmlEscape(`⚠ ${r.detail}`)}</system-out>\n    </testcase>`
    }

    return `${open} />`
  })

  const suiteName = xmlEscape(report.collection)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="${suiteName}" tests="${summary.total}" failures="${summary.fail}" time="${seconds(summary.timeMs)}">\n` +
    `  <testsuite name="${suiteName}" tests="${summary.total}" failures="${summary.fail}" errors="0" skipped="0" time="${seconds(summary.timeMs)}" timestamp="${xmlEscape(report.generatedAt)}">\n` +
    `${cases.join('\n')}\n` +
    `  </testsuite>\n` +
    `</testsuites>\n`
  )
}

/** Nombre de archivo tipo sonda-petstore-20261029-123456.html */
export function reportFileName(report: RunReport, ext: 'json' | 'html' | 'xml'): string {
  const stamp = report.generatedAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  return `sonda-${slug(report.collection)}-${stamp}.${ext}`
}
