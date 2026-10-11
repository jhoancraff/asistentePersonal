import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { obtenerPerfil } from '../lib/api'
import { saludo } from '../lib/format'
import { useOnline } from '../lib/hooks'
import Badge from './Badge'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const online = useOnline()
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    let vivo = true
    obtenerPerfil()
      .then((p) => vivo && setNombre(p.first_name || p.username))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  return (
    <header className="header">
      <div className="header-pill glass">
        <div className="header-text">
          <span className="header-hello">{saludo()}</span>
          <strong className="header-name">{nombre || 'Luz'}</strong>
        </div>
        <Badge tone={online ? 'success' : 'danger'} icon={online ? Wifi : WifiOff}>
          {online ? 'Online' : 'Offline'}
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  )
}
