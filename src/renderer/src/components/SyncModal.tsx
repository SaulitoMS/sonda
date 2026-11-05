import { useEffect, useState } from 'react'
import type {
  HttpMethod,
  SyncChangeInfo,
  SyncChangeKind,
  SyncOptions,
  SyncPreviewResult,
  SyncResult
} from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useTabsStore } from '../store/useTabsStore'
import { Modal } from './Modal'

const KIND_LABEL: Record<SyncChangeKind, string> = {
  url: 'URL o parámetros',
  body: 'body de ejemplo',
  requestSchema: 'schema del request',
  responseSchemas: 'schemas de respuesta'
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

interface Props {
  collectionId: string
  collectionName: string
  onClose: () => void
}

function Row({
  method,
  name,
  detail,
  warn
}: {
  method: HttpMethod
  name: string
  detail?: string
  warn?: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 px-2 py-1 text-xs">
      <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[method]}`}>{method}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-300" title={name}>
        {name}
      </span>
      {detail && <span className="shrink-0 text-[11px] text-zinc-500">{detail}</span>}
      {warn && <span className="shrink-0 text-[11px] text-amber-400">{warn}</span>}
    </div>
  )
}

function ChangeRow({ change }: { change: SyncChangeInfo }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const breaking = change.changes.filter((c) => c.impact === 'breaking').length

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-baseline gap-2 px-2 py-1 text-xs hover:bg-zinc-800/50"
      >
        <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[change.method]}`}>
          {change.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-zinc-300" title={change.name}>
          {change.name}
        </span>
        {breaking > 0 ? (
          <span className="shrink-0 rounded bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-400">
            {breaking === 1 ? 'rompe' : `rompe (${breaking})`}
          </span>
        ) : change.changes.length > 0 ? (
          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">
            compatible
          </span>
        ) : null}
        <span className="shrink-0 text-[11px] text-zinc-500">
          {change.kinds.map((k) => KIND_LABEL[k]).join(', ')}
        </span>
      </div>
      {change.keptUserEdits.length > 0 && (
        <p className="pb-1 pl-16 text-[11px] text-amber-400">
          tu {change.keptUserEdits.map((k) => KIND_LABEL[k]).join(' y ')} se conserva
        </p>
      )}
      {open &&
        change.changes.map((c, i) => (
          <p
            key={i}
            className={`selectable pb-0.5 pl-16 pr-2 font-mono text-[11px] ${
              c.impact === 'breaking' ? 'text-red-300' : 'text-zinc-400'
            }`}
          >
            {c.impact === 'breaking' ? '✕' : '✓'} {c.message}
          </p>
        ))}
    </div>
  )
}

function Section({
  title,
  count,
  checked,
  onToggle,
  hint,
  children
}: {
  title: string
  count: number
  checked: boolean
  onToggle: (v: boolean) => void
  hint?: string
  children: React.ReactNode
}): React.JSX.Element | null {
  if (count === 0) return null
  return (
    <div className="mb-3 rounded-md border border-zinc-800">
      <label className="flex cursor-pointer items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-blue-500"
        />
        {title} ({count})
      </label>
      {hint && <p className="px-3 pt-2 text-[11px] text-amber-400">{hint}</p>}
      <div className="max-h-36 overflow-auto py-1">{children}</div>
    </div>
  )
}

