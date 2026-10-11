import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const oscuro = theme === 'dark'
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      data-theme-state={theme}
      onClick={toggle}
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-pressed={oscuro}
    >
      <Sun size={20} className="tt-sun" aria-hidden="true" />
      <Moon size={20} className="tt-moon" aria-hidden="true" />
    </button>
  )
}
