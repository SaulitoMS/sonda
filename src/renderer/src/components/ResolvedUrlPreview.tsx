import { interpolate } from '../../../shared/variables'
import { useEffectiveEnv } from '../lib/collectionVariables'

interface Props {
  url: string
}

/** Muestra la URL con las {{variables}} ya resueltas. Los secretos se enmascaran. */
export function ResolvedUrlPreview({ url }: Props): React.JSX.Element | null {
  const env = useEffectiveEnv()
  if (!url.includes('{{')) return null

  const vars: Record<string, string> = {}
  for (const v of env?.variables ?? []) {
    if (v.enabled && v.key.trim()) vars[v.key.trim()] = v.secret ? '••••••' : v.value
  }

  // Las {{$dinámicas}} se dejan tal cual: se generan de nuevo en cada envío
  const { text, missing } = interpolate(url.trim(), vars, { dynamic: false })
  const undefinedVars = missing.filter((name) => !name.startsWith('$'))

  return (
    <div className="flex items-start gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs">
      <span className="shrink-0 text-zinc-500">URL final</span>
      <code
        className="min-w-0 flex-1 break-all text-zinc-300"
        title="Vista previa: un pre-script puede cambiarla al enviar"
      >
        {text}
      </code>
      {undefinedVars.length > 0 && (
        <span className="shrink-0 text-amber-400">Faltan: {undefinedVars.join(', ')}</span>
      )}
    </div>
  )
}