export function SyncModal({ collectionId, collectionName, onClose }: Props): React.JSX.Element {
  const refresh = useCollectionsStore((s) => s.refresh)
  const [preview, setPreview] = useState<SyncPreviewResult | null>(null)
  const [options, setOptions] = useState<SyncOptions>({ add: true, update: true, remove: false })
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.previewSync(collectionId).then((p) => {
      if (!cancelled) setPreview(p)
    })
    return () => {
      cancelled = true
    }
  }, [collectionId])

  const apply = async (): Promise<void> => {
    setApplying(true)
    const r = await window.api.applySync(collectionId, options)
    if (r.ok) {
      await refresh()
      // Las pestañas de lo borrado quedan "sin guardar"; las de lo actualizado se recargan
      const gone = new Set(r.removedPaths)
      useTabsStore.getState().detachMatching((file) => gone.has(file))
      await useTabsStore.getState().refreshFiles(r.updatedPaths)
    }
    setResult(r)
    setApplying(false)
  }

  const closeBtn = (
    <button
      onClick={onClose}
      className="btn btn-ghost"
    >
      Cerrar
    </button>
  )

  const title = `Sincronizar “${collectionName}”`

  // ---- Resultado ----
  if (result) {
    return (
      <Modal title={title} onClose={onClose} wide>
        {result.ok ? (
          <>
            <p className="text-sm font-semibold text-emerald-400">Colección sincronizada</p>
            <p className="mt-2 text-xs text-zinc-300">
              {plural(result.added, 'petición agregada', 'peticiones agregadas')} ·{' '}
              {plural(result.updated, 'actualizada', 'actualizadas')} ·{' '}
              {plural(result.removed, 'eliminada', 'eliminadas')}
            </p>
            {result.baseUrlChange && (
              <p className="mt-3 text-xs text-amber-400">
                ⚠ La baseUrl de la spec cambió de {result.baseUrlChange.from} a{' '}
                {result.baseUrlChange.to}. Actualiza la variable baseUrl de tu entorno.
              </p>
            )}
          </>
        ) : (
          <p className="selectable rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            {result.error}
          </p>
        )}
        <div className="mt-4 flex justify-end">{closeBtn}</div>
      </Modal>
    )
  }

  // ---- Cargando o error ----
  if (!preview) {
    return (
      <Modal title={title} onClose={onClose} wide>
        <p className="py-6 text-center text-xs text-zinc-500">Descargando la spec y comparando…</p>
      </Modal>
    )
  }

  if (!preview.ok) {
    return (
      <Modal title={title} onClose={onClose} wide>
        <p className="selectable rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {preview.error}
        </p>
        <div className="mt-4 flex justify-end">{closeBtn}</div>
      </Modal>
    )
  }

  // ---- Vista previa ----
  const { added, changed, removed, unchanged, baseUrlChange } = preview
  const total = added.length + changed.length + removed.length
  const breakingCount =
    changed.filter((c) => c.changes.some((x) => x.impact === 'breaking')).length + removed.length
  const selected =
    (options.add ? added.length : 0) +
    (options.update ? changed.length : 0) +
    (options.remove ? removed.length : 0)

  return (
    <Modal title={title} onClose={onClose} wide>
      <p
        className="selectable mb-3 truncate font-mono text-[11px] text-zinc-500"
        title={preview.source}
      >
        {preview.source}
      </p>

      {baseUrlChange && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
          ⚠ La baseUrl de la spec cambió de {baseUrlChange.from} a {baseUrlChange.to}. Tras
          sincronizar, actualiza la variable baseUrl de tu entorno.
        </p>
      )}

      {total === 0 ? (
        <p className="py-6 text-center text-xs text-emerald-400">
          La colección está al día ({plural(unchanged, 'petición', 'peticiones')} sin cambios).
        </p>
      ) : (
        <div className="max-h-[55vh] overflow-auto">
          {breakingCount > 0 && (
            <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              ⚠ {plural(breakingCount, 'endpoint tiene', 'endpoints tienen')} cambios que pueden
              romper a los clientes de la API. Pulsa un endpoint modificado para ver el detalle.
            </p>
          )}
          <Section
            title="Endpoints nuevos"
            count={added.length}
            checked={options.add}
            onToggle={(add) => setOptions((o) => ({ ...o, add }))}
          >
            {added.map((a) => (
              <Row key={a.key} method={a.method} name={a.name} detail={a.folder || undefined} />
            ))}
          </Section>

          <Section
            title="Endpoints modificados"
            count={changed.length}
            checked={options.update}
            onToggle={(update) => setOptions((o) => ({ ...o, update }))}
          >
            {changed.map((c) => (
              <ChangeRow key={c.path} change={c} />
            ))}
          </Section>

          <Section
            title="Endpoints que ya no existen"
            count={removed.length}
            checked={options.remove}
            onToggle={(remove) => setOptions((o) => ({ ...o, remove }))}
            hint="Se borran los archivos, incluidas tus aserciones y extracciones. Por eso viene desmarcado."
          >
            {removed.map((r) => (
              <Row key={r.path} method={r.method} name={r.name} />
            ))}
          </Section>

          <p className="text-[11px] text-zinc-600">
            {plural(unchanged, 'petición', 'peticiones')} sin cambios. Lo que editaste en cada
            petición (aserciones, extracciones, auth, headers propios) no se toca.
          </p>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {closeBtn}
        {total > 0 && (
          <button
            onClick={apply}
            disabled={applying || selected === 0}
            className="btn btn-primary"
          >
            {applying ? 'Aplicando…' : `Aplicar (${selected})`}
          </button>
        )}
      </div>
    </Modal>
  )
}
