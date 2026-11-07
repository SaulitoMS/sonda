import {
  DEFAULT_RUNNER_PREFS,
  normalizeRunnerPrefs,
  type RunnerPrefs
} from '../../../shared/runnerPrefs'

const KEY = 'sonda.runnerPrefs.v1'

export function loadRunnerPrefs(): RunnerPrefs {
  try {
    return normalizeRunnerPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return DEFAULT_RUNNER_PREFS
  }
}

export function saveRunnerPrefs(prefs: RunnerPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* sin almacenamiento: las opciones solo duran la sesión */
  }
}