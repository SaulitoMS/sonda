import { looksLikeCurl, parseCurl } from '../../../shared/curl'
import type { HttpMethod } from '../../../shared/types'
import { applyCurl } from '../lib/applyCurl'
import { cancelInFlight } from '../lib/inFlight'
import { METHOD_COLORS } from '../lib/methodColors'
import { useRequestStore } from '../store/useRequestStore'
import { useTabsStore } from '../store/useTabsStore'
import { Icon } from './Icon'
import { VariableInput } from './VariableInput'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

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
    // En pantallas estrechas la URL baja a su propia fila
    <div className="flex flex-wrap items-stretch gap-2 border-b border-zinc-800 p-3 sm:flex-nowrap">
      <div className="relative">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
          aria-label="Método HTTP"
          className={`h-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-3 pr-8 text-sm font-bold outline-none transition-colors hover:border-zinc-600 focus:border-blue-500 ${METHOD_COLORS[method]}`}
        >
          {METHODS.map((m) => (
            <option key={m} value={m} className="text-zinc-200">
              {m}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>

      <div
        className="order-last flex min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1"
        onPaste={handlePaste}
      >
        <VariableInput
          value={url}
          onChange={setUrl}
          onEnter={send}
          placeholder="https://api.ejemplo.com/endpoint  (o pega un comando curl)"
        />
      </div>

      {loading ? (
        <button
          onClick={() => cancelInFlight(useTabsStore.getState().activeId)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 active:scale-[0.98] sm:ml-0"
        >
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Cancelar
        </button>
      ) : (
        <button
          onClick={send}
          disabled={!url.trim()}
          title={`Enviar (${MOD}+Enter)`}
          className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
        >
          <Icon name="send" size={14} />
          Enviar
          <kbd className="hidden rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium lg:inline">
            {MOD}↵
          </kbd>
        </button>
      )}
    </div>
  )
}