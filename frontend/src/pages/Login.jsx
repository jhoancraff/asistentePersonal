import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LockKeyhole, UserRound } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import ThemeToggle from '../components/ThemeToggle'
import { login } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err.response ? 'Usuario o contraseña incorrectos.' : 'No hay conexión con el servidor.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login">
      <div className="login-aura" aria-hidden="true" />
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <form className="login-form glass" onSubmit={onSubmit}>
        <div className="logo" aria-label="Luz">
          <span className="logo-dot" aria-hidden="true" />
          Luz
        </div>
        <p className="muted login-sub">Tu asistente personal</p>

        <label className="field">
          <UserRound size={18} aria-hidden="true" />
          <input
            placeholder="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <ActionButton full loading={loading} disabled={!username || !password}>
          {loading ? 'Accediendo a la red…' : 'Entrar'}
        </ActionButton>
      </form>
    </div>
  )
}
