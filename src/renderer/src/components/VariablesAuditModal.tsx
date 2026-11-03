import { useEffect, useMemo, useState } from 'react'
import type { CollectionItem, SavedRequest } from '../../../shared/types'
import { auditVariables, authTexts, enabledPairs, type AuditGroup } from '../../../shared/varAudit'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Modal } from './Modal'

interface Loaded {
  collection: CollectionItem
  items: { label: string; saved: SavedRequest }[]
}

export function VariablesAuditModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const envData = useEnvironmentStore((s) => s.data)
  const [loaded, setLoaded] = useState<Loaded[] | null>(null)
  const [error, setError] = useState('')

  const activeEnv = envData.environments.find((e) => e.id === envData.activeId) ?? null

  useEffect(() => {
    let cancelled = false
    Promise.all(
      collections.map(async (collection): Promise<Loaded> => {
        const entries = [
          ...collection.folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
          ...collection.requests.map((item) => ({ item, group: '' }))
        ]
        const items = (
          await Promise.all(
            entries.map(async ({ item, group }) => {
              try {
                return {
                  label: group ? `${group} / ${item.name}` : item.name,
                  saved: await window.api.readRequest(item.path)
                }
              } catch {
                return null // un archivo ilegible no debe tumbar el análisis
              }
            })
          )
        ).filter((x): x is { label: string; saved: SavedRequest } => x !== null)
        return { collection, items }
      })
    ).then((all) => {
      if (!cancelled) setLoaded(all)
    })
    return () => {
      cancelled = true
    }
  }, [collections])

  const result = useMemo(() => {
    if (!loaded) return null
    const groups: AuditGroup[] = loaded.map(({ collection: c, items }) => ({
      name: c.name,
      vars: c.variables ?? [],
      inherited: [
        ...enabledPairs(c.headers),
        ...authTexts(c.auth),
        ...c.folders.flatMap((f) => [...enabledPairs(f.headers), ...authTexts(f.auth)])
      ],
      requests: items
    }))
    return auditVariables(groups, envData.environments)
  }, [loaded, envData])

  // Crea la variable (vacía) en el entorno activo; el análisis se recalcula solo
  const createInActive = async (name: string): Promise<void> => {
    if (!activeEnv) return
    setError('')
    try {
      const { data, save } = useEnvironmentStore.getState()
      await save({
        ...data,
        environments: data.environments.map((e) =>
          e.id === activeEnv.id
            ? {
                ...e,
                variables: [
                  ...e.variables.filter((v) => v.key || v.value),
                  { id: crypto.randomUUID(), key: name, value: '', secret: false, enabled: true }
                ]
              }
            : e
        )
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el entorno')
    }
  }

  return (
    <Modal title="Auditoría de variables" onClose={onClose} wide>
      {!result ? (
        <p className="py-6 text-center text-xs text-zinc-500">Analizando colecciones…</p>
      ) : (
        <div className="flex max-h-[65vh] flex-col gap-5 overflow-auto pr-1 text-xs">
          <section>
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-zinc-200">
              Usadas pero no definidas
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
                {result.undefinedVars.length}
              </span>
            </h3>
            <p className="mb-2 text-zinc-500">
              Estas peticiones no se enviarán hasta que existan. Cuentan como definidas las del
              entorno, la colección, la pestaña Extraer y los scripts.
            </p>
            {result.undefinedVars.length === 0 ? (
              <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-400">
                Todas las variables usadas están definidas ✓
              </p>
            ) : (
              <ul className="space-y-1.5">
                {result.undefinedVars.map((v) => (
                  <li
                    key={v.name}
                    className="flex items-start gap-2 rounded-md border border-zinc-800 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <code className="text-red-300">{`{{${v.name}}}`}</code>
                      <p
                        className="mt-0.5 truncate text-[11px] text-zinc-500"
                        title={v.usedIn.join('\n')}
                      >
                        {v.usedIn.slice(0, 3).join(' · ')}
                        {v.usedIn.length > 3 ? ` · +${v.usedIn.length - 3} más` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => void createInActive(v.name)}
                      disabled={!activeEnv}
                      title={
                        activeEnv
                          ? `Crear en “${activeEnv.name}” (sin valor)`
                          : 'Activa un entorno para poder crearla'
                      }
                      className="shrink-0 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Crear en entorno activo
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-zinc-200">
              Definidas pero sin usar
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                {result.unusedVars.length}
              </span>
            </h3>
            <p className="mb-2 text-zinc-500">
              Ninguna petición de ninguna colección las usa. Revisa antes de borrarlas: un script
              externo o un equipo con otro flujo podría necesitarlas.
            </p>
            {result.unusedVars.length === 0 ? (
              <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-400">
                No hay variables sin usar ✓
              </p>
            ) : (
              <ul className="space-y-1.5">
                {result.unusedVars.map((v) => (
                  <li
                    key={`${v.name}:${v.where.join(',')}`}
                    className="flex items-center gap-2 rounded-md border border-zinc-800 p-2"
                  >
                    <code className="text-amber-300">{v.name}</code>
                    <span className="ml-auto truncate text-[11px] text-zinc-500">
                      {v.where.join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
