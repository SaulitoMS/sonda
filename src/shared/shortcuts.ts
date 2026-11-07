export interface Shortcut {
  /** Combinación con "+" y el token "Mod" (⌘ en Mac, Ctrl en el resto). Ej: "Mod+Shift+T" */
  keys: string
  label: string
}

export interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { keys: 'Mod+K', label: 'Paleta de comandos (peticiones, herramientas y acciones)' },
      { keys: 'Mod+/', label: 'Mostrar esta lista de atajos' },
      { keys: 'Mod+Enter', label: 'Enviar la petición' },
      { keys: 'Esc', label: 'Cancelar la petición en curso' },
      { keys: 'Mod+S', label: 'Guardar la petición' },
      { keys: 'Mod+Shift+S', label: 'Guardar como…' },
      { keys: 'Mod+L', label: 'Ir a la barra de URL' },
      { keys: 'Mod+B', label: 'Mostrar u ocultar la barra lateral' },
      { keys: 'Mod+\\', label: 'Cambiar la disposición (vertical u horizontal)' },
      { keys: 'Mod+E', label: 'Entorno siguiente' },
      { keys: 'Mod+Shift+E', label: 'Entorno anterior' }
    ]
  },
  {
    title: 'Pestañas',
    items: [
      { keys: 'Mod+T', label: 'Nueva pestaña' },
      { keys: 'Mod+Shift+T', label: 'Reabrir la última pestaña cerrada' },
      { keys: 'Mod+W', label: 'Cerrar la pestaña' },
      { keys: 'Mod+Tab', label: 'Pestaña siguiente' },
      { keys: 'Mod+Shift+Tab', label: 'Pestaña anterior' },
      { keys: 'Mod+1…8', label: 'Ir a esa pestaña' },
      { keys: 'Mod+9', label: 'Ir a la última pestaña' }
    ]
  },
  {
    title: 'Buscar y escribir',
    items: [
      { keys: 'Mod+F', label: 'Buscar dentro del body o de la respuesta' },
      { keys: 'Enter', label: 'Siguiente coincidencia (en la búsqueda)' },
      { keys: 'Shift+Enter', label: 'Coincidencia anterior (en la búsqueda)' },
      { keys: 'Esc', label: 'Cerrar la búsqueda o la lista de variables' },
      { keys: '↑ ↓', label: 'Moverse por las sugerencias de {{variables}}' },
      { keys: 'Enter', label: 'Aceptar la sugerencia de {{variable}}' }
    ]
  },
  {
    title: 'Paleta de comandos',
    items: [
      { keys: '>', label: 'Al inicio del texto: mostrar solo acciones' },
      { keys: '↑ ↓', label: 'Moverse por los resultados' },
      { keys: 'Enter', label: 'Ejecutar o abrir el resultado' },
      { keys: 'Esc', label: 'Cerrar la paleta' }
    ]
  },
  {
    title: 'WebSocket',
    items: [
      { keys: 'Mod+Enter', label: 'Enviar el mensaje' },
      { keys: 'Mod+↑', label: 'Mensaje anterior del historial' },
      { keys: 'Mod+↓', label: 'Mensaje siguiente del historial' }
    ]
  }
]

const MAC_KEYS: Record<string, string> = {
  Mod: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↵',
  Tab: '⇥'
}

const OTHER_KEYS: Record<string, string> = { Mod: 'Ctrl' }

/** "Mod+Shift+T" → "⌘⇧T" en Mac y "Ctrl+Shift+T" en el resto */
export function formatKeys(keys: string, mac: boolean): string {
  const table = mac ? MAC_KEYS : OTHER_KEYS
  const parts = keys.split('+').map((p) => table[p] ?? p)
  return mac ? parts.join('') : parts.join('+')
}
