import { NavLink } from 'react-router-dom'
import { CalendarDays, House, NotebookText, Sparkles, Wallet } from 'lucide-react'

// El chat va al centro, elevado, como acción principal del asistente.
const ITEMS = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/finanzas', label: 'Finanzas', icon: Wallet },
  { to: '/chat', label: 'Luz', icon: Sparkles, central: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/notas', label: 'Notas', icon: NotebookText },
]

export default function BottomNav() {
  return (
    <nav className="dock glass" aria-label="Navegación principal">
      {ITEMS.map(({ to, label, icon: Icon, end, central }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            ['dock-item', central && 'dock-central', isActive && 'active'].filter(Boolean).join(' ')
          }
        >
          <span className="dock-icon">
            <Icon size={central ? 26 : 22} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="dock-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
