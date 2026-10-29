import { useMemo, useState } from 'react'
import { parseCurl, toCurl, type ParsedCurl } from '../../../shared/curl'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { applyCurl } from '../lib/applyCurl'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { METHOD_COLORS } from './RequestBar'
import { Modal } from './Modal'

type Tab = 'import' | 'export'

interface Props {
  initialTab?: Tab
  onClose: () => void
  onImported: (warnings: string[]) => void
}

type ParseState = { ok: true; value: ParsedCurl } | { ok: false; error: string } | null

const looksLikeJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export function CurlModal({ initialTab = 'import', onClose, onImported }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)

  const tabClass = (t: Tab): string =>
    `px-4 py-2 text-xs font-medium border-b-2 transition ${
      tab === t
        ? 'border-blue-500 text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  return (
    <Modal title="cURL" onClose={onClose} wide>
      <div className="mb-4 flex border-b border-zinc-800">
        <button className={tabClass('import')} onClick={() => setTab('import')}>
          Importar
        </button>
        <button className={tabClass('export')} onClick={() => setTab('export')}>
          Exportar
        </button>
      </div>

      {tab === 'import' ? (
        <ImportTab onClose={onClose} onImported={onImported} />
      ) : (
        <ExportTab onClose={onClose} />
      )}
    </Modal>
  )
}

/* ---------- Importar ---------- */

function ImportTab({
  onClose,
  onImported
}: {
  onClose: () => void
  onImported: (warnings: string[]) => void
}): React.JSX.Element {
  const [text, setText] = useState('')

  const parsed = useMemo<ParseState>(() => {
    if (!text.trim()) return null
    try {
      return { ok: true, value: parseCurl(text) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Comando inválido' }
    }
  }, [text])

  const submit = (): void => {
    if (!parsed?.ok) return
    applyCurl(parsed.value)
    onImported(parsed.value.warnings)
    onClose()
  }

  return (
    <>
      <p className="mb-3 text-xs text-zinc-400">
        Pega un comando <code>curl</code>. Sirve el de Chrome DevTools (Copy as cURL), el de la
        documentación de una API o el de Postman. Reemplaza la petición actual.
      </p>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`curl --request POST \\\n  --url 'https://api.ejemplo.com/users' \\\n  --header 'Content-Type: application/json' \\\n  --data-raw '{"name":"Sonda"}'`}
        spellCheck={false}
        className="h-44 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-blue-500"
      />

      {parsed?.ok && (
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${METHOD_COLORS[parsed.value.method]}`}>
              {parsed.value.method}
            </span>
            <span className="selectable truncate font-mono text-zinc-300">{parsed.value.url}</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {parsed.value.headers.length} headers · {parsed.value.body ? 'con body' : 'sin body'}
          </div>
          {parsed.value.warnings.map((w) => (
            <p key={w} className="mt-1 text-[11px] text-amber-400">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {parsed && !parsed.ok && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {parsed.error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={!parsed?.ok}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Importar
        </button>
      </div>
    </>
  )
}

/* ---------- Exportar ---------- */

function ExportTab({ onClose }: { onClose: () => void }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const headers = useRequestStore((s) => s.headers)
  const body = useRequestStore((s) => s.body)
  const envData = useEnvironmentStore((s) => s.data)

  const [resolve, setResolve] = useState(true)
  const [copied, setCopied] = useState(false)

  const activeEnv = envData.environments.find((e) => e.id === envData.activeId) ?? null

  const output = useMemo(() => {
    // Los secretos nunca se resuelven: se quedan como {{nombre}}
    const vars = resolve
      ? buildVarMap(
          activeEnv
            ? { ...activeEnv, variables: activeEnv.variables.filter((v) => !v.secret) }
            : null
        )
      : {}
    const r = (text: string): string => interpolate(text, vars).text

    const finalHeaders = headers
      .filter((h) => h.enabled && h.key.trim())
      .map((h) => ({ key: r(h.key), value: r(h.value) }))
    const finalBody = body.trim() ? r(body) : ''

    if (
      finalBody &&
      !finalHeaders.some((h) => h.key.toLowerCase() === 'content-type') &&
      looksLikeJson(finalBody)
    ) {
      finalHeaders.push({ key: 'Content-Type', value: 'application/json' })
    }

    return toCurl({ method, url: r(url.trim()), headers: finalHeaders, body: finalBody })
  }, [method, url, headers, body, resolve, activeEnv])

  const hasPlaceholders = /\{\{\s*[\w.-]+\s*\}\}/.test(output)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <label className="mb-3 flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={resolve}
          onChange={(e) => setResolve(e.target.checked)}
          className="accent-blue-500"
        />
        Resolver variables con el entorno {activeEnv ? `"${activeEnv.name}"` : 'activo'}
      </label>

      <pre className="selectable max-h-72 min-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs text-zinc-200">
        {output}
      </pre>

      {hasPlaceholders && (
        <p className="mt-2 text-[11px] text-amber-400">
          ⚠ Quedan variables como {'{{nombre}}'}: son secretos, no están definidas o desactivaste la
          resolución. Reemplázalas antes de ejecutar el comando.
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cerrar
        </button>
        <button
          onClick={copy}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
        >
          {copied ? '¡Copiado!' : 'Copiar cURL'}
        </button>
      </div>
    </>
  )
}