import { newRow, type KeyValue } from '../store/useRequestStore'
import { VariableInput } from './VariableInput'

interface Props {
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** Oculta el checkbox de activar/desactivar (ej: la tabla de Params, que vive en la URL) */
  hideToggle?: boolean
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Clave',
  valuePlaceholder = 'Valor',
  hideToggle = false
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

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          {!hideToggle && (
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => update(row.id, { enabled: e.target.checked })}
              className="accent-blue-500"
            />
          )}
          <VariableInput
            value={row.key}
            onChange={(key) => update(row.id, { key })}
            placeholder={keyPlaceholder}
          />
          <VariableInput
            value={row.value}
            onChange={(value) => update(row.id, { value })}
            placeholder={valuePlaceholder}
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