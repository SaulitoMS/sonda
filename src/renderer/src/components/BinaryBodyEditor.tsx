import { BINARY_FIELD } from '../../../shared/bodyForm'
import type { FormField } from '../../../shared/types'

interface Props {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

export function BinaryBodyEditor({ fields, onChange }: Props): React.JSX.Element {
  const current = fields.find((f) => f.key === BINARY_FIELD)
  const path = current?.value ?? ''

  const setPath = (value: string): void => {
    const others = fields.filter((f) => f.key !== BINARY_FIELD)
    const field: FormField = {
      id: current?.id ?? crypto.randomUUID(),
      key: BINARY_FIELD,
      value,
      type: 'file',
      enabled: true
    }
    onChange([field, ...others])
  }

  const pick = async (): Promise<void> => {
    const picked = await window.api.pickFile()
    if (picked) setPath(picked)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500">
        El archivo se envía tal cual como body (sin multipart). Si no defines Content-Type, Sonda
        usa application/octet-stream. Máximo 100 MB.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Ruta del archivo (acepta {{variables}})"
          spellCheck={false}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
        <button
          onClick={() => void pick()}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          Elegir archivo…
        </button>
      </div>
      {path && !path.includes('{{') && (
        <p className="text-[11px] text-zinc-500">Archivo: {fileName(path)}</p>
      )}
    </div>
  )
}
