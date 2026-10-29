import { newRow, type KeyValue } from '../store/useRequestStore'

interface Props {
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Clave',
  valuePlaceholder = 'Valor'
}: Props): React.JSX.Element {
  const update = (id: string, patch: Partial<KeyValue>): void => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    // Siempre dejamos una fila vacía al final
    const last = next[next.length - 1]
    if (last.key || last.value) next.push(newRow())
    onChange(next)
  }

  const remove = (id: string): void => {
    const next = rows.filter((r) => r.id !== id)
    onChange(next.length ? next : [newRow()])
  }

  const inputClass =
    'flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(row.id, { enabled: e.target.checked })}
            className="accent-blue-500"
          />
          <input
            value={row.key}
            onChange={(e) => update(row.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            spellCheck={false}
            className={inputClass}
          />
          <input
            value={row.value}
            onChange={(e) => update(row.id, { value: e.target.value })}
            placeholder={valuePlaceholder}
            spellCheck={false}
            className={inputClass}
          />
          <button
            onClick={() => remove(row.id)}
            className="px-2 text-zinc-500 hover:text-red-400"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}