import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarX2, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import Badge from '../components/Badge'
import BottomSheet from '../components/BottomSheet'
import Empty from '../components/Empty'
import Fab from '../components/Fab'
import { api, listar } from '../lib/api'
import { hora, inicioSemana, mismoDia, toInputLocal } from '../lib/format'

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const RECORDATORIOS = [0, 5, 15, 30, 60]

function mensajeError(err) {
  const d = err.response?.data
  if (d && typeof d === 'object') return Object.values(d).flat().join(' ')
  return 'No se pudo guardar. Intenta de nuevo.'
}

export default function Agenda() {
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [semana, setSemana] = useState(() => inicioSemana(new Date()))
  const [dia, setDia] = useState(() => new Date())
  const [sheet, setSheet] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setEventos(await listar('/agenda/eventos/'))
      setError('')
    } catch {
      setError('No se pudo cargar tu agenda.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const dias = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semana)
        d.setDate(semana.getDate() + i)
        return d
      }),
    [semana],
  )
  const delDia = eventos.filter((e) => mismoDia(new Date(e.inicio), dia))
  const hoy = new Date()

  function moverSemana(delta) {
    const s = new Date(semana)
    s.setDate(s.getDate() + delta * 7)
    setSemana(s)
    setDia(s)
  }

  async function alternar(ev) {
    setEventos((es) => es.map((e) => (e.id === ev.id ? { ...e, completado: !e.completado } : e)))
    try {
      await api.patch(`/agenda/eventos/${ev.id}/`, { completado: !ev.completado })
    } catch {
      cargar()
    }
  }

  async function eliminar(id) {
    setEventos((es) => es.filter((e) => e.id !== id))
    try {
      await api.delete(`/agenda/eventos/${id}/`)
    } catch {
      cargar()
    }
  }

  const mes = dia.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  return (
    <div className="stack">
      <div className="section-head">
        <h1>Agenda</h1>
        <div className="week-nav">
          <button type="button" className="icon-btn" onClick={() => moverSemana(-1)} aria-label="Semana anterior">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => moverSemana(1)} aria-label="Semana siguiente">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="muted capitalize">{mes}</p>

      {error && <p className="form-error">{error}</p>}

      <div className="week-strip" role="tablist" aria-label="Días de la semana">
        {dias.map((d, i) => {
          const activo = mismoDia(d, dia)
          const tiene = eventos.some((e) => mismoDia(new Date(e.inicio), d))
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="tab"
              aria-selected={activo}
              className={['day', activo && 'active', mismoDia(d, hoy) && 'today'].filter(Boolean).join(' ')}
              onClick={() => setDia(d)}
            >
              <span className="day-name">{DIAS[i]}</span>
              <span className="day-num">{d.getDate()}</span>
              <span className={tiene ? 'day-dot on' : 'day-dot'} aria-hidden="true" />
            </button>
          )
        })}
      </div>

      {cargando ? (
        <div className="skeleton-list" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : delDia.length === 0 ? (
        <Empty icon={CalendarX2} title="Día libre">
          No tienes eventos este día. Agenda uno con el botón +.
        </Empty>
      ) : (
        <ol className="timeline">
          {delDia.map((e) => (
            <li key={e.id} className={e.completado ? 'tl-item done' : 'tl-item'}>
              <span className="tl-node" aria-hidden="true" />
              <div className="tl-card glass">
                <button
                  type="button"
                  className={e.completado ? 'check on' : 'check'}
                  onClick={() => alternar(e)}
                  aria-label={e.completado ? 'Marcar como pendiente' : 'Marcar como completado'}
                  aria-pressed={e.completado}
                >
                  <Check size={16} strokeWidth={3} aria-hidden="true" />
                </button>
                <div className="row-main">
                  <strong className="tl-title">{e.titulo}</strong>
                  <span className="muted">
                    {hora(e.inicio)}
                    {e.fin && ` – ${hora(e.fin)}`}
                  </span>
                  {e.recordar_minutos_antes > 0 && (
                    <Badge tone="violet" icon={BellRing}>
                      {e.recordar_minutos_antes} min antes
                    </Badge>
                  )}
                </div>
                <button type="button" className="icon-btn subtle" onClick={() => eliminar(e.id)} aria-label="Eliminar evento">
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Fab label="Agendar evento" onClick={() => setSheet(true)} />
      {sheet && (
        <EventoSheet
          open
          dia={dia}
          onClose={() => setSheet(false)}
          onGuardado={() => {
            setSheet(false)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function EventoSheet({ open, dia, onClose, onGuardado }) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [inicio, setInicio] = useState(() => {
    const d = new Date(dia)
    d.setHours(new Date().getHours() + 1, 0, 0, 0)
    return toInputLocal(d)
  })
  const [fin, setFin] = useState('')
  const [recordar, setRecordar] = useState(15)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await api.post('/agenda/eventos/', {
        titulo,
        descripcion,
        inicio: new Date(inicio).toISOString(),
        fin: fin ? new Date(fin).toISOString() : null,
        recordar_minutos_antes: recordar,
      })
      onGuardado()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nuevo evento">
      <input className="input" placeholder="¿Qué vas a hacer?" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <textarea
        className="input"
        rows={2}
        placeholder="Detalles (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <label className="field-label">
        Inicio
        <input className="input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label className="field-label">
        Fin (opcional)
        <input className="input" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <span className="field-label">Recordatorio</span>
      <div className="chips">
        {RECORDATORIOS.map((m) => (
          <button key={m} type="button" className={m === recordar ? 'chip active' : 'chip'} onClick={() => setRecordar(m)}>
            {m === 0 ? 'A la hora' : `${m} min antes`}
          </button>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ActionButton full loading={guardando} disabled={!titulo.trim() || !inicio} onClick={guardar}>
        Agendar
      </ActionButton>
    </BottomSheet>
  )
}
