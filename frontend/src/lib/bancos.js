// Bancos venezolanos (respaldo local, sirve también sin red).
// El catálogo completo viene de la API: /api/finanzas/proveedores/.
// `tema` selecciona el estilo visual de la tarjeta (data-bank en CSS).
export const BANCOS = [
  { codigo: '0134', nombre: 'Banesco', tema: 'banesco' },
  { codigo: '0102', nombre: 'Banco de Venezuela (BDV)', corto: 'BDV', tema: 'bdv' },
  { codigo: '0105', nombre: 'Mercantil', tema: 'mercantil' },
  { codigo: '0108', nombre: 'BBVA Provincial', corto: 'Provincial', tema: 'provincial' },
  { codigo: '0172', nombre: 'Bancamiga', tema: 'bancamiga' },
  { codigo: '0191', nombre: 'BNC', tema: 'bnc' },
  { codigo: '0114', nombre: 'Bancaribe', tema: 'generico' },
  { codigo: '0115', nombre: 'Banco Exterior', tema: 'generico' },
  { codigo: '0116', nombre: 'BOD', tema: 'generico' },
  { codigo: '0174', nombre: 'Banplus', tema: 'generico' },
  { codigo: '0163', nombre: 'Banco del Tesoro', tema: 'generico' },
  { codigo: '0175', nombre: 'Bicentenario', tema: 'generico' },
  { codigo: '0171', nombre: 'Banco Activo', tema: 'generico' },
  { codigo: '0151', nombre: 'BFC', tema: 'generico' },
  { codigo: '0138', nombre: 'Banco Plaza', tema: 'generico' },
  { codigo: '0137', nombre: 'Sofitasa', tema: 'generico' },
  { codigo: '0168', nombre: 'Bancrecer', tema: 'generico' },
  { codigo: '0156', nombre: '100% Banco', tema: 'generico' },
  { codigo: '0169', nombre: 'Mi Banco', tema: 'generico' },
  { codigo: '0128', nombre: 'Banco Caroní', tema: 'generico' },
  { codigo: '0104', nombre: 'Venezolano de Crédito', tema: 'generico' },
  { codigo: '0166', nombre: 'Banco Agrícola', tema: 'generico' },
  { codigo: '0177', nombre: 'BANFANB', tema: 'generico' },
]

export const bancoPorCodigo = (codigo) => BANCOS.find((b) => b.codigo === codigo) ?? null
export const bancoPorNombre = (nombre) => BANCOS.find((b) => b.nombre === nombre) ?? null

/**
 * Tipos de instrumento. `clase` es la clase de institución en el catálogo
 * (banco | billetera | cripto). `sinNumero`: no hay número de cuenta/tarjeta,
 * se identifica con un correo, teléfono o usuario.
 */
export const INSTRUMENTOS = {
  debito: { label: 'Débito', largo: 'Tarjeta de débito', esTarjeta: true, clase: 'banco' },
  credito: { label: 'Crédito', largo: 'Tarjeta de crédito', esTarjeta: true, clase: 'banco' },
  cuenta: { label: 'Cuenta', largo: 'Cuenta bancaria', esTarjeta: false, clase: 'banco' },
  divisas: { label: 'Divisas', largo: 'Cuenta en divisas', esTarjeta: false, clase: 'banco' },
  billetera: {
    label: 'Billetera',
    largo: 'Billetera digital',
    esTarjeta: false,
    clase: 'billetera',
    sinNumero: true,
  },
  cripto: {
    label: 'Cripto',
    largo: 'Exchange o billetera cripto',
    esTarjeta: false,
    clase: 'cripto',
    sinNumero: true,
  },
}

export const OPERADORAS = ['0412', '0414', '0416', '0422', '0424', '0426']

// Monedas frecuentes. Cualquier otro código ISO 4217 se puede escribir a mano.
export const MONEDAS_FIAT = ['VES', 'USD', 'COP', 'EUR']
export const MONEDAS_CRIPTO = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']
export const esCripto = (m) => MONEDAS_CRIPTO.includes(m)

export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

/** 20 dígitos → 0134-1234-56-1234567890 */
export function formatCuenta(digitos) {
  const d = soloDigitos(digitos).slice(0, 20)
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8, 10), d.slice(10, 20)].filter(Boolean).join('-')
}

/** 16 dígitos → bloques de 4 */
export function formatTarjeta(digitos) {
  return (soloDigitos(digitos).slice(0, 16).match(/.{1,4}/g) ?? []).join(' ')
}

/** Detecta la franquicia por BIN: visa | mastercard | maestro | '' */
export function detectarRed(digitos) {
  const d = soloDigitos(digitos)
  if (!d) return ''
  if (d[0] === '4') return 'visa'
  const dos = Number(d.slice(0, 2))
  const cuatro = Number(d.slice(0, 4))
  if ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720)) return 'mastercard'
  if (d[0] === '5' || d[0] === '6') return 'maestro' // 50, 56–69: Maestro / débito
  return ''
}

/** Algoritmo de Luhn para tarjetas. */
export function luhnValido(digitos) {
  const d = soloDigitos(digitos)
  if (d.length < 13) return false
  let suma = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    suma += n
  }
  return suma % 10 === 0
}

/** IBAN (ISO 13616): longitud 15–34 y control mod-97. */
export function ibanValido(texto) {
  const iban = String(texto ?? '').replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const reordenado = iban.slice(4) + iban.slice(0, 4)
  let resto = 0
  for (const ch of reordenado) {
    const valor = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of valor) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

/** Enmascara todo menos los últimos 4 dígitos, conservando el formato. */
export function enmascarar(texto) {
  const total = (texto.match(/\d/g) ?? []).length
  let visto = 0
  return texto.replace(/\d/g, (c) => {
    visto += 1
    return total - visto < 4 ? c : '•'
  })
}

/** Oculta un correo, teléfono o usuario: j•••@gmail.com, ••••4567, ab•••yz. */
export function enmascararIdentificador(valor) {
  const v = String(valor ?? '').trim()
  if (!v) return ''
  if (v.includes('@')) {
    const [local, dominio] = v.split('@')
    return `${local.slice(0, 1)}•••@${dominio}`
  }
  const digitos = soloDigitos(v)
  if (digitos.length >= 7) return `••••${digitos.slice(-4)}`
  return v.length <= 4 ? '••••' : `${v.slice(0, 2)}•••${v.slice(-2)}`
}
