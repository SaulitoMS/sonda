const KEY = 'sonda.monitorWebhook'

export function getWebhookUrl(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setWebhookUrl(url: string): void {
  try {
    const clean = url.trim()
    if (clean) localStorage.setItem(KEY, clean)
    else localStorage.removeItem(KEY)
  } catch {
    /* sin almacenamiento: dura solo la sesión */
  }
}
