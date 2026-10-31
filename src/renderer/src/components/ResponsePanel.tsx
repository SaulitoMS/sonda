import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeAssertions } from '../../../shared/assertions'
import type {
  AssertionResult,
  ExtractionResult,
  RedirectHop,
  SchemaValidation,
  StreamEnd
} from '../../../shared/types'
import { useRequestStore } from '../store/useRequestStore'
import {
  binaryExtensionFor,
  buildFullExport,
  extensionFor,
  mimeFor,
  suggestFileName
} from '../../../shared/exportResponse'
import { downloadBase64, downloadText } from '../lib/download'
import { BinaryView } from './BinaryView'
import { getByPath, parsePath } from '../../../shared/assertions'
import { JsonTree } from './JsonTree'
import { Highlight } from './Highlight'
import { MAX_MATCHES, buildTreeSearch, countMatches } from '../lib/search'
import { usePreviousDiff, type PreviousDiff } from '../lib/usePreviousDiff'
import { formatXml, isHtmlResponse, isXmlResponse } from '../../../shared/markup'
import { isEventStream, parseSse, type SseEvent } from '../../../shared/sse'
import { useStreamStore, type LiveStream } from '../store/useStreamStore'
import { useTabsStore } from '../store/useTabsStore'
import { Icon } from './Icon'

type Tab = 'body' | 'headers' | 'schema' | 'tests' | 'changes'

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const statusColor = (status: number): string => {
  if (status >= 500) return 'bg-red-500/20 text-red-400'
  if (status >= 400) return 'bg-amber-500/20 text-amber-400'
  if (status >= 300) return 'bg-sky-500/20 text-sky-400'
  return 'bg-emerald-500/20 text-emerald-400'
}

// Verde = rápido, ámbar = aceptable, rojo = lento
const timeTone = (ms: number): string =>
  ms < 300 ? 'text-emerald-400' : ms < 1000 ? 'text-amber-400' : 'text-red-400'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Marca corta que se ve en la pestaña "Schema" */
const verdictBadge = (v: SchemaValidation): { label: string; color: string } => {
  switch (v.verdict) {
    case 'valid':
      return { label: '✓', color: 'text-emerald-400' }
    case 'invalid':
      return {
        label: `✗ ${v.issues.filter((i) => i.severity === 'error').length}`,
        color: 'text-red-400'
      }
    case 'undocumented':
      return { label: '⚠', color: 'text-amber-400' }
    default:
      return { label: '–', color: 'text-zinc-500' }
  }
}

