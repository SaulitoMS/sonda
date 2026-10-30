import {
  changeKind,
  emptyAssertion,
  KIND_LABELS,
  needsExpected,
  needsTarget,
  OP_LABELS,
  opsForKind
} from '../../../shared/assertions'
import type { Assertion, AssertionKind, AssertionOp } from '../../../shared/types'
import { useRequestStore } from '../store/useRequestStore'

const KINDS = Object.keys(KIND_LABELS) as AssertionKind[]

const selectClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'

const inputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

const targetPlaceholder: Partial<Record<AssertionKind, string>> = {
  header: 'content-type',
  body: 'data.items[0].id'
}

export function AssertionsPanel(): React.JSX.Element {
  const assertions = useRequestStore((s) => s.assertions)
  const setAssertions = useRequestStore((s) => s.setAssertions)

  const update = (id: string, next: Assertion): void =>
    setAssertions(assertions.map((a) => (a.id === id ? next : a)))
  const patch = (a: Assertion, p: Partial<Assertion>): void => update(a.id, { ...a, ...p })
  const remove = (id: string): void => setAssertions(assertions.filter((a) => a.id !== id))

  return (
    <div className="flex flex-col gap-3">
      {assertions.length === 0 && (
        <p className="text-xs text-zinc-500">
          Aún no hay aserciones. Agrega reglas simples que se evalúan junto al schema cada vez que
          envías la petición o ejecutas la colección.
        </p>
      )}

      {assertions.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={a.enabled}
            onChange={(e) => patch(a, { enabled: e.target.checked })}
            className="accent-blue-500"
            title="Activar o desactivar"
          />

          <select
            value={a.kind}
            onChange={(e) => update(a.id, changeKind(a, e.target.value as AssertionKind))}
            className={selectClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>

          {needsTarget(a.kind) && (
            <input
              value={a.target}
              onChange={(e) => patch(a, { target: e.target.value })}
              placeholder={targetPlaceholder[a.kind]}
              spellCheck={false}
              className={inputClass}
            />
          )}

          <select
            value={a.op}
            onChange={(e) => patch(a, { op: e.target.value as AssertionOp })}
            className={selectClass}
          >
            {opsForKind(a.kind).map((op) => (
              <option key={op} value={op}>
                {OP_LABELS[op]}
              </option>
            ))}
          </select>

          {needsExpected(a.op) && (
            <input
              value={a.expected}
              onChange={(e) => patch(a, { expected: e.target.value })}
              placeholder="Valor esperado"
              spellCheck={false}
              className={inputClass}
            />
          )}

          <button
            onClick={() => remove(a.id)}
            className="px-2 text-zinc-500 hover:text-red-400"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}

      <div>
        <button
          onClick={() => setAssertions([...assertions, emptyAssertion('status')])}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          + Agregar aserción
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        En Body escribe la ruta dentro del JSON, por ejemplo{' '}
        <span className="font-mono text-zinc-400">user.name</span> o{' '}
        <span className="font-mono text-zinc-400">items[0].id</span>. Si defines aserciones y todas
        pasan, el runner da la petición por buena aunque el status sea 4xx (útil para probar errores
        esperados).
      </p>
    </div>
  )
}
