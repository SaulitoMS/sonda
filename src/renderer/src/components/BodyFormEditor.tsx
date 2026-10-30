import { newField } from '../../../shared/bodyForm'
import type { BodyMode, FormField } from '../../../shared/types'

interface Props {
  mode: Exclude<BodyMode, 'raw'>
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

export function BodyFormEditor({ mode, fields, onChange }: Props): React.JSX.Element {
  const update = (id: string, patch: Partial<FormField>): void => {
    const next = fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    // Siempre dejamos una fila vacía al final
    const last = next[next.length - 1]
    if (last.key || last.value) next.push(newField())
    onChange(next)
  }

  const remove = (id: string): void => {
    const next = fields.filter((f) => f.id !== id)
    onChange(next.length ? next : [newField()])
  }

  const pick = async (id: string): Promise<void> => {
    const path = await window.api.pickFile()
    if (path) update(id, { value: path })
  }

  const inputClass =
    'flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

  return (
    <div className="flex flex-col gap-2">
      {mode === 'form-data' && (
        <p className="text-xs text-zinc-500">
          Se envía como multipart/form-data. El Content-Type lo pone Sonda con su boundary.
        </p>
      )}

      {fields.map((f) => (
        <div key={f.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.enabled}
            onChange={(e) => update(f.id, { enabled: e.target.checked })}
            className="accent-blue-500"
          />
          <input
            value={f.key}
            onChange={(e) => update(f.id, { key: e.target.value })}
            placeholder="Campo"
            spellCheck={false}
            className={inputClass}
          />

          {mode === 'form-data' && (
            <select
              value={f.type}
              // Al cambiar de tipo se vacía el valor: un texto no es una ruta de archivo
              onChange={(e) => update(f.id, { type: e.target.value as 'text' | 'file', value: '' })}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none"
            >
              <option value="text">Texto</option>
              <option value="file">Archivo</option>
            </select>
          )}

          {f.type === 'file' && mode === 'form-data' ? (
            <button
              onClick={() => void pick(f.id)}
              title={f.value}
              className={`${inputClass} truncate text-left ${f.value ? 'text-zinc-200' : 'text-zinc-500'}`}
            >
              {f.value ? fileName(f.value) : 'Elegir archivo…'}
            </button>
          ) : (
            <input
              value={f.value}
              onChange={(e) => update(f.id, { value: e.target.value })}
              placeholder="Valor"
              spellCheck={false}
              className={inputClass}
            />
          )}

          <button
            onClick={() => remove(f.id)}
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
