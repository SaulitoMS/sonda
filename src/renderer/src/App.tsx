import { useCallback, useEffect, useRef, useState } from 'react'
import { CurlModal } from './components/CurlModal'
import { EnvironmentSelector } from './components/EnvironmentSelector'
import { EnvironmentsModal } from './components/EnvironmentsModal'
import { HistoryModal } from './components/HistoryModal'
import { ImportModal } from './components/ImportModal'
import { RequestBar } from './components/RequestBar'
import { RequestPanel } from './components/RequestPanel'
import { ResponsePanel } from './components/ResponsePanel'
import { RunnerModal } from './components/RunnerModal'
import { SaveModal } from './components/SaveModal'
import { Sidebar } from './components/Sidebar'
import { SyncModal } from './components/SyncModal'
import { TabsBar } from './components/TabsBar'
import { useEnvironmentStore } from './store/useEnvironmentStore'
import { useRequestStore } from './store/useRequestStore'
import { useTabsStore } from './store/useTabsStore'
import { CommandPalette } from './components/CommandPalette'
import { CookiesModal } from './components/CookiesModal'
import { SettingsModal } from './components/SettingsModal'
import { BenchmarkModal } from './components/BenchmarkModal'
import { MockModal } from './components/MockModal'

type ModalType =
  | 'import'
  | 'save'
  | 'envs'
  | 'curl'
  | 'runner'
  | 'history'
  | 'sync'
  | 'palette'
  | 'cookies'
  | 'settings'
  | 'bench'
  | 'mock'
  | null

function App(): React.JSX.Element {
  const send = useRequestStore((s) => s.send)
  const currentFile = useRequestStore((s) => s.currentFile)
  const newTab = useTabsStore((s) => s.newTab)
  const loadEnvironments = useEnvironmentStore((s) => s.load)

  const [modal, setModal] = useState<ModalType>(null)
  const [runCollectionId, setRunCollectionId] = useState('')
  const [syncCollection, setSyncCollection] = useState({ id: '', name: '' })
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
    // Lo guardado pasa a ser la nueva línea base: la pestaña deja de marcarse con ●
    useRequestStore.getState().markSaved(s.currentFile, s.name)
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
      if (e.key === 't') {
        e.preventDefault()
        newTab()
      }
      if (e.key === 'k') {
        e.preventDefault()
        setModal((m) => (m === 'palette' ? null : 'palette'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send, save, newTab])

  const btn = 'rounded px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800'

  return (
    <div className="flex h-full bg-zinc-900 text-zinc-200">
      <Sidebar
        onImport={() => setModal('import')}
        onRun={(id) => {
          setRunCollectionId(id)
          setModal('runner')
        }}
        onSync={(id, name) => {
          setSyncCollection({ id, name })
          setModal('sync')
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-stretch justify-between border-b border-zinc-800 pl-1 pr-4">
          <TabsBar />
          <div className="flex shrink-0 items-center gap-1 pl-2">
            {flash && <span className="mr-2 text-xs text-emerald-400">{flash}</span>}
            <EnvironmentSelector onManage={() => setModal('envs')} />
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <button
              className={btn}
              onClick={() => setModal('history')}
              title="Historial de peticiones"
            >
              Historial
            </button>
            <button
              className={btn}
              onClick={() => setModal('cookies')}
              title="Cookies guardadas de las respuestas"
            >
              Cookies
            </button>
            <button
              className={btn}
              onClick={() => setModal('bench')}
              title="Enviar la petición varias veces y medir tiempos"
            >
              Rendimiento
            </button>
            <button
              className={btn}
              onClick={() => setModal('mock')}
              title="Levantar un servidor local con respuestas de ejemplo de una colección"
            >
              Mock
            </button>
            <button className={btn} onClick={() => setModal('settings')} title="Ajustes globales">
              Ajustes
            </button>
            <button
              className={btn}
              onClick={() => setModal('curl')}
              title="Importar o exportar cURL"
            >
              cURL
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
      {modal === 'palette' && <CommandPalette onClose={() => setModal(null)} />}
      {modal === 'runner' && (
        <RunnerModal collectionId={runCollectionId} onClose={() => setModal(null)} />
      )}
      {modal === 'sync' && (
        <SyncModal
          collectionId={syncCollection.id}
          collectionName={syncCollection.name}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'envs' && <EnvironmentsModal onClose={() => setModal(null)} />}
      {modal === 'bench' && <BenchmarkModal onClose={() => setModal(null)} />}
      {modal === 'mock' && <MockModal onClose={() => setModal(null)} />}
      {modal === 'cookies' && <CookiesModal onClose={() => setModal(null)} />}
      {modal === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          onSaved={() => showFlash('Ajustes guardados ✓')}
        />
      )}
      {modal === 'curl' && <CurlModal onClose={() => setModal(null)} onImported={onCurlImported} />}
      {modal === 'history' && (
        <HistoryModal
          onClose={() => setModal(null)}
          onRestored={() => showFlash('Petición restaurada ✓')}
        />
      )}
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
