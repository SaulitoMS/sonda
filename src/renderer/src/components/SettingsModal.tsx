import { useEffect, useState } from 'react'
import {
  DEFAULT_USER_AGENT,
  MAX_REDIRECT_LIMIT,
  MAX_RETRIES,
  MAX_RETRY_DELAY_MS,
  MAX_TIMEOUT_S,
  MIN_REDIRECT_LIMIT,
  MIN_RETRIES,
  MIN_RETRY_DELAY_MS,
  MIN_TIMEOUT_S
} from '../../../shared/settings'
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
  const [initialWorkspace, setInitialWorkspace] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.loadSettings().then((s) => {
      if (!alive) return
      setDraft(s)
      setInitialWorkspace(s.workspacePath)
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
      if (draft.workspacePath !== initialWorkspace) {
        // Otra carpeta = otras colecciones: se descarta la sesión de pestañas y se recarga
        try {
          localStorage.removeItem('sonda.session.v1')
          localStorage.removeItem('sonda.quickAccess')
        } catch {
          /* sin almacenamiento */
        }
        window.location.reload()
        return
      }
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
            <label className={label}>Carpeta de trabajo (workspace)</label>
            <div className="flex gap-2">
              <input
                value={draft.workspacePath}
                onChange={(e) => set('workspacePath', e.target.value)}
                placeholder="Vacío = Documentos/Sonda"
                spellCheck={false}
                className={field}
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await window.api.pickFolder()
                  if (path) set('workspacePath', path)
                }}
                className="shrink-0 rounded bg-zinc-800 px-3 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Elegir
              </button>
            </div>
            <p className={hint}>
              Aquí se guardan colecciones y entornos. Al cambiarla, Sonda se recarga y cierra las
              pestañas abiertas. Los archivos de la carpeta anterior no se mueven. La CLI la usa con
              la variable SONDA_WORKSPACE.
            </p>
          </div>
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
            <label className={label}>Máximo de redirecciones</label>
            <input
              type="number"
              min={MIN_REDIRECT_LIMIT}
              max={MAX_REDIRECT_LIMIT}
              value={draft.maxRedirects}
              disabled={!draft.followRedirects}
              onChange={(e) => set('maxRedirects', Number(e.target.value))}
              className={field}
            />
            <p className={hint}>
              Si se supera, la petición falla con un aviso de posible bucle. Entre{' '}
              {MIN_REDIRECT_LIMIT} y {MAX_REDIRECT_LIMIT}.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={draft.http2}
                onChange={(e) => set('http2', e.target.checked)}
              />
              Usar HTTP/2 cuando el servidor lo soporte
            </label>
            <p className={hint}>
              Solo en https y sin proxy. Si el servidor no negocia HTTP/2, la petición sigue por
              HTTP/1.1 sin errores.
            </p>
          </div>

          <div>
            <label className={label}>User-Agent por defecto</label>
            <input
              type="text"
              value={draft.userAgent}
              placeholder={DEFAULT_USER_AGENT}
              onChange={(e) => set('userAgent', e.target.value)}
              className={field}
            />
            <p className={hint}>
              Se envía cuando la petición no define su propio header User-Agent. Déjalo vacío para
              no enviar ninguno.
            </p>
          </div>

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
                Ignorar la verificación expone tus peticiones a suplantación. Úsalo solo en entornos
                de prueba.
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

          <div>
            <label className={label}>Excluir del proxy</label>
            <input
              value={draft.noProxy}
              onChange={(e) => set('noProxy', e.target.value)}
              placeholder="api.interna.local, .corp.net, 10.0.0.5"
              spellCheck={false}
              disabled={!draft.proxyUrl}
              className={`${field} disabled:opacity-50`}
            />
            <p className={hint}>
              Hosts separados por coma que van directo, sin proxy. Un dominio incluye sus
              subdominios.
            </p>
          </div>

          <div>
            <label className={label}>Certificado de cliente (mTLS)</label>
            <div className="space-y-2">
              {(
                [
                  ['clientCertPath', 'Certificado (.pem / .crt)'],
                  ['clientKeyPath', 'Llave privada (.key / .pem)']
                ] as const
              ).map(([key, placeholder]) => (
                <div key={key} className="flex gap-2">
                  <input
                    value={draft[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const path = await window.api.pickFile()
                      if (path) set(key, path)
                    }}
                    className="shrink-0 rounded bg-zinc-800 px-3 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Elegir
                  </button>
                </div>
              ))}
              <input
                value={draft.clientCertHost}
                onChange={(e) => set('clientCertHost', e.target.value)}
                placeholder="Solo para este host (opcional): api.banco.com"
                spellCheck={false}
                className={field}
              />
            </div>
            <p className={hint}>
              Se envía en peticiones https cuando ya hay certificado y llave. La llave no debe tener
              contraseña. Si cambias el contenido de los archivos, reinicia la app.
            </p>
          </div>

          <div>
            <label className={label}>CA propia (certificado raíz)</label>
            <div className="flex gap-2">
              <input
                value={draft.caCertPath}
                onChange={(e) => set('caCertPath', e.target.value)}
                placeholder="Certificado de la CA (.pem / .crt)"
                spellCheck={false}
                className={field}
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await window.api.pickFile()
                  if (path) set('caCertPath', path)
                }}
                className="shrink-0 rounded bg-zinc-800 px-3 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Elegir
              </button>
            </div>
            <p className={hint}>
              Para APIs con certificado firmado por una CA interna: se confía en ella además de las
              públicas, sin desactivar la verificación SSL. Si cambias el archivo, reinicia la app.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Reintentos automáticos</label>
                <input
                  type="number"
                  min={MIN_RETRIES}
                  max={MAX_RETRIES}
                  value={draft.retries}
                  onChange={(e) => set('retries', Number(e.target.value))}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Espera base (ms)</label>
                <input
                  type="number"
                  min={MIN_RETRY_DELAY_MS}
                  max={MAX_RETRY_DELAY_MS}
                  step={100}
                  value={draft.retryDelayMs}
                  disabled={draft.retries === 0}
                  onChange={(e) => set('retryDelayMs', Number(e.target.value))}
                  className={`${field} disabled:opacity-50`}
                />
              </div>
            </div>
            <p className={hint}>
              0 = sin reintentos. Se reintenta ante errores de red, timeout y status
              429/502/503/504, solo en GET, HEAD, OPTIONS, PUT y DELETE. La espera se duplica en
              cada intento.
            </p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
              Guardar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
