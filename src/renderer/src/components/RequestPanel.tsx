import { useMemo, useState } from 'react'
import { BODY_MODES } from '../../../shared/bodyForm'
import { applyQuery, parseQuery } from '../../../shared/params'
import type { SchemaValidation } from '../../../shared/types'
import { validateRequestBody } from '../../../shared/validate'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore, type KeyValue } from '../store/useRequestStore'
import { AssertionsPanel } from './AssertionsPanel'
import { AuthPanel } from './AuthPanel'
import { BodyFormEditor } from './BodyFormEditor'
import { ExtractionsPanel } from './ExtractionsPanel'
import { KeyValueEditor } from './KeyValueEditor'
import { RequestSchemaStatus } from './RequestSchemaStatus'
import { editForKey } from '../../../shared/jsonEditing'
import { applyEdit } from '../lib/applyEdit'
import { VariableTextarea } from './VariableTextarea'

type Tab = 'params' | 'auth' | 'headers' | 'body' | 'tests' | 'extract'

export function RequestPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('params')
  const {
    url,
    headers,
    body,
    bodyForm,
    auth,
    assertions,
    extractions,
    requestSchema,
    method,
    setUrl,
    setHeaders,
    setBody,
    setBodyForm
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

  // Valida el body tal como se enviaría: con las {{variables}} del entorno activo ya resueltas.
  // El schema de la spec es de JSON, así que solo aplica al body de texto.
  const bodyCheck = useMemo<SchemaValidation | null>(() => {
    if (!requestSchema || bodyForm.mode !== 'raw') return null
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
  }, [requestSchema, body, bodyForm.mode, method, envData])

  // Error de sintaxis del JSON escrito. Con {{variables}} aún no es JSON válido, no se molesta
  const jsonError = useMemo<string | null>(() => {
    const text = body.trim()
    if (!text || !/^[[{]/.test(text) || /\{\{.*?\}\}/.test(text)) return null
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

  // Sangría y cierre automático de {, [ y " mientras se escribe JSON
  const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // AltGr llega como Ctrl+Alt: es parte de escribir "{" o "[" en teclados en español
    if (e.nativeEvent.isComposing || e.metaKey || (e.ctrlKey && !e.altKey)) return

    const el = e.currentTarget
    const edit = editForKey(
      { value: el.value, start: el.selectionStart, end: el.selectionEnd },
      e.key,
      e.shiftKey
    )
    if (!edit) return

    e.preventDefault()
    applyEdit(el, edit, setBody)
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
          Auth{' '}
          {auth.type !== 'inherit' && auth.type !== 'none' && (
            <span className="text-blue-400">●</span>
          )}
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

            <div className="flex items-center gap-2">
              {BODY_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setBodyForm({ ...bodyForm, mode: m.id })}
                  className={`rounded px-2 py-1 text-xs ${
                    bodyForm.mode === m.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {bodyForm.mode === 'raw' ? (
              <>
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
                <VariableTextarea
                  value={body}
                  onChange={setBody}
                  onKeyDown={onBodyKeyDown}
                  placeholder={'{\n  "nombre": "Sonda"\n}'}
                  className="min-h-48 flex-1"
                />
                {bodyCheck && <RequestSchemaStatus validation={bodyCheck} />}
              </>
            ) : (
              <BodyFormEditor
                mode={bodyForm.mode}
                fields={bodyForm.fields}
                onChange={(fields) => setBodyForm({ ...bodyForm, fields })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
