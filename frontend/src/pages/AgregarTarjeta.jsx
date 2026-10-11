import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Bitcoin,
  CreditCard,
  Globe2,
  Info,
  Landmark,
  Link2,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wallet,
} from 'lucide-react'
import ActionButton from '../components/ActionButton'
import TarjetaVirtual from '../components/TarjetaVirtual'
import { api, listar } from '../lib/api'
import {
  BANCOS,
  INSTRUMENTOS,
  MONEDAS_CRIPTO,
  MONEDAS_FIAT,
  OPERADORAS,
  bancoPorCodigo,
  bancoPorNombre,
  detectarRed,
  formatCuenta,
  formatTarjeta,
  ibanValido,
  luhnValido,
  soloDigitos,
} from '../lib/bancos'
import { validarDocumento } from '../lib/documento'
import { decimalesMoneda, formatMoney } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { MONEDA_POR_PAIS, PAISES } from '../lib/paises'
import '../styles/tarjeta.css'

const ICONOS = {
  debito: CreditCard,
  credito: CreditCard,
  cuenta: Landmark,
  divisas: Wallet,
  billetera: Smartphone,
  cripto: Bitcoin,
}
const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const TIPOS_CONOCIDOS = ['ahorros', 'corriente', 'debito', 'credito', 'divisas', 'billetera', 'cripto']
const OTRO = '__otro__'

// Un único estado centralizado: el formulario y la tarjeta leen de aquí.
const INICIAL = {
  instrumento: 'debito',
  subtipo: 'ahorros',
  pais: 'VE',
  banco: '', // nombre de la institución
  bancoLibre: false, // el usuario escribió el nombre a mano
  bancoTema: 'generico',
  bancoCodigo: '',
  bancoClase: 'banco', // clase de la institución emisora (banco | billetera | cripto)
  bic: '',
  cuentaMadre: '', // id de la cuenta de la que sale el saldo (solo tarjetas)
  numero: '',
  identificador: '',
  titular: '',
  docTipo: 'V',
  docNumero: '',
  mes: '',
  anio: '',
  cvv: '',
  moneda: 'VES', // por defecto bolívares
  saldo: '', // cents-mask: dígitos | decimal: texto "0.5"
  pagoMovil: false,
  opTel: '0414',
  telefono: '',
  activa: true,
}

const claseDe = (instrumento) => INSTRUMENTOS[instrumento].clase

/** Monedas con más de 2 decimales (BTC…) se teclean como decimal; el resto con máscara. */
const modoDecimal = (moneda) => decimalesMoneda(moneda) > 2

function saldoNumero(e) {
  if (modoDecimal(e.moneda)) return Number(String(e.saldo).replace(',', '.')) || 0
  return Number(e.saldo || 0) / 10 ** decimalesMoneda(e.moneda)
}

function monedaPorDefecto(instrumento, pais) {
  if (instrumento === 'cripto') return 'USDT'
  if (instrumento === 'billetera' || instrumento === 'divisas') return 'USD'
  return MONEDA_POR_PAIS[pais] ?? 'VES'
}

/** Convierte una cuenta del backend al estado del formulario (modo edición). */
function estadoDesdeCuenta(c) {
  const [docTipo = 'V', docNumero = ''] = (c.documento || '').split('-')
  const [mm = '', aa = ''] = (c.vencimiento || '').split('/')
  const tel = c.pago_movil_telefono || ''
  const dec = decimalesMoneda(c.moneda)
  const saldo = Number(c.saldo_inicial) || 0
  return {
    ...INICIAL,
    instrumento:
      c.tipo === 'debito'
        ? 'debito'
        : c.tipo === 'credito' || c.tipo === 'tarjeta'
          ? 'credito'
          : c.tipo === 'divisas'
            ? 'divisas'
            : c.tipo === 'billetera'
              ? 'billetera'
              : c.tipo === 'cripto'
                ? 'cripto'
                : 'cuenta',
    subtipo: c.tipo === 'corriente' ? 'corriente' : 'ahorros',
    pais: c.pais || (c.tipo === 'billetera' || c.tipo === 'cripto' ? '' : 'VE'),
    banco: c.banco || '',
    bancoTema: c.tema || bancoPorNombre(c.banco)?.tema || 'generico',
    bancoCodigo: c.banco_codigo || '',
    bancoClase: c.clase_institucion || 'banco',
    cuentaMadre: c.cuenta_madre ? String(c.cuenta_madre) : '',
    bic: c.swift_bic || '',
    identificador: c.identificador || '',
    titular: c.titular || '',
    docTipo: docTipo || 'V',
    docNumero,
    mes: mm,
    anio: aa ? `20${aa}` : '',
    moneda: c.moneda,
    saldo: dec > 2 ? String(saldo || '') : String(Math.round(saldo * 10 ** dec) || ''),
    pagoMovil: Boolean(tel),
    opTel: tel.slice(0, 4) || '0414',
    telefono: tel.slice(4),
    activa: c.activa,
  }
}

