import type { HttpMethod } from '../../../shared/types'
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

export function RequestBar(): React.JSX.Element {
  const { method, url, loading, setMethod, setUrl, send } = useRequestStore()

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

      <VariableInput
        value={url}
        onChange={setUrl}
        onEnter={send}
        placeholder="https://api.ejemplo.com/endpoint"
      />

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