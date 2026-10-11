import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, EyeOff, KeyRound, Lock, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import ActionButton from './ActionButton'
import BottomSheet from './BottomSheet'
import Empty from './Empty'

const OCULTAR_TRAS_MS = 30_000
const BASE = '/finanzas/notas-seguras/'

function mensaje(err, porDefecto) {
  if (err.response?.status === 503) {
    return 'El cifrado no está configurado en el servidor (falta FIELD_ENCRYPTION_KEYS).'
  }
  const d = err.response?.data
  if (d && typeof d === 'object') {
    const texto = Object.values(d).flat().join(' ')
    if (texto) return texto
  }
  return porDefecto
}

/**
 * Notas cifradas ancladas a una cuenta (claves, preguntas de seguridad…).
 * El servidor las guarda cifradas; aquí el contenido solo se pide al pulsar "Mostrar",
 * se oculta solo a los 30 s o al salir de la pestaña y nunca se guarda en el navegador.
 */
export default function NotasSeguras({ cuentaId }) {
  const [notas, setNotas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [visibles, setVisibles] = useState({}) // id -> contenido en claro
  const [cargandoId, setCargandoId] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [sheet, setSheet] = useState(null) // { nota?, contenido? } | null
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const temporizadores = useRef({})

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(BASE, { params: { cuenta: cuentaId } })
      setNotas(data)
      setError('')
    } catch (err) {
      setError(mensaje(err, 'No se pudieron cargar las notas seguras.'))
    } finally {
      setCargando(false)
    }
  }, [cuentaId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const ocultar = useCallback((id) => {
    clearTimeout(temporizadores.current[id])
    delete temporizadores.current[id]
    setVisibles((v) => {
      const { [id]: _quitada, ...resto } = v
      return resto
    })
  }, [])

  const ocultarTodas = useCallback(() => {
    Object.values(temporizadores.current).forEach(clearTimeout)
    temporizadores.current = {}
    setVisibles({})
  }, [])

  // El contenido se oculta al pasar a otra pestaña/app y al salir de la pantalla.
  useEffect(() => {
    const alCambiar = () => document.hidden && ocultarTodas()
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      document.removeEventListener('visibilitychange', alCambiar)
      Object.values(temporizadores.current).forEach(clearTimeout)
    }
  }, [ocultarTodas])

  async function leer(id) {
    const { data } = await api.get(`${BASE}${id}/`)
    return data
  }

  async function mostrar(id) {
    setCargandoId(id)
    setError('')
    try {
      const nota = await leer(id)
      setVisibles((v) => ({ ...v, [id]: nota.contenido }))
      clearTimeout(temporizadores.current[id])
      temporizadores.current[id] = setTimeout(() => ocultar(id), OCULTAR_TRAS_MS)
    } catch (err) {
      setError(mensaje(err, 'No se pudo mostrar la nota.'))
    } finally {
      setCargandoId(null)
    }
  }

  async function copiar(id) {
    try {
      await navigator.clipboard.writeText(visibles[id])
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000)
    } catch {
      setError('No se pudo copiar (el portapapeles requiere HTTPS). Selecciona y copia a mano.')
    }
  }

  async function editar(n) {
    setError('')
    try {
      const nota = await leer(n.id)
      setSheet({ nota: n, titulo: nota.titulo, contenido: nota.contenido })
    } catch (err) {
      setError(mensaje(err, 'No se pudo abrir la nota.'))
    }
  }

  async function eliminar() {
    setEliminando(true)
    try {
      await api.delete(`${BASE}${aEliminar.id}/`)
      ocultar(aEliminar.id)
      setAEliminar(null)
      await cargar()
    } catch (err) {
      setError(mensaje(err, 'No se pudo eliminar la nota.'))
      setAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <section className="notas-seguras" aria-label="Notas seguras">
      <div className="section-head">
        <h2 className="grupo-titulo">
          <Lock size={18} aria-hidden="true" />
          Notas seguras
          <span className="grupo-count">{notas.length}</span>
        </h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSheet({})}
          aria-label="Nueva nota segura"
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      <p className="muted">
        Se guardan <strong>cifradas</strong> en la base de datos. Solo tú las ves aquí, dentro de la
        cuenta, y se ocultan solas a los 30 segundos.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <div className="skeleton" aria-hidden="true" />
      ) : notas.length === 0 && !error ? (
        <Empty icon={KeyRound} title="Sin notas seguras">
          Guarda aquí las claves o preguntas de seguridad de esta cuenta.
        </Empty>
      ) : (
        <ul className="notas-lista">
          {notas.map((n) => {
            const contenido = visibles[n.id]
            const abierta = contenido !== undefined
            return (
              <li key={n.id} className="nota-segura glass">
                <div className="nota-segura-cab">
                  <span className="row-icon tone-violet">
                    <KeyRound size={18} aria-hidden="true" />
                  </span>
                  <strong className="nota-segura-titulo">{n.titulo}</strong>
                </div>

                {abierta ? (
                  <pre className="nota-segura-texto">{contenido}</pre>
                ) : (
                  <p className="nota-segura-oculta" aria-label="Contenido oculto">
                    ••••••••••••••••
                  </p>
                )}

                <div className="nota-segura-acciones">
                  {abierta ? (
                    <>
                      <ActionButton variant="ghost" icon={EyeOff} className="btn-sm" onClick={() => ocultar(n.id)}>
                        Ocultar
                      </ActionButton>
                      <ActionButton variant="ghost" icon={Copy} className="btn-sm" onClick={() => copiar(n.id)}>
                        {copiado === n.id ? 'Copiado' : 'Copiar'}
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton
                      variant="ghost"
                      icon={ShieldAlert}
                      className="btn-sm"
                      loading={cargandoId === n.id}
                      onClick={() => mostrar(n.id)}
                    >
                      Mostrar
                    </ActionButton>
                  )}
                  <button type="button" className="icon-btn subtle" onClick={() => editar(n)} aria-label={`Editar ${n.titulo}`}>
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn subtle"
                    onClick={() => setAEliminar(n)}
                    aria-label={`Eliminar ${n.titulo}`}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {sheet && (
        <NotaSheet
          cuentaId={cuentaId}
          inicial={sheet}
          onClose={() => setSheet(null)}
          onGuardada={(id) => {
            if (id) ocultar(id)
            setSheet(null)
            cargar()
          }}
        />
      )}

      <BottomSheet open={Boolean(aEliminar)} onClose={() => setAEliminar(null)} title="Eliminar nota segura">
        <p>
          Vas a eliminar <strong>{aEliminar?.titulo}</strong>. Esta acción no se puede deshacer.
        </p>
        <ActionButton variant="danger" full icon={Trash2} loading={eliminando} onClick={eliminar}>
          Eliminar definitivamente
        </ActionButton>
        <ActionButton variant="ghost" full onClick={() => setAEliminar(null)}>
          Cancelar
        </ActionButton>
      </BottomSheet>
    </section>
  )
}

function NotaSheet({ cuentaId, inicial, onClose, onGuardada }) {
  const editando = Boolean(inicial.nota)
  const [titulo, setTitulo] = useState(inicial.titulo ?? '')
  const [contenido, setContenido] = useState(inicial.contenido ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      if (editando) {
        await api.patch(`${BASE}${inicial.nota.id}/`, { titulo, contenido })
        onGuardada(inicial.nota.id)
      } else {
        await api.post(BASE, { cuenta: cuentaId, titulo, contenido })
        onGuardada(null)
      }
    } catch (err) {
      setError(mensaje(err, 'No se pudo guardar la nota.'))
      setGuardando(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={editando ? 'Editar nota segura' : 'Nueva nota segura'}>
      <input
        className="input"
        placeholder="Título (ej. Preguntas de seguridad)"
        maxLength={120}
        autoComplete="off"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <textarea
        className="input"
        rows={7}
        maxLength={5000}
        autoComplete="off"
        placeholder="Claves, respuestas, pistas…"
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <p className="privacy-note note-info">
        <ShieldAlert size={16} aria-hidden="true" />
        Se cifra antes de guardarse. Evita escribir el PIN o el CVV de tus tarjetas: no hace falta
        para operar y es lo primero que buscaría un atacante.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ActionButton
        full
        loading={guardando}
        disabled={!titulo.trim() || !contenido.trim()}
        onClick={guardar}
      >
        {editando ? 'Guardar cambios' : 'Guardar nota cifrada'}
      </ActionButton>
    </BottomSheet>
  )
}