function SchemaReport({ validation }: { validation: SchemaValidation }): React.JSX.Element {
  const errors = validation.issues.filter((i) => i.severity === 'error').length
  const warnings = validation.issues.length - errors

  let summary: string
  let color = 'text-zinc-400'
  if (validation.verdict === 'valid') {
    summary = `La respuesta cumple el schema del status ${validation.matched}`
    if (warnings > 0) summary += ` (${plural(warnings, 'advertencia', 'advertencias')})`
    color = 'text-emerald-400'
  } else if (validation.verdict === 'invalid') {
    summary = `${plural(errors, 'error', 'errores')} contra el schema del status ${validation.matched}`
    color = 'text-red-400'
  } else {
    summary = validation.message ?? ''
    if (validation.verdict === 'undocumented') color = 'text-amber-400'
  }

  return (
    <div className="selectable space-y-3 text-xs">
      <p className={`font-semibold ${color}`}>{summary}</p>

      {validation.issues.length > 0 && (
        <ul className="space-y-1.5 font-mono">
          {validation.issues.map((issue, i) => (
            <li key={i} className="flex gap-2">
              <span className={issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}>
                {issue.severity === 'error' ? '✗' : '⚠'}
              </span>
              <span className="font-semibold text-blue-300">{issue.path}</span>
              <span className="text-zinc-300">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      {validation.truncated && (
        <p className="text-zinc-500">Se muestran solo los primeros 50 problemas de cada tipo.</p>
      )}
    </div>
  )
}

function TestsReport({ results }: { results: AssertionResult[] }): React.JSX.Element {
  const { passed, total } = summarizeAssertions(results)
  const allPassed = passed === total

  return (
    <div className="selectable space-y-3 text-xs">
      <p className={`font-semibold ${allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
        {allPassed
          ? `Pasaron las ${plural(total, 'aserción', 'aserciones')}`
          : `Pasaron ${passed} de ${plural(total, 'aserción', 'aserciones')}`}
      </p>

      <ul className="space-y-1.5 font-mono">
        {results.map((r) => (
          <li key={r.id} className="flex gap-2">
            <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
              {r.passed ? '✓' : '✗'}
            </span>
            <span className="text-zinc-200">{r.label}</span>
            {!r.passed && <span className="text-red-300">· {r.message}</span>}
            {r.passed && r.actual !== undefined && (
              <span className="text-zinc-500">· {r.actual}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const showValue = (v: unknown): string => {
  const text = JSON.stringify(v) ?? 'undefined'
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

function ChangesReport({ diff }: { diff: PreviousDiff }): React.JSX.Element {
  if (diff.state === 'none') {
    return (
      <p className="text-xs text-zinc-500">
        Aún no hay una respuesta anterior de esta petición para comparar. Envíala otra vez.
      </p>
    )
  }
  if (diff.state === 'unavailable') {
    return <p className="text-xs text-amber-400">{diff.reason}</p>
  }

  const time = new Date(diff.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const statusChanged = diff.statusBefore !== diff.statusAfter

  return (
    <div className="selectable space-y-3 text-xs">
      <p
        className={`font-semibold ${
          diff.changes.length === 0 && !statusChanged ? 'text-emerald-400' : 'text-amber-400'
        }`}
      >
        {diff.changes.length === 0
          ? `Sin cambios en el body respecto a la respuesta de las ${time}`
          : `${plural(diff.changes.length, 'cambio', 'cambios')} respecto a la respuesta de las ${time}`}
      </p>

      {statusChanged && (
        <p className="font-mono text-amber-300">
          Status: {diff.statusBefore} → {diff.statusAfter}
        </p>
      )}

      <ul className="space-y-1.5 font-mono">
        {diff.changes.map((c, i) => (
          <li key={i} className="flex flex-wrap gap-2">
            <span
              className={
                c.kind === 'added'
                  ? 'text-emerald-400'
                  : c.kind === 'removed'
                    ? 'text-red-400'
                    : 'text-amber-400'
              }
            >
              {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '~'}
            </span>
            <span className="font-semibold text-blue-300">{c.path}</span>
            {c.kind === 'changed' && (
              <span className="text-zinc-300">
                {showValue(c.before)} → {showValue(c.after)}
              </span>
            )}
            {c.kind === 'added' && <span className="text-zinc-300">{showValue(c.after)}</span>}
            {c.kind === 'removed' && (
              <span className="text-zinc-500 line-through">{showValue(c.before)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const clip = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text)

function ExtractionsBanner({ results }: { results: ExtractionResult[] }): React.JSX.Element | null {
  if (results.length === 0) return null
  return (
    <div className="selectable border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs">
      {results.map((r) => (
        <p key={r.id} className={r.ok ? 'text-emerald-400' : 'text-red-400'}>
          {r.ok ? '✓' : '✗'} {`{{${r.variable || '?'}}}`}
          <span className="text-zinc-400">
            {r.ok ? ` = ${r.secret ? '••••••••' : clip(r.value ?? '')}` : ` · ${r.message}`}
          </span>
        </p>
      ))}
    </div>
  )
}

function WarningsBanner({ warnings }: { warnings: string[] }): React.JSX.Element | null {
  if (warnings.length === 0) return null
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      {warnings.map((w, i) => (
        <p key={i}>⚠ {w}</p>
      ))}
    </div>
  )
}

const STREAM_NOTE: Record<StreamEnd, string> = {
  closed: 'El servidor cerró el stream.',
  cancelled: 'Detuviste el stream: esto es lo recibido hasta ese momento.',
  timeout: 'Se alcanzó el tiempo límite: esto es lo recibido hasta entonces.',
  limit: 'Se cortó al llegar al límite de 20 MB.',
  error: 'La conexión se interrumpió.'
}

const MAX_EVENTS_SHOWN = 500

/** Los saltos de redirección que hubo hasta la respuesta final (plegado por defecto) */
function RedirectChain({
  hops,
  finalUrl
}: {
  hops: RedirectHop[]
  finalUrl: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-zinc-800 px-4 py-1.5 text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-zinc-400 hover:text-zinc-200"
      >
        <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
        <span className="font-semibold text-blue-300">
          ↪ {plural(hops.length, 'redirección', 'redirecciones')}
        </span>
        <span className="selectable min-w-0 flex-1 truncate font-mono text-zinc-500">
          {finalUrl}
        </span>
      </button>
      {open && (
        <ol className="selectable mt-1.5 space-y-1.5 font-mono">
          {hops.map((h, i) => (
            <li key={i} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 text-zinc-300">
                <span className="rounded bg-zinc-800 px-1.5 text-amber-300">{h.status}</span>
                <span className="break-all">{h.url}</span>
                <span className="text-zinc-500">
                  {h.timeMs} ms
                  {h.setCookies > 0 && ` · ${plural(h.setCookies, 'cookie', 'cookies')}`}
                </span>
              </div>
              <div className="break-all pl-3 text-zinc-500">→ {h.location}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const prettyData = (data: string): string => {
  try {
    return JSON.stringify(JSON.parse(data), null, 2)
  } catch {
    return data
  }
}

/** Lo que va llegando de un stream mientras sigue abierto */
function LiveStreamView({ stream }: { stream: LiveStream }): React.JSX.Element {
  const end = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [stream.text])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-xs text-emerald-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Recibiendo eventos… {formatSize(stream.bytes)}
        <span className="text-zinc-500">· pulsa Cancelar para detener y ver lo recibido</span>
      </div>
      <pre className="selectable min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs text-zinc-300">
        {stream.text}
        <span ref={end} />
      </pre>
    </div>
  )
}

/** Eventos de un stream ya terminado, uno por tarjeta */
function SseEvents({ events }: { events: SseEvent[] }): React.JSX.Element {
  if (events.length === 0) {
    return <p className="text-xs text-zinc-500">El servidor no envió ningún evento.</p>
  }
  return (
    <div className="selectable space-y-2 text-xs">
      <p className="text-zinc-500">
        {plural(events.length, 'evento', 'eventos')}
        {events.length > MAX_EVENTS_SHOWN && ` (se muestran los primeros ${MAX_EVENTS_SHOWN})`}
      </p>
      <ol className="space-y-2">
        {events.slice(0, MAX_EVENTS_SHOWN).map((e, i) => (
          <li key={i} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
            <div className="mb-1 flex flex-wrap gap-x-3 text-zinc-500">
              <span>#{i + 1}</span>
              {e.event && <span className="font-semibold text-blue-300">{e.event}</span>}
              {e.id && <span>id: {e.id}</span>}
              {e.retry !== undefined && <span>retry: {e.retry} ms</span>}
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono text-zinc-200">
              {prettyData(e.data) || '(sin datos)'}
            </pre>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ResponsePanel(): React.JSX.Element {
  const { response, loading, validation, assertionResults, extractionResults, warnings } =
    useRequestStore()
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const diff = usePreviousDiff(response, method, url)
  const activeTabId = useTabsStore((s) => s.activeId)
  const live = useStreamStore((s) => s.live[activeTabId])
  const [tab, setTab] = useState<Tab>('body')
  // Si la nueva respuesta no tiene validación, la pestaña "Schema" no existe: volver a Body
  const hasTests = assertionResults.length > 0
  const current: Tab =
    (tab === 'schema' && !validation) || (tab === 'tests' && !hasTests) ? 'body' : tab
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [view, setView] = useState<'tree' | 'raw'>('tree')
  const [htmlView, setHtmlView] = useState<'preview' | 'code'>('code')
  const [sseView, setSseView] = useState<'events' | 'text'>('events')
  const [filter, setFilter] = useState('')

  const prettyBody = useMemo(() => {
    if (!response || !response.ok) return ''
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2)
    } catch {
      // XML bien formado se muestra indentado; si no lo está, se deja tal cual
      return isXmlResponse(response.headers['content-type'], response.body)
        ? (formatXml(response.body) ?? response.body)
        : response.body
    }
  }, [response])

  const parsed = useMemo<{ ok: true; value: unknown } | { ok: false }>(() => {
    if (!response || !response.ok) return { ok: false }
    try {
      return { ok: true, value: JSON.parse(response.body) }
    } catch {
      return { ok: false }
    }
  }, [response])

  // Con filtro, muestra solo lo que hay en esa ruta (ej: data.items[0].name)
  const filtered = useMemo<{ found: boolean; value?: unknown; invalid?: boolean }>(() => {
    if (!parsed.ok || !filter.trim())
      return { found: true, value: parsed.ok ? parsed.value : undefined }
    const tokens = parsePath(filter)
    if (!tokens) return { found: false, invalid: true }
    return getByPath(parsed.value, tokens)
  }, [parsed, filter])

  // ── Búsqueda dentro del body (Ctrl/Cmd+F) ──
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const isHtml =
    !!response?.ok &&
    !response.binary &&
    !parsed.ok &&
    isHtmlResponse(response.headers['content-type'], response.body)
  const showPreview = isHtml && htmlView === 'preview' && current === 'body'

  const isSse =
    !!response?.ok && !response.binary && isEventStream(response.headers['content-type'])
  const sseEvents = useMemo(
    () => (isSse && response?.ok ? parseSse(response.body) : []),
    [isSse, response]
  )
  const showEvents = isSse && sseView === 'events' && current === 'body'

  // La vista previa y la lista de eventos no son texto plano: Ctrl+F no puede buscar en ellas
  const canSearch =
    !!response?.ok && !response.binary && current === 'body' && !showPreview && !showEvents
  const searchQuery = searchOpen && canSearch ? query : ''
  const treeView = parsed.ok && view === 'tree'

  const treeSearch = useMemo(
    () =>
      treeView && filtered.found && searchQuery
        ? buildTreeSearch(filtered.value, searchQuery)
        : null,
    [treeView, filtered, searchQuery]
  )
  const rawTotal = useMemo(
    () => (!treeView && searchQuery ? countMatches(prettyBody, searchQuery) : 0),
    [treeView, prettyBody, searchQuery]
  )
  const total = treeView ? (treeSearch?.total ?? 0) : rawTotal
  const activeIdx = total ? Math.min(active, total - 1) : 0

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
    setActive(0)
  }

  const goMatch = (dir: 1 | -1): void => {
    if (total) setActive((activeIdx + dir + total) % total)
  }

  useEffect(() => {
    if (!canSearch) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => searchInput.current?.select())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canSearch])

  // Lleva la coincidencia activa al centro de la vista
  useEffect(() => {
    if (!searchQuery) return
    bodyRef.current
      ?.querySelector('[data-search-active="true"]')
      ?.scrollIntoView({ block: 'center' })
  }, [activeIdx, searchQuery, total, view])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(prettyBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const bodyExt = !response?.ok
    ? 'txt'
    : response.binary
      ? binaryExtensionFor(response.binary.contentType)
      : extensionFor(response.headers['content-type'], response.body)

  const exportBody = (): void => {
    if (!response?.ok) return
    const name = suggestFileName(method, url, bodyExt)
    if (response.binary) {
      if (response.binary.base64) {
        downloadBase64(name, response.binary.base64, response.binary.contentType)
      }
    } else {
      downloadText(name, prettyBody, mimeFor(bodyExt))
    }
    setMenuOpen(false)
  }

  const exportFull = (): void => {
    if (!response?.ok) return
    const name = suggestFileName(method, url, 'json').replace(/\.json$/, '-completa.json')
    downloadText(name, buildFullExport({ method, url }, response), 'application/json')
    setMenuOpen(false)
  }

  const tabClass = (t: Tab): string =>
    `relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${
      current === t
        ? 'text-zinc-100 after:bg-blue-500'
        : 'text-zinc-500 after:bg-transparent hover:text-zinc-300'
    }`

  if (loading) {
    if (live) return <LiveStreamView stream={live} />
    return (
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          Enviando petición…
        </div>
        <div className="space-y-2.5">
          <div className="skeleton h-3 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-2/5" />
        </div>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-blue-400">
          <Icon name="zap" size={22} />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-300">Aún no hay respuesta</p>
          <p className="mt-1 text-xs text-zinc-500">
            Escribe una URL y pulsa Enviar, o usa{' '}
            <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px]">
              Ctrl/⌘ + Enter
            </kbd>
          </p>
        </div>
      </div>
    )
  }

  if (!response.ok) {
    return (
      <div className="flex-1 overflow-auto">
        <WarningsBanner warnings={warnings} />
        <div className="m-4 flex gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <Icon name="alert" size={18} className="mt-0.5 text-red-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-400">Error en la petición</p>
            <p className="selectable mt-1 break-words font-mono text-xs text-red-300">
              {response.error}
            </p>
            <p className="mt-2 text-xs text-zinc-500">{response.timeMs} ms</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WarningsBanner warnings={warnings} />
      <ExtractionsBanner results={extractionResults} />

      {response.redirects && response.finalUrl && (
        <RedirectChain hops={response.redirects} finalUrl={response.finalUrl} />
      )}

      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
          <button className={tabClass('body')} onClick={() => setTab('body')}>
            Body
          </button>
          <button className={tabClass('headers')} onClick={() => setTab('headers')}>
            Headers ({Object.keys(response.headers).length})
          </button>
          {validation && (
            <button className={tabClass('schema')} onClick={() => setTab('schema')}>
              Schema{' '}
              <span className={verdictBadge(validation).color}>
                {verdictBadge(validation).label}
              </span>
            </button>
          )}
          {hasTests && (
            <button className={tabClass('tests')} onClick={() => setTab('tests')}>
              Tests{' '}
              <span
                className={
                  summarizeAssertions(assertionResults).passed === assertionResults.length
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }
              >
                {summarizeAssertions(assertionResults).passed}/{assertionResults.length}
              </span>
            </button>
          )}
          <button className={tabClass('changes')} onClick={() => setTab('changes')}>
            Cambios
            {diff.state === 'ready' && (
              <span
                className={`ml-1 ${diff.changes.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}
              >
                {diff.changes.length === 0 ? '✓' : diff.changes.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-1 pr-2 text-xs">
          <span
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-bold ${statusColor(response.status)}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {response.status}
            <span className="hidden font-medium opacity-80 sm:inline">{response.statusText}</span>
          </span>
          <span
            className={`flex items-center gap-1 font-medium ${timeTone(response.timeMs)}`}
            title={
              response.ttfbMs !== undefined
                ? `Espera del servidor (hasta el primer byte): ${response.ttfbMs} ms · Descarga: ${response.timeMs - response.ttfbMs} ms`
                : undefined
            }
          >
            <Icon name="clock" size={12} />
            {response.timeMs} ms
            {response.ttfbMs !== undefined && (
              <span className="ml-1 hidden font-normal text-zinc-500 sm:inline">
                (TTFB {response.ttfbMs})
              </span>
            )}
          </span>
          <span className="text-zinc-400">{formatSize(response.sizeBytes)}</span>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
              title="Guardar la respuesta en un archivo"
            >
              <Icon name="download" size={13} />
              <span className="hidden sm:inline">Exportar</span>
              <Icon name="chevronDown" size={11} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="anim-pop absolute right-0 top-full z-50 mt-1 w-56 origin-top-right rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                  <button
                    onClick={exportBody}
                    className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Body (.{bodyExt})
                  </button>
                  <button
                    onClick={exportFull}
                    className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Respuesta completa (.json)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {searchOpen && canSearch && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs">
          <input
            ref={searchInput}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goMatch(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') closeSearch()
            }}
            placeholder="Buscar en la respuesta…  (Enter: siguiente · Shift+Enter: anterior)"
            spellCheck={false}
            className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
          <span className="w-20 text-right tabular-nums text-zinc-500">
            {query &&
              (total
                ? `${activeIdx + 1}/${total >= MAX_MATCHES ? `${MAX_MATCHES}+` : total}`
                : 'Sin resultados')}
          </span>
          <button
            onClick={() => goMatch(-1)}
            disabled={!total}
            title="Anterior (Shift+Enter)"
            className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            onClick={() => goMatch(1)}
            disabled={!total}
            title="Siguiente (Enter)"
            className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            ↓
          </button>
          <button
            onClick={closeSearch}
            title="Cerrar (Esc)"
            className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      )}

      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-auto p-3">
        {current === 'body' && response.binary && (
          <BinaryView
            binary={response.binary}
            sizeLabel={formatSize(response.sizeBytes)}
            onDownload={exportBody}
          />
        )}

        {current === 'body' && !response.binary && (
          <>
            {parsed.ok && (
              <div className="mb-2 flex items-center gap-2 pr-16 text-xs">
                <button
                  onClick={() => setView(view === 'tree' ? 'raw' : 'tree')}
                  className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  {view === 'tree' ? 'Ver texto' : 'Ver árbol'}
                </button>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar por ruta: data.items[0].name"
                  spellCheck={false}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono outline-none placeholder:text-zinc-500 focus:border-blue-500"
                />
              </div>
            )}

            {isSse && (
              <div className="mb-2 flex items-center gap-2 pr-16 text-xs">
                <button
                  onClick={() => setSseView(sseView === 'events' ? 'text' : 'events')}
                  className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  {sseView === 'events' ? 'Ver texto' : 'Ver eventos'}
                </button>
                {response.stream && (
                  <span className="text-zinc-500">
                    {STREAM_NOTE[response.stream.endedBy]}
                    {response.stream.error && ` (${response.stream.error})`}
                  </span>
                )}
              </div>
            )}
            {isHtml && (
              <div className="mb-2 flex items-center gap-2 pr-16 text-xs">
                <button
                  onClick={() => setHtmlView(htmlView === 'preview' ? 'code' : 'preview')}
                  className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                >
                  {htmlView === 'preview' ? 'Ver código' : 'Vista previa'}
                </button>
                {htmlView === 'preview' && (
                  <span className="text-zinc-500">
                    Sin scripts, imágenes ni estilos externos (por seguridad)
                  </span>
                )}
              </div>
            )}

            <button
              onClick={copy}
              className="absolute right-4 top-3 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>

            {showPreview ? (
              <iframe
                title="Vista previa HTML"
                sandbox=""
                srcDoc={response.body}
                className="h-[65vh] min-h-[320px] w-full rounded border border-zinc-700 bg-white"
              />
            ) : showEvents ? (
              <SseEvents events={sseEvents} />
            ) : treeView ? (
              filtered.found ? (
                <JsonTree
                  value={filtered.value}
                  search={
                    treeSearch
                      ? { query: searchQuery, active: activeIdx, tree: treeSearch }
                      : undefined
                  }
                />
              ) : (
                <p className="text-xs text-amber-400">
                  {filtered.invalid ? 'Ruta mal escrita' : `No existe "${filter}" en la respuesta`}
                </p>
              )
            ) : (
              <pre className="selectable whitespace-pre-wrap break-all font-mono text-xs text-zinc-200">
                <Highlight
                  text={prettyBody || '(respuesta vacía)'}
                  query={searchQuery}
                  start={0}
                  active={activeIdx}
                />
              </pre>
            )}
          </>
        )}

        {current === 'headers' && (
          <table className="selectable w-full text-left font-mono text-xs">
            <tbody>
              {Object.entries(response.headers).map(([key, value]) => (
                <tr key={key} className="border-b border-zinc-800">
                  <td className="py-1.5 pr-4 align-top font-semibold text-blue-300">{key}</td>
                  <td className="break-all py-1.5 text-zinc-300">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {current === 'schema' && validation && <SchemaReport validation={validation} />}

        {current === 'tests' && hasTests && <TestsReport results={assertionResults} />}

        {current === 'changes' && <ChangesReport diff={diff} />}
      </div>
    </div>
  )
}
