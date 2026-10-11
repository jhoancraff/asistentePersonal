import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Eye, EyeOff, Plus } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import CuentaCard from '../components/CuentaCard'
import Empty from '../components/Empty'
import EliminarCuentaSheet from '../components/EliminarCuentaSheet'
import { listar } from '../lib/api'

/** Tarjetas afiliadas a una cuenta madre: comparten su saldo y se ven aquí por separado. */
export default function TarjetasDeCuenta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [oculto, setOculto] = useState(false)
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
      setError('No se pudieron cargar las tarjetas.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const madre = cuentas.find((c) => String(c.id) === String(id)) ?? null
  const tarjetas = useMemo(
    () => cuentas.filter((c) => String(c.cuenta_madre) === String(id)),
    [cuentas, id],
  )

  // Lo gastado este mes con cada tarjeta (en la moneda de la cuenta).
  const gastoMes = useMemo(() => {
    const hoy = new Date()
    const mapa = {}
    for (const m of movimientos) {
      if (m.tipo !== 'gasto') continue
      const [y, mo] = m.fecha.split('-').map(Number)
      if (y === hoy.getFullYear() && mo === hoy.getMonth() + 1) {
        mapa[m.cuenta] = (mapa[m.cuenta] ?? 0) + Number(m.monto)
      }
    }
    return mapa
  }, [movimientos])

  const titulo = madre ? `Tarjetas de ${madre.banco || madre.nombre}` : 'Tarjetas afiliadas'

  return (
    <div className="stack">
      <div className="section-head">
        <button
          type="button"
          className="icon-btn"
          onClick={() => navigate('/finanzas/cuentas')}
          aria-label="Volver a Mis cuentas"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1 className="add-title">{titulo}</h1>
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
        <div className="cuentas-grid" aria-hidden="true">
          <div className="skeleton carousel-skeleton" />
          <div className="skeleton carousel-skeleton" />
        </div>
      ) : !madre ? (
        <Empty icon={CreditCard} title="Cuenta no encontrada">
          Esta cuenta ya no existe o no tienes acceso a ella.
        </Empty>
      ) : (
        <>
          <section className="cuentas-grupo" aria-label="Cuenta madre">
            <h2 className="grupo-titulo">Cuenta madre</h2>
            <div className="cuentas-grid">
              <CuentaCard
                cuenta={madre}
                oculto={oculto}
                onAbrir={() => navigate(`/finanzas/cuentas/${madre.id}`)}
                onEditar={() => navigate(`/finanzas/${madre.id}/editar`)}
              />
            </div>
            <p className="muted">
              Las tarjetas de esta cuenta gastan su saldo. Sus movimientos aparecen junto a los de la
              cuenta madre en Finanzas.
            </p>
          </section>

          <section className="cuentas-grupo" aria-label="Tarjetas afiliadas">
            <h2 className="grupo-titulo">
              Tarjetas afiliadas
              <span className="grupo-count">{tarjetas.length}</span>
            </h2>
            {tarjetas.length === 0 ? (
              <Empty icon={CreditCard} title="Sin tarjetas afiliadas">
                Afilia una tarjeta para que gaste el saldo de esta cuenta.
              </Empty>
            ) : (
              <div className="cuentas-grid">
                {tarjetas.map((t) => (
                  <CuentaCard
                    key={t.id}
                    cuenta={t}
                    madre={madre}
                    afiliada
                    gastoMes={gastoMes[t.id] ?? 0}
                    oculto={oculto}
                    onAbrir={() => navigate(`/finanzas/cuentas/${t.id}`)}
                    onEditar={() => navigate(`/finanzas/${t.id}/editar`)}
                    onEliminar={() => setAEliminar(t)}
                  />
                ))}
              </div>
            )}
            <ActionButton
              variant="ghost"
              icon={Plus}
              full
              onClick={() => navigate(`/finanzas/nueva?madre=${madre.id}`)}
            >
              Afiliar otra tarjeta
            </ActionButton>
          </section>
        </>
      )}

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
