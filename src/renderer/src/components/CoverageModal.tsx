import { useEffect, useMemo, useState } from 'react'
import {
  coverageOf,
  summarizeCoverage,
  type CoverageLevel,
  type RequestCoverage
} from '../../../shared/coverage'
import type { RequestItem } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useTabsStore } from '../store/useTabsStore'
import { Modal } from './Modal'

interface Row {
  item: RequestItem
  group: string
  cov: RequestCoverage
}

const LEVEL: Record<CoverageLevel, { label: string; cls: string }> = {
  none: { label: 'Sin aserciones', cls: 'bg-red-500/15 text-red-400' },
  basic: { label: 'Parcial', cls: 'bg-amber-500/15 text-amber-400' },
  good: { label: 'Completa', cls: 'bg-emerald-500/15 text-emerald-400' }
}

const ORDER: Record<CoverageLevel, number> = { none: 0, basic: 1, good: 2 }

const pct = (part: number, total: number): number =>
  total === 0 ? 0 : Math.round((part / total) * 100)

function Meter({
  label,
  part,
  total,
  hint
}: {
  label: string
  part: number
  total: number
  hint: string
}): React.JSX.Element {
  const value = pct(part, total)
  return (
    <div className="flex-1 rounded-md border border-zinc-800 p-3" title={hint}>
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-100">
        {value}%
        <span className="ml-2 text-xs font-normal text-zinc-500">
          {part} de {total}
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full ${value >= 80 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

interface Props {
  collectionId: string
  collectionName: string
  onClose: () => void
}

export function CoverageModal({ collectionId, collectionName, onClose }: Props): React.JSX.Element {
  const collection = useCollectionsStore((s) => s.collections.find((c) => c.id === collectionId))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [onlyGaps, setOnlyGaps] = useState(true)

  const entries = useMemo(() => {
    if (!collection) return []
    return [
      ...collection.folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
      ...collection.requests.map((item) => ({ item, group: '' }))
    ]
  }, [collection])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      entries.map(async ({ item, group }): Promise<Row | null> => {
        try {
          return { item, group, cov: coverageOf(await window.api.readRequest(item.path)) }
        } catch {
          return null // un archivo ilegible no debe tumbar el análisis
        }
      })
    ).then((all) => {
      if (!cancelled) {
        setRows(
          all
            .filter((r): r is Row => r !== null)
            .sort((a, b) => ORDER[a.cov.level] - ORDER[b.cov.level])
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [entries])

  const summary = useMemo(() => (rows ? summarizeCoverage(rows.map((r) => r.cov)) : null), [rows])

  const visible = rows
    ? rows.filter((r) => !onlyGaps || r.cov.level !== 'good' || r.cov.untested.length > 0)
    : []

  const open = async (item: RequestItem): Promise<void> => {
    const saved = await window.api.readRequest(item.path)
    useTabsStore.getState().openSaved(saved, item.path)
    onClose()
  }

  return (
    <Modal title={`Cobertura de “${collectionName}”`} onClose={onClose} wide>
      {!rows || !summary ? (
        <p className="py-6 text-center text-xs text-zinc-500">Analizando peticiones…</p>
      ) : summary.total === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">La colección no tiene peticiones.</p>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <Meter
              label="Peticiones con aserciones"
              part={summary.withAssertions}
              total={summary.total}
              hint="Peticiones que tienen al menos una aserción activa"
            />
            <Meter
              label="Peticiones completas"
              part={summary.good}
              total={summary.total}
              hint="Revisan el status y el body"
            />
            <Meter
              label="Status documentados probados"
              part={summary.statusesTested}
              total={summary.statusesDocumented}
              hint="Status que la spec declara y alguna aserción “status es igual a” comprueba"
            />
          </div>

          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={onlyGaps}
              onChange={(e) => setOnlyGaps(e.target.checked)}
              className="accent-blue-500"
            />
            Mostrar solo lo que tiene huecos
          </label>

          <div className="max-h-[48vh] overflow-auto rounded-md border border-zinc-800">
            {visible.length === 0 ? (
              <p className="py-6 text-center text-xs text-emerald-400">
                No hay huecos: todo está cubierto.
              </p>
            ) : (
              visible.map(({ item, group, cov }) => (
                <div
                  key={item.path}
                  onClick={() => void open(item)}
                  className="flex cursor-pointer items-baseline gap-2 border-b border-zinc-800/60 px-3 py-1.5 text-xs last:border-b-0 hover:bg-zinc-800/50"
                  title="Abrir la petición"
                >
                  <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[item.method]}`}>
                    {item.method}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300">
                    {item.name}
                    {group && <span className="ml-2 text-zinc-600">{group}</span>}
                  </span>
                  {cov.untested.length > 0 && (
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      sin probar: {cov.untested.join(', ')}
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded px-1.5 text-[10px] font-semibold ${LEVEL[cov.level].cls}`}
                  >
                    {LEVEL[cov.level].label}
                  </span>
                </div>
              ))
            )}
          </div>

          <p className="mt-2 text-[11px] text-zinc-600">
            Completa = tiene aserciones sobre el status y el body. Es un análisis de lo que
            configuraste, no de lo que se ejecutó.
          </p>
        </>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="btn btn-ghost"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
