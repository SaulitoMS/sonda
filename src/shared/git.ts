export type GitChange = 'new' | 'modified' | 'deleted' | 'renamed' | 'conflict'

export interface GitFile {
  /** Ruta relativa al workspace, con "/" */
  path: string
  change: GitChange
  /** true si el cambio ya está en el área de preparación (git add) */
  staged: boolean
  /** Ruta anterior, solo si change es "renamed" */
  from?: string
}

export interface GitCommit {
  hash: string
  subject: string
  /** Milisegundos desde 1970 */
  date: number
}

export interface GitRepoStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
}

export type GitStatusResult =
  /** Git no está instalado (o no está en el PATH) */
  | { ok: true; state: 'no-git' }
  /** El workspace todavía no es un repositorio */
  | { ok: true; state: 'no-repo' }
  | { ok: true; state: 'repo'; status: GitRepoStatus; commits: GitCommit[] }
  | { ok: false; error: string }

export type GitActionResult = { ok: true } | { ok: false; error: string }

const CONFLICTS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

function parseBranchLine(line: string): Pick<GitRepoStatus, 'branch' | 'ahead' | 'behind'> {
  const initial = /^(?:No commits yet on|Initial commit on) (.+)$/.exec(line)
  if (initial) return { branch: initial[1], ahead: 0, behind: 0 }

  const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(line)
  if (!m) return { branch: line, ahead: 0, behind: 0 }
  const track = m[3] ?? ''
  return {
    branch: m[1],
    ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0)
  }
}

/** Lee la salida de `git status --porcelain=v1 -z -b -uall` */
export function parseGitStatus(output: string): GitRepoStatus {
  const entries = output.split('\0')
  let head: Pick<GitRepoStatus, 'branch' | 'ahead' | 'behind'> = {
    branch: '',
    ahead: 0,
    behind: 0
  }
  const files: GitFile[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    if (entry.startsWith('## ')) {
      head = parseBranchLine(entry.slice(3))
      continue
    }

    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    // Renombrados y copias traen la ruta anterior como siguiente entrada
    const from = 'RC'.includes(x) || 'RC'.includes(y) ? entries[++i] : undefined

    let change: GitChange = 'modified'
    if (CONFLICTS.has(x + y)) change = 'conflict'
    else if (from !== undefined) change = 'renamed'
    else if (x === '?' || x === 'A' || y === 'A') change = 'new'
    else if (x === 'D' || y === 'D') change = 'deleted'

    files.push({
      path,
      change,
      staged: x !== ' ' && x !== '?',
      ...(change === 'renamed' && from ? { from } : {})
    })
  }
  return { ...head, files }
}

export type GitDiffResult =
  | { ok: true; diff: string; truncated: boolean }
  | { ok: false; error: string }

export type GitDiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

export interface GitDiffLine {
  kind: GitDiffLineKind
  text: string
}

/** Clasifica cada línea de un diff. Antes del primer "@@" todo es cabecera (meta) */
export function parseDiff(diff: string): GitDiffLine[] {
  const lines = diff.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()

  const out: GitDiffLine[] = []
  let inHunk = false
  for (const text of lines) {
    if (text.startsWith('diff --git')) {
      inHunk = false
      out.push({ kind: 'meta', text })
    } else if (text.startsWith('@@')) {
      inHunk = true
      out.push({ kind: 'hunk', text })
    } else if (!inHunk) {
      out.push({ kind: 'meta', text })
    } else {
      out.push({ kind: text[0] === '+' ? 'add' : text[0] === '-' ? 'del' : 'context', text })
    }
  }
  return out
}