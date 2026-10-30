import { useMemo, useState } from 'react'
import { applyQuery, parseQuery } from '../../../shared/params'
import type { SchemaValidation } from '../../../shared/types'
import { validateRequestBody } from '../../../shared/validate'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore, type KeyValue } from '../store/useRequestStore'
import { AssertionsPanel } from './AssertionsPanel'
import { AuthPanel } from './AuthPanel'
import { ExtractionsPanel } from './ExtractionsPanel'
import { KeyValueEditor } from './KeyValueEditor'
import { RequestSchemaStatus } from './RequestSchemaStatus'

type Tab = 'params' | 'auth' | 'headers' | 'body' | 'tests' | 'extract'

export function RequestPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('params')
  const {
    url,
    headers,
    body,
    auth,
    assertions,
    extractions,
    requestSchema,
    method,
    setUrl,
    setHeaders,
    setBody
  } = useRequestStore()
  const envData = useEnvironmentStore((s) => s.data)

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

  // Valida el body tal como se enviaría: con las {{variables}} del entorno activo ya resueltas
  const bodyCheck = useMemo<SchemaValidation | null>(() => {
    if (!requestSchema) return null
    const env = envData.environments.find((e) => e.id === envData.activeId)
    const { text, missing } = interpolate(body, buildVarMap(env))
    if (missing.length > 0) {
      const names = missing.map((n) => `{{${n}}}`).join(', ')
      return {
        verdict: 'skipped',
        message: `El body usa variables sin definir (${names}), no se puede validar.`,
        issues: [],
        truncated: false
      }
    }
    return validateRequestBody({ schema: requestSchema, method, body: text })
  }, [requestSchema, body, method, envData])

  const paramCount = paramRows.length - 1
  const activeHeaders = headers.filter((h) => h.enabled && h.key.trim()).length
  const bodyDisabled = method === 'GET' || method === 'HEAD'

  const jsonError = useMemo<string | null>(() => {
    const text = body.trim()
    if (!text || !/^[[{]/.test(text)) return null
    // Con {{variables}} no es JSON válido todavía; no molestamos
    if (/\{\{.*?\}\}/.test(text)) return null
    try {
      JSON.parse(text)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'JSON inválido'
    }
  }, [body])

  const formatBody = (): void => {
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2))
    } catch {
      /* si no es JSON, no se toca */
    }
  }

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
          Body {bodyCheck?.verdict === 'valid' && <span className="text-emerald-400">✓</span>}
          {bodyCheck?.verdict === 'invalid' && (
            <span className="text-red-400">
              ✗ {bodyCheck.issues.filter((i) => i.severity === 'error').length}
            </span>
          )}
        </button>
        <button className={tabClass('tests')} onClick={() => setTab('tests')}>
          Tests{' '}
          {assertions.length > 0 && <span className="text-blue-400">({assertions.length})</span>}
        </button>
        <button className={tabClass('extract')} onClick={() => setTab('extract')}>
          Extraer{' '}
          {extractions.length > 0 && <span className="text-blue-400">({extractions.length})</span>}
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

        {tab === 'tests' && <AssertionsPanel />}

        {tab === 'extract' && <ExtractionsPanel />}

        {tab === 'body' && (
          <div className="flex h-full flex-col gap-3">
            {bodyDisabled && (
              <p className="text-xs text-amber-400">
                {method} no envía body. Cambia el método para usarlo.
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className={`text-xs ${jsonError ? 'text-red-400' : 'text-zinc-500'}`}>
                {jsonError ? `JSON inválido: ${jsonError}` : 'JSON'}
              </span>
              <button
                onClick={formatBody}
                disabled={!body.trim()}
                className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                Formatear
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'{\n  "nombre": "Sonda"\n}'}
              spellCheck={false}
              className="min-h-48 w-full flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
            />
            {bodyCheck && <RequestSchemaStatus validation={bodyCheck} />}
          </div>
        )}
      </div>
    </div>
  )
}
