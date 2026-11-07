import { useEffect, useMemo, useState } from 'react'
import { lintCollection, type LintEntry, type LintResult } from '../../../shared/collectionLint'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

interface Group {
  collection: string
  results: LintResult[]
}

export function CollectionLintModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [groups, setGroups] = useState<Group[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      collections.map(async (c): Promise<Group> => {
        const refs = [
          ...c.folders.flatMap((f) =>
            f.requests.map((item) => ({ item, label: `${f.name} / ${item.name}` }))
          ),
          ...c.requests.map((item) => ({ item, label: item.name }))
        ]
        const loaded = await Promise.all(
          refs.map(async ({ item, label }): Promise<LintEntry | null> => {
            try {
              return { path: item.path, label, request: await window.api.readRequest(item.path) }
            } catch {
              return null // un archivo ilegible no debe tumbar el análisis
            }
          })
        )
        const entries = loaded.filter((e): e is LintEntry => e !== null)
        return { collection: c.name, results: lintCollection(entries) }
      })
    ).then((all) => {
      if (!cancelled) setGroups(all.filter((g) => g.results.length > 0))
    })
    return () => {
      cancelled = true
    }
  }, [collections])

  const warnings = useMemo(
    () =>
      (groups ?? []).reduce(
        (n, g) =>
          n +
          g.results.reduce(
            (m, r) => m + r.issues.filter((i) => i.severity === 'warning').length,
            0
          ),
        0
      ),
    [groups]
  )

  return (
    <Modal title="Lint de colecciones" onClose={onClose} wide>
      {!groups ? (
        <p className="py-6 text-center text-xs text-zinc-500">Analizando colecciones…</p>
      ) : (
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-auto pr-1 text-xs">
          <p className="text-zinc-500">
            Malas prácticas que conviene corregir antes de compartir o automatizar tus colecciones.
          </p>

          {groups.length === 0 ? (
            <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-400">Todo en orden ✓</p>
          ) : (
            <>
              <p className="rounded-md bg-amber-500/10 p-2 text-amber-400">
                {warnings} aviso(s) importantes, más sugerencias
              </p>
              {groups.map((g) => (
                <section key={g.collection}>
                  <h3 className="mb-1 font-semibold text-zinc-200">{g.collection}</h3>
                  <ul className="space-y-1.5">
                    {g.results.map((r) => (
                      <li key={r.path} className="rounded-md border border-zinc-800 p-2">
                        <p className="truncate text-zinc-200" title={r.label}>
                          {r.label}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[11px]">
                          {r.issues.map((i, n) => (
                            <li
                              key={n}
                              className={
                                i.severity === 'warning' ? 'text-amber-300' : 'text-zinc-500'
                              }
                            >
                              {i.severity === 'warning' ? '⚠' : '·'} {i.message}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