function reducer(estado, accion) {
  switch (accion.tipo) {
    case 'campo':
      return { ...estado, [accion.campo]: accion.valor }
    case 'cargar':
      return accion.valor
    case 'instrumento': {
      const instrumento = accion.valor
      const clase = claseDe(instrumento)
      const pais = clase === 'banco' && !estado.pais ? 'VE' : estado.pais
      return {
        ...estado,
        instrumento,
        pais,
        banco: '',
        bancoLibre: false,
        bancoTema: 'generico',
        bancoCodigo: '',
        bancoClase: clase,
        cuentaMadre: '',
        bic: '',
        numero: '',
        identificador: '',
        cvv: '',
        mes: '',
        anio: '',
        moneda: accion.editando ? estado.moneda : monedaPorDefecto(instrumento, pais),
        saldo: '',
      }
    }
    case 'pais': {
      const pais = accion.valor
      const clase = claseDe(estado.instrumento)
      return {
        ...estado,
        pais,
        banco: '',
        bancoLibre: false,
        bancoTema: 'generico',
        bancoCodigo: '',
        bancoClase: clase,
        bic: '',
        numero: '',
        moneda:
          accion.editando || clase !== 'banco' || estado.instrumento === 'divisas'
            ? estado.moneda
            : (MONEDA_POR_PAIS[pais] ?? estado.moneda),
        saldo: accion.editando ? estado.saldo : '',
        pagoMovil: pais === 'VE' ? estado.pagoMovil : false,
      }
    }
    case 'proveedor': {
      const p = accion.valor
      const sugerida = !accion.editando && p.moneda_sugerida ? p.moneda_sugerida : null
      return {
        ...estado,
        banco: p.nombre,
        bancoLibre: false,
        bancoTema: p.tema || 'generico',
        bancoCodigo: p.codigo || '',
        bancoClase: p.clase || claseDe(estado.instrumento),
        bic: p.bic || '',
        ...(sugerida && sugerida !== estado.moneda
          ? { moneda: sugerida, saldo: '', cuentaMadre: '' }
          : {}),
      }
    }
    case 'moneda':
      return {
        ...estado,
        moneda: accion.valor,
        cuentaMadre: accion.valor === estado.moneda ? estado.cuentaMadre : '',
        saldo: modoDecimal(accion.valor) === modoDecimal(estado.moneda) ? estado.saldo : '',
      }
    case 'numero': {
      const info = INSTRUMENTOS[estado.instrumento]
      const bruto = String(accion.valor)
      if (info.esTarjeta) return { ...estado, numero: soloDigitos(bruto).slice(0, 16) }
      if (estado.pais === 'VE') {
        const numero = soloDigitos(bruto).slice(0, 20)
        let cambios = {}
        // En Venezuela los 4 primeros dígitos identifican al banco.
        if (numero.length >= 4) {
          const b = bancoPorCodigo(numero.slice(0, 4))
          if (b) {
            cambios = {
              banco: b.nombre,
              bancoTema: b.tema,
              bancoCodigo: b.codigo,
              bancoClase: 'banco',
              bancoLibre: false,
            }
          }
        }
        return { ...estado, numero, ...cambios }
      }
      // Internacional: IBAN o número local (alfanumérico)
      return { ...estado, numero: bruto.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 34) }
    }
    default:
      return estado
  }
}

