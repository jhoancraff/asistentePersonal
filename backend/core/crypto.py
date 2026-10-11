"""Cifrado autenticado de campos sensibles (AES-256-GCM).

- Las claves viven en el entorno (FIELD_ENCRYPTION_KEYS), NUNCA en la base de datos.
- Formato:  enc:v1:<id_clave>:<base64url(nonce || cifrado+etiqueta)>
- `aad` (datos asociados) liga el cifrado a su contexto (cuenta, dueño, campo): un valor
  cifrado copiado a otra fila no se puede descifrar.
- Rotación: FIELD_ENCRYPTION_KEYS="nueva:<clave>,vieja:<clave>". Se cifra siempre con la
  primera y se descifra con cualquiera; `manage.py rotar_cifrado` re-cifra lo existente.
"""
import base64
import binascii
import os
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

PREFIJO = "enc"
VERSION = "v1"


class CifradoError(Exception):
    """Error de cifrado/descifrado (clave ausente, dato alterado, etc.)."""


class CifradoNoConfigurado(CifradoError):
    """No hay claves definidas en FIELD_ENCRYPTION_KEYS."""


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


@lru_cache(maxsize=4)
def _parsear(raw: str) -> tuple[str, dict[str, bytes]]:
    claves: dict[str, bytes] = {}
    activa = ""
    for item in filter(None, (x.strip() for x in raw.split(","))):
        if ":" not in item:
            raise CifradoError("FIELD_ENCRYPTION_KEYS: formato esperado 'id:clave'.")
        kid, valor = item.split(":", 1)
        try:
            clave = _b64d(valor)
        except (binascii.Error, ValueError) as exc:
            raise CifradoError(f"Clave '{kid}' no es base64 válido.") from exc
        if len(clave) != 32:
            raise CifradoError(f"Clave '{kid}' debe tener 32 bytes (256 bits).")
        claves[kid] = clave
        activa = activa or kid
    if not claves:
        raise CifradoNoConfigurado("Falta FIELD_ENCRYPTION_KEYS en el entorno.")
    return activa, claves


def _claves():
    return _parsear(getattr(settings, "FIELD_ENCRYPTION_KEYS", "") or "")


def generar_clave() -> str:
    """Una clave nueva de 256 bits, en base64url."""
    return _b64e(os.urandom(32))


def cifrar(texto: str, aad: str) -> str:
    activa, claves = _claves()
    nonce = os.urandom(12)
    datos = AESGCM(claves[activa]).encrypt(nonce, texto.encode("utf-8"), aad.encode("utf-8"))
    return f"{PREFIJO}:{VERSION}:{activa}:{_b64e(nonce + datos)}"


def descifrar(token: str, aad: str) -> str:
    try:
        prefijo, version, kid, carga = token.split(":", 3)
    except ValueError as exc:
        raise CifradoError("Valor cifrado con formato desconocido.") from exc
    if prefijo != PREFIJO or version != VERSION:
        raise CifradoError("Versión de cifrado no soportada.")
    _, claves = _claves()
    if kid not in claves:
        raise CifradoError(f"No hay clave '{kid}' para descifrar este valor.")
    try:
        crudo = _b64d(carga)
        return AESGCM(claves[kid]).decrypt(crudo[:12], crudo[12:], aad.encode("utf-8")).decode("utf-8")
    except (InvalidTag, binascii.Error, ValueError) as exc:
        raise CifradoError("El valor fue alterado o la clave no corresponde.") from exc


def clave_activa_id(token: str) -> str:
    return token.split(":", 3)[2] if token.count(":") >= 3 else ""
