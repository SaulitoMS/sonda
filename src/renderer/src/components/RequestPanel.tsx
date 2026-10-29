import { useState } from 'react'
import { useRequestStore } from '../store/useRequestStore'
import { KeyValueEditor } from './KeyValueEditor'

type Tab = 'headers' | 'body'

export function RequestPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('headers')
  const { headers, body, method, setHeaders, setBody } = useRequestStore()

  const tabClass = (t: Tab): string =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      tab === t
        ? 'border-blue-500 text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  const activeHeaders = headers.filter((h) => h.enabled && h.key.trim()).length
  const bodyDisabled = method === 'GET' || method === 'HEAD'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-zinc-800 px-2">
        <button className={tabClass('headers')} onClick={() => setTab('headers')}>
          Headers {activeHeaders > 0 && <span className="text-blue-400">({activeHeaders})</span>}
        </button>
        <button className={tabClass('body')} onClick={() => setTab('body')}>
          Body
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'headers' && <KeyValueEditor rows={headers} onChange={setHeaders} />}

        {tab === 'body' && (
          <>
            {bodyDisabled && (
              <p className="mb-2 text-xs text-amber-400">
                {method} no envía body. Cambia el método para usarlo.
              </p>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'{\n  "nombre": "Sonda"\n}'}
              spellCheck={false}
              className="h-full min-h-48 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
            />
          </>
        )}
      </div>
    </div>
  )
}