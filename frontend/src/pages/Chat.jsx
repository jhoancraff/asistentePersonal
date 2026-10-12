import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Info,
  Mic,
  Pause,
  Play,
  SendHorizontal,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { api, backendOrigin, listar } from '../lib/api'
import { hora } from '../lib/format'

function urlAudio(path) {
  if (!path) return null
  return /^https?:/.test(path) ? path : `${backendOrigin()}${path}`
}

const BARRAS = 28
const MAX_SEGUNDOS = 60 // la grabación se detiene sola
const MIN_MS = 1000 // menos de esto se descarta (toque accidental)

/** Formato de audio que este navegador sabe grabar (webm en Android/Chrome, mp4 en iPhone). */
function formatoSoportado() {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidatos.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? ''
}

function Onda({ activa }) {
  return (
    <span className={activa ? 'wave playing' : 'wave'} aria-hidden="true">
      {Array.from({ length: BARRAS }, (_, i) => (
        <i key={i} style={{ '--i': i, '--h': `${30 + ((i * 37) % 70)}%` }} />
      ))}
    </span>
  )
}

function ReproductorAudio({ src }) {
  const ref = useRef(null)
  const [sonando, setSonando] = useState(false)
  function alternar() {
    const a = ref.current
    if (!a) return
    if (a.paused) a.play()
    else a.pause()
  }
  return (
    <div className="audio-player">
      <button type="button" className="play" onClick={alternar} aria-label={sonando ? 'Pausar' : 'Reproducir'}>
        {sonando ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <Onda activa={sonando} />
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
      />
    </div>
  )
}

const ETIQUETA_ESTADO = {
  confirmada: 'Hecho',
  cancelada: 'Cancelada',
  fallida: 'No se pudo',
  expirada: 'Expiró',
}

/** Tarjeta de una acción propuesta por Luz: se ejecuta solo si el usuario confirma. */
/** Texto del asistente: respeta **negritas** sin interpretar HTML (React escapa todo). */
function Texto({ children }) {
  const partes = String(children).split(/(\*\*[^*]+\*\*)/g)
  return partes.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      p
    ),
  )
}

