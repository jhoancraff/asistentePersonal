// Países (ISO 3166-1 alfa-2). Los nombres salen de Intl.DisplayNames, localizados al español.
const CODIGOS =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

// Primero los países que más usa este proyecto.
const PRIORIDAD = ['VE', 'CO', 'US', 'PA', 'ES']

// Moneda sugerida por país (ISO 4217). Si falta, se deja la actual.
export const MONEDA_POR_PAIS = {
  VE: 'VES', CO: 'COP', US: 'USD', PA: 'USD', EC: 'USD', SV: 'USD', PR: 'USD',
  ES: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR',
  MX: 'MXN', AR: 'ARS', BR: 'BRL', CL: 'CLP', PE: 'PEN', UY: 'UYU', BO: 'BOB', PY: 'PYG',
  DO: 'DOP', CR: 'CRC', GT: 'GTQ', HN: 'HNL', CA: 'CAD', GB: 'GBP', CH: 'CHF', CN: 'CNY',
  JP: 'JPY', AU: 'AUD',
}

const nombres = new Intl.DisplayNames(['es'], { type: 'region' })

function nombrePais(codigo) {
  try {
    return nombres.of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

export const PAISES = (() => {
  const todos = CODIGOS.split(/\s+/).map((codigo) => ({ codigo, nombre: nombrePais(codigo) }))
  const prioritarios = PRIORIDAD.map((c) => todos.find((p) => p.codigo === c)).filter(Boolean)
  const resto = todos
    .filter((p) => !PRIORIDAD.includes(p.codigo))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return [...prioritarios, ...resto]
})()

export const nombreDePais = (codigo) => (codigo ? nombrePais(codigo) : 'Global')
