import { useState } from 'react'
import { interpolate } from '../../../shared/variables'
import { useEffectiveEnv } from '../lib/collectionVariables'

interface Props {
  url: string
}

/** Muestra la URL con las {{variables}} ya resueltas. Los secretos se enmascaran. */
export function ResolvedUrlPreview({ url }: Props): React.JSX.Element | null {
  const env = useEffectiveEnv()
  const [copied, setCopied] = useState(false)
  if (!url.includes('{{')) return null

  const vars: Record<string, string> = {}
  // Para copiar, los secretos no se resuelven: quedan como {{nombre}} y no salen del keychain
  const copyVars: Record<string, string> = {}
  for (const v of env?.variables ?? []) {
    const key = v.key.trim()
    if (!v.enabled || !key) continue
    vars[key] = v.secret ? '••••••' : v.value
    if (!v.secret) copyVars[key] = v.value
  }

  // Las {{$dinámicas}} se dejan tal cual: se generan de nuevo en cada envío
  const { text, missing } = interpolate(url.trim(), vars, { dynamic: false })
  const undefinedVars = missing.filter((name) => !name.startsWith('$'))

  const copy = async (): Promise<void> => {
    const { text: plain } = interpolate(url.trim(), copyVars, { dynamic: false })
    await navigator.clipboard.writeText(plain)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
      <button
        onClick={() => void copy()}
        className="shrink-0 rounded px-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        title="Copiar la URL con las variables resueltas (los secretos quedan como {{variable}})"
      >
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}