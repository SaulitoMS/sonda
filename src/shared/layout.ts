export type SplitDirection = 'column' | 'row'

export interface LayoutState {
  sidebarOpen: boolean
  /** Ancho de la barra lateral en px */
  sidebarWidth: number
  /** Parte del espacio (0 a 1) que ocupa el panel de la petición */
  split: number
  /** column: petición arriba y respuesta abajo · row: petición a la izquierda y respuesta a la derecha */
  direction: SplitDirection
}

export const SIDEBAR_MIN = 260
export const SIDEBAR_MAX = 520
export const SPLIT_MIN = 0.2
export const SPLIT_MAX = 0.8

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarWidth: 288,
  split: 0.42,
  direction: 'column'
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Valida lo que viene del almacenamiento o de un arrastre: lo inválido vuelve a su valor por defecto */
export function normalizeLayout(raw: unknown): LayoutState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    sidebarOpen: typeof r.sidebarOpen === 'boolean' ? r.sidebarOpen : DEFAULT_LAYOUT.sidebarOpen,
    sidebarWidth: Math.round(
      clamp(num(r.sidebarWidth, DEFAULT_LAYOUT.sidebarWidth), SIDEBAR_MIN, SIDEBAR_MAX)
    ),
    split: clamp(num(r.split, DEFAULT_LAYOUT.split), SPLIT_MIN, SPLIT_MAX),
    direction: r.direction === 'row' || r.direction === 'column' ? r.direction : 'column'
  }
}