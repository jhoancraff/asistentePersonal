// Validación de cédula y RIF venezolanos (misma lógica que backend/finanzas/validators.py).
const VALOR_LETRA = { V: 1, E: 2, J: 3, P: 4, G: 5 }
const PESOS = [3, 2, 7, 6, 5, 4, 3, 2]

export function digitoVerificadorRif(letra, cuerpo) {
  const suma =
    VALOR_LETRA[letra] * 4 + PESOS.reduce((acc, peso, i) => acc + Number(cuerpo[i]) * peso, 0)
  const digito = 11 - (suma % 11)
  return digito >= 10 ? 0 : digito
}

/**
 * Valida el documento según la letra:
 *  - 9 dígitos  → RIF: se comprueba el dígito verificador.
 *  - V/E 5–8    → cédula (no lleva dígito verificador).
 *  - J/G        → siempre RIF de 9 dígitos.
 * Devuelve { ok, esRif, mensaje }.
 */
export function validarDocumento(letra, numero) {
  if (!numero) return { ok: false, esRif: false, mensaje: 'Ingresa tu cédula o RIF.' }
  if (numero.length === 9) {
    const ok = digitoVerificadorRif(letra, numero.slice(0, 8)) === Number(numero[8])
    return ok
      ? { ok: true, esRif: true, mensaje: '' }
      : { ok: false, esRif: true, mensaje: 'El dígito verificador del RIF no es válido.' }
  }
  if (letra === 'J' || letra === 'G') {
    return { ok: false, esRif: true, mensaje: 'El RIF debe tener 9 dígitos (8 + verificador).' }
  }
  if (numero.length < 5 || numero.length > 8) {
    return { ok: false, esRif: false, mensaje: 'La cédula debe tener entre 5 y 8 dígitos.' }
  }
  return { ok: true, esRif: false, mensaje: '' }
}
