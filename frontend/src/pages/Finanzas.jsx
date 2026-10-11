import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Car,
  CreditCard,
  Delete,
  Eye,
  EyeOff,
  Gamepad2,
  HeartPulse,
  House,
  Bitcoin,
  Landmark,
  Link2,
  Pencil,
  Plus,
  Receipt,
  Smartphone,
  ShoppingBasket,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react'
import ActionButton from '../components/ActionButton'
import BottomSheet from '../components/BottomSheet'
import Empty from '../components/Empty'
import Fab from '../components/Fab'
import GlassCard from '../components/GlassCard'
import { api, listar } from '../lib/api'
import { bancoPorNombre, enmascararIdentificador } from '../lib/bancos'
import { decimalesMoneda, fechaRelativa, formatMoney, toISODate } from '../lib/format'

const TIPO_CUENTA = {
  ahorros: { label: 'Cuenta de ahorros', icon: Landmark },
  corriente: { label: 'Cuenta corriente', icon: Landmark },
  debito: { label: 'Tarjeta de débito', icon: CreditCard },
  credito: { label: 'Tarjeta de crédito', icon: CreditCard },
  divisas: { label: 'Cuenta en divisas', icon: Wallet },
  efectivo: { label: 'Efectivo', icon: Banknote },
  tarjeta: { label: 'Tarjeta', icon: CreditCard },
  billetera: { label: 'Billetera digital', icon: Smartphone },
  cripto: { label: 'Cripto', icon: Bitcoin },
  otra: { label: 'Otra', icon: Wallet },
}

function iconoCategoria(nombre = '') {
  const n = nombre.toLowerCase()
  if (/(comida|mercado|super|restaur|almuerzo|caf[eé])/.test(n)) return ShoppingBasket
  if (/(transporte|gasolina|taxi|uber|bus|carro|moto)/.test(n)) return Car
  if (/(salud|m[eé]dic|farmac|doctor)/.test(n)) return HeartPulse
  if (/(hogar|casa|arriendo|servicio|renta)/.test(n)) return House
  if (/(ocio|entreten|juego|cine|salida)/.test(n)) return Gamepad2
  return Tag
}

function mensajeError(err) {
  const d = err.response?.data
  if (d && typeof d === 'object') return Object.values(d).flat().join(' ')
  return 'No se pudo guardar. Intenta de nuevo.'
}

