/** Opciones del runner que se recuerdan entre sesiones. "Incluir escrituras" no se guarda a propósito */
export interface RunnerPrefs {
  stopOnFail: boolean
  skipFolderOnFail: boolean
  retryAny: boolean
  retries: number
  delayMs: number
}

export const DEFAULT_RUNNER_PREFS: RunnerPrefs = {
  stopOnFail: false,
  skipFolderOnFail: false,
  retryAny: false,
  retries: 0,
  delayMs: 0
}

const toInt = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback

/** Valida lo leído de localStorage: lo inválido vuelve a su valor por defecto */
export function normalizeRunnerPrefs(raw: unknown): RunnerPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_RUNNER_PREFS
  return {
    stopOnFail: typeof r.stopOnFail === 'boolean' ? r.stopOnFail : d.stopOnFail,
    skipFolderOnFail:
      typeof r.skipFolderOnFail === 'boolean' ? r.skipFolderOnFail : d.skipFolderOnFail,
    retryAny: typeof r.retryAny === 'boolean' ? r.retryAny : d.retryAny,
    retries: toInt(r.retries, d.retries, 0, 10),
    delayMs: toInt(r.delayMs, d.delayMs, 0, 10000)
  }
}
