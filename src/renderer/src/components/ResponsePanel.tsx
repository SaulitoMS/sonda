import { useMemo, useState } from 'react'
import { useRequestStore } from '../store/useRequestStore'

type Tab = 'body' | 'headers'

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

export function ResponsePanel(): React.JSX.Element {
  const { response, loading } = useRequestStore()
  const [tab, setTab] = useState<Tab>('body')
  const [copied, setCopied] = useState(false)

  const prettyBody = useMemo(() => {
    if (!response || !response.ok) return ''
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2)
    } catch {
      return response.body
    }
  }, [response])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(prettyBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const tabClass = (t: Tab): string =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      tab === t
        ? 'border-blue-500 text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Enviando petición…
      </div>
    )
  }

  if (!response) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Envía una petición para ver la respuesta
      </div>
    )
  }

  if (!response.ok) {
    return (
      <div className="flex-1 p-4">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-400">Error en la petición</p>
          <p className="selectable mt-1 font-mono text-xs text-red-300">{response.error}</p>
          <p className="mt-2 text-xs text-zinc-500">{response.timeMs} ms</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex">
          <button className={tabClass('body')} onClick={() => setTab('body')}>
            Body
          </button>
          <button className={tabClass('headers')} onClick={() => setTab('headers')}>
            Headers ({Object.keys(response.headers).length})
          </button>
        </div>

        <div className="flex items-center gap-3 pr-2 text-xs">
          <span className={`rounded px-2 py-1 font-bold ${statusColor(response.status)}`}>
            {response.status} {response.statusText}
          </span>
          <span className="text-zinc-400">{response.timeMs} ms</span>
          <span className="text-zinc-400">{formatSize(response.sizeBytes)}</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto p-3">
        {tab === 'body' && (
          <>
            <button
              onClick={copy}
              className="absolute right-4 top-3 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
            <pre className="selectable whitespace-pre-wrap break-all font-mono text-xs text-zinc-200">
              {prettyBody || '(respuesta vacía)'}
            </pre>
          </>
        )}

        {tab === 'headers' && (
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
      </div>
    </div>
  )
}
