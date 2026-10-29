import { useMemo, useState } from 'react'
import { applyQuery, parseQuery } from '../../../shared/params'
import { useRequestStore, type KeyValue } from '../store/useRequestStore'
import { AuthPanel } from './AuthPanel'
import { KeyValueEditor } from './KeyValueEditor'

type Tab = 'params' | 'auth' | 'headers' | 'body'

export function RequestPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('params')
  const { url, headers, body, auth, method, setUrl, setHeaders, setBody } = useRequestStore()

  const tabClass = (t: Tab): string =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      tab === t
        ? 'border-blue-500 text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  // La URL es la fuente de verdad: la tabla se deriva de ella y al editarla se reescribe la URL.
  // Los ids se basan en la posición para que los inputs no pierdan el foco al escribir.
  const paramRows = useMemo<KeyValue[]>(() => {
    const rows = parseQuery(url).map((p, i) => ({
      id: `param-${i}`,
      key: p.key,
      value: p.value,
      enabled: true
    }))
    rows.push({ id: `param-${rows.length}`, key: '', value: '', enabled: true })
    return rows
  }, [url])

  const onParamsChange = (rows: KeyValue[]): void => {
    setUrl(applyQuery(url, rows))
  }

  const paramCount = paramRows.length - 1
  const activeHeaders = headers.filter((h) => h.enabled && h.key.trim()).length
  const bodyDisabled = method === 'GET' || method === 'HEAD'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-zinc-800 px-2">
        <button className={tabClass('params')} onClick={() => setTab('params')}>
          Params {paramCount > 0 && <span className="text-blue-400">({paramCount})</span>}
        </button>
        <button className={tabClass('auth')} onClick={() => setTab('auth')}>
          Auth {auth.type !== 'none' && <span className="text-blue-400">●</span>}
        </button>
        <button className={tabClass('headers')} onClick={() => setTab('headers')}>
          Headers {activeHeaders > 0 && <span className="text-blue-400">({activeHeaders})</span>}
        </button>
        <button className={tabClass('body')} onClick={() => setTab('body')}>
          Body
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'params' && (
          <KeyValueEditor
            rows={paramRows}
            onChange={onParamsChange}
            keyPlaceholder="Parámetro"
            hideToggle
          />
        )}

        {tab === 'auth' && <AuthPanel />}

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