import type { SchemaValidation } from '../../../shared/types'

const MAX_SHOWN = 6

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Resultado de validar el body que se va a enviar contra el schema del requestBody de la spec */
export function RequestSchemaStatus({
  validation
}: {
  validation: SchemaValidation
}): React.JSX.Element {
  const errors = validation.issues.filter((i) => i.severity === 'error')
  const warnings = validation.issues.length - errors.length

  if (validation.verdict === 'skipped') {
    return <p className="text-xs text-zinc-500">{validation.message}</p>
  }

  if (validation.verdict === 'valid') {
    return (
      <p className="text-xs text-emerald-400">
        ✓ El body cumple el schema de la spec
        {warnings > 0 && (
          <span className="text-amber-400">
            {' '}
            ({plural(warnings, 'campo no documentado', 'campos no documentados')})
          </span>
        )}
      </p>
    )
  }

  const shown = errors.slice(0, MAX_SHOWN)
  return (
    <div className="selectable space-y-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs">
      <p className="font-semibold text-red-400">
        ✗ {plural(errors.length, 'error', 'errores')} contra el schema de la spec. Se puede enviar
        igual.
      </p>
      <ul className="space-y-1 font-mono">
        {shown.map((issue, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-semibold text-blue-300">{issue.path}</span>
            <span className="text-zinc-300">{issue.message}</span>
          </li>
        ))}
      </ul>
      {errors.length > shown.length && (
        <p className="text-zinc-500">y {errors.length - shown.length} más…</p>
      )}
    </div>
  )
}