import { useMemo, useState } from 'react'
import {
  buildGraphqlBody,
  GQL_INTROSPECTION_QUERY,
  operationTemplate,
  parseGraphqlBody,
  parseIntrospection,
  type GqlOperation
} from '../../../shared/graphql'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const area =
  'w-full flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

interface Props {
  onClose: () => void
}

export function GraphQLModal({ onClose }: Props): React.JSX.Element {
  const url = useRequestStore((s) => s.url)
  const initial = useMemo(() => parseGraphqlBody(useRequestStore.getState().body), [])

  const [query, setQuery] = useState(initial?.query ?? '')
  const [variables, setVariables] = useState(initial?.variables ?? '')
  const [error, setError] = useState('')
  const [operations, setOperations] = useState<GqlOperation[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const loadSchema = async (): Promise<void> => {
    const s = useRequestStore.getState()
    if (!s.url.trim()) {
      setError('Escribe primero la URL del endpoint GraphQL en la barra superior.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const env = useEnvironmentStore.getState().getActive()
      const { response } = await executeRequest(
        {
          method: 'POST',
          url: s.url,
          headers: s.headers,
          auth: s.auth,
          body: JSON.stringify({ query: GQL_INTROSPECTION_QUERY })
        },
        env,
        { path: s.currentFile }
      )
      if (!response.ok) {
        setError(response.error)
        return
      }
      const parsed = parseIntrospection(response.body)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      setOperations(parsed.operations)
      if (parsed.operations.length === 0) setError('El schema no expone queries ni mutations.')
    } finally {
      setLoading(false)
    }
  }

  const pick = (op: GqlOperation): void => {
    const t = operationTemplate(op)
    setQuery(t.query)
    setVariables(t.variables)
    setError('')
  }

  const apply = (): void => {
    const result = buildGraphqlBody(query, variables)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const s = useRequestStore.getState()
    s.setBody(result.body)
    s.setBodyForm({ ...s.bodyForm, mode: 'raw' })
    // GraphQL viaja casi siempre por POST
    if (s.method === 'GET' || s.method === 'HEAD') s.setMethod('POST')
    onClose()
  }

  const shown = operations.filter((o) => o.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <Modal title="Asistente GraphQL" onClose={onClose} wide>
      <div className="grid h-[52vh] grid-cols-[250px_1fr] gap-4">
        <div className="flex min-h-0 flex-col">
          <button
            onClick={() => void loadSchema()}
            disabled={loading}
            className="rounded bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            title={url || 'Sin URL'}
          >
            {loading ? 'Cargando…' : 'Cargar operaciones del servidor'}
          </button>

          {operations.length > 0 ? (
            <>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar…"
                className="mt-2 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
              />
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-800">
                {shown.map((op) => (
                  <button
                    key={`${op.kind}-${op.name}`}
                    onClick={() => pick(op)}
                    className="block w-full border-b border-zinc-800 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-zinc-800"
                    title={`${op.name}(${op.args.map((a) => `${a.name}: ${a.type}`).join(', ')}): ${op.returns}`}
                  >
                    <span
                      className={`mr-1.5 font-bold ${op.kind === 'query' ? 'text-emerald-400' : 'text-amber-400'}`}
                    >
                      {op.kind === 'query' ? 'Q' : 'M'}
                    </span>
                    <span className="text-zinc-200">{op.name}</span>
                    <span className="block truncate pl-4 text-[11px] text-zinc-500">
                      → {op.returns}
                    </span>
                  </button>
                ))}
                {shown.length === 0 && (
                  <p className="p-2 text-[11px] text-zinc-500">Sin coincidencias.</p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-500">
              Usa la URL y los headers/auth de la petición actual para pedir el schema por
              introspección. Al elegir una operación se arma la query con sus variables.
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <label className={label}>Query</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            placeholder={'query {\n  __typename\n}'}
            className={`${area} min-h-0 flex-[2]`}
          />
          <label className={label}>Variables (JSON)</label>
          <textarea
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            spellCheck={false}
            placeholder={'{\n  "id": "1"\n}'}
            className={`${area} min-h-0 flex-1`}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          onClick={apply}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
        >
          Aplicar al body
        </button>
      </div>
    </Modal>
  )
}