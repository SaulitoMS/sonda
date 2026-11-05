export interface EnvTone {
  id: string
  label: string
  /** Clase del puntito de color */
  dot: string
  /** Clases del borde y texto del selector */
  select: string
}

export const ENV_TONES: EnvTone[] = [
  {
    id: 'green',
    label: 'Verde',
    dot: 'bg-emerald-400',
    select: 'border-emerald-500/70 text-emerald-300 focus:border-emerald-400'
  },
  {
    id: 'blue',
    label: 'Azul',
    dot: 'bg-sky-400',
    select: 'border-sky-500/70 text-sky-300 focus:border-sky-400'
  },
  {
    id: 'amber',
    label: 'Ámbar',
    dot: 'bg-amber-400',
    select: 'border-amber-500/70 text-amber-300 focus:border-amber-400'
  },
  {
    id: 'red',
    label: 'Rojo',
    dot: 'bg-red-400',
    select: 'border-red-500/70 text-red-300 focus:border-red-400'
  },
  {
    id: 'purple',
    label: 'Morado',
    dot: 'bg-violet-400',
    select: 'border-violet-500/70 text-violet-300 focus:border-violet-400'
  }
]

/** null si el entorno no tiene color (o el guardado ya no existe) */
export function envTone(id: string | undefined): EnvTone | null {
  return ENV_TONES.find((t) => t.id === id) ?? null
}
