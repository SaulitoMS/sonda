import type { SendRequestResult } from '../../../shared/types'

/** A partir de cuántos ms una petición se considera "larga" */
export const SLOW_NOTIFY_MS = 5000

/** Avisa con una notificación del sistema si la petición fue larga y la app no está en primer plano */
export function notifyIfSlow(method: string, url: string, response: SendRequestResult): void {
  if (response.timeMs < SLOW_NOTIFY_MS) return
  if (typeof document === 'undefined' || document.hasFocus()) return
  if (typeof Notification === 'undefined') return

  const seconds = (response.timeMs / 1000).toFixed(1)
  const result = response.ok ? `${response.status} ${response.statusText}` : 'Error'
  const cleanUrl = url.replace(/[?#].*$/, '')

  try {
    new Notification('Sonda: petición terminada', {
      body: `${method} ${cleanUrl}\n${result} · ${seconds} s`
    })
  } catch {
    // sin permiso de notificaciones: no pasa nada
  }
}
