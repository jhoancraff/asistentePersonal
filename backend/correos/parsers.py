"""Extractores de notificaciones bancarias por correo.

SEGURIDAD: el texto de un correo es contenido NO confiable. Aquí solo se aplican patrones
fijos (expresiones regulares); jamás se envía a un modelo de IA ni se interpreta como
instrucciones. Si el formato no coincide exactamente, no se registra nada.
"""
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from email.utils import parseaddr


@dataclass(frozen=True)
class Operacion:
    banco: str  # nombre tal como se busca en Cuenta.banco (sin distinguir mayúsculas)
    tipo: str  # "gasto" | "ingreso"
    descripcion: str  # p. ej. "Pago Móvil"
    monto: Decimal
    fecha: date
    referencia: str
    digitos_cuenta: str  # últimos 4 dígitos de la cuenta de la operación


def normalizar(texto: str) -> str:
    return re.sub(r"\s+", " ", (texto or "").replace("\xa0", " ")).strip()


def monto_ve(texto: str) -> Decimal:
    """'3.210,00' → Decimal('3210.00')."""
    return Decimal(texto.replace(".", "").replace(",", "."))


_BANCAMIGA_SALIDA = re.compile(
    r"(?:El|La)\s+(?P<operacion>[^.\d]{3,40}?)\s+desde\s+la\s+Cuenta\s+Nro\.?\s*"
    r"(?P<cuenta>[\d*\-]{8,40})\s+por\s+(?P<monto>\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s+"
    r"el\s+(?P<dia>\d{2})/(?P<mes>\d{2})/(?P<anio>\d{4})\s+\d{2}:\d{2}(?::\d{2})?\s+"
    r"ha\s+sido\s+procesad[oa]\s+con\s+[ée]xito",
    re.IGNORECASE,
)
_REFERENCIA = re.compile(r"\bRef\.?\s*:?\s*(?P<ref>\d{4,20})\b", re.IGNORECASE)


def parsear_bancamiga(texto: str) -> Operacion | None:
    t = normalizar(texto)
    m = _BANCAMIGA_SALIDA.search(t)
    ref = _REFERENCIA.search(t)
    if not m or not ref:
        return None
    digitos = re.sub(r"\D", "", m["cuenta"])[-4:]
    if len(digitos) < 4:
        return None
    try:
        fecha = date(int(m["anio"]), int(m["mes"]), int(m["dia"]))
        monto = monto_ve(m["monto"])
    except (ValueError, ArithmeticError):
        return None
    if monto <= 0:
        return None
    return Operacion(
        banco="bancamiga",
        tipo="gasto",
        descripcion=m["operacion"].strip().title(),
        monto=monto,
        fecha=fecha,
        referencia=ref["ref"],
        digitos_cuenta=digitos,
    )


# dominio del remitente → extractor. Para soportar otro banco: agrega su dominio y su extractor.
PARSERS = {"bancamiga.com": parsear_bancamiga}


def dominio_remitente(remitente: str) -> str:
    direccion = parseaddr(remitente or "")[1].lower()
    return direccion.rsplit("@", 1)[-1] if "@" in direccion else ""


def autenticado(cabecera: str, dominio: str) -> bool:
    """Comprueba el resultado que Gmail registró al recibir el correo (SPF/DKIM/DMARC).

    Evita que un correo falso que solo *dice* venir del banco cree movimientos.
    """
    c = (cabecera or "").lower()
    dom = re.escape(dominio.lower())
    dmarc = re.search(rf"dmarc=pass[^;]*header\.from={dom}\b", c)
    dkim = re.search(rf"dkim=pass[^;]*header\.(?:i=@|d=)(?:[\w.-]*\.)?{dom}\b", c)
    return bool(dmarc or dkim)
