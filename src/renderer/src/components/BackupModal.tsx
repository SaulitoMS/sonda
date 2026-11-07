import { useState } from 'react'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Modal } from './Modal'

interface Notice {
  tone: 'ok' | 'error'
  text: string
}

export function BackupModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const exportBackup = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.api.exportBackup()
      if (result === null) return // canceló
      setNotice(
        result.ok
          ? { tone: 'ok', text: `Backup guardado: ${result.count} archivos en ${result.path}` }
          : { tone: 'error', text: result.error }
      )
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.api.restoreBackup()
      if (result === null) return // canceló
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error })
        return
      }
      await useCollectionsStore.getState().refresh()
      await useEnvironmentStore.getState().load()
      const extra = [
        result.skipped > 0 ? `${result.skipped} ya existían y no se tocaron` : '',
        result.ignored > 0 ? `${result.ignored} entradas inválidas se ignoraron` : ''
      ].filter(Boolean)
      setNotice({
        tone: 'ok',
        text: `Se restauraron ${result.restored} archivos${extra.length ? ` (${extra.join('; ')})` : ''}`
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Backup del workspace" onClose={onClose} icon="download">
      <div className="flex flex-col gap-4 text-xs text-zinc-300">
        <p className="text-zinc-500">
          Guarda todas tus colecciones y entornos en un solo archivo JSON. Los valores secretos
          (keychain) no se incluyen. Al restaurar, los archivos que ya existen no se sobrescriben.
        </p>

        <div className="flex gap-2">
          <button onClick={exportBackup} disabled={busy} className="btn btn-primary">
            Exportar backup
          </button>
          <button onClick={restoreBackup} disabled={busy} className="btn btn-ghost">
            Restaurar backup
          </button>
        </div>

        {notice && (
          <p
            className={`rounded-md border p-2 break-all ${
              notice.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>
    </Modal>
  )
}
