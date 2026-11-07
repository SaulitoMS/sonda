import { create } from 'zustand'
import {
  clampInterval,
  decideNotification,
  failingSince,
  pushRun,
  type MonitorRun
} from '../../../shared/monitor'
import { runMonitorOnce } from '../lib/monitorRunner'
import { buildWebhookPayload } from '../../../shared/monitorWebhook'
import { getWebhookUrl } from '../lib/monitorWebhook'

interface MonitorState {
  collectionId: string | null
  intervalMin: number
  active: boolean
  checking: boolean
  /** Momento de la próxima comprobación (ms desde epoch) */
  nextAt: number | null
  /** La más reciente primero */
  runs: MonitorRun[]
  start: (collectionId: string, intervalMin: number) => void
  stop: () => void
  runNow: () => Promise<void>
}

// El temporizador vive fuera de React: el monitor sigue aunque se cierre el modal
let timer: ReturnType<typeof setInterval> | undefined

function notify(title: string, body: string): void {
  try {
    new Notification(title, { body })
  } catch {
    // sin soporte de notificaciones: el estado sigue visible en la cabecera
  }
}

export const useMonitorStore = create<MonitorState>((set, get) => {
  async function tick(): Promise<void> {
    const { collectionId, checking, active, intervalMin } = get()
    if (!collectionId || checking) return

    set({ checking: true, nextAt: active ? Date.now() + intervalMin * 60_000 : null })
    try {
      const run = await runMonitorOnce(collectionId)
      const previous = get().runs[0] ?? null
      // Se calcula antes de guardar la comprobación nueva: mide la racha que acaba de terminar
      const down = failingSince(get().runs)
      set({ runs: pushRun(get().runs, run) })
      const note = decideNotification(previous, run, down)
      if (note) {
        notify(note.title, note.body)
        const hook = getWebhookUrl()
        if (hook) void window.api.sendWebhook(hook, buildWebhookPayload(hook, note))
      }
    } finally {
      set({ checking: false })
    }
  }

  return {
    collectionId: null,
    intervalMin: 5,
    active: false,
    checking: false,
    nextAt: null,
    runs: [],

    start: (collectionId, minutes) => {
      clearInterval(timer)
      const intervalMin = clampInterval(minutes)
      set({ collectionId, intervalMin, active: true, runs: [] })
      timer = setInterval(() => void tick(), intervalMin * 60_000)
      void tick()
    },

    stop: () => {
      clearInterval(timer)
      timer = undefined
      set({ active: false, nextAt: null })
    },

    runNow: () => tick()
  }
})
