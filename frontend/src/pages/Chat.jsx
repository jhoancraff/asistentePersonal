import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Info, Mic, Pause, Play, SendHorizontal, Sparkles, Square } from 'lucide-react'
import { api, backendOrigin, listar } from '../lib/api'
import { hora } from '../lib/format'

function urlAudio(path) {
  if (!path) return null
  return /^https?:/.test(path) ? path : `${backendOrigin()}${path}`
}

const BARRAS = 28

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

function Accion({ accion }) {
  const titulo = typeof accion === 'string' ? accion : accion.titulo || accion.nombre || 'Acción ejecutada'
  const detalle = typeof accion === 'object' ? accion.detalle : null
  return (
    <div className="action-card">
      <BadgeCheck size={20} className="c-success" aria-hidden="true" />
      <div>
        <strong>{titulo}</strong>
        {detalle && <span className="muted">{detalle}</span>}
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
  const recorder = useRef(null)
  const trozos = useRef([])
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

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  async function enviar(formData) {
    setEnviando(true)
    setError('')
    try {
      const { data } = await api.post(`/chat/conversaciones/${conversacion.id}/mensajes/`, formData)
      setMensajes((m) => [...m, data])
    } catch {
      setError('No se pudo enviar el mensaje.')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarTexto(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || !conversacion) return
    setTexto('')
    const fd = new FormData()
    fd.append('texto', t)
    await enviar(fd)
  }

  async function iniciarGrabacion() {
    setError('')
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setError('El micrófono requiere HTTPS (o localhost). Abre la app con una conexión segura.')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream.current)
      trozos.current = []
      rec.ondataavailable = (e) => e.data.size && trozos.current.push(e.data)
      rec.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop())
        const blob = new Blob(trozos.current, { type: rec.mimeType || 'audio/webm' })
        if (!blob.size || !conversacion) return
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const fd = new FormData()
        fd.append('audio', blob, `voz-${Date.now()}.${ext}`)
        await enviar(fd)
      }
      rec.start()
      recorder.current = rec
      setSegundos(0)
      setGrabando(true)
    } catch {
      setError('No se pudo acceder al micrófono. Revisa el permiso del navegador.')
    }
  }

  function detenerGrabacion() {
    recorder.current?.stop()
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
        <div className="chat-notice">
          <Info size={16} aria-hidden="true" />
          La IA de Luz aún no está conectada: tus mensajes y audios se guardan, pero todavía no recibirás respuesta.
        </div>

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
                {(m.texto || m.transcripcion) && <p>{m.texto || m.transcripcion}</p>}
                {Array.isArray(m.acciones) &&
                  m.acciones.map((a, i) => <Accion key={i} accion={a} />)}
                <time className="bubble-time">{hora(m.fecha_creacion)}</time>
              </div>
            </div>
          )
        })}
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
