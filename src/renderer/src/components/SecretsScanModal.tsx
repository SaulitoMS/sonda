import { useEffect, useMemo, useState } from 'react'
import { scanAuth, scanHeaders, scanRequest, type SecretFinding } from '../../../shared/secretScan'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

interface Group {
  collection: string
  items: { label: string; findings: SecretFinding[] }[]
}

export function SecretsScanModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [groups, setGroups] = useState<Group[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      collections.map(async (c): Promise<Group> => {
        const items: Group['items'] = []
        const scope = [...scanAuth(c.auth), ...scanHeaders(c.headers)]
        if (scope.length) items.push({ label: 'Colección (heredado)', findings: scope })

        for (const f of c.folders) {
          const own = [...scanAuth(f.auth), ...scanHeaders(f.headers)]
          if (own.length) items.push({ label: `${f.name} (heredado)`, findings: own })
        }

        const entries = [
          ...c.folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
          ...c.requests.map((item) => ({ item, group: '' }))
        ]
        await Promise.all(
          entries.map(async ({ item, group }) => {
            try {
              const findings = scanRequest(await window.api.readRequest(item.path))
              if (findings.length) {
                items.push({ label: group ? `${group} / ${item.name}` : item.name, findings })
              }
            } catch {
              /* un archivo ilegible no debe tumbar el análisis */
            }
          })
        )
        return { collection: c.name, items }
      })
    ).then((all) => {
      if (!cancelled) setGroups(all.filter((g) => g.items.length > 0))
    })
    return () => {
      cancelled = true
    }
  }, [collections])

  const total = useMemo(
    () =>
      (groups ?? []).reduce((n, g) => n + g.items.reduce((m, i) => m + i.findings.length, 0), 0),
    [groups]
  )

  return (
    <Modal title="Secretos en colecciones" onClose={onClose} wide>
      {!groups ? (
        <p className="py-6 text-center text-xs text-zinc-500">Analizando colecciones…</p>
      ) : (
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-auto pr-1 text-xs">
          <p className="text-zinc-500">
            Tus peticiones son archivos que puedes subir a Git. Aquí ves las credenciales escritas a
            mano; muévelas a una variable marcada como <b>Secreto</b> y usa{' '}
            <code>{'{{variable}}'}</code>.
          </p>

          {total === 0 ? (
            <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-400">
              No se encontraron credenciales en texto plano ✓
            </p>
          ) : (
            <>
              <p className="rounded-md bg-amber-500/10 p-2 text-amber-400">
                {total} credencial(es) en texto plano
              </p>
              {groups.map((g) => (
                <section key={g.collection}>
                  <h3 className="mb-1 font-semibold text-zinc-200">{g.collection}</h3>
                  <ul className="space-y-1.5">
                    {g.items.map((item) => (
                      <li key={item.label} className="rounded-md border border-zinc-800 p-2">
                        <p className="truncate text-zinc-200" title={item.label}>
                          {item.label}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-500">
                          {item.findings.map((f, i) => (
                            <li key={i}>
                              {f.field} <code className="text-amber-300">{f.preview}</code>
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
