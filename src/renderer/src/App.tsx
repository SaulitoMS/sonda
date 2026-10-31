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
import { useMonitorStore } from './store/useMonitorStore'
import { CommandPalette, type Command } from './components/CommandPalette'
import { CookiesModal } from './components/CookiesModal'
import { SettingsModal } from './components/SettingsModal'
import { BenchmarkModal } from './components/BenchmarkModal'
import { FuzzModal } from './components/FuzzModal'
import { SnapshotModal } from './components/SnapshotModal'
import { MonitorModal } from './components/MonitorModal'
import { MockModal } from './components/MockModal'
import { ThemeToggle } from './components/ThemeToggle'
import { Splitter } from './components/Splitter'
import { ToolsMenu, type ToolItem } from './components/ToolsMenu'
import { getLayout, setLayout, useLayout } from './lib/layout'
import { toggleTheme } from './lib/theme'
import { DEFAULT_LAYOUT } from '../../shared/layout'

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
  | 'fuzz'
  | 'snapshot'
  | 'monitor'
  | 'mock'
  | null

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

function App(): React.JSX.Element {
  const send = useRequestStore((s) => s.send)
  const currentFile = useRequestStore((s) => s.currentFile)
  const newTab = useTabsStore((s) => s.newTab)
  const loadEnvironments = useEnvironmentStore((s) => s.load)
  const monitorActive = useMonitorStore((s) => s.active)
  const monitorFailing = useMonitorStore((s) => (s.runs[0]?.fail ?? 0) > 0)
  const layout = useLayout()

  const [modal, setModal] = useState<ModalType>(null)
  const [runCollectionId, setRunCollectionId] = useState('')
  const [syncCollection, setSyncCollection] = useState({ id: '', name: '' })
  const [flash, setFlash] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

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

  const toggleSidebar = useCallback(() => setLayout({ sidebarOpen: !getLayout().sidebarOpen }), [])
  const toggleDirection = useCallback(
    () => setLayout({ direction: getLayout().direction === 'column' ? 'row' : 'column' }),
    []
  )

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
      if (e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      if (e.key === '\\') {
        e.preventDefault()
        toggleDirection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send, save, newTab, toggleSidebar, toggleDirection])

  // Herramientas: un solo lugar para el menú de la cabecera y la paleta de comandos
  const tools: ToolItem[] = [
    {
      id: 'history',
      label: 'Historial',
      description: 'Peticiones enviadas recientemente',
      onSelect: () => setModal('history')
    },
    {
      id: 'cookies',
      label: 'Cookies',
      description: 'Cookies guardadas de las respuestas',
      onSelect: () => setModal('cookies')
    },
    {
      id: 'bench',
      label: 'Rendimiento',
      description: 'Enviar la petición varias veces y medir tiempos',
      onSelect: () => setModal('bench')
    },
    {
      id: 'fuzz',
      label: 'Fuzz',
      description: 'Probar la API con bodies inválidos generados desde el schema',
      onSelect: () => setModal('fuzz')
    },
    {
      id: 'snapshot',
      label: 'Snapshot',
      description: 'Guardar una respuesta como línea base y detectar cambios',
      onSelect: () => setModal('snapshot')
    },
    {
      id: 'monitor',
      label: 'Monitor',
      description: 'Ejecutar una colección cada cierto tiempo y avisar si falla',
      onSelect: () => setModal('monitor'),
      badge: monitorActive ? (
        <span className={monitorFailing ? 'text-red-400' : 'text-emerald-400'}>●</span>
      ) : undefined
    },
    {
      id: 'mock',
      label: 'Mock',
      description: 'Servidor local con respuestas de ejemplo de una colección',
      onSelect: () => setModal('mock')
    },
    {
      id: 'curl',
      label: 'cURL',
      description: 'Importar o exportar la petición como comando',
      onSelect: () => setModal('curl')
    },
    {
      id: 'settings',
      label: 'Ajustes',
      description: 'Tiempo límite, SSL, proxy y reintentos',
      onSelect: () => setModal('settings')
    }
  ]

  // Todo lo anterior más las acciones generales, para buscarlas con Cmd/Ctrl + K
  const commands: Command[] = [
    { id: 'new-tab', label: 'Nueva pestaña', hint: `${MOD}T`, run: newTab },
    { id: 'save', label: 'Guardar', hint: `${MOD}S`, run: () => void save() },
    ...(currentFile
      ? [{ id: 'save-as', label: 'Guardar como…', run: () => setModal('save') }]
      : []),
    { id: 'envs', label: 'Gestionar entornos', run: () => setModal('envs') },
    { id: 'import', label: 'Importar Swagger / OpenAPI', run: () => setModal('import') },
    {
      id: 'sidebar',
      label: layout.sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral',
      hint: `${MOD}B`,
      run: toggleSidebar
    },
    {
      id: 'direction',
      label:
        layout.direction === 'column'
          ? 'Respuesta al lado de la petición'
          : 'Respuesta debajo de la petición',
      hint: `${MOD}\\`,
      keywords: 'disposición layout horizontal vertical',
      run: toggleDirection
    },
    { id: 'theme', label: 'Cambiar tema', keywords: 'claro oscuro', run: toggleTheme },
    ...tools.map((t) => ({
      id: `tool:${t.id}`,
      label: t.label,
      hint: t.description,
      run: t.onSelect
    }))
  ]

  const resetSidebar = (): void => setLayout({ sidebarWidth: DEFAULT_LAYOUT.sidebarWidth })
  const dragSidebar = (x: number): void => {
    const left = bodyRef.current?.getBoundingClientRect().left ?? 0
    setLayout({ sidebarWidth: x - left })
  }
  const dragSplit = (x: number, y: number): void => {
    const box = mainRef.current?.getBoundingClientRect()
    if (!box) return
    setLayout({
      split: layout.direction === 'column' ? (y - box.top) / box.height : (x - box.left) / box.width
    })
  }

  const iconBtn = 'rounded p-1.5 text-zinc-300 hover:bg-zinc-800'
  const svg = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-200">
      {/* Barra superior: navegación, búsqueda global y acciones */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-2">
        <button
          className={iconBtn}
          onClick={toggleSidebar}
          title={`${layout.sidebarOpen ? 'Ocultar' : 'Mostrar'} barra lateral (${MOD}B)`}
          aria-label="Alternar barra lateral"
        >
          <svg {...svg}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
        <span className="select-none text-sm font-bold tracking-tight text-zinc-100">Sonda</span>

        <button
          onClick={() => setModal('palette')}
          className="mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 text-left text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-400"
          title="Buscar peticiones y acciones"
        >
          <svg {...svg} width={13} height={13}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 truncate">Buscar peticiones y acciones…</span>
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {MOD}K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {flash && <span className="mr-1 text-xs text-emerald-400">{flash}</span>}
          <EnvironmentSelector onManage={() => setModal('envs')} />
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <button
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            onClick={save}
            title={`Guardar (${MOD}S)`}
          >
            Guardar
          </button>
          <ToolsMenu
            items={tools}
            indicator={
              monitorActive ? (
                <span className={monitorFailing ? 'text-red-400' : 'text-emerald-400'}>●</span>
              ) : undefined
            }
          />
          <ThemeToggle />
        </div>
      </header>

      <div ref={bodyRef} className="flex min-h-0 flex-1">
        {layout.sidebarOpen && (
          <>
            <div style={{ width: layout.sidebarWidth }} className="flex min-h-0 shrink-0">
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
            </div>
            <Splitter orientation="vertical" onDrag={dragSidebar} onReset={resetSidebar} />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-stretch border-b border-zinc-800 bg-zinc-950/30 pr-2">
            <TabsBar />
            <button
              className={`${iconBtn} my-auto`}
              onClick={toggleDirection}
              title={`Cambiar disposición de los paneles (${MOD}\\)`}
              aria-label="Cambiar disposición de los paneles"
            >
              <svg {...svg}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                {layout.direction === 'column' ? <path d="M3 12h18" /> : <path d="M12 4v16" />}
              </svg>
            </button>
          </div>

          <RequestBar onCurlImported={onCurlImported} />

          <main
            ref={mainRef}
            className={`flex min-h-0 flex-1 ${
              layout.direction === 'column' ? 'flex-col' : 'flex-row'
            }`}
          >
            <section
              style={{ flexBasis: `${layout.split * 100}%` }}
              className="flex min-h-0 min-w-0 shrink-0 grow-0 flex-col overflow-hidden"
            >
              <RequestPanel />
            </section>
            <Splitter
              orientation={layout.direction === 'column' ? 'horizontal' : 'vertical'}
              onDrag={dragSplit}
              onReset={() => setLayout({ split: DEFAULT_LAYOUT.split })}
            />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ResponsePanel />
            </section>
          </main>
        </div>
      </div>

      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'palette' && <CommandPalette onClose={() => setModal(null)} commands={commands} />}
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
      {modal === 'fuzz' && <FuzzModal onClose={() => setModal(null)} />}
      {modal === 'snapshot' && <SnapshotModal onClose={() => setModal(null)} />}
      {modal === 'monitor' && <MonitorModal onClose={() => setModal(null)} />}
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