import type { BodyForm, BodyFormData, BodyMode, FormField, FormFieldData, FormPart } from './types'

export const BODY_MODES: { id: BodyMode; label: string }[] = [
  { id: 'raw', label: 'Texto / JSON' },
  { id: 'urlencoded', label: 'x-www-form-urlencoded' },
  { id: 'form-data', label: 'form-data' }
]

export const newField = (): FormField => ({
  id: crypto.randomUUID(),
  key: '',
  value: '',
  type: 'text',
  enabled: true
})

/**
 * Versión limpia para guardar o comparar: sin ids ni filas vacías.
 * Devuelve undefined si no hay nada que guardar (modo raw y sin campos).
 */
export function toBodyFormData(form: BodyFormData): BodyFormData | undefined {
  const fields = form.fields
    .filter((f) => f.key.trim())
    .map(({ key, value, type, enabled }) => ({ key, value, type, enabled }))
  if (form.mode === 'raw' && fields.length === 0) return undefined
  return { mode: form.mode, fields }
}

/** Convierte lo guardado en lo que usa la tabla: con ids y una fila vacía al final */
export function fromBodyFormData(data?: BodyFormData | null): BodyForm {
  return {
    mode: data?.mode ?? 'raw',
    fields: [...(data?.fields ?? []).map((f) => ({ id: crypto.randomUUID(), ...f })), newField()]
  }
}

const isUsed = (f: FormFieldData): boolean => f.enabled && f.key.trim() !== ''

/** key1=valor1&key2=valor2 con todo codificado. Los campos de archivo no aplican aquí */
export function urlencodedBody(fields: FormFieldData[], resolve: (text: string) => string): string {
  const params = new URLSearchParams()
  for (const f of fields) {
    if (isUsed(f) && f.type === 'text') params.append(resolve(f.key.trim()), resolve(f.value))
  }
  return params.toString()
}

/** Campos activos de un form-data, con {{variables}} ya resueltas */
export function formDataParts(
  fields: FormFieldData[],
  resolve: (text: string) => string
): FormPart[] {
  return fields.filter(isUsed).map((f) => ({
    key: resolve(f.key.trim()),
    kind: f.type,
    value: resolve(f.value)
  }))
}
