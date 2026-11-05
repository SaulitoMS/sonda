import { useMemo, useState } from 'react'
import { MAX_DATA_ROWS } from '../../../shared/csvData'
import { generateRows, parseColumns, toCsv, toJson } from '../../../shared/dataGen'
import { downloadText } from '../lib/download'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'
const btn =
  'rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50'

const DEFAULT_TEMPLATE = [
  'nombre={{$randomFullName}}',
  'email={{$randomEmail}}',
  'telefono={{$randomPhone}}',
  'id={{$uuid}}'
].join('\n')

const PREVIEW_ROWS = 5

interface Props {
  onClose: () => void
}

export function DataGenModal({ onClose }: Props): React.JSX.Element {
  const [text, setText] = useState(DEFAULT_TEMPLATE)
  const [count, setCount] = useState(20)
  const [seed, setSeed] = useState(0)
  const [copied, setCopied] = useState(false)

  const columns = useMemo(() => parseColumns(text), [text])
  const rows = useMemo(() => {
    void seed // cambia al pulsar "Regenerar" para volver a evaluar las variables
    return columns.length === 0 ? [] : generateRows(columns, count)
  }, [columns, count, seed])

  const copyCsv = async (): Promise<void> => {
    await navigator.clipboard.writeText(toCsv(columns, rows))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title="Generador de datos de prueba" onClose={onClose} wide>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <div>
          <label className={label}>Columnas (una por línea: nombre=plantilla)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            className={`${field} font-mono`}
          />
        </div>
        <div>
          <label className={label}>Filas (máx. {MAX_DATA_ROWS})</label>
          <input
            type="number"
            min={1}
            max={MAX_DATA_ROWS}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className={field}
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        Usa variables dinámicas como {'{{$randomEmail}}'} o {'{{$uuid}}'}: cada celda genera un
        valor nuevo. Carga el archivo en el runner como datos de prueba.
      </p>

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-md border border-zinc-800">
          <table className="w-full text-left text-[11px] text-zinc-300">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.name} className="px-2 py-1 font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  {columns.map((c) => (
                    <td key={c.name} className="max-w-[220px] truncate px-2 py-1">
                      {r[c.name]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-zinc-800 px-2 py-1 text-[11px] text-zinc-500">
            Vista previa: {Math.min(PREVIEW_ROWS, rows.length)} de {rows.length} filas
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
        <button onClick={() => setSeed((s) => s + 1)} disabled={rows.length === 0} className={btn}>
          Regenerar
        </button>
        <button onClick={() => void copyCsv()} disabled={rows.length === 0} className={btn}>
          {copied ? 'Copiado ✓' : 'Copiar CSV'}
        </button>
        <button
          onClick={() => downloadText('datos-de-prueba.json', toJson(rows), 'application/json')}
          disabled={rows.length === 0}
          className={btn}
        >
          Descargar JSON
        </button>
        <button
          onClick={() => downloadText('datos-de-prueba.csv', toCsv(columns, rows), 'text/csv')}
          disabled={rows.length === 0}
          className="btn btn-primary btn-sm"
        >
          Descargar CSV
        </button>
      </div>
    </Modal>
  )
}
