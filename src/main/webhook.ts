import { ipcMain } from 'electron'

const TIMEOUT_MS = 8000

export function registerWebhookHandlers(): void {
  // Devuelve el mensaje de error, o null si salió bien
  ipcMain.handle(
    'webhook:send',
    async (_event, url: string, payload: unknown): Promise<string | null> => {
      let target: URL
      try {
        target = new URL(url)
      } catch {
        return 'URL de webhook inválida'
      }
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        return 'El webhook debe empezar con http:// o https://'
      }

      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        return res.ok ? null : `El webhook respondió ${res.status}`
      } catch (err) {
        return err instanceof Error ? err.message : 'No se pudo enviar el webhook'
      }
    }
  )
}
