import { useMemo, useState } from 'react'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { buildAuth } from '../../../shared/auth'
import { appendQuery } from '../../../shared/params'
import { applyCurl } from '../lib/applyCurl'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { METHOD_COLORS } from '../lib/methodColors'
import { Modal } from './Modal'
import { parseCurl, type ParsedCurl } from '../../../shared/curl'
import { CODE_LANGS, generateCode, type CodeLang } from '../../../shared/codegen'
import { formDataParts, urlencodedBody } from '../../../shared/bodyForm'
import { buildAuth, emptyAuth } from '../../../shared/auth'
import { resolveAuthFor } from '../lib/inheritedAuth'
import { useCollectionsStore } from '../store/useCollectionsStore'

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

export function CurlModal({
  initialTab = 'import',
  onClose,
  onImported
}: Props): React.JSX.Element {
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
  const ownAuth = useRequestStore((s) => s.auth)
  const currentFile = useRequestStore((s) => s.currentFile)
  const collections = useCollectionsStore((s) => s.collections)
  // Se exporta la auth que de verdad se enviaría (la heredada, si la petición hereda)
  const auth = useMemo(
    () => resolveAuthFor(collections, ownAuth, currentFile).auth ?? emptyAuth(),
    [collections, ownAuth, currentFile]
  )
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const headers = useRequestStore((s) => s.headers)
  const body = useRequestStore((s) => s.body)
  const envData = useEnvironmentStore((s) => s.data)
  const bodyForm = useRequestStore((s) => s.bodyForm)

  const [resolve, setResolve] = useState(true)
  const [lang, setLang] = useState<CodeLang>('curl')
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
    const r = (text: string): string => interpolate(text, vars, { dynamic: resolve }).text

    const mode = bodyForm.mode
    const finalHeaders = headers
      .filter((h) => h.enabled && h.key.trim())
      // En form-data el Content-Type lleva el boundary y lo pone quien ejecute el código
      .filter((h) => mode !== 'form-data' || h.key.trim().toLowerCase() !== 'content-type')
      .map((h) => ({ key: r(h.key), value: r(h.value) }))

    const finalBody =
      mode === 'urlencoded'
        ? urlencodedBody(bodyForm.fields, r)
        : mode === 'raw' && body.trim()
          ? r(body)
          : ''
    const formData = mode === 'form-data' ? formDataParts(bodyForm.fields, r) : undefined

    if (finalBody && !finalHeaders.some((h) => h.key.toLowerCase() === 'content-type')) {
      if (mode === 'urlencoded') {
        finalHeaders.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
      } else if (looksLikeJson(finalBody)) {
        finalHeaders.push({ key: 'Content-Type', value: 'application/json' })
      }
    }

    // Basic se exporta con --user (así los {{secretos}} no se codifican en base64 sin resolver)
    const basicUser = auth.type === 'basic' ? `${r(auth.username)}:${r(auth.password)}` : undefined
    const authParts = buildAuth(auth.type === 'basic' ? null : auth, r)
    for (const h of authParts.headers) {
      if (!finalHeaders.some((x) => x.key.toLowerCase() === h.key.toLowerCase())) {
        finalHeaders.push(h)
      }
    }

    return generateCode(lang, {
      method,
      url: appendQuery(r(url.trim()), authParts.query),
      headers: finalHeaders,
      body: finalBody,
      formData,
      user: basicUser === ':' ? undefined : basicUser
    })
  }, [method, url, headers, body, bodyForm, auth, resolve, activeEnv, lang])

  const hasPlaceholders = /\{\{\s*\$?[\w.-]+\s*\}\}/.test(output)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-300">
        <span>Lenguaje</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as CodeLang)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
        >
          {CODE_LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

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
          resolución. Reemplázalas antes de ejecutarlo.
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
          {copied ? '¡Copiado!' : 'Copiar código'}
        </button>
      </div>
    </>
  )
}
