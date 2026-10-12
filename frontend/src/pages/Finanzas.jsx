import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Car,
  Delete,
  Eye,
  EyeOff,
  Gamepad2,
  HeartPulse,
  House,
  LayoutGrid,
  Plus,
  Receipt,
  ShoppingBasket,
  Tag,
  Trash2,
} from 'lucide-react'
import ActionButton from '../components/ActionButton'
import BottomSheet from '../components/BottomSheet'
import CuentaCard from '../components/CuentaCard'
import Empty from '../components/Empty'
import EliminarCuentaSheet from '../components/EliminarCuentaSheet'
import Fab from '../components/Fab'
import GlassCard from '../components/GlassCard'
import { api, listar } from '../lib/api'
import { decimalesMoneda, fechaRelativa, formatMoney, toISODate } from '../lib/format'

// Máximo de cuentas visibles en el carrusel; el resto está en /finanzas/cuentas.
const MAX_CARRUSEL = 3

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
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preferida = Number(params.get('cuenta')) || null
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

  // El carrusel muestra hasta MAX_CARRUSEL cuentas. Si se llega desde "Mis cuentas" con una
  // cuenta concreta (?cuenta=ID), esa cuenta pasa al principio del carrusel.
  // Las tarjetas afiliadas no se listan aparte (compartirían saldo con su cuenta madre y se
  // vería duplicado): cuelgan de su cuenta madre y se consultan con su botón.
  const principales = useMemo(() => cuentas.filter((c) => !c.cuenta_madre), [cuentas])
  const afiliadasDe = useMemo(() => {
    const mapa = {}
    for (const c of cuentas) {
      if (c.cuenta_madre) (mapa[c.cuenta_madre] ??= []).push(c)
    }
    return mapa
  }, [cuentas])
  const visibles = useMemo(() => {
    const base = principales.slice(0, MAX_CARRUSEL)
    let elegida = preferida ? cuentas.find((c) => c.id === preferida) : null
    // Si se pidió una tarjeta afiliada, se selecciona su cuenta madre.
    if (elegida?.cuenta_madre) elegida = cuentas.find((c) => c.id === elegida.cuenta_madre) ?? null
    if (elegida && !base.some((c) => c.id === elegida.id)) {
      return [elegida, ...base.slice(0, MAX_CARRUSEL - 1)]
    }
    return base
  }, [cuentas, principales, preferida])
  const hayMas = principales.length > MAX_CARRUSEL
  const verTodas = () => navigate('/finanzas/cuentas')
  const cuenta = visibles[Math.min(idx, Math.max(visibles.length - 1, 0))]
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
          {visibles.map((c) => (
            <CuentaCard
              key={c.id}
              cuenta={c}
              tarjetas={afiliadasDe[c.id] ?? []}
              oculto={oculto}
              onVerTarjetas={() => navigate(`/finanzas/cuentas/${c.id}/tarjetas`)}
              onDetalle={() => navigate(`/finanzas/cuentas/${c.id}`)}
              onEditar={() => navigate(`/finanzas/${c.id}/editar`)}
              onEliminar={() => setAEliminar(c)}
            />
          ))}
          {hayMas && (
            <button type="button" className="bank-card bank-card-more" onClick={verTodas}>
              <LayoutGrid size={26} aria-hidden="true" />
              <strong>Ver todas</strong>
              <span>{principales.length} cuentas</span>
            </button>
          )}
          <button type="button" className="bank-card bank-card-add" onClick={nuevaCuenta}>
            <Plus size={28} aria-hidden="true" />
            <span>Nueva cuenta</span>
          </button>
        </div>
      )}

      {visibles.length > 1 && (
        <div className="dots" aria-hidden="true">
          {visibles.map((c, i) => (
            <span key={c.id} className={i === idx ? 'dot active' : 'dot'} />
          ))}
        </div>
      )}

      {!cargando && hayMas && (
        <button type="button" className="see-all" onClick={verTodas}>
          Ver todas las cuentas ({principales.length})
          <ArrowRight size={16} aria-hidden="true" />
        </button>
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

      <EliminarCuentaSheet
        cuenta={aEliminar}
        cuentas={cuentas}
        movimientos={movimientos}
        onClose={() => setAEliminar(null)}
        onEliminada={() => {
          setAEliminar(null)
          setIdx(0)
          cargar()
        }}
      />

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

  // Cuentas elegibles: las activas (y la que ya venía seleccionada, aunque esté inactiva).
  const elegibles = cuentas.filter((c) => c.activa !== false || c.id === cuentaInicial)
  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const monedaSel = cuentaSel?.moneda ?? 'VES'
  const decimales = decimalesMoneda(monedaSel)
  const categoriaSel = cats.find((c) => c.id === categoriaId)
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

      <label className="field-block">
        <span className="field-label">Cuenta</span>
        <select
          className="input"
          value={cuentaId ?? ''}
          onChange={(e) => setCuentaId(Number(e.target.value))}
        >
          {elegibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.moneda}
              {c.cuenta_madre ? ' · tarjeta afiliada' : ''}
            </option>
          ))}
        </select>
        {cuentaSel && (
          <span className="muted">
            Saldo disponible: {formatMoney(cuentaSel.saldo, cuentaSel.moneda)}
          </span>
        )}
      </label>

      <div className="field-block">
        <span className="field-label">
          Categoría{categoriaSel ? `: ${categoriaSel.nombre}` : ' (opcional)'}
        </span>
        {cats.length > 0 ? (
          <div className="chips wrap" role="group" aria-label="Categoría">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === categoriaId ? 'chip active' : 'chip'}
                aria-pressed={c.id === categoriaId}
                onClick={() => setCategoriaId(c.id === categoriaId ? null : c.id)}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Aún no tienes categorías. Crea la primera aquí abajo.</p>
        )}
        <div className="inline-add">
          <input
            className="input"
            placeholder="Nueva categoría"
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                agregarCategoria()
              }
            }}
          />
          <ActionButton
            variant="ghost"
            icon={Plus}
            onClick={agregarCategoria}
            disabled={!nuevaCat.trim()}
            aria-label="Agregar categoría"
          />
        </div>
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
