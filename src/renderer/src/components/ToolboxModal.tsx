import { useEffect, useMemo, useState } from 'react'
import {
  describeTimestamp,
  escapeHtml,
  escapeJsonString,
  formatJson,
  fromBase64,
  fromHex,
  hashText,
  jsonToQuery,
  minifyJson,
  queryToJson,
  toBase64,
  toBase64Url,
  toHex,
  unescapeHtml,
  unescapeJsonString,
  urlDecode,
  urlEncode,
  type HashAlgo
} from '../../../shared/encoders'
import { Modal } from './Modal'

const MODES = [
  { id: 'b64-enc', label: 'Base64 · codificar' },
  { id: 'b64-dec', label: 'Base64 · decodificar' },
  { id: 'b64u-enc', label: 'Base64url · codificar (JWT)' },
  { id: 'url-enc', label: 'URL · codificar' },
  { id: 'url-dec', label: 'URL · decodificar' },
  { id: 'qs-json', label: 'Query string → JSON' },
  { id: 'json-qs', label: 'JSON → query string' },
  { id: 'json-fmt', label: 'JSON · formatear' },
  { id: 'json-min', label: 'JSON · minificar' },
  { id: 'json-esc', label: 'Texto → string JSON (escapar)' },
  { id: 'json-unesc', label: 'String JSON → texto (desescapar)' },
  { id: 'hex-enc', label: 'Hex · codificar' },
  { id: 'hex-dec', label: 'Hex · decodificar' },
  { id: 'html-esc', label: 'HTML · escapar entidades' },
  { id: 'html-unesc', label: 'HTML · desescapar entidades' },
  { id: 'ts', label: 'Timestamp ↔ fecha' },
  { id: 'sha1', label: 'Hash SHA-1' },
  { id: 'sha256', label: 'Hash SHA-256' },
  { id: 'sha512', label: 'Hash SHA-512' }
] as const

type Mode = (typeof MODES)[number]['id']

const HASH_ALGO: Partial<Record<Mode, HashAlgo>> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512'
}

/** Operación inversa: al usar el resultado como entrada, se cambia a la opuesta */
const SWAP: Partial<Record<Mode, Mode>> = {
  'b64-enc': 'b64-dec',
  'b64-dec': 'b64-enc',
  'url-enc': 'url-dec',
  'url-dec': 'url-enc',
  'qs-json': 'json-qs',
  'json-qs': 'qs-json',
  'json-esc': 'json-unesc',
  'json-unesc': 'json-esc',
  'hex-enc': 'hex-dec',
  'hex-dec': 'hex-enc',
  'b64u-enc': 'b64-dec',
  'html-esc': 'html-unesc',
  'html-unesc': 'html-esc'
}

interface Result {
  text: string
  error: boolean
}

function convert(mode: Mode, input: string): Result {
  try {
    switch (mode) {
      case 'b64-enc':
        return { text: toBase64(input), error: false }
      case 'b64-dec':
        return { text: fromBase64(input), error: false }
      case 'b64u-enc':
        return { text: toBase64Url(input), error: false }
      case 'url-enc':
        return { text: urlEncode(input), error: false }
      case 'url-dec':
        return { text: urlDecode(input), error: false }
      case 'qs-json':
        return { text: queryToJson(input), error: false }
      case 'json-qs':
        return { text: jsonToQuery(input), error: false }
      case 'json-fmt':
        return { text: formatJson(input), error: false }
      case 'json-min':
        return { text: minifyJson(input), error: false }
      case 'json-esc':
        return { text: escapeJsonString(input), error: false }
      case 'json-unesc':
        return { text: unescapeJsonString(input), error: false }
      case 'hex-enc':
        return { text: toHex(input), error: false }
      case 'hex-dec':
        return { text: fromHex(input), error: false }
      case 'html-esc':
        return { text: escapeHtml(input), error: false }
      case 'html-unesc':
        return { text: unescapeHtml(input), error: false }
      case 'ts':
        return { text: describeTimestamp(input), error: false }
      default:
        return { text: '', error: false }
    }
  } catch (err) {
    return { text: err instanceof Error ? err.message : 'Entrada inválida', error: true }
  }
}

export function ToolboxModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('b64-dec')
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  // El hash es asíncrono: se guarda con la clave que lo originó para descartar resultados viejos
  const [hash, setHash] = useState<{ key: string; value: string } | null>(null)

  const algo = HASH_ALGO[mode]
  const hashKey = `${mode}|${input}`

  useEffect(() => {
    if (!algo || !input) return
    let cancelled = false
    hashText(algo, input)
      .then((value) => {
        if (!cancelled) setHash({ key: hashKey, value })
      })
      .catch(() => {
        if (!cancelled) setHash({ key: hashKey, value: 'No se pudo calcular el hash' })
      })
    return () => {
      cancelled = true
    }
  }, [algo, input, hashKey])

  const result = useMemo<Result>(() => {
    if (!input) return { text: '', error: false }
    if (algo) return { text: hash?.key === hashKey ? hash.value : '', error: false }
    return convert(mode, input)
  }, [mode, input, algo, hash, hashKey])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(result.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title="Caja de herramientas" onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-300">
        <span>Operación</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Pega aquí el texto…"
        spellCheck={false}
        className="h-32 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-blue-500"
      />

      <pre
        className={`selectable mt-3 max-h-60 min-h-20 overflow-auto whitespace-pre-wrap break-all rounded-md border p-3 font-mono text-xs ${
          result.error
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : 'border-zinc-800 bg-zinc-950/60 text-zinc-200'
        }`}
      >
        {result.text}
      </pre>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={() => {
            setInput(result.text)
            setMode(SWAP[mode] ?? mode)
          }}
          disabled={!result.text || result.error}
          className="btn btn-ghost disabled:opacity-40"
        >
          Usar resultado como entrada
        </button>
        <button onClick={copy} disabled={!result.text || result.error} className="btn btn-primary">
          {copied ? '¡Copiado!' : 'Copiar resultado'}
        </button>
      </div>
    </Modal>
  )
}
