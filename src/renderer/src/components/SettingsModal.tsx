import { useEffect, useState } from 'react'
import { MAX_TIMEOUT_S, MIN_TIMEOUT_S } from '../../../shared/settings'
import type { AppSettings, SslMode } from '../../../shared/types'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'
const hint = 'mt-1 text-[11px] text-zinc-500'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function SettingsModal({ onClose, onSaved }: Props): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.loadSettings().then((s) => {
      if (alive) setDraft(s)
    })
    return () => {
      alive = false
    }
  }, [])

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  const save = async (): Promise<void> => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      await window.api.saveSettings(draft)
      onSaved()
      onClose()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'No se pudo guardar'
      setError(text.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setSaving(false)
    }
  }

  return (
    <Modal title="Ajustes" onClose={onClose}>
      {!draft ? (
        <p className="text-xs text-zinc-500">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={label}>Tiempo límite (segundos)</label>
            <input
              type="number"
              min={MIN_TIMEOUT_S}
              max={MAX_TIMEOUT_S}
              value={draft.timeoutSeconds}
              onChange={(e) => set('timeoutSeconds', Number(e.target.value))}
              className={field}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={draft.followRedirects}
              onChange={(e) => set('followRedirects', e.target.checked)}
            />
            Seguir redirecciones automáticamente
          </label>

          <div>
            <label className={label}>Certificados SSL</label>
            <select
              value={draft.sslMode}
              onChange={(e) => set('sslMode', e.target.value as SslMode)}
              className={field}
            >
              <option value="auto">Automático (tolerar inválidos solo en localhost)</option>
              <option value="verify">Siempre verificar</option>
              <option value="ignore">Ignorar errores de certificado</option>
            </select>
            {draft.sslMode === 'ignore' && (
              <p className="mt-1 text-[11px] text-amber-400">
                Ignorar la verificación expone tus peticiones a suplantación. Úsalo solo en
                entornos de prueba.
              </p>
            )}
          </div>

          <div>
            <label className={label}>Proxy</label>
            <input
              value={draft.proxyUrl}
              onChange={(e) => set('proxyUrl', e.target.value)}
              placeholder="http://usuario:clave@proxy:8080"
              spellCheck={false}
              className={field}
            />
            <p className={hint}>Vacío = sin proxy. Las peticiones a localhost no lo usan.</p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}