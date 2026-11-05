import { useState } from 'react'
import { Icon } from './Icon'

interface Props {
  headers: Record<string, string>
}

export function HeadersTable({ headers }: Props): React.JSX.Element {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = async (id: string, text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey((c) => (c === id ? null : c)), 1200)
  }

  const entries = Object.entries(headers)
  const allAsText = entries.map(([k, v]) => `${k}: ${v}`).join('\n')

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => copy('*all', allAsText)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Icon name={copiedKey === '*all' ? 'check' : 'copy'} size={12} />
          {copiedKey === '*all' ? '¡Copiado!' : 'Copiar todos'}
        </button>
      </div>
      <table className="selectable w-full text-left font-mono text-xs">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="group border-b border-zinc-800">
              <td className="py-1.5 pr-4 align-top font-semibold text-blue-300">{key}</td>
              <td className="break-all py-1.5 text-zinc-300">{value}</td>
              <td className="w-8 py-1.5 text-right align-top">
                <button
                  onClick={() => copy(key, value)}
                  title="Copiar valor"
                  className="rounded p-1 text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-100 focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon
                    name={copiedKey === key ? 'check' : 'copy'}
                    size={12}
                    className={copiedKey === key ? 'text-emerald-400' : ''}
                  />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
