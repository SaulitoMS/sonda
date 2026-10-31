import { promises as fs } from 'fs'
import { parseArgs } from 'util'
import { classifyResult, type RunStatus } from '../shared/classify'
import { parseDataSet, withDataVars, type DataSet } from '../shared/csvData'
import { applyExtractions } from '../shared/extract'
import {
  buildReport,
  reportToHtml,
  reportToJson,
  reportToJunit,
  type ReportInput
} from '../shared/report'
import { DEFAULT_SETTINGS, proxyError } from '../shared/settings'
import type { CollectionItem, Environment, HttpMethod, RequestItem } from '../shared/types'
import { executeRequest } from './execute'
import { createSender } from './http'
import {
  defaultWorkspace,
  findCollection,
  loadCollections,
  loadEnvironments,
  readRequest
} from './workspace'

const SAFE_METHODS: HttpMethod[] = ['GET', 'HEAD', 'OPTIONS']

const HELP = `Sonda CLI: ejecuta tus colecciones desde la terminal o un pipeline de CI.

Uso:
  sonda-cli run <colección> [opciones]
  sonda-cli list [opciones]

Opciones de "run":
  -w, --workspace <ruta>   Carpeta del workspace (por defecto $SONDA_WORKSPACE o ~/Documents/Sonda)
  -e, --env <nombre>       Entorno a usar (por defecto, el activo en la app)
      --var <clave=valor>  Define o pisa una variable. Se puede repetir
  -f, --folder <nombre>    Ejecuta solo las peticiones de esa carpeta
  -d, --data <archivo>     CSV o JSON: la colección corre una vez por fila
      --include-writes     Incluye POST, PUT, PATCH y DELETE (por defecto solo GET, HEAD y OPTIONS)
      --bail               Se detiene en el primer fallo
      --strict             Los avisos (⚠) también hacen fallar la ejecución
      --retries <n>        Reintentos ante error de red, 429 o 5xx (0 a 3, por defecto 0)
      --delay <ms>         Pausa entre peticiones (por defecto 0)
      --timeout <s>        Tiempo máximo por petición (por defecto ${DEFAULT_SETTINGS.timeoutSeconds})
      --no-redirects       No seguir redirecciones
      --insecure           No verificar certificados TLS (por defecto solo se tolera en localhost)
      --proxy <url>        Proxy http(s) (por defecto $HTTPS_PROXY si existe)
      --junit <archivo>    Escribe el reporte JUnit XML
      --json <archivo>     Escribe el reporte JSON
      --html <archivo>     Escribe el reporte HTML
      --no-color           Sin colores en la salida
  -h, --help               Muestra esta ayuda

Secretos: los valores marcados como secreto en la app están cifrados en tu keychain y la CLI no
puede leerlos. Pásalos con --var token=... o con variables de entorno SONDA_VAR_token=...

Código de salida: 0 todo bien · 1 hubo fallos · 2 error de uso o de configuración.
`

class UsageError extends Error {}

function color(
  enabled: boolean
): Record<'red' | 'green' | 'yellow' | 'dim' | 'bold', (s: string) => string> {
  const wrap =
    (code: string) =>
    (s: string): string =>
      enabled ? `\x1b[${code}m${s}\x1b[0m` : s
  return { red: wrap('31'), green: wrap('32'), yellow: wrap('33'), dim: wrap('2'), bold: wrap('1') }
}

function parseVars(list: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  // Primero las del entorno del sistema, para que --var las pise
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SONDA_VAR_') && key.length > 10 && value !== undefined) {
      out[key.slice(10)] = value
    }
  }
  for (const item of list) {
    const i = item.indexOf('=')
    if (i <= 0) throw new UsageError(`--var espera clave=valor, recibió "${item}"`)
    out[item.slice(0, i).trim()] = item.slice(i + 1)
  }
  return out
}

