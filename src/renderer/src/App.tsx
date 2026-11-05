import { useCallback, useEffect, useRef, useState } from 'react'
import { CurlModal } from './components/CurlModal'
import { Icon } from './components/Icon'
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
import { DataGenModal } from './components/DataGenModal'
import { ThemeToggle } from './components/ThemeToggle'
import { Splitter } from './components/Splitter'
import { ToolsMenu, type ToolItem } from './components/ToolsMenu'
import { getLayout, setLayout, useLayout } from './lib/layout'
import { toggleTheme } from './lib/theme'
import { isDirtyState } from '../../shared/dirty'
import { tabLabel } from '../../shared/tabs'
import { useMediaQuery } from './lib/useMediaQuery'
import { DEFAULT_LAYOUT } from '../../shared/layout'
import { CoverageModal } from './components/CoverageModal'
import { WebSocketModal } from './components/WebSocketModal'
import { togglePin, useQuickAccess } from './lib/quickAccess'
import { VariablesAuditModal } from './components/VariablesAuditModal'
import { FindReplaceModal } from './components/FindReplaceModal'
import { ToolboxModal } from './components/ToolboxModal'
import { EnvCompareModal } from './components/EnvCompareModal'
import { cancelInFlight } from './lib/inFlight'
import { nextEnvironmentId } from '../../shared/envCycle'
import { ShortcutsModal } from './components/ShortcutsModal'

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
  | 'websocket'
  | 'coverage'
  | 'vars'
  | 'replace'
  | 'compare'
  | 'toolbox'
  | 'datagen'
  | 'shortcuts'
  | null

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** JSON formateado si el texto lo es; si no, el texto tal cual */
function prettyText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function App(): React.JSX.Element {
  const send = useRequestStore((s) => s.send)
  const loading = useRequestStore((s) => s.loading)
  const currentFile = useRequestStore((s) => s.currentFile)
  const newTab = useTabsStore((s) => s.newTab)
  const reopenClosed = useTabsStore((s) => s.reopenClosed)
  const duplicateTab = useTabsStore((s) => s.duplicate)
  const closeOtherTabs = useTabsStore((s) => s.closeOthers)
  const activeTabId = useTabsStore((s) => s.activeId)
  const loadEnvironments = useEnvironmentStore((s) => s.load)
  const envData = useEnvironmentStore((s) => s.data)
  const monitorActive = useMonitorStore((s) => s.active)
  const monitorFailing = useMonitorStore((s) => (s.runs[0]?.fail ?? 0) > 0)
  const layout = useLayout()
  const quick = useQuickAccess()

  // Por debajo de 900px la barra lateral pasa a ser un cajón que se superpone
  const isNarrow = useMediaQuery('(max-width: 899px)')
  // El cajón se cierra solo al abrir otra petición (cambia currentFile)
  const [drawer, setDrawer] = useState<{ file: string | null } | null>(null)
  const drawerOpen = isNarrow && drawer !== null && drawer.file === currentFile
  // En pantallas estrechas la respuesta siempre va debajo
  const direction = isNarrow ? 'column' : layout.direction

  const [modal, setModal] = useState<ModalType>(null)
  const [runCollectionId, setRunCollectionId] = useState('')
  const [runFolder, setRunFolder] = useState<string | null>(null)
  const [syncCollection, setSyncCollection] = useState({ id: '', name: '' })
  const [coverageCollection, setCoverageCollection] = useState({ id: '', name: '' })
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

  const toggleSidebar = useCallback(() => {
    if (isNarrow) {
      setDrawer((d) => (d ? null : { file: useRequestStore.getState().currentFile }))
    } else {
      setLayout({ sidebarOpen: !getLayout().sidebarOpen })
    }
  }, [isNarrow])
  const toggleDirection = useCallback(
    () => setLayout({ direction: getLayout().direction === 'column' ? 'row' : 'column' }),
    []
  )

  // Cierra la pestaña activa y pide confirmación si tiene cambios sin guardar
  const closeActiveTab = useCallback(() => {
    const live = useRequestStore.getState()
    if (
      isDirtyState(live) &&
      !confirm(`"${tabLabel(live)}" tiene cambios sin guardar. ¿Cerrar sin guardar?`)
    )
      return
    const { activeId, close } = useTabsStore.getState()
    close(activeId)
  }, [])

  // Salta a la pestaña siguiente (1) o anterior (-1), de forma circular
  const cycleTab = useCallback((step: 1 | -1) => {
    const { tabs, activeId, select } = useTabsStore.getState()
    const index = tabs.findIndex((t) => t.id === activeId)
    select(tabs[(index + step + tabs.length) % tabs.length].id)
  }, [])

  // Cambia el entorno activo y avisa cuál quedó (importante con los protegidos)
  const switchEnvironment = useCallback(
    async (id: string | null) => {
      try {
        await useEnvironmentStore.getState().setActive(id)
      } catch {
        showFlash('No se pudo cambiar de entorno')
        return
      }
      const env = useEnvironmentStore.getState().getActive()
      showFlash(env ? `Entorno: ${env.name}${env.protected ? ' (protegido)' : ''}` : 'Sin entorno')
    },
    [showFlash]
  )

  // Salta al entorno siguiente (1) o anterior (-1), de forma circular
  const cycleEnvironment = useCallback(
    (step: 1 | -1) => {
      const { data } = useEnvironmentStore.getState()
      if (data.environments.length === 0) {
        showFlash('No hay entornos. Crea uno en «Entornos»')
        return
      }
      void switchEnvironment(nextEnvironmentId(data.environments, data.activeId, step))
    },
    [showFlash, switchEnvironment]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() === 't' && e.shiftKey) {
        e.preventDefault()
        reopenClosed()
        return
      }
      if (e.key.toLowerCase() === 'w' && !e.shiftKey) {
        e.preventDefault()
        closeActiveTab()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
        return
      }
      // Ctrl/Cmd+E: entorno siguiente; con Shift, el anterior
      if (e.key.toLowerCase() === 'e' && !e.altKey) {
        e.preventDefault()
        cycleEnvironment(e.shiftKey ? -1 : 1)
        return
      }
      // Ctrl/Cmd+/ (o ?): lista de atajos
      if (e.key === '/' || e.key === '?') {
        e.preventDefault()
        setModal((m) => (m === 'shortcuts' ? null : 'shortcuts'))
        return
      }
      // Ctrl+1…8 va a esa pestaña; Ctrl+9 va a la última (como en los navegadores)
      if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        const { tabs, select } = useTabsStore.getState()
        const target = e.key === '9' ? tabs[tabs.length - 1] : tabs[Number(e.key) - 1]
        if (target) select(target.id)
        return
      }
      if (e.key === 'Enter') send()
      if (e.key === 's') {
        e.preventDefault()
        save()
      }
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        newTab()
      }
      if (e.key === 'k') {
        e.preventDefault()
        setModal((m) => (m === 'palette' ? null : 'palette'))
      }
      if (e.key === 'l') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('[data-url-bar] input')
        input?.focus()
        input?.select()
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
  }, [
    send,
    save,
    newTab,
    reopenClosed,
    closeActiveTab,
    cycleTab,
    cycleEnvironment,
    toggleSidebar,
    toggleDirection
  ])

  // Herramientas: un solo lugar para el menú de la cabecera y la paleta de comandos
  const tools: ToolItem[] = [
    {
      id: 'history',
      icon: 'history',
      label: 'Historial',
      description: 'Peticiones enviadas recientemente',
      onSelect: () => setModal('history')
    },
    {
      id: 'cookies',
      icon: 'cookie',
      label: 'Cookies',
      description: 'Cookies guardadas de las respuestas',
      onSelect: () => setModal('cookies')
    },
    {
      id: 'bench',
      icon: 'gauge',
      label: 'Rendimiento',
      description: 'Enviar la petición varias veces y medir tiempos',
      onSelect: () => setModal('bench')
    },
    {
      id: 'fuzz',
      icon: 'bug',
      label: 'Fuzz',
      description: 'Probar la API con bodies inválidos generados desde el schema',
      onSelect: () => setModal('fuzz')
    },
    {
      id: 'snapshot',
      icon: 'camera',
      label: 'Snapshot',
      description: 'Guardar una respuesta como línea base y detectar cambios',
      onSelect: () => setModal('snapshot')
    },
    {
      id: 'monitor',
      icon: 'activity',
      label: 'Monitor',
      description: 'Ejecutar una colección cada cierto tiempo y avisar si falla',
      onSelect: () => setModal('monitor'),
      badge: monitorActive ? (
        <span className={monitorFailing ? 'text-red-400' : 'text-emerald-400'}>●</span>
      ) : undefined
    },
    {
      id: 'mock',
      icon: 'server',
      label: 'Mock',
      description: 'Servidor local con respuestas de ejemplo de una colección',
      onSelect: () => setModal('mock')
    },
    {
      id: 'websocket',
      icon: 'zap',
      label: 'WebSocket',
      description: 'Conectarse, enviar mensajes y ver lo que llega en tiempo real',
      onSelect: () => setModal('websocket')
    },
    {
      id: 'vars',
      icon: 'search',
      label: 'Variables',
      description: 'Detectar variables sin definir o sin usar en tus colecciones',
      onSelect: () => setModal('vars')
    },
    {
      id: 'replace',
      icon: 'copy',
      label: 'Buscar y reemplazar',
      description: 'Cambiar un host, variable o header en toda una colección',
      onSelect: () => setModal('replace')
    },
    {
      id: 'compare',
      icon: 'activity',
      label: 'Comparar entornos',
      description: 'Enviar la petición a dos entornos y ver qué cambia',
      onSelect: () => setModal('compare')
    },
    {
      id: 'toolbox',
      icon: 'link',
      label: 'Caja de herramientas',
      description: 'Base64, URL, hash y conversión de timestamps',
      onSelect: () => setModal('toolbox')
    },
    {
      id: 'datagen',
      icon: 'sliders',
      label: 'Datos de prueba',
      description: 'Genera CSV o JSON con datos aleatorios para el runner',
      onSelect: () => setModal('datagen')
    },
    {
      id: 'curl',
      icon: 'terminal',
      label: 'cURL',
      description: 'Importar o exportar la petición como comando',
      onSelect: () => setModal('curl')
    },
    {
      id: 'settings',
      icon: 'sliders',
      label: 'Ajustes',
      description: 'Tiempo límite, SSL, proxy y reintentos',
      onSelect: () => setModal('settings')
    }
  ]

  // Todo lo anterior más las acciones generales, para buscarlas con Cmd/Ctrl + K
  const commands: Command[] = [
    { id: 'new-tab', label: 'Nueva pestaña', hint: `${MOD}T`, run: newTab },
    {
      id: 'reopen-tab',
      label: 'Reabrir pestaña cerrada',
      hint: `${MOD}⇧T`,
      keywords: 'deshacer cerrar restaurar',
      run: reopenClosed
    },
    {
      id: 'close-tab',
      label: 'Cerrar pestaña',
      hint: `${MOD}W`,
      keywords: 'cerrar quitar',
      run: closeActiveTab
    },
    {
      id: 'duplicate-tab',
      label: 'Duplicar pestaña',
      keywords: 'copiar clonar',
      run: () => duplicateTab(activeTabId)
    },
    {
      id: 'close-other-tabs',
      label: 'Cerrar las demás pestañas',
      keywords: 'cerrar otras',
      run: () => closeOtherTabs(activeTabId)
    },
    {
      id: 'shortcuts',
      label: 'Atajos de teclado',
      hint: `${MOD}/`,
      keywords: 'ayuda teclas keyboard shortcuts',
      run: () => setModal('shortcuts')
    },
    {
      id: 'env-next',
      label: 'Entorno siguiente',
      hint: `${MOD}E`,
      keywords: 'cambiar rotar entorno environment',
      run: () => cycleEnvironment(1)
    },
    {
      id: 'env-prev',
      label: 'Entorno anterior',
      hint: `${MOD}⇧E`,
      keywords: 'cambiar rotar entorno environment',
      run: () => cycleEnvironment(-1)
    },
    {
      id: 'env-none',
      label: 'Entorno: sin entorno',
      hint: envData.activeId === null ? 'activo' : undefined,
      keywords: 'cambiar quitar entorno environment',
      run: () => void switchEnvironment(null)
    },
    ...envData.environments.map((env): Command => ({
      id: `env-${env.id}`,
      label: `Entorno: ${env.name}`,
      hint: env.id === envData.activeId ? 'activo' : env.protected ? 'protegido' : undefined,
      keywords: 'cambiar seleccionar entorno environment',
      run: () => void switchEnvironment(env.id)
    })),
    {
      id: 'send',
      label: 'Enviar petición',
      hint: `${MOD}↵`,
      keywords: 'ejecutar correr lanzar',
      run: () => void send()
    },
    ...(loading
      ? [
          {
            id: 'cancel',
            label: 'Cancelar petición en curso',
            keywords: 'detener abortar parar',
            run: () => cancelInFlight(activeTabId)
          }
        ]
      : []),
    {
      id: 'copy-response',
      label: 'Copiar body de la respuesta',
      keywords: 'portapapeles copiar respuesta',
      run: () => {
        const r = useRequestStore.getState().response
        if (!r?.ok || !r.body) {
          showFlash('No hay body para copiar')
          return
        }
        void navigator.clipboard
          .writeText(prettyText(r.body))
          .then(() => showFlash('Body copiado ✓'))
      }
    },
    { id: 'save', label: 'Guardar', hint: `${MOD}S`, run: () => void save() },
    ...(currentFile
      ? [{ id: 'save-as', label: 'Guardar como…', run: () => setModal('save') }]
      : []),
    ...(currentFile
      ? [
          {
            id: 'pin',
            label: quick.pinned.includes(currentFile)
              ? 'Quitar petición de fijadas'
              : 'Fijar petición actual',
            keywords: 'favorita estrella pin',
            run: () => {
              togglePin(currentFile)
              showFlash(
                quick.pinned.includes(currentFile) ? 'Quitada de fijadas ✓' : 'Petición fijada ✓'
              )
            }
          }
        ]
      : []),
    { id: 'envs', label: 'Gestionar entornos', run: () => setModal('envs') },
    { id: 'import', label: 'Importar Swagger / OpenAPI', run: () => setModal('import') },
    {
      id: 'sidebar',
      label: (isNarrow ? drawerOpen : layout.sidebarOpen)
        ? 'Ocultar barra lateral'
        : 'Mostrar barra lateral',
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
      split: direction === 'column' ? (y - box.top) / box.height : (x - box.left) / box.width
    })
  }

  const iconBtn =
    'rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100'
  const sidebarShown = isNarrow ? drawerOpen : layout.sidebarOpen

  const sidebar = (
    <Sidebar
      onImport={() => setModal('import')}
      onRun={(id, folder) => {
        setRunCollectionId(id)
        setRunFolder(folder ?? null)
        setModal('runner')
      }}
      onSync={(id, name) => {
        setSyncCollection({ id, name })
        setModal('sync')
      }}
      onCoverage={(id, name) => {
        setCoverageCollection({ id, name })
        setModal('coverage')
      }}
    />
  )

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-200">
      {/* Barra superior: navegación, búsqueda global y acciones */}
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-2 sm:gap-2">
        <button
          className={iconBtn}
          onClick={toggleSidebar}
          title={`${sidebarShown ? 'Ocultar' : 'Mostrar'} barra lateral (${MOD}B)`}
          aria-label="Alternar barra lateral"
        >
          <Icon name="panelLeft" size={17} />
        </button>

        <div className="flex select-none items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-linear-to-br from-blue-500 to-violet-500 text-white">
            <Icon name="zap" size={13} />
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-zinc-100 sm:inline">
            Sonda
          </span>
        </div>

        {/* Buscador global: barra en pantallas anchas, botón de lupa en estrechas */}
        <button
          onClick={() => setModal('palette')}
          className="mx-auto hidden h-8 w-full max-w-md items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-400 md:flex"
          title="Buscar peticiones y acciones"
        >
          <Icon name="search" size={13} />
          <span className="flex-1 truncate">Buscar peticiones y acciones…</span>
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {MOD}K
          </kbd>
        </button>
        <span className="flex-1 md:hidden" />
        <button
          className={`${iconBtn} md:hidden`}
          onClick={() => setModal('palette')}
          aria-label="Buscar peticiones y acciones"
        >
          <Icon name="search" size={16} />
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <EnvironmentSelector onManage={() => setModal('envs')} />
          <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:block" />
          <button
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 sm:px-3"
            onClick={save}
            title={`Guardar (${MOD}S)`}
          >
            <Icon name="save" size={14} />
            <span className="hidden sm:inline">Guardar</span>
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

      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        {/* Pantallas anchas: barra lateral fija con divisor arrastrable */}
        {!isNarrow && layout.sidebarOpen && (
          <>
            <div style={{ width: layout.sidebarWidth }} className="flex min-h-0 shrink-0">
              {sidebar}
            </div>
            <Splitter orientation="vertical" onDrag={dragSidebar} onReset={resetSidebar} />
          </>
        )}

        {/* Pantallas estrechas: cajón superpuesto */}
        {drawerOpen && (
          <div className="absolute inset-0 z-40 flex">
            <div className="anim-slide-in flex h-full w-[min(20rem,85vw)] shrink-0 border-r border-zinc-800 bg-zinc-900 shadow-2xl">
              {sidebar}
            </div>
            <button
              className="anim-fade flex-1 bg-black/50"
              onClick={() => setDrawer(null)}
              aria-label="Cerrar barra lateral"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-stretch border-b border-zinc-800 bg-zinc-950/30 pr-2">
            <TabsBar />
            {!isNarrow && (
              <button
                className={`${iconBtn} my-auto`}
                onClick={toggleDirection}
                title={`Cambiar disposición de los paneles (${MOD}\\)`}
                aria-label="Cambiar disposición de los paneles"
              >
                <Icon name={direction === 'column' ? 'layoutRows' : 'layoutCols'} size={15} />
              </button>
            )}
          </div>

          <RequestBar onCurlImported={onCurlImported} />

          <main
            ref={mainRef}
            className={`flex min-h-0 flex-1 ${direction === 'column' ? 'flex-col' : 'flex-row'}`}
          >
            <section
              style={{ flexBasis: `${layout.split * 100}%` }}
              className="flex min-h-0 min-w-0 shrink-0 grow-0 flex-col overflow-hidden"
            >
              <RequestPanel />
            </section>
            <Splitter
              orientation={direction === 'column' ? 'horizontal' : 'vertical'}
              onDrag={dragSplit}
              onReset={() => setLayout({ split: DEFAULT_LAYOUT.split })}
            />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ResponsePanel />
            </section>
          </main>
        </div>
      </div>

      {/* Aviso breve (guardado, importado…) */}
      {flash && (
        <div
          role="status"
          className="anim-toast fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs text-zinc-100 shadow-xl"
        >
          <Icon name="check" size={14} className="text-emerald-400" />
          {flash.replace(/\s*✓$/, '')}
        </div>
      )}

      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'palette' && <CommandPalette onClose={() => setModal(null)} commands={commands} />}
      {modal === 'runner' && (
        <RunnerModal
          collectionId={runCollectionId}
          initialFolder={runFolder}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'sync' && (
        <SyncModal
          collectionId={syncCollection.id}
          collectionName={syncCollection.name}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'coverage' && (
        <CoverageModal
          collectionId={coverageCollection.id}
          collectionName={coverageCollection.name}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'envs' && <EnvironmentsModal onClose={() => setModal(null)} />}
      {modal === 'bench' && <BenchmarkModal onClose={() => setModal(null)} />}
      {modal === 'fuzz' && <FuzzModal onClose={() => setModal(null)} />}
      {modal === 'snapshot' && <SnapshotModal onClose={() => setModal(null)} />}
      {modal === 'monitor' && <MonitorModal onClose={() => setModal(null)} />}
      {modal === 'mock' && <MockModal onClose={() => setModal(null)} />}
      {modal === 'websocket' && <WebSocketModal onClose={() => setModal(null)} />}
      {modal === 'vars' && <VariablesAuditModal onClose={() => setModal(null)} />}
      {modal === 'replace' && <FindReplaceModal onClose={() => setModal(null)} />}
      {modal === 'toolbox' && <ToolboxModal onClose={() => setModal(null)} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal === 'datagen' && <DataGenModal onClose={() => setModal(null)} />}
      {modal === 'compare' && <EnvCompareModal onClose={() => setModal(null)} />}
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
