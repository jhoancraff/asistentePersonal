import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LockKeyhole, NotebookText, Search, ShieldCheck, Trash2 } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import BottomSheet from '../components/BottomSheet'
import Empty from '../components/Empty'
import Fab from '../components/Fab'
import { api, listar } from '../lib/api'
import { useDebounced } from '../lib/hooks'

function mensajeError(err) {
  const d = err.response?.data
  if (d && typeof d === 'object') return Object.values(d).flat().join(' ')
  return 'No se pudo guardar. Intenta de nuevo.'
}

export default function Notas() {
  const [params, setParams] = useSearchParams()
  const [notas, setNotas] = useState([])
  const [q, setQ] = useState('')
  const busqueda = useDebounced(q.trim())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reveladas, setReveladas] = useState(() => new Set())
  const sheet = params.get('nueva') === '1'

  const cargar = useCallback(async () => {
    try {
      setNotas(await listar('/notas/', busqueda ? { q: busqueda } : undefined))
      setError('')
    } catch {
      setError('No se pudieron cargar tus notas.')
    } finally {
      setCargando(false)
    }
  }, [busqueda])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = () => setParams({ nueva: '1' })
  const cerrar = useCallback(() => setParams({}), [setParams])

  function revelar(id) {
    setReveladas((s) => new Set(s).add(id))
  }

  async function eliminar(id) {
    setNotas((ns) => ns.filter((n) => n.id !== id))
    try {
      await api.delete(`/notas/${id}/`)
    } catch {
      cargar()
    }
  }

  return (
    <div className="stack">
      <h1>Notas</h1>

      <label className="field terminal">
        <Search size={18} aria-hidden="true" />
        <span className="prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          placeholder="buscar en tus notas…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar notas"
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      {cargando ? (
        <div className="skeleton-list" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : notas.length === 0 ? (
        <Empty icon={NotebookText} title={busqueda ? 'Sin resultados' : 'Aún no tienes notas'}>
          {busqueda ? 'Prueba con otra palabra.' : 'Guarda ideas, datos y apuntes con el botón +.'}
        </Empty>
      ) : (
        <div className="masonry">
          {notas.map((n) => {
            const oculta = n.sensible && !reveladas.has(n.id)
            return (
              <article key={n.id} className="note glass">
                <header className="note-head">
                  <strong>{n.titulo}</strong>
                  {n.sensible && <ShieldCheck size={16} className="c-violet" aria-label="Nota sensible" />}
                </header>
                <div className={oculta ? 'note-body blurred' : 'note-body'} aria-hidden={oculta}>
                  {/* Oculta: el DOM no contiene el texto real, solo una máscara. */}
                  {oculta
                    ? (n.contenido || 'Sin contenido').replace(/\S/g, '•')
                    : n.contenido || <span className="muted">Sin contenido</span>}
                </div>
                {oculta && (
                  <button type="button" className="reveal" onClick={() => revelar(n.id)}>
                    <LockKeyhole size={20} aria-hidden="true" />
                    Tocar para revelar
                  </button>
                )}
                <footer className="note-foot">
                  <span className="muted">
                    {new Date(n.fecha_actualizacion).toLocaleDateString('es-CO', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <button type="button" className="icon-btn subtle" onClick={() => eliminar(n.id)} aria-label="Eliminar nota">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      <Fab label="Nueva nota" onClick={abrir} />
      {sheet && (
        <NotaSheet
          open
          onClose={cerrar}
          onGuardado={() => {
            cerrar()
            cargar()
          }}
        />
      )}
    </div>
  )
}

function NotaSheet({ open, onClose, onGuardado }) {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [sensible, setSensible] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await api.post('/notas/', { titulo, contenido, sensible })
      onGuardado()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nueva nota">
      <input className="input" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <textarea
        className="input"
        rows={6}
        placeholder="Escribe aquí…"
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <button
        type="button"
        className={sensible ? 'switch on' : 'switch'}
        role="switch"
        aria-checked={sensible}
        onClick={() => setSensible((s) => !s)}
      >
        <LockKeyhole size={18} aria-hidden="true" />
        <span>Nota sensible (información bancaria)</span>
        <span className="switch-knob" aria-hidden="true" />
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ActionButton full loading={guardando} disabled={!titulo.trim()} onClick={guardar}>
        Guardar nota
      </ActionButton>
    </BottomSheet>
  )
}