export default function Finanzas() {
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [idx, setIdx] = useState(0)
  const [oculto, setOculto] = useState(false)
  const [sheetMov, setSheetMov] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const navigate = useNavigate()
  const nuevaCuenta = () => navigate('/finanzas/nueva')
  const carrusel = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const [c, m, k] = await Promise.all([
        listar('/finanzas/cuentas/'),
        listar('/finanzas/movimientos/'),
        listar('/finanzas/categorias/'),
      ])
      setCuentas(c)
      setMovimientos(m)
      setCategorias(k)
      setError('')
    } catch {
      setError('No se pudieron cargar tus finanzas.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuenta = cuentas[Math.min(idx, Math.max(cuentas.length - 1, 0))]
  // Una cuenta madre incluye los movimientos de sus tarjetas vinculadas.
  const idsCuenta = useMemo(
    () =>
      new Set(
        cuenta ? [cuenta.id, ...cuentas.filter((c) => c.cuenta_madre === cuenta.id).map((c) => c.id)] : [],
      ),
    [cuenta, cuentas],
  )
  const delMes = useMemo(() => {
    const hoy = new Date()
    return movimientos.filter((m) => {
      if (cuenta && !idsCuenta.has(m.cuenta)) return false
      const [y, mo] = m.fecha.split('-').map(Number)
      return y === hoy.getFullYear() && mo === hoy.getMonth() + 1
    })
  }, [movimientos, cuenta, idsCuenta])
  const ingresos = delMes.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const gastos = delMes.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)
  const feed = cuenta ? movimientos.filter((m) => idsCuenta.has(m.cuenta)) : movimientos
  const cuentaPorId = useMemo(() => Object.fromEntries(cuentas.map((c) => [c.id, c])), [cuentas])
  const catPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias])
  const monedaDe = useMemo(() => Object.fromEntries(cuentas.map((c) => [c.id, c.moneda])), [cuentas])
  const moneda = cuenta?.moneda ?? 'VES'

  function onScroll(e) {
    const el = e.currentTarget
    const card = el.firstElementChild
    if (!card) return
    const paso = card.offsetWidth + 12
    setIdx(Math.round(el.scrollLeft / paso))
  }

  async function eliminar(id) {
    setMovimientos((ms) => ms.filter((m) => m.id !== id))
    try {
      await api.delete(`/finanzas/movimientos/${id}/`)
      cargar()
    } catch {
      cargar()
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    try {
      await api.delete(`/finanzas/cuentas/${aEliminar.id}/`)
      setAEliminar(null)
      setIdx(0)
      await cargar()
    } catch {
      setError('No se pudo eliminar la cuenta.')
      setAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  const total = ingresos + gastos
  const pctIngresos = total ? (ingresos / total) * 100 : 0

  return (
    <div className="stack">
      <div className="section-head">
        <h1>Finanzas</h1>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOculto((o) => !o)}
          aria-label={oculto ? 'Mostrar saldos' : 'Ocultar saldos'}
          aria-pressed={oculto}
        >
          {oculto ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {cargando ? (
        <div className="skeleton carousel-skeleton" aria-hidden="true" />
      ) : (
      <div className="carousel" ref={carrusel} onScroll={onScroll}>
        {cuentas.map((c) => {
          const Icono = (TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.otra).icon
          return (
            <div
              key={c.id}
              className="bank-card"
              data-bank={c.tema || bancoPorNombre(c.banco)?.tema || 'generico'}
            >
              <div className="bank-card-top">
                <Icono size={22} aria-hidden="true" />
                <span>{c.banco || (TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.otra).label}</span>
              </div>
              <div className="bank-card-tools">
                <button
                  type="button"
                  className="card-tool"
                  onClick={() => navigate(`/finanzas/${c.id}/editar`)}
                  aria-label={`Editar ${c.nombre}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="card-tool"
                  onClick={() => setAEliminar(c)}
                  aria-label={`Eliminar ${c.nombre}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="bank-card-balance">
                {oculto ? '••••••' : formatMoney(c.saldo, c.moneda)}
              </div>
              {c.cuenta_madre && cuentaPorId[c.cuenta_madre] && (
                <span className="card-link">
                  <Link2 size={13} aria-hidden="true" />
                  Saldo de {cuentaPorId[c.cuenta_madre].banco || cuentaPorId[c.cuenta_madre].nombre}
                </span>
              )}
              <div className="bank-card-bottom">
                <span>
                  {c.ultimos_digitos
                    ? `${(TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.otra).label} ••${c.ultimos_digitos}`
                    : c.identificador
                      ? `${(TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.otra).label} · ${enmascararIdentificador(c.identificador)}`
                      : c.nombre}
                </span>
                <span className="muted-on-card">
                  {c.activa ? c.moneda : `${c.moneda} · Inactiva`}
                </span>
              </div>
            </div>
          )
        })}
        <button type="button" className="bank-card bank-card-add" onClick={nuevaCuenta}>
          <Plus size={28} aria-hidden="true" />
          <span>Nueva cuenta</span>
        </button>
      </div>
      )}

      {cuentas.length > 1 && (
        <div className="dots" aria-hidden="true">
          {cuentas.map((c, i) => (
            <span key={c.id} className={i === idx ? 'dot active' : 'dot'} />
          ))}
        </div>
      )}

      <GlassCard className="balance-chart">
        <svg viewBox="0 0 120 120" className="ring" role="img" aria-label="Proporción de ingresos y gastos del mes">
          <circle cx="60" cy="60" r="48" className="ring-bg" />
          {total > 0 && (
            <>
              <circle cx="60" cy="60" r="48" className="ring-gasto" />
              {pctIngresos > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  className="ring-ingreso"
                  strokeDasharray={`${(pctIngresos / 100) * 301.6} 301.6`}
                />
              )}
            </>
          )}
          <text x="60" y="58" textAnchor="middle" className="ring-pct">
            {total ? `${Math.round(pctIngresos)}%` : '—'}
          </text>
          <text x="60" y="74" textAnchor="middle" className="ring-sub">
            ingresos
          </text>
        </svg>
        <div className="balance-legend">
          <span className="eyebrow">Este mes</span>
          <div className="legend-row">
            <ArrowDownLeft size={16} className="c-success" aria-hidden="true" />
            <span>Ingresos</span>
            <strong className="c-success">{formatMoney(ingresos, moneda)}</strong>
          </div>
          <div className="legend-row">
            <ArrowUpRight size={16} className="c-danger" aria-hidden="true" />
            <span>Gastos</span>
            <strong className="c-danger">{formatMoney(gastos, moneda)}</strong>
          </div>
        </div>
      </GlassCard>

      <div className="section-head">
        <h2>Movimientos</h2>
      </div>

      {cargando ? (
        <div className="skeleton-list" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : feed.length === 0 ? (
        <Empty icon={Receipt} title="Aún no hay movimientos">
          {cuentas.length
            ? 'Registra tu primer ingreso o gasto con el botón +.'
            : 'Crea una cuenta para empezar a registrar movimientos.'}
        </Empty>
      ) : (
        <ul className="list">
          {feed.map((m) => {
            const ingreso = m.tipo === 'ingreso'
            const Icono = ingreso ? ArrowDownLeft : iconoCategoria(catPorId[m.categoria]?.nombre)
            return (
              <li key={m.id} className="row glass">
                <span className={`row-icon ${ingreso ? 'tone-success' : 'tone-danger'}`}>
                  <Icono size={20} aria-hidden="true" />
                </span>
                <div className="row-main">
                  <strong>{m.descripcion || catPorId[m.categoria]?.nombre || 'Movimiento'}</strong>
                  <span className="muted">
                    {fechaRelativa(m.fecha)}
                    {catPorId[m.categoria] && ` · ${catPorId[m.categoria].nombre}`}
                    {cuenta && m.cuenta !== cuenta.id && cuentaPorId[m.cuenta]
                      ? ` · ${cuentaPorId[m.cuenta].nombre}`
                      : ''}
                  </span>
                </div>
                <strong className={ingreso ? 'c-success' : 'c-danger'}>
                  {ingreso ? '+' : '−'} {oculto ? '••••' : formatMoney(m.monto, monedaDe[m.cuenta])}
                </strong>
                <button
                  type="button"
                  className="icon-btn subtle"
                  onClick={() => eliminar(m.id)}
                  aria-label="Eliminar movimiento"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab label="Registrar movimiento" onClick={() => (cuentas.length ? setSheetMov(true) : nuevaCuenta())} />

      <BottomSheet
        open={Boolean(aEliminar)}
        onClose={() => setAEliminar(null)}
        title="Eliminar cuenta"
      >
        <p>
          Vas a eliminar <strong>{aEliminar?.nombre}</strong>
          {aEliminar && movimientos.some((m) => m.cuenta === aEliminar.id)
            ? ` y sus ${movimientos.filter((m) => m.cuenta === aEliminar.id).length} movimientos`
            : ''}
          . Esta acción no se puede deshacer.
        </p>
        {aEliminar && cuentas.some((c) => c.cuenta_madre === aEliminar.id) && (
          <p className="muted">
            Sus tarjetas vinculadas se conservan, pero quedarán sin cuenta madre.
          </p>
        )}
        <p className="muted">
          Si solo quieres dejar de contarla en tu balance, edítala y desactívala en lugar de
          eliminarla.
        </p>
        <ActionButton variant="danger" full icon={Trash2} loading={eliminando} onClick={confirmarEliminar}>
          Eliminar definitivamente
        </ActionButton>
        <ActionButton variant="ghost" full onClick={() => setAEliminar(null)}>
          Cancelar
        </ActionButton>
      </BottomSheet>

      {sheetMov && (
        <MovimientoSheet
          open
          onClose={() => setSheetMov(false)}
          cuentas={cuentas}
          categorias={categorias}
          cuentaInicial={cuenta?.id}
          onGuardado={() => {
            setSheetMov(false)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function MovimientoSheet({ open, onClose, cuentas, categorias, cuentaInicial, onGuardado }) {
  // Se monta solo mientras está abierto, así cada apertura parte de un formulario limpio.
  const [tipo, setTipo] = useState('gasto')
  const [digitos, setDigitos] = useState('')
  const [cuentaId, setCuentaId] = useState(cuentaInicial ?? cuentas[0]?.id)
  const [categoriaId, setCategoriaId] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(() => toISODate(new Date()))
  const [nuevaCat, setNuevaCat] = useState('')
  const [cats, setCats] = useState(categorias)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const monedaSel = cuentas.find((c) => c.id === cuentaId)?.moneda ?? 'VES'
  const decimales = decimalesMoneda(monedaSel)
  const tecla = (t) =>
    setDigitos((d) => {
      if (t === 'del') return d.slice(0, -1)
      if ((d + t).length > 12) return d
      return (d + t).replace(/^0+(?=\d)/, '')
    })

  async function agregarCategoria() {
    const nombre = nuevaCat.trim()
    if (!nombre) return
    try {
      const { data } = await api.post('/finanzas/categorias/', { nombre })
      setCats((c) => [...c, data])
      setCategoriaId(data.id)
      setNuevaCat('')
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await api.post('/finanzas/movimientos/', {
        cuenta: cuentaId,
        categoria: categoriaId,
        tipo,
        monto: (Number(digitos) / 10 ** decimales).toFixed(2),
        descripcion,
        fecha,
      })
      onGuardado()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const monto = Number(digitos) / 10 ** decimales
  return (
    <BottomSheet open={open} onClose={onClose} title="Nuevo movimiento">
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tipo === 'gasto'}
          className={tipo === 'gasto' ? 'seg active seg-danger' : 'seg'}
          onClick={() => setTipo('gasto')}
        >
          Gasto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tipo === 'ingreso'}
          className={tipo === 'ingreso' ? 'seg active seg-success' : 'seg'}
          onClick={() => setTipo('ingreso')}
        >
          Ingreso
        </button>
      </div>

      <div className={`amount ${tipo === 'ingreso' ? 'c-success' : 'c-danger'}`}>{formatMoney(monto, monedaSel)}</div>

      <div className="chips" aria-label="Cuenta">
        {cuentas.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === cuentaId ? 'chip active' : 'chip'}
            onClick={() => setCuentaId(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="chips" aria-label="Categoría">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === categoriaId ? 'chip active' : 'chip'}
            onClick={() => setCategoriaId(c.id === categoriaId ? null : c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>
      <div className="inline-add">
        <input
          className="input"
          placeholder="Nueva categoría"
          value={nuevaCat}
          onChange={(e) => setNuevaCat(e.target.value)}
        />
        <ActionButton variant="ghost" icon={Plus} onClick={agregarCategoria} disabled={!nuevaCat.trim()} aria-label="Agregar categoría" />
      </div>

      <div className="grid-2">
        <input
          className="input"
          placeholder="Descripción"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map((t) => (
          <button key={t} type="button" className="key" onClick={() => tecla(t)}>
            {t}
          </button>
        ))}
        <button type="button" className="key" onClick={() => tecla('del')} aria-label="Borrar">
          <Delete size={22} aria-hidden="true" />
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <ActionButton full loading={guardando} disabled={!monto || !cuentaId} onClick={guardar}>
        Guardar {tipo}
      </ActionButton>
    </BottomSheet>
  )
}