function Accion({ accion, ocupada, onConfirmar, onCancelar }) {
  const pendiente = accion.estado === 'pendiente'
  const exito = accion.estado === 'confirmada'
  const Icono = exito ? BadgeCheck : pendiente ? Info : AlertTriangle
  return (
    <div className={`action-card estado-${accion.estado}`}>
      <Icono size={20} className={exito ? 'c-success' : pendiente ? 'c-violet' : 'c-danger'} aria-hidden="true" />
      <div className="action-body">
        <strong>{pendiente ? 'Confirma esta acción' : ETIQUETA_ESTADO[accion.estado] ?? accion.estado}</strong>
        <span className="muted">{accion.resumen}</span>
        {accion.estado === 'fallida' && accion.resultado && (
          <span className="c-danger">{accion.resultado}</span>
        )}
        {pendiente && (
          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ocupada}
              onClick={() => onConfirmar(accion.id)}
            >
              <Check size={16} aria-hidden="true" />
              Confirmar
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupada}
              onClick={() => onCancelar(accion.id)}
            >
              <X size={16} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Chat() {
  const [conversacion, setConversacion] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ia, setIa] = useState(null)
  const [accionOcupada, setAccionOcupada] = useState(null)
  const recorder = useRef(null)
  const trozos = useRef([])
  const descartar = useRef(false)
  const inicio = useRef(0)
  const stream = useRef(null)
  const fin = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const existentes = await listar('/chat/conversaciones/')
      const conv =
        existentes[0] ?? (await api.post('/chat/conversaciones/', { titulo: 'Luz' })).data
      setConversacion(conv)
      const { data } = await api.get(`/chat/conversaciones/${conv.id}/mensajes/`)
      setMensajes(data)
      api
        .get('/chat/estado/')
        .then((r) => setIa(r.data))
        .catch(() => setIa(null))
      setError('')
    } catch {
      setError('No se pudo abrir el chat.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes])

  useEffect(() => {
    if (!grabando) return undefined
    const id = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [grabando])

  // Límite de duración: se detiene y se envía solo.
  useEffect(() => {
    if (grabando && segundos >= MAX_SEGUNDOS) detenerGrabacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabando, segundos])

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  async function enviar(formData, textoOptimista = '') {
    setEnviando(true)
    setError('')
    const temporal = `tmp-${Date.now()}`
    if (textoOptimista) {
      // El mensaje del usuario aparece al instante; luego se reemplaza por el guardado.
      setMensajes((m) => [
        ...m,
        { id: temporal, rol: 'usuario', texto: textoOptimista, fecha_creacion: new Date().toISOString(), acciones: [] },
      ])
    }
    try {
      const { data } = await api.post(`/chat/conversaciones/${conversacion.id}/mensajes/`, formData)
      setMensajes((m) => [...m.filter((x) => x.id !== temporal), ...data.mensajes])
    } catch {
      setMensajes((m) => m.filter((x) => x.id !== temporal))
      setError('No se pudo enviar el mensaje.')
    } finally {
      setEnviando(false)
    }
  }

  function actualizarAccion(accion) {
    setMensajes((ms) =>
      ms.map((m) => ({
        ...m,
        acciones: (m.acciones ?? []).map((a) => (a.id === accion.id ? { ...a, ...accion } : a)),
      })),
    )
  }

  async function resolverAccion(id, verbo) {
    setAccionOcupada(id)
    setError('')
    try {
      const { data } = await api.post(`/chat/acciones/${id}/${verbo}/`)
      actualizarAccion(data.accion)
      setMensajes((m) => [...m, data.mensaje])
    } catch (err) {
      const d = err.response?.data
      if (d?.accion) actualizarAccion(d.accion)
      setError(d?.detail ?? 'No se pudo completar la acción.')
    } finally {
      setAccionOcupada(null)
    }
  }

  async function enviarTexto(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || !conversacion) return
    setTexto('')
    const fd = new FormData()
    fd.append('texto', t)
    await enviar(fd, t)
  }

  async function iniciarGrabacion() {
    setError('')
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setError('El micrófono requiere HTTPS (o localhost). Abre la app con una conexión segura.')
      return
    }
    if (typeof window.MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio. Escríbeme el mensaje.')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      const tipo = formatoSoportado()
      const rec = new MediaRecorder(stream.current, tipo ? { mimeType: tipo } : undefined)
      trozos.current = []
      descartar.current = false
      rec.ondataavailable = (e) => e.data.size && trozos.current.push(e.data)
      rec.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop())
        if (descartar.current || !conversacion) return
        if (Date.now() - inicio.current < MIN_MS) {
          setError('La grabación fue muy corta. Mantén el micrófono un poco más.')
          return
        }
        const blob = new Blob(trozos.current, { type: rec.mimeType || tipo || 'audio/webm' })
        if (!blob.size) return
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
        const fd = new FormData()
        fd.append('audio', blob, `voz-${Date.now()}.${ext}`)
        await enviar(fd, '🎤 Audio enviado · transcribiendo…')
      }
      rec.start()
      inicio.current = Date.now()
      recorder.current = rec
      setSegundos(0)
      setGrabando(true)
    } catch (err) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado. Habilítalo en los ajustes del navegador.'
          : err?.name === 'NotFoundError'
            ? 'No se encontró ningún micrófono.'
            : 'No se pudo acceder al micrófono.',
      )
    }
  }

  function detenerGrabacion() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    setGrabando(false)
  }

  function cancelarGrabacion() {
    descartar.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
    setGrabando(false)
  }

  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="avatar" aria-hidden="true">
          <Sparkles size={22} />
        </span>
        <div>
          <strong>Luz</strong>
          <span className="muted">Tu asistente personal</span>
        </div>
      </div>

      <div className="chat-scroll">
        {ia && !ia.configurada && (
          <div className="chat-notice">
            <Info size={16} aria-hidden="true" />
            La IA aún no tiene llave configurada: define GROQ_API_KEY (o GEMINI_API_KEY) en
            backend/.env y reinicia el servidor.
          </div>
        )}
        {ia?.configurada && ia.voz === false && (
          <div className="chat-notice">
            <Info size={16} aria-hidden="true" />
            Para hablarme necesitas GROQ_API_KEY en backend/.env (la voz usa Whisper de Groq).
          </div>
        )}
        {ia?.configurada && mensajes.length === 0 && !cargando && (
          <div className="chat-notice">
            <Info size={16} aria-hidden="true" />
            Pregúntame por tus saldos o movimientos, o pídeme registrar un gasto o crear un evento.
            Puedes escribirme o tocar el micrófono y hablarme. Antes de crear, editar o eliminar
            algo, siempre te pediré confirmación.
          </div>
        )}

        {cargando && <div className="skeleton" aria-hidden="true" />}

        {mensajes.map((m) => {
          const mio = m.rol === 'usuario'
          const audio = urlAudio(m.audio)
          return (
            <div key={m.id} className={mio ? 'bubble-row mine' : 'bubble-row'}>
              {!mio && (
                <span className="avatar sm" aria-hidden="true">
                  <Sparkles size={14} />
                </span>
              )}
              <div className={mio ? 'bubble me' : 'bubble luz'}>
                {audio && <ReproductorAudio src={audio} />}
                {m.transcripcion && !m.texto && <span className="voz-etiqueta">Lo que entendí</span>}
                {(m.texto || m.transcripcion) && (
                  <p>
                    <Texto>{m.texto || m.transcripcion}</Texto>
                  </p>
                )}
                {Array.isArray(m.acciones) &&
                  m.acciones.map((a) => (
                    <Accion
                      key={a.id}
                      accion={a}
                      ocupada={accionOcupada === a.id}
                      onConfirmar={(id) => resolverAccion(id, 'confirmar')}
                      onCancelar={(id) => resolverAccion(id, 'cancelar')}
                    />
                  ))}
                <time className="bubble-time">{hora(m.fecha_creacion)}</time>
              </div>
            </div>
          )
        })}
        {enviando && (
          <div className="bubble-row" role="status" aria-label="Luz está pensando">
            <span className="avatar sm" aria-hidden="true">
              <Sparkles size={14} />
            </span>
            <div className="bubble luz typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={fin} />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="composer glass" onSubmit={enviarTexto}>
        {grabando ? (
          <div className="recording" role="status">
            <button
              type="button"
              className="icon-btn"
              onClick={cancelarGrabacion}
              aria-label="Cancelar grabación"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <span className="rec-dot" aria-hidden="true" />
            <Onda activa />
            <span className="rec-time">{mmss}</span>
          </div>
        ) : (
          <input
            className="composer-input"
            placeholder="Escríbele a Luz…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!conversacion || enviando}
            aria-label="Mensaje"
          />
        )}
        {texto.trim() && !grabando ? (
          <button type="submit" className="round-btn send" disabled={enviando} aria-label="Enviar">
            <SendHorizontal size={20} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={grabando ? 'round-btn mic recording-btn' : 'round-btn mic'}
            onClick={grabando ? detenerGrabacion : iniciarGrabacion}
            disabled={!conversacion || enviando}
            aria-label={grabando ? 'Detener y enviar audio' : 'Grabar audio'}
          >
            {grabando ? <Square size={18} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          </button>
        )}
      </form>
    </div>
  )
}
