import {
  Banknote,
  Bitcoin,
  ChevronRight,
  CreditCard,
  KeyRound,
  Landmark,
  Link2,
  Pencil,
  Smartphone,
  Trash2,
  Wallet,
} from 'lucide-react'
import { bancoPorNombre, enmascararIdentificador } from '../lib/bancos'
import { formatMoney } from '../lib/format'

export const TIPO_CUENTA = {
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

/**
 * Tarjeta visual de una cuenta o instrumento.
 *
 * - `onAbrir`: si se pasa, toda la tarjeta es pulsable.
 * - `tarjetas` + `onVerTarjetas`: en una cuenta madre, muestra un botón con las tarjetas afiliadas.
 * - `afiliada` (+ `gastoMes`): una tarjeta vinculada no repite el saldo de su cuenta madre;
 *   muestra en su lugar lo gastado en el mes.
 */
export default function CuentaCard({
  cuenta: c,
  madre,
  tarjetas = [],
  oculto,
  afiliada = false,
  gastoMes = 0,
  onEditar,
  onEliminar,
  onAbrir,
  onDetalle,
  onVerTarjetas,
}) {
  const tipo = TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.otra
  const Icono = tipo.icon
  const abrible = Boolean(onAbrir)
  const nTarjetas = tarjetas.length

  return (
    <div
      className={['bank-card', abrible && 'bank-card-clickable', onDetalle && 'tools-3']
        .filter(Boolean)
        .join(' ')}
      data-bank={c.tema || bancoPorNombre(c.banco)?.tema || 'generico'}
      role={abrible ? 'link' : undefined}
      tabIndex={abrible ? 0 : undefined}
      aria-label={abrible ? `Ver movimientos de ${c.nombre}` : undefined}
      onClick={abrible ? onAbrir : undefined}
      onKeyDown={
        abrible
          ? (ev) => {
              if (ev.target !== ev.currentTarget) return
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                onAbrir()
              }
            }
          : undefined
      }
    >
      <div className="bank-card-top">
        <Icono size={22} aria-hidden="true" />
        <span>{c.banco || tipo.label}</span>
      </div>

      {(onEditar || onEliminar || onDetalle) && (
        <div className="bank-card-tools">
          {onDetalle && (
            <button
              type="button"
              className="card-tool"
              onClick={(ev) => {
                ev.stopPropagation()
                onDetalle()
              }}
              aria-label={`Detalles y notas seguras de ${c.nombre}`}
            >
              <KeyRound size={16} aria-hidden="true" />
            </button>
          )}
          {onEditar && (
            <button
              type="button"
              className="card-tool"
              onClick={(ev) => {
                ev.stopPropagation()
                onEditar()
              }}
              aria-label={`Editar ${c.nombre}`}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
          {onEliminar && (
            <button
              type="button"
              className="card-tool"
              onClick={(ev) => {
                ev.stopPropagation()
                onEliminar()
              }}
              aria-label={`Eliminar ${c.nombre}`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {afiliada ? (
        <div className="bank-card-gasto">
          <span className="balance-label">Gastado este mes</span>
          <div className="bank-card-balance">{oculto ? '••••••' : formatMoney(gastoMes, c.moneda)}</div>
        </div>
      ) : (
        <div className="bank-card-balance">{oculto ? '••••••' : formatMoney(c.saldo, c.moneda)}</div>
      )}

      {madre && (
        <span className="card-link">
          <Link2 size={13} aria-hidden="true" />
          Usa el saldo de {madre.banco || madre.nombre}
        </span>
      )}

      {nTarjetas > 0 && onVerTarjetas && (
        <button
          type="button"
          className="card-tarjetas"
          onClick={(ev) => {
            ev.stopPropagation()
            onVerTarjetas()
          }}
          aria-label={`Ver ${nTarjetas} ${nTarjetas === 1 ? 'tarjeta afiliada' : 'tarjetas afiliadas'} a ${c.nombre}`}
        >
          <CreditCard size={14} aria-hidden="true" />
          {nTarjetas} {nTarjetas === 1 ? 'tarjeta afiliada' : 'tarjetas afiliadas'}
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}

      <div className="bank-card-bottom">
        <span>
          {c.ultimos_digitos
            ? `${tipo.label} ••${c.ultimos_digitos}`
            : c.identificador
              ? `${tipo.label} · ${enmascararIdentificador(c.identificador)}`
              : c.nombre}
        </span>
        <span className="muted-on-card">{c.activa ? c.moneda : `${c.moneda} · Inactiva`}</span>
      </div>
    </div>
  )
}