function validar(e, editando) {
  const info = INSTRUMENTOS[e.instrumento]
  const clase = info.clase
  const err = {}
  if (!e.banco.trim()) err.banco = 'Selecciona o escribe la institución.'

  if (info.sinNumero) {
    if (e.identificador.trim().length < 3) err.identificador = 'Indica el correo, teléfono o usuario.'
  } else {
    // En edición el número es opcional: vacío = conservar el actual.
    if (!editando || e.numero.length > 0) {
      if (info.esTarjeta) {
        if (e.numero.length !== 16) err.numero = 'La tarjeta debe tener 16 dígitos.'
        else if (!luhnValido(e.numero)) err.numero = 'El número de tarjeta no es válido.'
      } else if (e.pais === 'VE') {
        if (e.numero.length !== 20) err.numero = 'La cuenta debe tener 20 dígitos.'
        else if (e.bancoCodigo && !e.numero.startsWith(e.bancoCodigo))
          err.numero = `Los primeros 4 dígitos de ${e.banco} son ${e.bancoCodigo}.`
      } else if (/^[A-Z]{2}\d{2}/.test(e.numero)) {
        if (!ibanValido(e.numero)) err.numero = 'El IBAN no es válido (revisa los dígitos).'
      } else if (e.numero.length < 6) {
        err.numero = 'Ingresa al menos 6 caracteres del número de cuenta o un IBAN.'
      }
    }
    if (e.titular.trim().split(/\s+/).filter(Boolean).length < 2)
      err.titular = 'Escribe nombre y apellido como figura en el banco.'
  }

  // Cédula/RIF: solo para instituciones venezolanas
  if (e.bancoClase === 'banco' && e.pais === 'VE') {
    const doc = validarDocumento(e.docTipo, e.docNumero)
    if (!doc.ok) err.docNumero = doc.mensaje
  }

  if (info.esTarjeta) {
    const ahora = new Date()
    if (!e.mes && !e.anio && editando) {
      /* tarjeta antigua sin vencimiento registrado */
    } else if (!e.mes || !e.anio) {
      err.vence = 'Indica mes y año de vencimiento.'
    } else if (
      !editando &&
      (Number(e.anio) < ahora.getFullYear() ||
        (Number(e.anio) === ahora.getFullYear() && Number(e.mes) < ahora.getMonth() + 1))
    ) {
      err.vence = 'La tarjeta está vencida.'
    }
    if (!editando && e.cvv.length !== 3) err.cvv = 'El CVV tiene 3 dígitos.'
  }
  if (e.pagoMovil && e.telefono.length !== 7) err.telefono = 'Ingresa los 7 dígitos del teléfono.'
  if (!/^[A-Z0-9]{2,10}$/.test(e.moneda)) err.moneda = 'Código de moneda inválido (ej. USD, USDT).'
  return err
}

