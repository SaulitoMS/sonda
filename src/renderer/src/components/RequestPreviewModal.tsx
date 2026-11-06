import { useMemo, useState } from 'react'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { useEffectiveEnv } from '../lib/collectionVariables'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const SENSITIVE = /^(authorization|proxy-authorization|cookie|x-api-key|x-auth-token)$/i

export function RequestPreviewModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const headers = useRequestStore((s) => s.headers)
  const body = useRequestStore((s) => s.body)
  const env = useEffectiveEnv()
  const [showSecrets, setShowSecrets] = useState(false)
  const [copied, setCopied] = useState(false)

  const preview = useMemo(() => {
    const vars = buildVarMap(env)
    const missing = new Set<string>()
    const resolve = (text: string): string => {
      const out = interpolate(text, vars)
      out.missing.forEach((m) => missing.add(m))
      return out.text
    }
    return {
      url: resolve(url),
      headers: headers
        .filter((h) => h.enabled && h.key.trim() !== '')
        .map((h) => ({ key: resolve(h.key), value: resolve(h.value) })),
      body: resolve(body),
      missing: [...missing]
    }
  }, [env, url, headers, body])

  const shown = (key: string, value: string): string =>
    !showSecrets && SENSITIVE.test(key) ? '••••••••' : value

  const asText = (): string =>
    [
      `${method} ${preview.url}`,
      ...preview.headers.map((h) => `${h.key}: ${shown(h.key, h.value)}`),
      ...(preview.body ? ['', preview.body] : [])
    ].join('\n')

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(asText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal
      title="Vista previa de la petición"
      description="Así se enviará, con las variables ya resueltas"
      icon="fileCode"
      wide
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => setShowSecrets(e.target.checked)}
            />
            Mostrar valores sensibles
          </label>
          <button
            onClick={copy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      }
    >
      {preview.missing.length > 0 && (
        <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Variables sin definir: {preview.missing.map((m) => `{{${m}}}`).join(', ')}. La petición no
          se enviará hasta definirlas.
        </p>
      )}

      <pre className="selectable overflow-auto whitespace-pre-wrap break-all rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
        <span className="font-bold text-emerald-400">{method}</span> {preview.url || '(sin URL)'}
        {preview.headers.map((h, i) => (
          <span key={i} className="block">
            <span className="text-sky-400">{h.key}</span>: {shown(h.key, h.value)}
          </span>
        ))}
        {preview.body && <span className="mt-2 block text-zinc-300">{preview.body}</span>}
      </pre>

      <p className="mt-3 text-[11px] text-zinc-500">
        No incluye los headers ni la autenticación heredados de la colección o carpeta, ni lo que
        cambien los scripts previos.
      </p>
    </Modal>
  )
}
