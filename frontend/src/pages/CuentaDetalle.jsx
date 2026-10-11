import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Eye, EyeOff, Pencil, Receipt, Trash2, Wallet } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import CuentaCard, { TIPO_CUENTA } from '../components/CuentaCard'
import Empty from '../components/Empty'
import EliminarCuentaSheet from '../components/EliminarCuentaSheet'
import NotasSeguras from '../components/NotasSeguras'
import { listar } from '../lib/api'
import { enmascararIdentificador } from '../lib/bancos'
import { nombreDePais } from '../lib/paises'

function Dato({ etiqueta, valor }) {
  if (valor === undefined || valor === null || valor === '') return null
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  )
}

/** Detalles de una cuenta: datos, acceso a movimientos/tarjetas y notas seguras cifradas. */
export default function CuentaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [oculto, setOculto] = useState(true)
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
      setError('No se pudo cargar la cuenta.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuenta = cuentas.find((c) => String(c.id) === String(id)) ?? null
  const madre = cuenta?.cuenta_madre ? cuentas.find((c) => c.id === cuenta.cuenta_madre) : null
  const tarjetas = useMemo(
    () => cuentas.filter((c) => String(c.cuenta_madre) === String(id)),
    [cuentas, id],
  )

  const tipo = cuenta ? (TIPO_CUENTA[cuenta.tipo] ?? TIPO_CUENTA.otra).label : ''
  const mask = (v) => (oculto ? '••••••' : v)

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
        <h1 className="add-title">Detalles</h1>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOculto((o) => !o)}
          aria-label={oculto ? 'Mostrar datos' : 'Ocultar datos'}
          aria-pressed={!oculto}
        >
          {oculto ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {cargando ? (
        <div className="skeleton carousel-skeleton" aria-hidden="true" />
      ) : !cuenta ? (
        <Empty icon={Wallet} title="Cuenta no encontrada">
          Esta cuenta ya no existe o no tienes acceso a ella.
        </Empty>
      ) : (
        <>
          <CuentaCard
            cuenta={cuenta}
            madre={madre}
            oculto={false}
            tarjetas={tarjetas}
            onVerTarjetas={() => navigate(`/finanzas/cuentas/${cuenta.id}/tarjetas`)}
          />

          <div className="detalle-acciones">
            <ActionButton
              variant="ghost"
              icon={Receipt}
              onClick={() => navigate(`/finanzas?cuenta=${cuenta.id}`)}
            >
              Movimientos
            </ActionButton>
            <ActionButton variant="ghost" icon={Pencil} onClick={() => navigate(`/finanzas/${cuenta.id}/editar`)}>
              Editar
            </ActionButton>
            <ActionButton variant="ghost" icon={Trash2} onClick={() => setAEliminar(cuenta)}>
              Eliminar
            </ActionButton>
          </div>

          {tarjetas.length > 0 && (
            <ActionButton
              variant="ghost"
              icon={CreditCard}
              full
              onClick={() => navigate(`/finanzas/cuentas/${cuenta.id}/tarjetas`)}
            >
              Ver {tarjetas.length} {tarjetas.length === 1 ? 'tarjeta afiliada' : 'tarjetas afiliadas'}
            </ActionButton>
          )}

          <section className="glass detalle-datos" aria-label="Datos de la cuenta">
            <dl>
              <Dato etiqueta="Tipo" valor={tipo} />
              <Dato etiqueta="Institución" valor={cuenta.banco} />
              <Dato etiqueta="País" valor={cuenta.pais ? nombreDePais(cuenta.pais) : ''} />
              <Dato etiqueta="Moneda" valor={cuenta.moneda} />
              <Dato etiqueta="Titular" valor={cuenta.titular} />
              <Dato etiqueta="Documento" valor={cuenta.documento ? mask(cuenta.documento) : ''} />
              <Dato
                etiqueta="Identificador"
                valor={cuenta.identificador ? (oculto ? enmascararIdentificador(cuenta.identificador) : cuenta.identificador) : ''}
              />
              <Dato etiqueta="Últimos dígitos" valor={cuenta.ultimos_digitos ? `••${cuenta.ultimos_digitos}` : ''} />
              <Dato etiqueta="Vencimiento" valor={cuenta.vencimiento} />
              <Dato etiqueta="Red" valor={cuenta.red ? cuenta.red.toUpperCase() : ''} />
              <Dato
                etiqueta="Pago Móvil"
                valor={cuenta.pago_movil_telefono ? mask(cuenta.pago_movil_telefono) : ''}
              />
              <Dato etiqueta="Estado" valor={cuenta.activa ? 'Activa' : 'Inactiva'} />
            </dl>
          </section>

          <NotasSeguras cuentaId={cuenta.id} />
        </>
      )}

      <EliminarCuentaSheet
        cuenta={aEliminar}
        cuentas={cuentas}
        movimientos={movimientos}
        onClose={() => setAEliminar(null)}
        onEliminada={() => navigate('/finanzas/cuentas', { replace: true })}
      />
    </div>
  )
}
