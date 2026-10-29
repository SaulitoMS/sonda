import { useCallback, useEffect, useRef, useState } from 'react'
import { CurlModal } from './components/CurlModal'
import { EnvironmentSelector } from './components/EnvironmentSelector'
import { EnvironmentsModal } from './components/EnvironmentsModal'
import { ImportModal } from './components/ImportModal'
import { RequestBar } from './components/RequestBar'
import { RequestPanel } from './components/RequestPanel'
import { ResponsePanel } from './components/ResponsePanel'
import { SaveModal } from './components/SaveModal'
import { Sidebar } from './components/Sidebar'
import { useEnvironmentStore } from './store/useEnvironmentStore'
import { useRequestStore } from './store/useRequestStore'

type ModalType = 'import' | 'save' | 'envs' | 'curl' | null

function App(): React.JSX.Element {
  const send = useRequestStore((s) => s.send)
  const name = useRequestStore((s) => s.name)
  const currentFile = useRequestStore((s) => s.currentFile)
  const reset = useRequestStore((s) => s.reset)
  const loadEnvironments = useEnvironmentStore((s) => s.load)

  const [modal, setModal] = useState<ModalType>(null)
  const [flash, setFlash] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showFlash = useCallback((text: string) => {
    setFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 1800)
  }, [])

  const onCurlImported = useCallback(
    (warnings: string[]) =>
      showFlash(warnings.length ? 'cURL importado (con avisos)' : 'cURL importado ✓'),
    [showFlash]
  )

  useEffect(() => {
    loadEnvironments()
  }, [loadEnvironments])

  // Guardar: si ya viene de una colección, sobrescribe; si no, pide dónde guardarla
  const save = useCallback(async () => {
    const s = useRequestStore.getState()
    if (!s.currentFile) {
      setModal('save')
      return
    }
    await window.api.saveRequest({ relPath: s.currentFile, request: s.toSaved(s.name) })
    showFlash('Guardado ✓')
  }, [showFlash])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'Enter') send()
      if (e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send, save])

  const btn = 'rounded px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800'

  return (
    <div className="flex h-full bg-zinc-900 text-zinc-200">
      <Sidebar onImport={() => setModal('import')} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-sm font-bold tracking-wide text-blue-400">Sonda</h1>
            <span className="truncate text-xs text-zinc-500">
              {currentFile ? name : 'Petición sin guardar'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {flash && <span className="mr-2 text-xs text-emerald-400">{flash}</span>}
            <EnvironmentSelector onManage={() => setModal('envs')} />
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <button
              className={btn}
              onClick={() => setModal('curl')}
              title="Importar o exportar cURL"
            >
              cURL
            </button>
            <button className={btn} onClick={reset}>
              Nueva
            </button>
            {currentFile && (
              <button className={btn} onClick={() => setModal('save')}>
                Guardar como…
              </button>
            )}
            <button className={`${btn} font-semibold`} onClick={save}>
              Guardar
            </button>
          </div>
        </header>

        <RequestBar onCurlImported={onCurlImported} />

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col border-b border-zinc-800">
            <RequestPanel />
          </section>
          <section className="flex min-h-0 flex-[1.4] flex-col">
            <ResponsePanel />
          </section>
        </main>
      </div>

      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'envs' && <EnvironmentsModal onClose={() => setModal(null)} />}
      {modal === 'curl' && <CurlModal onClose={() => setModal(null)} onImported={onCurlImported} />}
      {modal === 'save' && (
        <SaveModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            showFlash('Guardado ✓')
          }}
        />
      )}
    </div>
  )
}

export default App
