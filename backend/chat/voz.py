"""Voz de entrada: transcripción de audio a texto con Whisper (Groq).

El audio se envía a Groq solo para transcribirse; el texto resultante entra al mismo agente
que los mensajes escritos (con la misma confirmación para crear, editar o eliminar).
"""
import logging

import requests
from django.conf import settings

log = logging.getLogger(__name__)

# Orientan a Whisper hacia el vocabulario de la app (nombres de bancos, monedas, plataformas).
PISTA = (
    "Luz, asistente de finanzas personales. Bolívares, dólares, Banesco, Mercantil, "
    "Provincial, BDV, Bancamiga, Bancaribe, Zelle, Binance, Zinli, Pago Móvil, USDT."
)

# Whisper "alucina" frases típicas con silencio o ruido; se descartan.
ALUCINACIONES = (
    "gracias por ver",
    "subtítulos",
    "subtitulos",
    "amara.org",
    "suscríbete",
    "suscribete",
    "thanks for watching",
)


class VozError(Exception):
    """No se pudo transcribir el audio (mensaje apto para mostrar al usuario)."""


def disponible() -> bool:
    return bool(settings.GROQ_API_KEY)


def _base() -> str:
    return (settings.GROQ_BASE_URL or "https://api.groq.com/openai/v1").rstrip("/")


def _motivo(r) -> str:
    try:
        data = r.json()
        err = data.get("error", data)
        texto = err.get("message") if isinstance(err, dict) else str(err)
    except ValueError:
        texto = r.text
    return (texto or "sin detalle").replace(settings.GROQ_API_KEY, "***").strip()[:160]


def transcribir(contenido: bytes, nombre: str = "audio.webm", tipo: str = "audio/webm") -> str:
    """Devuelve el texto del audio. Lanza VozError con un motivo legible si falla."""
    if not disponible():
        raise VozError("falta GROQ_API_KEY para transcribir voz")
    if not contenido:
        raise VozError("el audio llegó vacío")

    modelos = []
    for m in (settings.GROQ_STT_MODEL, "whisper-large-v3"):
        if m and m not in modelos:
            modelos.append(m)

    ultimo = "sin respuesta"
    for modelo in modelos:
        try:
            r = requests.post(
                f"{_base()}/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                data={
                    "model": modelo,
                    "language": settings.VOZ_IDIOMA,
                    "temperature": "0",
                    "response_format": "json",
                    "prompt": PISTA,
                },
                files={"file": (nombre or "audio.webm", contenido, tipo or "application/octet-stream")},
                timeout=settings.IA_TIMEOUT_SEGUNDOS + 30,
            )
        except requests.RequestException as exc:
            ultimo = f"sin conexión ({type(exc).__name__})"
            log.warning("Voz: %s falló: %s", modelo, ultimo)
            continue
        if r.status_code == 200:
            try:
                texto = (r.json().get("text") or "").strip()
            except ValueError as exc:
                raise VozError("respuesta inesperada del transcriptor") from exc
            log.info("Voz: %s transcribió %s caracteres", modelo, len(texto))
            if any(a in texto.lower() for a in ALUCINACIONES) and len(texto) < 60:
                return ""
            return texto
        if r.status_code in (401, 403):
            raise VozError("llave rechazada o región no permitida")
        if r.status_code == 413:
            raise VozError("el audio es demasiado largo")
        if r.status_code in (400, 422):
            raise VozError(f"formato de audio no aceptado ({_motivo(r)})")
        ultimo = "límite de uso alcanzado" if r.status_code == 429 else f"error {r.status_code}"
        log.warning("Voz: %s falló: %s", modelo, ultimo)
    raise VozError(ultimo)
