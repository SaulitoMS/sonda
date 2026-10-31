import { toggleTheme, useTheme } from '../lib/theme'
import { Icon } from './Icon'

export function ThemeToggle(): React.JSX.Element {
  const theme = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
      onClick={toggleTheme}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
    >
      {/* Sol (estás en oscuro → pasa a claro) · Luna (estás en claro → pasa a oscuro) */}
      <Icon name={isDark ? 'sun' : 'moon'} size={15} />
    </button>
  )
}