export default function AgregarTarjeta() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editando = Boolean(id)
  const [e, dispatch] = useReducer(reducer, INICIAL)
  const [original, setOriginal] = useState(null)
  const [cargando, setCargando] = useState(editando)
  const [catalogo, setCatalogo] = useState([])
  const [cuentas, setCuentas] = useState([])
  const madreTocada = useRef(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [otraMoneda, setOtraMoneda] = useState(false)
  const [privado, setPrivado] = useState(false)
  const [volteada, setVolteada] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [registrado, setRegistrado] = useState(false)
  const [errorApi, setErrorApi] = useState('')
  const formRef = useRef(null)

  const info = INSTRUMENTOS[e.instrumento]
  const clase = info.clase
  const esVE = e.bancoClase === 'banco' && e.pais === 'VE'
  const q = useDebounced(busqueda.trim(), 350)
  const esTarjeta = Boolean(info.esTarjeta)

  // Carga del registro al editar
  useEffect(() => {
    if (!editando) return undefined
    let vivo = true
    api
      .get(`/finanzas/cuentas/${id}/`)
      .then(({ data }) => {
        if (!vivo) return
        setOriginal(data)
        dispatch({ tipo: 'cargar', valor: estadoDesdeCuenta(data) })
      })
      .catch(() => vivo && setErrorApi('No se pudo cargar la cuenta.'))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [editando, id])

  // Cuentas del usuario: candidatas a cuenta madre de una tarjeta
  useEffect(() => {
    let vivo = true
    listar('/finanzas/cuentas/')
      .then((lista) => vivo && setCuentas(lista))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  // Catálogo curado según clase y país
  useEffect(() => {
    let vivo = true
    const params = { curado: 1 }
    // Una tarjeta puede emitirla un banco, una billetera (Zinli) o un exchange (Binance).
    if (!esTarjeta) params.clase = clase
    if (e.pais) {
      params.pais = e.pais
      if (clase !== 'banco' || esTarjeta) params.incluir_globales = 1
    }
    listar('/finanzas/proveedores/', params)
      .then((lista) => vivo && setCatalogo(lista))
      .catch(() => {
        // Sin red/API: respaldo local para Venezuela
        if (vivo) setCatalogo(clase === 'banco' && e.pais === 'VE' ? BANCOS : [])
      })
    return () => {
      vivo = false
    }
  }, [clase, e.pais, esTarjeta])

  // Búsqueda en el catálogo importado (OpenSanctions)
  useEffect(() => {
    if (clase !== 'banco' || q.length < 2) return undefined
    let vivo = true
    const params = { clase, q }
    if (e.pais) params.pais = e.pais
    listar('/finanzas/proveedores/', params)
      .then((lista) => vivo && setResultados(lista.slice(0, 8)))
      .catch(() => vivo && setResultados([]))
    return () => {
      vivo = false
    }
  }, [clase, e.pais, q])

  const bancoActual = useMemo(() => {
    if (!e.banco) return null
    const estatico = bancoPorNombre(e.banco)
    return { nombre: e.banco, corto: estatico?.corto, tema: e.bancoTema || 'generico' }
  }, [e.banco, e.bancoTema])

  const errores = useMemo(() => validar(e, editando), [e, editando])
  const redTecleada = info.esTarjeta ? detectarRed(e.numero) : ''
  const red = redTecleada || (editando && !e.numero ? original?.red || '' : '')
  const anioActual = new Date().getFullYear()
  const anios = Array.from({ length: 13 }, (_, i) => String(anioActual + i))
  if (e.anio && !anios.includes(e.anio)) anios.unshift(e.anio)
  const saldo = saldoNumero(e)
  const decimal = modoDecimal(e.moneda)
  const set = (campo) => (ev) => dispatch({ tipo: 'campo', campo, valor: ev.target.value })
  const mostrar = (campo) => intentado && errores[campo]
  const doc = esVE ? validarDocumento(e.docTipo, e.docNumero) : { ok: true, esRif: false }

  const numeroFormateado = info.esTarjeta
    ? formatTarjeta(e.numero)
    : e.pais === 'VE'
      ? formatCuenta(e.numero)
      : (e.numero.match(/.{1,4}/g) ?? []).join(' ')
  const pagoMovilActivo = esVE && e.pagoMovil && e.telefono.length === 7
  const ultimosGuardados = editando && !e.numero ? original?.ultimos_digitos || '' : ''
  const enCatalogo = catalogo.some((p) => p.nombre === e.banco)
  const valorSelect = e.bancoLibre ? OTRO : enCatalogo ? e.banco : e.banco ? OTRO : ''
  const mostrarLibre = e.bancoLibre || (Boolean(e.banco) && !enCatalogo && !resultados.length)

  // Cuentas que pueden respaldar esta tarjeta: misma moneda, que no sean tarjetas ni la propia.
  const candidatos = useMemo(
    () =>
      cuentas.filter(
        (c) =>
          String(c.id) !== String(id) &&
          !c.cuenta_madre &&
          !['debito', 'credito', 'tarjeta'].includes(c.tipo) &&
          (c.moneda === e.moneda || String(c.id) === e.cuentaMadre),
      ),
    [cuentas, id, e.moneda, e.cuentaMadre],
  )
  const madre = cuentas.find((c) => String(c.id) === e.cuentaMadre) ?? null

  // Si hay exactamente una cuenta de la misma plataforma, se propone como madre.
  useEffect(() => {
    if (editando || !esTarjeta || madreTocada.current || e.cuentaMadre || !e.banco) return
    const mismas = candidatos.filter((c) => c.banco === e.banco)
    if (mismas.length === 1) {
      dispatch({ tipo: 'campo', campo: 'cuentaMadre', valor: String(mismas[0].id) })
    }
  }, [editando, esTarjeta, e.banco, e.cuentaMadre, candidatos])

  const opcionesMoneda = useMemo(() => {
    const base = clase === 'cripto' ? [...MONEDAS_CRIPTO, ...MONEDAS_FIAT] : [...MONEDAS_FIAT]
    if (e.moneda && !base.includes(e.moneda)) base.unshift(e.moneda)
    return base
  }, [clase, e.moneda])

  function elegirProveedor(valor) {
    if (valor === OTRO) {
      dispatch({ tipo: 'campo', campo: 'bancoLibre', valor: true })
      dispatch({ tipo: 'campo', campo: 'banco', valor: '' })
      dispatch({ tipo: 'campo', campo: 'bancoTema', valor: 'generico' })
      dispatch({ tipo: 'campo', campo: 'bancoCodigo', valor: '' })
      return
    }
    const p = catalogo.find((x) => x.nombre === valor)
    if (p) dispatch({ tipo: 'proveedor', valor: p, editando })
    else dispatch({ tipo: 'campo', campo: 'banco', valor: '' })
  }

  async function onSubmit(ev) {
    ev.preventDefault()
    setIntentado(true)
    setErrorApi('')
    if (Object.keys(errores).length) {
      navigator.vibrate?.([20, 40, 20])
      formRef.current?.querySelector('[data-error="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      return
    }
    navigator.vibrate?.(15)
    setGuardando(true)

    const ultimos = e.numero ? e.numero.slice(-4) : original?.ultimos_digitos || ''
    const tipoNuevo =
      e.instrumento === 'cuenta'
        ? e.subtipo
        : e.instrumento
    // Tipos antiguos (efectivo, otra…) se conservan si el instrumento no cambió.
    const tipo =
      editando && original && !TIPOS_CONOCIDOS.includes(original.tipo) ? original.tipo : tipoNuevo
    const etiqueta = bancoActual.corto ?? bancoActual.nombre
    const payload = {
      nombre: `${etiqueta} · ${info.label}${ultimos ? ` ••${ultimos}` : ''}`,
      banco: e.banco.trim(),
      banco_codigo: e.bancoCodigo,
      swift_bic: e.bic,
      tema: e.bancoTema || 'generico',
      clase_institucion: e.bancoClase,
      pais: e.pais,
      tipo,
      moneda: e.moneda,
      saldo_inicial: e.cuentaMadre ? '0.00' : saldo.toFixed(Math.max(decimalesMoneda(e.moneda), 2)),
      cuenta_madre: esTarjeta && e.cuentaMadre ? Number(e.cuentaMadre) : null,
      titular: e.titular.trim(),
      documento: esVE ? `${e.docTipo}-${e.docNumero}` : '',
      identificador: info.sinNumero ? e.identificador.trim() : '',
      vencimiento: info.esTarjeta && e.mes && e.anio ? `${e.mes}/${e.anio.slice(-2)}` : '',
      pago_movil_telefono: esVE && e.pagoMovil ? `${e.opTel}${e.telefono}` : '',
    }
    // SEGURIDAD: el número completo y el CVV jamás salen del formulario.
    if (!info.sinNumero && (!editando || e.numero)) {
      payload.ultimos_digitos = ultimos
      payload.red = red || (e.instrumento === 'debito' ? 'maestro' : '')
    }
    if (editando) payload.activa = e.activa

    try {
      if (editando) await api.patch(`/finanzas/cuentas/${id}/`, payload)
      else await api.post('/finanzas/cuentas/', payload)
      // Institución escrita a mano: se recuerda para la próxima vez (mejor esfuerzo).
      if (e.bancoLibre && !enCatalogo) {
        api
          .post('/finanzas/proveedores/', {
            clase: e.bancoClase,
            nombre: e.banco.trim(),
            pais: e.pais,
            tema: 'generico',
            moneda_sugerida: e.moneda,
          })
          .catch(() => {})
      }
      setRegistrado(true)
      navigator.vibrate?.([10, 30, 10])
      setTimeout(() => navigate('/finanzas', { replace: true }), 700)
    } catch (err) {
      const d = err.response?.data
      setErrorApi(
        d && typeof d === 'object'
          ? Object.values(d).flat().join(' ')
          : 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.',
      )
      setGuardando(false)
    }
  }

  const campoCls = (campo) => (mostrar(campo) ? 'field-block has-error' : 'field-block')

  if (cargando) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 220 }} aria-hidden="true" />
        <div className="skeleton" aria-hidden="true" />
      </div>
    )
  }

  const etiquetaIdent =
    clase === 'cripto'
      ? 'Correo o ID de usuario (ej. Binance ID)'
      : e.banco === 'Zelle'
        ? 'Correo o teléfono registrado en Zelle'
        : 'Correo, teléfono o usuario de la cuenta'

  return (
    <div className="stack add-card">
      <div className="section-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1 className="add-title">{editando ? 'Editar cuenta' : 'Nueva cuenta'}</h1>
        <span className="add-spacer" aria-hidden="true" />
      </div>

      <TarjetaVirtual
        banco={bancoActual}
        instrumento={e.instrumento}
        subtipo={e.subtipo}
        numero={e.numero}
        ultimos={ultimosGuardados}
        identificador={e.identificador}
        pais={e.pais}
        titular={e.titular}
        mes={e.mes}
        anio={e.anio}
        cvv={e.cvv}
        moneda={e.moneda}
        red={red}
        pagoMovil={pagoMovilActivo}
        privado={privado}
        volteada={volteada}
        onTogglePrivado={() => setPrivado((p) => !p)}
        onToggleVolteo={() => setVolteada((v) => !v)}
      />

      <form ref={formRef} className="stack" onSubmit={onSubmit} noValidate>
        <fieldset className="field-block">
          <legend className="field-label">¿Qué quieres registrar?</legend>
          <div className="instrument-grid">
            {Object.entries(INSTRUMENTOS).map(([clave, v]) => {
              const Icono = ICONOS[clave]
              return (
                <button
                  key={clave}
                  type="button"
                  className={e.instrumento === clave ? 'instrument active' : 'instrument'}
                  aria-pressed={e.instrumento === clave}
                  disabled={editando && e.instrumento !== clave}
                  onClick={() => dispatch({ tipo: 'instrumento', valor: clave, editando })}
                >
                  <Icono size={20} aria-hidden="true" />
                  <span>{v.label}</span>
                </button>
              )
            })}
          </div>
          {e.instrumento === 'cuenta' && (
            <div className="chips">
              {['ahorros', 'corriente'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={e.subtipo === s ? 'chip active' : 'chip'}
                  onClick={() => dispatch({ tipo: 'campo', campo: 'subtipo', valor: s })}
                >
                  {s === 'ahorros' ? 'Ahorros' : 'Corriente'}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <label className="field-block">
          <span className="field-label">
            País{clase !== 'banco' && ' (opcional)'}
          </span>
          <span className="field-icon">
            <Globe2 size={18} aria-hidden="true" />
            <select
              className="select-bare"
              value={e.pais}
              onChange={(ev) => dispatch({ tipo: 'pais', valor: ev.target.value, editando })}
            >
              {clase !== 'banco' && <option value="">Global / sin país</option>}
              {PAISES.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </span>
        </label>

        <div className={campoCls('banco')} data-error={Boolean(mostrar('banco'))}>
          <label className="field-block">
            <span className="field-label">
              {esTarjeta
                ? 'Banco o plataforma emisora'
                : clase === 'banco'
                  ? 'Banco'
                  : clase === 'billetera'
                    ? 'Billetera'
                    : 'Exchange o billetera'}
            </span>
            <select
              className="input"
              value={valorSelect}
              onChange={(ev) => elegirProveedor(ev.target.value)}
            >
              <option value="">Selecciona…</option>
              {!enCatalogo && e.banco && !e.bancoLibre && (
                <option value={e.banco}>{e.banco}</option>
              )}
              {(esTarjeta
                ? [
                    ['banco', 'Bancos'],
                    ['billetera', 'Billeteras digitales'],
                    ['cripto', 'Exchanges y cripto'],
                  ]
                : [[clase, '']]
              ).map(([c, etiqueta]) => {
                const items = catalogo.filter((p) => (p.clase ?? 'banco') === c)
                if (!items.length) return null
                const opciones = items.map((p) => (
                  <option key={p.id ?? p.nombre} value={p.nombre}>
                    {p.nombre}
                    {p.codigo ? ` · ${p.codigo}` : ''}
                  </option>
                ))
                return etiqueta ? (
                  <optgroup key={c} label={etiqueta}>
                    {opciones}
                  </optgroup>
                ) : (
                  opciones
                )
              })}
              <option value={OTRO}>Otro (escribir nombre)…</option>
            </select>
          </label>

          {clase === 'banco' && (
            <>
              <span className="field-icon">
                <Search size={18} aria-hidden="true" />
                <input
                  placeholder="Buscar otro banco por nombre…"
                  aria-label="Buscar banco"
                  value={busqueda}
                  onChange={(ev) => setBusqueda(ev.target.value)}
                />
              </span>
              {q.length >= 2 && resultados.length > 0 && (
                <div className="chips" role="listbox" aria-label="Resultados">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={p.nombre === e.banco}
                      className={p.nombre === e.banco ? 'chip active' : 'chip'}
                      onClick={() => {
                        dispatch({ tipo: 'proveedor', valor: p, editando })
                        setBusqueda('')
                      }}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mostrarLibre && (
            <input
              className="input"
              placeholder="Nombre de la institución"
              aria-label="Nombre de la institución"
              value={e.banco}
              onChange={(ev) => {
                dispatch({ tipo: 'campo', campo: 'bancoLibre', valor: true })
                dispatch({ tipo: 'campo', campo: 'banco', valor: ev.target.value })
              }}
            />
          )}
          {mostrar('banco') && <span className="field-error">{errores.banco}</span>}
        </div>

        {info.sinNumero ? (
          <label className={campoCls('identificador')} data-error={Boolean(mostrar('identificador'))}>
            <span className="field-label">{etiquetaIdent}</span>
            <span className="field-icon">
              <Mail size={18} aria-hidden="true" />
              <input
                autoComplete="off"
                autoCapitalize="none"
                placeholder="tucorreo@ejemplo.com · +58… · @usuario"
                value={e.identificador}
                onChange={set('identificador')}
              />
            </span>
            {mostrar('identificador') && <span className="field-error">{errores.identificador}</span>}
          </label>
        ) : (
          <label className={campoCls('numero')} data-error={Boolean(mostrar('numero'))}>
            <span className="field-label">
              {info.esTarjeta
                ? 'Número de tarjeta (16 dígitos)'
                : e.pais === 'VE'
                  ? 'Número de cuenta (20 dígitos)'
                  : 'Número de cuenta o IBAN'}
              {editando && ' · opcional'}
            </span>
            <input
              className="input mono"
              inputMode={e.pais === 'VE' || info.esTarjeta ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={
                editando && original?.ultimos_digitos
                  ? `Guardada ••••${original.ultimos_digitos} · escribe para cambiarla`
                  : info.esTarjeta
                    ? '0000 0000 0000 0000'
                    : e.pais === 'VE'
                      ? '0134-0000-00-0000000000'
                      : 'ES91 2100 0418 4502 0005 1332'
              }
              value={numeroFormateado}
              onChange={(ev) => dispatch({ tipo: 'numero', valor: ev.target.value })}
            />
            {mostrar('numero') && <span className="field-error">{errores.numero}</span>}
          </label>
        )}

        <label className={campoCls('titular')} data-error={Boolean(mostrar('titular'))}>
          <span className="field-label">Titular{info.sinNumero && ' (opcional)'}</span>
          <span className="field-icon">
            <UserRound size={18} aria-hidden="true" />
            <input
              placeholder="Nombre y apellido"
              autoComplete="name"
              value={e.titular}
              onChange={set('titular')}
            />
          </span>
          {mostrar('titular') && <span className="field-error">{errores.titular}</span>}
        </label>

        {esVE && (
          <div className={campoCls('docNumero')} data-error={Boolean(mostrar('docNumero'))}>
            <span className="field-label">Documento de identidad (cédula o RIF)</span>
            <div className="doc-row">
              <select
                className="input"
                value={e.docTipo}
                onChange={set('docTipo')}
                aria-label="Tipo de documento"
              >
                {['V', 'E', 'J', 'G'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                className="input"
                inputMode="numeric"
                placeholder="Cédula o RIF"
                aria-label="Número de documento"
                value={e.docNumero}
                onChange={(ev) =>
                  dispatch({
                    tipo: 'campo',
                    campo: 'docNumero',
                    valor: soloDigitos(ev.target.value).slice(0, 9),
                  })
                }
              />
            </div>
            {mostrar('docNumero') && <span className="field-error">{errores.docNumero}</span>}
            {doc.ok && doc.esRif && (
              <span className="field-ok">
                <BadgeCheck size={15} aria-hidden="true" />
                RIF válido
              </span>
            )}
            {!mostrar('docNumero') && !doc.ok && doc.esRif && e.docNumero.length === 9 && (
              <span className="field-error">{doc.mensaje}</span>
            )}
          </div>
        )}

        {info.esTarjeta && (
          <div className={campoCls('vence')} data-error={Boolean(mostrar('vence') || mostrar('cvv'))}>
            <span className="field-label">
              {editando ? 'Vencimiento' : 'Vencimiento y código de seguridad'}
            </span>
            <div className="exp-row">
              <select className="input" value={e.mes} onChange={set('mes')} aria-label="Mes">
                <option value="">Mes</option>
                {MESES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <select className="input" value={e.anio} onChange={set('anio')} aria-label="Año">
                <option value="">Año</option>
                {anios.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              {!editando && (
                <span className="field-icon cvv-field">
                  <Lock size={16} aria-hidden="true" />
                  <input
                    className="cvv-input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="CVV"
                    aria-label="Código de seguridad (CVV)"
                    maxLength={3}
                    value={e.cvv}
                    onFocus={() => setVolteada(true)}
                    onBlur={() => setVolteada(false)}
                    onChange={(ev) =>
                      dispatch({
                        tipo: 'campo',
                        campo: 'cvv',
                        valor: soloDigitos(ev.target.value).slice(0, 3),
                      })
                    }
                  />
                </span>
              )}
            </div>
            {mostrar('vence') && <span className="field-error">{errores.vence}</span>}
            {mostrar('cvv') && <span className="field-error">{errores.cvv}</span>}
          </div>
        )}

        <div className={campoCls('moneda')} data-error={Boolean(mostrar('moneda'))}>
          <span className="field-label">
            Moneda o activo{editando && ' (no se puede cambiar en una cuenta existente)'}
          </span>
          <div className="chips">
            {opcionesMoneda.map((m) => (
              <button
                key={m}
                type="button"
                className={e.moneda === m && !otraMoneda ? 'chip active' : 'chip'}
                aria-pressed={e.moneda === m}
                disabled={editando || (e.instrumento === 'divisas' && m === 'VES')}
                onClick={() => {
                  setOtraMoneda(false)
                  dispatch({ tipo: 'moneda', valor: m })
                }}
              >
                {m}
              </button>
            ))}
            {!editando && (
              <button
                type="button"
                className={otraMoneda ? 'chip active' : 'chip'}
                onClick={() => setOtraMoneda((v) => !v)}
              >
                Otra…
              </button>
            )}
          </div>
          {otraMoneda && !editando && (
            <input
              className="input mono"
              placeholder="Código (ej. MXN, GBP, SOL)"
              maxLength={10}
              autoCapitalize="characters"
              value={e.moneda}
              onChange={(ev) =>
                dispatch({
                  tipo: 'moneda',
                  valor: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                })
              }
            />
          )}
          {mostrar('moneda') && <span className="field-error">{errores.moneda}</span>}
        </div>

        {e.cuentaMadre && madre ? (
          <div className="linked-balance">
            <Link2 size={18} aria-hidden="true" />
            <div>
              <strong>Usa el saldo de {madre.nombre}</strong>
              <span className="muted">{formatMoney(madre.saldo, madre.moneda)} disponibles</span>
            </div>
          </div>
        ) : (
          <label className="field-block">
            <span className="field-label">Saldo inicial ({e.moneda})</span>
            {decimal ? (
              <input
                className="input money"
                inputMode="decimal"
                placeholder="0.00000000"
                value={e.saldo}
                onChange={(ev) => {
                  const v = ev.target.value.replace(',', '.')
                  if (/^\d{0,14}(\.\d{0,8})?$/.test(v)) {
                    dispatch({ tipo: 'campo', campo: 'saldo', valor: v })
                  }
                }}
              />
            ) : (
              <input
                className="input money"
                inputMode="numeric"
                placeholder={formatMoney(0, e.moneda)}
                value={e.saldo ? formatMoney(saldo, e.moneda) : ''}
                onChange={(ev) =>
                  dispatch({
                    tipo: 'campo',
                    campo: 'saldo',
                    valor: soloDigitos(ev.target.value).replace(/^0+/, '').slice(0, 14),
                  })
                }
              />
            )}
          </label>
        )}

        {esTarjeta && (candidatos.length > 0 || madre) && (
          <label className="field-block">
            <span className="field-label">Cuenta madre (de dónde sale el saldo)</span>
            <span className="field-icon">
              <Link2 size={18} aria-hidden="true" />
              <select
                className="select-bare"
                value={e.cuentaMadre}
                onChange={(ev) => {
                  madreTocada.current = true
                  dispatch({ tipo: 'campo', campo: 'cuentaMadre', valor: ev.target.value })
                }}
              >
                <option value="">Sin vincular (saldo propio)</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {formatMoney(c.saldo, c.moneda)}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}

        {esTarjeta && !e.cuentaMadre && e.bancoClase !== 'banco' && e.banco && (
          <p className="privacy-note note-info">
            <Info size={16} aria-hidden="true" />
            {candidatos.length > 0
              ? `Las tarjetas de ${e.banco} gastan el saldo de tu cuenta en ${e.banco}. Vincúlala arriba para que comparta ese saldo y no se cuente dos veces.`
              : `Las tarjetas de ${e.banco} gastan el saldo de tu cuenta en ${e.banco}. Registra primero esa cuenta (en ${e.moneda}) para poder vincularla; si no, deja el saldo en 0.`}
          </p>
        )}

        {esVE && (
          <div className="field-block" data-error={Boolean(mostrar('telefono'))}>
            <button
              type="button"
              className={e.pagoMovil ? 'switch on' : 'switch'}
              role="switch"
              aria-checked={e.pagoMovil}
              onClick={() => dispatch({ tipo: 'campo', campo: 'pagoMovil', valor: !e.pagoMovil })}
            >
              <Smartphone size={18} aria-hidden="true" />
              <span>Afiliada a Pago Móvil</span>
              <span className="switch-knob" aria-hidden="true" />
            </button>
            {e.pagoMovil && (
              <div className="phone-row">
                <select className="input" value={e.opTel} onChange={set('opTel')} aria-label="Operadora">
                  {OPERADORAS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="1234567"
                  aria-label="Teléfono de Pago Móvil"
                  value={e.telefono}
                  onChange={(ev) =>
                    dispatch({
                      tipo: 'campo',
                      campo: 'telefono',
                      valor: soloDigitos(ev.target.value).slice(0, 7),
                    })
                  }
                />
              </div>
            )}
            {mostrar('telefono') && <span className="field-error">{errores.telefono}</span>}
          </div>
        )}

        {editando && (
          <button
            type="button"
            className={e.activa ? 'switch on' : 'switch'}
            role="switch"
            aria-checked={e.activa}
            onClick={() => dispatch({ tipo: 'campo', campo: 'activa', valor: !e.activa })}
          >
            <Wallet size={18} aria-hidden="true" />
            <span>Cuenta activa (suma en tu balance)</span>
            <span className="switch-knob" aria-hidden="true" />
          </button>
        )}

        <p className="privacy-note">
          <ShieldCheck size={16} aria-hidden="true" />
          {info.sinNumero
            ? 'Luz guarda solo el correo, teléfono o usuario que indiques; nunca contraseñas ni claves API.'
            : 'Por seguridad, Luz solo guarda los últimos 4 dígitos. El número completo y el CVV se descartan al guardar.'}
        </p>

        {errorApi && (
          <p className="form-error" role="alert">
            {errorApi}
          </p>
        )}

        <ActionButton
          full
          loading={guardando && !registrado}
          disabled={guardando}
          className={registrado ? 'btn-haptic saved' : 'btn-haptic'}
        >
          {registrado
            ? editando
              ? 'Cambios guardados'
              : 'Cuenta registrada'
            : editando
              ? 'Guardar cambios'
              : 'Registrar cuenta'}
        </ActionButton>
      </form>
    </div>
  )
}