function toInt(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UsageError(`${name} debe ser un entero entre ${min} y ${max}`)
  }
  return n
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      workspace: { type: 'string', short: 'w' },
      env: { type: 'string', short: 'e' },
      var: { type: 'string', multiple: true },
      folder: { type: 'string', short: 'f' },
      data: { type: 'string', short: 'd' },
      'include-writes': { type: 'boolean' },
      bail: { type: 'boolean' },
      strict: { type: 'boolean' },
      retries: { type: 'string' },
      delay: { type: 'string' },
      timeout: { type: 'string' },
      'no-redirects': { type: 'boolean' },
      insecure: { type: 'boolean' },
      proxy: { type: 'string' },
      junit: { type: 'string' },
      json: { type: 'string' },
      html: { type: 'string' },
      'no-color': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  })

  const [command, target] = positionals
  if (values.help || !command) {
    process.stdout.write(HELP)
    return values.help ? 0 : 2
  }

  const root = values.workspace ?? defaultWorkspace()
  const c = color(!values['no-color'] && !process.env.NO_COLOR && !!process.stdout.isTTY)
  const collections = await loadCollections(root)
  const envData = await loadEnvironments(root)

  if (command === 'list') {
    process.stdout.write(c.bold('Colecciones\n'))
    for (const col of collections) {
      const count = col.requests.length + col.folders.reduce((n, f) => n + f.requests.length, 0)
      process.stdout.write(`  ${col.id}  ${c.dim(`${col.name} · ${count} peticiones`)}\n`)
    }
    process.stdout.write(c.bold('\nEntornos\n'))
    for (const e of envData.environments) {
      const active = e.id === envData.activeId ? c.dim(' (activo)') : ''
      process.stdout.write(`  ${e.name}${active}\n`)
    }
    return 0
  }

  if (command !== 'run') throw new UsageError(`Comando desconocido: "${command}"`)
  if (!target) throw new UsageError('Falta la colección. Uso: sonda-cli run <colección>')

  const collection = findCollection(collections, target)
  if (!collection) {
    const names = collections.map((x) => x.id).join(', ') || '(ninguna)'
    throw new UsageError(`No existe la colección "${target}" en ${root}. Disponibles: ${names}`)
  }

  // ----- Entorno -----
  let env: Environment | null
  if (values.env) {
    const s = values.env.trim().toLowerCase()
    env =
      envData.environments.find((e) => e.name.toLowerCase() === s || e.id === values.env) ?? null
    if (!env) {
      const names = envData.environments.map((e) => e.name).join(', ') || '(ninguno)'
      throw new UsageError(`No existe el entorno "${values.env}". Disponibles: ${names}`)
    }
  } else {
    env = envData.environments.find((e) => e.id === envData.activeId) ?? null
  }
  const overrides = parseVars(values.var ?? [])

  // Los secretos llegan vacíos: se avisa de los que nadie aportó
  const missingSecrets =
    env?.variables.filter(
      (v) => v.enabled && v.secret && !v.value && !(v.key.trim() in overrides)
    ) ?? []
  if (missingSecrets.length > 0) {
    const names = missingSecrets.map((v) => v.key).join(', ')
    process.stderr.write(
      c.yellow(
        `⚠ Variables secretas sin valor: ${names}. Pásalas con --var o SONDA_VAR_<nombre>.\n`
      )
    )
  }

  // ----- Ajustes -----
  const retries = toInt(values.retries, '--retries', 0, 3, 0)
  const delayMs = toInt(values.delay, '--delay', 0, 10000, 0)
  const timeoutS = toInt(values.timeout, '--timeout', 1, 600, DEFAULT_SETTINGS.timeoutSeconds)
  const proxyUrl = values.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy ?? ''
  const pe = proxyError(proxyUrl)
  if (pe) throw new UsageError(pe)

  const send = createSender({
    timeoutMs: timeoutS * 1000,
    followRedirects: !values['no-redirects'],
    insecure: values.insecure ? true : null,
    proxyUrl
  })

  // ----- Datos -----
  let dataset: DataSet | null = null
  if (values.data) {
    try {
      dataset = parseDataSet(await fs.readFile(values.data, 'utf-8'))
    } catch (err) {
      throw new UsageError(
        `No se pudo leer ${values.data}: ${err instanceof Error ? err.message : 'error'}`
      )
    }
  }

  // ----- Cola -----
  const folders = values.folder
    ? collection.folders.filter((f) => f.name.toLowerCase() === values.folder!.toLowerCase())
    : collection.folders
  if (values.folder && folders.length === 0) {
    const names = collection.folders.map((f) => f.name).join(', ') || '(ninguna)'
    throw new UsageError(`No existe la carpeta "${values.folder}". Disponibles: ${names}`)
  }
  const all: { item: RequestItem; group: string }[] = [
    ...folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
    ...(values.folder ? [] : collection.requests.map((item) => ({ item, group: '' })))
  ]
  const planned = values['include-writes']
    ? all
    : all.filter((e) => SAFE_METHODS.includes(e.item.method))
  const skipped = all.length - planned.length

  const jobs = dataset
    ? dataset.rows.flatMap((data, i) => planned.map((entry) => ({ entry, data, iteration: i + 1 })))
    : planned.map((entry) => ({ entry, data: undefined, iteration: undefined }))

  if (jobs.length === 0) {
    throw new UsageError(
      'No hay peticiones por ejecutar (las de escritura solo corren con --include-writes).'
    )
  }

  process.stdout.write(
    `${c.bold(collection.name)} ${c.dim(`· entorno: ${env?.name ?? 'ninguno'} · ${jobs.length} peticiones`)}\n`
  )
  if (skipped > 0) {
    process.stdout.write(
      c.dim(`  ${skipped} peticiones de escritura omitidas (usa --include-writes)\n`)
    )
  }

  // ----- Ejecución -----
  // Lo extraído por una petición queda disponible para las siguientes (solo en memoria)
  let state: Environment | null = env
  const rows: ReportInput[] = []
  const ICON: Record<RunStatus, string> = {
    pass: c.green('✓'),
    warn: c.yellow('⚠'),
    fail: c.red('✗')
  }

  for (const [index, job] of jobs.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs)

    const runJob = async (): Promise<{ row: ReportInput; transient: boolean }> => {
      const rowEnv = withDataVars(withDataVars(state, job.data ?? {}), overrides)
      const label = job.iteration
        ? `${job.entry.item.name} [fila ${job.iteration}]`
        : job.entry.item.name
      try {
        const saved = await readRequest(root, job.entry.item.path)
        const { response, validation, requestValidation, assertionResults, extractions } =
          await executeRequest(saved, rowEnv, {
            path: job.entry.item.path,
            collections: [collection] as CollectionItem[],
            send
          })

        const okExtractions = extractions.filter((e) => e.ok)
        if (state && okExtractions.length > 0) state = applyExtractions(state, okExtractions).env
        else if (!state && okExtractions.length > 0) {
          state = applyExtractions({ id: 'cli', name: 'cli', variables: [] }, okExtractions).env
        }

        const problems = extractions
          .filter((e) => !e.ok)
          .map((e) => `No se extrajo {{${e.variable || '?'}}}: ${e.message}`)
        const base = classifyResult(response, validation, assertionResults, requestValidation)
        const verdict =
          base.status === 'pass' && problems.length > 0
            ? { status: 'warn' as RunStatus, detail: problems[0] }
            : base

        return {
          row: {
            group: job.entry.group,
            name: label,
            method: job.entry.item.method,
            path: job.entry.item.path,
            ...verdict,
            httpStatus: response.ok ? response.status : undefined,
            timeMs: response.timeMs,
            assertionResults,
            validation
          },
          transient: !response.ok || response.status === 429 || response.status >= 500
        }
      } catch (err) {
        return {
          row: {
            group: job.entry.group,
            name: label,
            method: job.entry.item.method,
            path: job.entry.item.path,
            status: 'fail',
            detail: err instanceof Error ? err.message : 'Error desconocido',
            timeMs: 0
          },
          transient: false
        }
      }
    }

    let { row, transient } = await runJob()
    for (let attempt = 1; attempt <= retries && row.status === 'fail' && transient; attempt++) {
      await sleep(Math.max(delayMs, 500))
      ;({ row, transient } = await runJob())
    }

    rows.push(row)
    const where = row.group ? `${row.group} / ` : ''
    const http = row.httpStatus ? String(row.httpStatus) : '---'
    process.stdout.write(
      `  ${ICON[row.status]} ${row.method.padEnd(7)} ${where}${row.name} ${c.dim(`${http} · ${row.timeMs} ms`)}\n`
    )
    if (row.detail && row.status !== 'pass') {
      process.stdout.write(`      ${c.dim(row.detail)}\n`)
    }

    if (values.bail && row.status === 'fail') {
      process.stdout.write(c.yellow('  Se detuvo en el primer fallo (--bail)\n'))
      break
    }
  }

  // ----- Reportes -----
  const report = buildReport({ collection: collection.name, environment: env?.name ?? null, rows })
  if (values.junit) await fs.writeFile(values.junit, reportToJunit(report), 'utf-8')
  if (values.json) await fs.writeFile(values.json, reportToJson(report), 'utf-8')
  if (values.html) await fs.writeFile(values.html, reportToHtml(report), 'utf-8')

  const { pass, warn, fail, total, timeMs } = report.summary
  process.stdout.write(
    `\n${c.green(`✓ ${pass}`)}  ${c.yellow(`⚠ ${warn}`)}  ${c.red(`✗ ${fail}`)}  ${c.dim(`${total} peticiones · ${timeMs} ms`)}\n`
  )
  for (const [flag, file] of [
    ['junit', values.junit],
    ['json', values.json],
    ['html', values.html]
  ]) {
    if (file) process.stdout.write(c.dim(`Reporte ${flag}: ${file}\n`))
  }

  return fail > 0 || (values.strict && warn > 0) ? 1 : 0
}

// Se sale cuando termina de vaciarse la salida: así no se corta el texto al encadenarlo con otro comando
const exit = (code: number): void => {
  process.stdout.write('', () => process.exit(code))
}

main(process.argv.slice(2)).then(exit, (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`Error: ${message}\n`)
  if (err instanceof UsageError) process.stderr.write('Usa --help para ver las opciones.\n')
  exit(2)
})
