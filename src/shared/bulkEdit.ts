export interface BulkRow {
  key: string
  value: string
  enabled: boolean
}

/** Convierte filas clave/valor en texto, una por línea: "clave: valor". Las desactivadas llevan "// " delante */
export function rowsToBulk(rows: BulkRow[], withToggle = true): string {
  return rows
    .filter((r) => r.key.trim() || r.value.trim())
    .map((r) => `${withToggle && !r.enabled ? '// ' : ''}${r.key}: ${r.value}`)
    .join('\n')
}

/** Inverso de rowsToBulk. Separa por el primer ":" y ignora líneas vacías */
export function bulkToRows(text: string, withToggle = true): BulkRow[] {
  const rows: BulkRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    let enabled = true
    if (withToggle && line.startsWith('//')) {
      enabled = false
      line = line.slice(2).trim()
    }
    if (!line) continue
    const i = line.indexOf(':')
    rows.push(
      i === -1
        ? { key: line, value: '', enabled }
        : { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim(), enabled }
    )
  }
  return rows
}
