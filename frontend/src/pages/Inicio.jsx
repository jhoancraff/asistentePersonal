import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  LogOut,
  Mic,
  NotebookPen,
  Satellite,
} from 'lucide-react'
import ActionButton from '../components/ActionButton'
import Badge from '../components/Badge'
import GlassCard from '../components/GlassCard'
import { listar, logout } from '../lib/api'
import { cuentaRegresiva, fechaRelativa, formatMoney, hora, mismoDia } from '../lib/format'
import { useTick } from '../lib/hooks'
import { activarNotificaciones } from '../lib/push'

async function pushActivo() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    return Boolean(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

export default function Inicio() {
  const navigate = useNavigate()
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [push, setPush] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [pushCargando, setPushCargando] = useState(false)
  useTick()

  useEffect(() => {
    let vivo = true
    Promise.allSettled([
      listar('/finanzas/cuentas/'),
      listar('/finanzas/movimientos/'),
      listar('/agenda/eventos/'),
    ]).then(([c, m, e]) => {
      if (!vivo) return
      if (c.status === 'fulfilled') setCuentas(c.value)
      if (m.status === 'fulfilled') setMovimientos(m.value)
      if (e.status === 'fulfilled') setEventos(e.value)
      setCargando(false)
    })
    pushActivo().then((v) => vivo && setPush(v))
    return () => {
      vivo = false
    }
  }, [])

  // Un total por moneda: no se mezclan bolívares con dólares.
  const totales = useMemo(() => {
    const porMoneda = {}
    for (const c of cuentas.filter((x) => x.activa && !x.cuenta_madre)) {
      porMoneda[c.moneda] = (porMoneda[c.moneda] ?? 0) + Number(c.saldo)
    }
    return Object.entries(porMoneda)
  }, [cuentas])
  const monedaDe = useMemo(() => Object.fromEntries(cuentas.map((c) => [c.id, c.moneda])), [cuentas])
  const hoy = new Date()
  const eventosHoy = eventos.filter((e) => mismoDia(new Date(e.inicio), hoy))
  const proximo = eventos.find((e) => !e.completado && new Date(e.inicio) > hoy)
  const ultimo = movimientos[0]

  const onActivar = useCallback(async () => {
    setPushCargando(true)
    setPushMsg('')
    try {
      const ok = await activarNotificaciones()
      setPush(ok)
      if (!ok) setPushMsg('No se pudo activar. Revisa el permiso de notificaciones del navegador.')
    } catch {
      setPushMsg('No se pudo activar el enlace.')
    } finally {
      setPushCargando(false)
    }
  }, [])

  return (
    <div className="stack">
      <GlassCard glow className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <span className="eyebrow">Balance consolidado</span>
        <div className="hero-amount">
          {cargando ? '···' : formatMoney(totales[0]?.[1] ?? 0, totales[0]?.[0] ?? 'VES')}
        </div>
        {totales.slice(1).map(([moneda, total]) => (
          <div key={moneda} className="hero-amount-extra">
            {formatMoney(total, moneda)}
          </div>
        ))}
        <div className="hero-meta">
          <Badge tone="violet" icon={CalendarClock}>
            {eventosHoy.length} {eventosHoy.length === 1 ? 'evento hoy' : 'eventos hoy'}
          </Badge>
          <Badge tone="muted">
            {cuentas.filter((c) => !c.cuenta_madre).length}{' '}
            {cuentas.filter((c) => !c.cuenta_madre).length === 1 ? 'cuenta' : 'cuentas'}
          </Badge>
        </div>
        <div className="uplink">
          <Satellite size={20} aria-hidden="true" className={push ? 'uplink-on' : 'uplink-off'} />
          <div className="uplink-text">
            <strong>{push ? 'Enlace satelital activo' : 'Enlace satelital inactivo'}</strong>
            <span className="muted">
              {push ? 'Recibirás tus recordatorios' : 'Activa las notificaciones push'}
            </span>
          </div>
          {!push && (
            <ActionButton
              variant="ghost"
              icon={BellRing}
              loading={pushCargando}
              onClick={onActivar}
              className="btn-sm"
            >
              Activar
            </ActionButton>
          )}
        </div>
        {pushMsg && (
          <p className="form-error" role="status">
            {pushMsg}
          </p>
        )}
      </GlassCard>

      <div className="grid-2">
        <GlassCard
          as="button"
          type="button"
          className="widget tappable"
          onClick={() => navigate('/agenda')}
        >
          <span className="eyebrow">Próximo evento</span>
          {proximo ? (
            <>
              <strong className="widget-title">{proximo.titulo}</strong>
              <span className="muted">{hora(proximo.inicio)}</span>
              <Badge tone="accent" icon={CalendarClock}>
                {cuentaRegresiva(proximo.inicio)}
              </Badge>
            </>
          ) : (
            <span className="muted">Sin eventos próximos</span>
          )}
        </GlassCard>

        <GlassCard
          as="button"
          type="button"
          className="widget tappable"
          onClick={() => navigate('/finanzas')}
        >
          <span className="eyebrow">Último movimiento</span>
          {ultimo ? (
            <>
              <strong className="widget-title">{ultimo.descripcion || 'Sin descripción'}</strong>
              <span className="muted">{fechaRelativa(ultimo.fecha)}</span>
              <Badge
                tone={ultimo.tipo === 'ingreso' ? 'success' : 'danger'}
                icon={ultimo.tipo === 'ingreso' ? ArrowDownLeft : ArrowUpRight}
              >
                {ultimo.tipo === 'ingreso' ? '+' : '−'} {formatMoney(ultimo.monto, monedaDe[ultimo.cuenta])}
              </Badge>
            </>
          ) : (
            <span className="muted">Aún sin movimientos</span>
          )}
        </GlassCard>
      </div>

      <div className="grid-2">
        <ActionButton variant="ghost" icon={NotebookPen} full onClick={() => navigate('/notas?nueva=1')}>
          Dictar nota
        </ActionButton>
        <ActionButton icon={Mic} full onClick={() => navigate('/chat')}>
          Hablar
        </ActionButton>
      </div>

      <ActionButton
        variant="ghost"
        icon={LogOut}
        full
        onClick={() => {
          logout()
          navigate('/login')
        }}
      >
        Cerrar sesión
      </ActionButton>
    </div>
  )
}
