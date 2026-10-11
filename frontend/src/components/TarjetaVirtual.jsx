import { Eye, EyeOff, Nfc, RotateCw, Smartphone } from 'lucide-react'
import { INSTRUMENTOS, enmascarar, enmascararIdentificador } from '../lib/bancos'
import { nombreDePais } from '../lib/paises'

/** Agrupa `texto` (ya con relleno) en bloques con el separador dado. */
function agrupar(digitos, bloques, sep) {
  const total = bloques.reduce((a, b) => a + b, 0)
  const d = String(digitos).replace(/[^\d•]/g, '').slice(0, total).padEnd(total, '#')
  const partes = []
  let i = 0
  for (const n of bloques) {
    partes.push(d.slice(i, i + n))
    i += n
  }
  return partes.join(sep)
}

function MarcaRed({ red }) {
  if (red === 'visa') return <span className="net net-visa">VISA</span>
  if (red === 'mastercard' || red === 'maestro') {
    return (
      <span className={`net net-mc ${red}`} aria-label={red === 'maestro' ? 'Maestro' : 'Mastercard'}>
        <i />
        <i />
      </span>
    )
  }
  return null
}

/**
 * Tarjeta bancaria virtual (relación 1.586) con giro 3D.
 * Es puramente visual: refleja lo que se escribe y no guarda nada.
 */
export default function TarjetaVirtual({
  banco,
  instrumento = 'debito',
  subtipo = 'ahorros',
  numero = '',
  ultimos = '',
  identificador = '',
  pais = '',
  titular = '',
  mes = '',
  anio = '',
  cvv = '',
  moneda = 'VES',
  red = '',
  pagoMovil = false,
  privado = true,
  volteada = false,
  onTogglePrivado,
  onToggleVolteo,
}) {
  const info = INSTRUMENTOS[instrumento]
  const esTarjeta = info.esTarjeta
  const bloques = esTarjeta ? [4, 4, 4, 4] : [4, 4, 2, 10]
  const sep = esTarjeta ? ' ' : '-'
  // Al editar, el número completo no existe: se muestra enmascarado con los últimos 4 guardados.
  const base =
    !numero && ultimos
      ? '•'.repeat(bloques.reduce((a, b) => a + b, 0) - 4) + ultimos
      : numero
  const crudo = agrupar(base, bloques, sep)
  const visible = info.sinNumero
    ? identificador
      ? privado
        ? enmascararIdentificador(identificador)
        : identificador
      : 'correo, teléfono o usuario'
    : privado
      ? enmascarar(crudo)
      : crudo
  const redEfectiva = red || (instrumento === 'debito' ? 'maestro' : '')
  const tipoLabel = esTarjeta || info.sinNumero
    ? info.largo
    : instrumento === 'divisas'
      ? 'Cuenta en divisas'
      : subtipo === 'corriente'
        ? 'Cuenta corriente'
        : 'Cuenta de ahorros'
  const vence = mes || anio ? `${mes || 'MM'}/${anio ? String(anio).slice(-2) : 'AA'}` : 'MM/AA'
  const nombreBanco = banco?.corto ?? banco?.nombre ?? 'Tu banco'

  return (
    <div className="vcard-scene">
      <div
        className={volteada ? 'vcard flipped' : 'vcard'}
        data-bank={banco?.tema ?? 'generico'}
        role="img"
        aria-label={`${tipoLabel} de ${nombreBanco}${pais ? `, ${nombreDePais(pais)}` : ''}, ${moneda}${pagoMovil ? ', Pago Móvil activo' : ''}`}
      >
        {/* ───── Frente ───── */}
        <div className="vcard-face vcard-front">
          <div className="vcard-shine" aria-hidden="true" />
          <div className="vcard-top">
            <span className="vcard-bank">{nombreBanco}</span>
          </div>

          <div className="vcard-mid">
            {!info.sinNumero && (
              <span className="chip-emv" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            )}
            {pagoMovil && (
              <span className="vcard-pm">
                <Smartphone size={13} aria-hidden="true" />
                Pago Móvil activo
              </span>
            )}
            <Nfc size={26} strokeWidth={1.75} aria-hidden="true" className="vcard-nfc" />
          </div>

          <div
            className={esTarjeta ? 'vcard-number' : 'vcard-number vcard-number-cuenta'}
            data-ident={info.sinNumero ? 'true' : undefined}
            aria-hidden="true"
          >
            {visible}
          </div>

          <div className="vcard-bottom">
            <div className="vcard-holder">
              <span className="vcard-label">{tipoLabel}</span>
              <strong>{titular.trim() ? titular.toUpperCase() : 'NOMBRE APELLIDO'}</strong>
            </div>
            {esTarjeta && (
              <div className="vcard-exp">
                <span className="vcard-label">Vence</span>
                <strong>{vence}</strong>
              </div>
            )}
            <div className="vcard-side">
              <span className="vcard-cur">{moneda || 'VES'}</span>
              <MarcaRed red={esTarjeta ? redEfectiva : ''} />
            </div>
          </div>
        </div>

        {/* ───── Reverso ───── */}
        <div className="vcard-face vcard-back">
          <div className="vcard-stripe" aria-hidden="true" />
          <div className="vcard-sign">
            <span className="vcard-sign-line" aria-hidden="true">
              {titular.trim() || 'Firma autorizada'}
            </span>
            <span className="vcard-cvv">{cvv ? (privado ? '•'.repeat(cvv.length) : cvv) : '•••'}</span>
          </div>
          <p className="vcard-fine">
            Solo se muestra aquí. Luz nunca guarda el número completo ni el CVV.
          </p>
          <span className="vcard-bank vcard-back-bank">{nombreBanco}</span>
        </div>
      </div>

      <div className="vcard-actions">
        <button
          type="button"
          className="icon-btn vcard-btn"
          onClick={onTogglePrivado}
          aria-label={privado ? 'Mostrar números' : 'Ocultar números'}
          aria-pressed={!privado}
        >
          {privado ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
        {esTarjeta && (
          <button
            type="button"
            className="icon-btn vcard-btn"
            onClick={onToggleVolteo}
            aria-label={volteada ? 'Ver frente de la tarjeta' : 'Ver reverso de la tarjeta'}
            aria-pressed={volteada}
          >
            <RotateCw size={20} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
