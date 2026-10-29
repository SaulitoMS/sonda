import { looksLikeCurl, parseCurl } from '../../../shared/curl'
import type { HttpMethod } from '../../../shared/types'
import { applyCurl } from '../lib/applyCurl'
import { useRequestStore } from '../store/useRequestStore'
import { VariableInput } from './VariableInput'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-red-400',
  HEAD: 'text-zinc-300',
  OPTIONS: 'text-zinc-300'
}

interface Props {
  onCurlImported?: (warnings: string[]) => void
}

export function RequestBar({ onCurlImported }: Props): React.JSX.Element {
  const { method, url, loading, setMethod, setUrl, send } = useRequestStore()

  // Si lo pegado es un comando cURL válido, se importa en vez de escribirlo en la URL
  const handlePaste = (e: React.ClipboardEvent): void => {
    const text = e.clipboardData.getData('text')
    if (!looksLikeCurl(text)) return
    try {
      const parsed = parseCurl(text)
      e.preventDefault()
      applyCurl(parsed)
      onCurlImported?.(parsed.warnings)
    } catch {
      // Si no se puede interpretar, se pega como texto normal
    }
  }

  return (
    <div className="flex gap-2 border-b border-zinc-800 p-3">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as HttpMethod)}
        className={`rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 ${METHOD_COLORS[method]}`}
      >
        {METHODS.map((m) => (
          <option key={m} value={m} className="text-zinc-200">
            {m}
          </option>
        ))}
      </select>

      <div className="flex flex-1" onPaste={handlePaste}>
        <VariableInput
          value={url}
          onChange={setUrl}
          onEnter={send}
          placeholder="https://api.ejemplo.com/endpoint  (o pega un comando curl)"
        />
      </div>

      <button
        onClick={send}
        disabled={loading || !url.trim()}
        className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Enviando…' : 'Enviar'}
      </button>
    </div>
  )
}