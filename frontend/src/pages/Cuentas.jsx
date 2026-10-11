import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Plus, Search, Wallet } from 'lucide-react'
import CuentaCard from '../components/CuentaCard'
import Empty from '../components/Empty'
import EliminarCuentaSheet from '../components/EliminarCuentaSheet'
import { listar } from '../lib/api'

const GRUPOS = [
  { clave: 'tarjetas', titulo: 'Tarjetas', tipos: ['debito', 'credito', 'tarjeta'] },
  { clave: 'bancarias', titulo: 'Cuentas bancarias', tipos: ['ahorros', 'corriente', 'divisas'] },
  { clave: 'billeteras', titulo: 'Billeteras digitales', tipos: ['billetera'] },
  { clave: 'cripto', titulo: 'Exchanges y cripto', tipos: ['cripto'] },
]
const TIPOS_AGRUPADOS = GRUPOS.flatMap((g) => g.tipos)
const TIPOS_TARJETA = ['debito', 'credito', 'tarjeta']

/**
 * Todas las cuentas e instrumentos, agrupados por tipo.
 * Las tarjetas afiliadas a una cuenta madre NO se listan aparte (compartirían su saldo y
 * parecería duplicado): cuelgan de su cuenta madre, con un botón para verlas.
 */
export default function Cuentas() {
  const navigate = useNavigate()
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [oculto, setOculto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [aEliminar, setAEliminar] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        listar('/finanzas/cuentas/'),
        listar('/finanzas/movimientos/'),
      ])
      setCuentas(c)
      setMovimientos(m)
      setError('')
    } catch {
      setError('No se pudieron cargar tus cuentas.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const principales = useMemo(() => cuentas.filter((c) => !c.cuenta_madre), [cuentas])
  const afiliadasDe = useMemo(() => {
    const mapa = {}
    for (const c of cuentas) {
      if (c.cuenta_madre) (mapa[c.cuenta_madre] ??= []).push(c)
    }
    return mapa
  }, [cuentas])

  const grupos = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const coincide = (c) =>
      [c.nombre, c.banco, c.moneda, c.ultimos_digitos, c.titular]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    // Una cuenta madre también aparece si coincide alguna de sus tarjetas afiliadas.
    const visibles = q
      ? principales.filter((c) => coincide(c) || (afiliadasDe[c.id] ?? []).some(coincide))
      : principales
    const lista = GRUPOS.map((g) => ({ ...g, items: visibles.filter((c) => g.tipos.includes(c.tipo)) }))
    const otras = visibles.filter((c) => !TIPOS_AGRUPADOS.includes(c.tipo))
    if (otras.length) lista.push({ clave: 'otras', titulo: 'Otras', items: otras })
    return lista.filter((g) => g.items.length > 0)
  }, [principales, afiliadasDe, filtro])

  const nAfiliadas = cuentas.length - principales.length
  const nTarjetasPropias = principales.filter((c) => TIPOS_TARJETA.includes(c.tipo)).length

  return (
    <div className="stack">
      <div className="section-head">
        <button type="button" className="icon-btn" onClick={() => navigate('/finanzas')} aria-label="Volver a Finanzas">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1 className="add-title">Mis cuentas</h1>
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

      {!cargando && principales.length > 0 && (
        <p className="muted">
          {principales.length} {principales.length === 1 ? 'cuenta' : 'cuentas e instrumentos'}
          {nTarjetasPropias > 0 &&
            ` · ${nTarjetasPropias} ${nTarjetasPropias === 1 ? 'tarjeta' : 'tarjetas'}`}
          {nAfiliadas > 0 &&
            ` · ${nAfiliadas} ${nAfiliadas === 1 ? 'tarjeta afiliada' : 'tarjetas afiliadas'}`}
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {principales.length > 6 && (
        <label className="field">
          <Search size={18} aria-hidden="true" />
          <input
            placeholder="Buscar por banco, nombre o moneda…"
            aria-label="Buscar cuentas"
            value={filtro}
            onChange={(ev) => setFiltro(ev.target.value)}
          />
        </label>
      )}

      {cargando ? (
        <div className="cuentas-grid" aria-hidden="true">
          <div className="skeleton carousel-skeleton" />
          <div className="skeleton carousel-skeleton" />
        </div>
      ) : cuentas.length === 0 ? (
        <Empty icon={Wallet} title="Aún no tienes cuentas">
          Registra tu primera cuenta, tarjeta o billetera.
        </Empty>
      ) : grupos.length === 0 ? (
        <Empty icon={Search} title="Sin resultados">
          Ninguna cuenta coincide con "{filtro}".
        </Empty>
      ) : (
        grupos.map((g) => (
          <section key={g.clave} className="cuentas-grupo" aria-label={g.titulo}>
            <h2 className="grupo-titulo">
              {g.titulo}
              <span className="grupo-count">{g.items.length}</span>
            </h2>
            <div className="cuentas-grid">
              {g.items.map((c) => (
                <CuentaCard
                  key={c.id}
                  cuenta={c}
                  tarjetas={afiliadasDe[c.id] ?? []}
                  oculto={oculto}
                  onAbrir={() => navigate(`/finanzas/cuentas/${c.id}`)}
                  onVerTarjetas={() => navigate(`/finanzas/cuentas/${c.id}/tarjetas`)}
                  onEditar={() => navigate(`/finanzas/${c.id}/editar`)}
                  onEliminar={() => setAEliminar(c)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <button type="button" className="fab" onClick={() => navigate('/finanzas/nueva')} aria-label="Nueva cuenta">
        <Plus size={26} aria-hidden="true" />
      </button>

      <EliminarCuentaSheet
        cuenta={aEliminar}
        cuentas={cuentas}
        movimientos={movimientos}
        onClose={() => setAEliminar(null)}
        onEliminada={() => {
          setAEliminar(null)
          cargar()
        }}
      />
    </div>
  )
}
