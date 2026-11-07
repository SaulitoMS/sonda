export interface CliCommandOptions {
  /** id de la colección (lo que acepta `sonda-cli run`) */
  collection: string
  env: string | null
  /** null = toda la colección, "" = peticiones sin carpeta */
  folder: string | null
  includeWrites: boolean
  bail: boolean
  retries: number
  delayMs: number
  maxTimeMs: number
  only: string
  exclude: string
  repeat: number
  /** ¿Se cargó un archivo de datos? La CLI lo pide con --data <archivo> */
  hasData: boolean
  retryAny: boolean
  skipFolderOnFail: boolean
}

/** Comillas para la shell: deja tal cual lo seguro y envuelve en '...' lo demás */
export const shellQuote = (text: string): string =>
  /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`

/**
 * El comando de `sonda-cli` equivalente a lo configurado en el runner, más una lista de lo que
 * la CLI no puede reproducir (para avisarlo en vez de ejecutar algo distinto en silencio).
 */
export function buildCliCommand(o: CliCommandOptions): { command: string; notes: string[] } {
  const args = ['sonda-cli', 'run', shellQuote(o.collection)]
  const notes: string[] = []
  const add = (flag: string, value?: string | number): void => {
    args.push(value === undefined ? flag : `${flag} ${shellQuote(String(value))}`)
  }

  if (o.env) add('-e', o.env)
  if (o.folder) add('-f', o.folder)
  else if (o.folder === '') {
    notes.push(
      'Las peticiones sin carpeta no se pueden elegir solas en la CLI: correrá toda la colección.'
    )
  }
  if (o.includeWrites) add('--include-writes')
  if (o.bail) add('--bail')
  if (o.retries > 0) {
    add('--retries', Math.min(o.retries, 3))
    if (o.retries > 3) notes.push('La CLI permite hasta 3 reintentos.')
  }
  if (o.delayMs > 0) add('--delay', o.delayMs)
  if (o.maxTimeMs > 0) add('--max-time', o.maxTimeMs)
  if (o.only.trim()) add('--only', o.only.trim())
  if (o.exclude.trim()) add('--exclude', o.exclude.trim())
  if (o.hasData) notes.push('Agrega --data <archivo> con tu CSV o JSON.')
  else if (o.repeat > 1) add('--repeat', o.repeat)
  if (o.retryAny) notes.push('"Reintentar cualquier fallo" no existe en la CLI.')
  if (o.skipFolderOnFail) notes.push('"Saltar el resto de la carpeta" no existe en la CLI.')

  return { command: args.join(' '), notes }
}
