import { conditionalHeader, isConditionalKey } from '../../../shared/conditional'
import { useRequestStore } from '../store/useRequestStore'
import { Icon } from './Icon'

export function ConditionalResend({
  responseHeaders
}: {
  responseHeaders: Record<string, string>
}): React.JSX.Element | null {
  const method = useRequestStore((s) => s.method)
  const headers = useRequestStore((s) => s.headers)
  const loading = useRequestStore((s) => s.loading)
  const setHeaders = useRequestStore((s) => s.setHeaders)
  const send = useRequestStore((s) => s.send)

  const cond = conditionalHeader(responseHeaders)
  if (!cond || (method !== 'GET' && method !== 'HEAD')) return null

  const resend = (): void => {
    const rest = headers.filter((h) => !isConditionalKey(h.key))
    setHeaders([
      ...rest,
      { id: crypto.randomUUID(), key: cond.key, value: cond.value, enabled: true }
    ])
    void send()
  }

  return (
    <div className="selectable mb-5 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-zinc-200">Probar petición condicional</p>
        <p className="break-all text-zinc-500">
          Reenvía con {cond.key}: {cond.value}. Si no cambió, el servidor debería responder 304 sin
          body. El header queda agregado en la pestaña Headers.
        </p>
      </div>
      <button
        onClick={resend}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        <Icon name="send" size={13} />
        Reenviar
      </button>
    </div>
  )
}
