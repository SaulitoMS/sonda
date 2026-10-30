import { emptyAuth } from '../../../shared/auth'
import {
  parseSession,
  SESSION_VERSION,
  type PersistedRequest,
  type PersistedSession
} from '../../../shared/session'
import {
  blankSnapshot,
  captureSnapshot,
  newRow,
  useRequestStore,
  type RequestSnapshot
} from '../store/useRequestStore'
import { useTabsStore, type Tab } from '../store/useTabsStore'

const KEY = 'sonda.session.v1'

function toPersisted(s: RequestSnapshot): PersistedRequest {
  return {
    method: s.method,
    url: s.url,
    headers: s.headers,
    body: s.body,
    auth: s.auth,
    assertions: s.assertions,
    extractions: s.extractions,
    requestSchema: s.requestSchema,
    responseSchemas: s.responseSchemas,
    currentFile: s.currentFile,
    name: s.name,
    baseline: s.baseline
  }
}

function toSnapshot(p: PersistedRequest): RequestSnapshot {
  return {
    ...blankSnapshot(),
    method: p.method,
    url: p.url,
    headers: p.headers.length
      ? p.headers.map((h) => ({ ...h, id: h.id || crypto.randomUUID() }))
      : [newRow()],
    body: p.body,
    auth: { ...emptyAuth(), ...p.auth },
    assertions: p.assertions,
    extractions: p.extractions,
    requestSchema: p.requestSchema,
    responseSchemas: p.responseSchemas,
    currentFile: p.currentFile,
    name: p.name,
    baseline: p.baseline
  }
}

/** Vuelve a abrir las pestañas de la última sesión. Llamar una vez, antes de renderizar */
export function restoreSession(): void {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return
  }
  const session = parseSession(raw)
  if (!session) return

  const restored = session.tabs.map((t) => ({ id: t.id, snapshot: toSnapshot(t.request) }))
  const active = restored.find((t) => t.id === session.activeId) ?? restored[0]

  const tabs: Tab[] = restored.map((t) => ({ id: t.id, snapshot: t.snapshot }))
  useRequestStore.setState(active.snapshot)
  useTabsStore.setState({ tabs, activeId: active.id })
}

function buildSession(): PersistedSession {
  const { tabs, activeId } = useTabsStore.getState()
  const live = captureSnapshot()
  return {
    version: SESSION_VERSION,
    activeId,
    tabs: tabs.map((t) => ({
      id: t.id,
      request: toPersisted(t.id === activeId ? live : (t.snapshot ?? blankSnapshot()))
    }))
  }
}

function write(): void {
  const session = buildSession()
  const slim: PersistedSession = {
    ...session,
    tabs: session.tabs.map((t) => ({
      ...t,
      request: { ...t.request, requestSchema: null, responseSchemas: null }
    }))
  }
  // Si el almacenamiento se llena, reintenta sin los schemas (lo más pesado)
  for (const data of [session, slim]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
      return
    } catch {
      // cuota llena: se prueba la versión liviana
    }
  }
}

/** Guarda la sesión al cambiar algo (con pausa para no escribir en cada tecla) y al cerrar */
export function startSessionPersistence(): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(write, 400)
  }
  useRequestStore.subscribe(schedule)
  useTabsStore.subscribe(schedule)
  window.addEventListener('beforeunload', write)
}
