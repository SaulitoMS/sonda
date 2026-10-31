import { MAX_MATCHES } from '../lib/search'

interface Props {
  text: string
  query: string
  /** Índice global de la primera coincidencia de este texto; sin él no se resalta nada */
  start: number | undefined
  /** Índice global de la coincidencia activa (la que se naranja y a la que se salta) */
  active: number
}

/** Muestra `text` con las apariciones de `query` resaltadas (sin distinguir mayúsculas) */
export function Highlight({ text, query, start, active }: Props): React.JSX.Element {
  if (!query || start === undefined) return <>{text}</>

  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let pos = 0
  let n = start
  let i = lower.indexOf(q)

  while (i !== -1 && n - start < MAX_MATCHES) {
    if (i > pos) parts.push(text.slice(pos, i))
    const isActive = n === active
    parts.push(
      <mark
        key={i}
        data-search-active={isActive ? 'true' : undefined}
        className={`rounded-sm text-black ${isActive ? 'bg-orange-400' : 'bg-yellow-300'}`}
      >
        {text.slice(i, i + q.length)}
      </mark>
    )
    pos = i + q.length
    n++
    i = lower.indexOf(q, pos)
  }
  parts.push(text.slice(pos))
  return <>{parts}</>
}
