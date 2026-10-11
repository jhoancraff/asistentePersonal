"""Validación de documentos de identidad venezolanos (cédula y RIF)."""
import re

from django.core.exceptions import ValidationError

# Valor de cada letra para el cálculo del dígito verificador del RIF (SENIAT).
VALOR_LETRA = {"V": 1, "E": 2, "J": 3, "P": 4, "G": 5}
PESOS = (3, 2, 7, 6, 5, 4, 3, 2)


def digito_verificador_rif(letra: str, cuerpo: str) -> int:
    """Calcula el dígito verificador de un RIF (letra + 8 dígitos)."""
    suma = VALOR_LETRA[letra] * 4 + sum(int(d) * p for d, p in zip(cuerpo, PESOS))
    digito = 11 - (suma % 11)
    return 0 if digito >= 10 else digito


def rif_valido(letra: str, digitos: str) -> bool:
    """`digitos` son los 9 dígitos del RIF (8 de cuerpo + verificador)."""
    if letra not in VALOR_LETRA or not re.fullmatch(r"\d{9}", digitos):
        return False
    return digito_verificador_rif(letra, digitos[:8]) == int(digitos[8])


def validar_documento(valor: str) -> str:
    """Acepta '', 'V-12345678' (cédula) o 'J-070133805' (RIF con verificador)."""
    if not valor:
        return valor
    m = re.fullmatch(r"([VEJGP])-?(\d{5,10})", valor.upper())
    if not m:
        raise ValidationError("Documento inválido. Usa el formato V-12345678.")
    letra, numero = m.groups()
    if len(numero) == 9:
        if not rif_valido(letra, numero):
            raise ValidationError("El dígito verificador del RIF no es válido.")
    elif letra in ("J", "G", "P"):
        raise ValidationError("El RIF debe tener 9 dígitos (8 + dígito verificador).")
    elif len(numero) > 8:
        raise ValidationError("La cédula no puede tener más de 8 dígitos.")
    return f"{letra}-{numero}"
