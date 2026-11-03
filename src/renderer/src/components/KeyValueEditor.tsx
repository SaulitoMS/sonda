import { useState } from 'react'
import { bulkToRows, rowsToBulk } from '../../../shared/bulkEdit'
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
  const [bulk, setBulk] = useState(false)
  const [text, setText] = useState('')
  const withToggle = !hideToggle

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

  const openBulk = (): void => {
    setText(rowsToBulk(rows, withToggle))
    setBulk(true)
  }

  const onBulkChange = (value: string): void => {
    setText(value)
    const parsed = bulkToRows(value, withToggle).map((r, i) => ({
      ...r,
      id: rows[i]?.id ?? crypto.randomUUID()
    }))
    onChange([...parsed, newRow()])
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => (bulk ? setBulk(false) : openBulk())}
        className="self-end text-[11px] text-zinc-500 hover:text-zinc-200"
      >
        {bulk ? 'Volver a la tabla' : 'Edición en bloque'}
      </button>

      {bulk ? (
        <>
          <textarea
            value={text}
            onChange={(e) => onBulkChange(e.target.value)}
            spellCheck={false}
            placeholder={`${keyPlaceholder}: ${valuePlaceholder}`}
            className="min-h-40 resize-y rounded-md border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs leading-relaxed outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
          <p className="text-[11px] text-zinc-500">
            Una por línea, como <code>clave: valor</code>.
            {withToggle && ' Empieza la línea con // para desactivarla.'}
          </p>
        </>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            {withToggle && (
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
        ))
      )}
    </div>
  )
}