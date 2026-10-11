const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export const formatCOP = (n) => cop.format(Number(n) || 0)

const dosDecimales = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

// Activos cripto: decimales habituales al mostrarlos y al teclearlos.
const DECIMALES_CRIPTO = { USDT: 2, USDC: 2, BTC: 8, ETH: 6, BNB: 6 }

/** Formatea un monto según la moneda (VES, USD, COP, EUR…, USDT, BTC…). */
export function formatMoney(n, moneda = 'VES') {
  const v = Number(n) || 0
  if (moneda === 'VES') return `Bs. ${v.toLocaleString('es-VE', dosDecimales)}`
  if (moneda === 'USD') return `US$ ${v.toLocaleString('es-VE', dosDecimales)}`
  if (moneda === 'COP') return formatCOP(v)
  if (moneda in DECIMALES_CRIPTO) {
    const d = DECIMALES_CRIPTO[moneda]
    return `${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: d })} ${moneda}`
  }
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(v)
  } catch {
    return `${v.toLocaleString('es-VE', dosDecimales)} ${moneda}`
  }
}

/** Decimales con los que se teclean los montos de cada moneda. */
export function decimalesMoneda(moneda) {
  if (moneda === 'COP') return 0
  if (moneda in DECIMALES_CRIPTO) return DECIMALES_CRIPTO[moneda]
  return 2
}

export function saludo(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const pad = (n) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' en hora local. */
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Date → valor para <input type="datetime-local">. */
export const toInputLocal = (d) => `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** 'YYYY-MM-DD' → Date local (sin desfase de zona horaria). */
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const mismoDia = (a, b) => a.toDateString() === b.toDateString()

export function fechaRelativa(iso) {
  const d = parseISODate(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (mismoDia(d, hoy)) return 'Hoy'
  if (mismoDia(d, ayer)) return 'Ayer'
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

export function cuentaRegresiva(iso) {
  const min = Math.round((new Date(iso) - Date.now()) / 60000)
  if (min <= 0) return 'Ahora'
  if (min < 60) return `En ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `En ${h} h ${min % 60} min`
  return `En ${Math.floor(h / 24)} d`
}

/** Lunes de la semana de `date`. */
export function inicioSemana(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
