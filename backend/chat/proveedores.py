"""Clientes de los proveedores de IA (API compatible con OpenAI).

Orden de preferencia en settings.IA_PROVEEDORES (por defecto: groq, gemini). Si uno falla
por límite de uso (429), llave inválida, región, red o error del servidor, se prueba el
siguiente. Nunca se registran las llaves ni el contenido de los mensajes.
"""
import json
import logging
import time
import uuid

import requests
from django.conf import settings

log = logging.getLogger(__name__)

DEFINICIONES = {
    "groq": {
        "etiqueta": "Groq",
        "url": "https://api.groq.com/openai/v1",
        "url_ajuste": "GROQ_BASE_URL",
        "clave": "GROQ_API_KEY",
        "modelo": "GROQ_MODEL",
    },
    "gemini": {
        "etiqueta": "Google Gemini",
        "url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "url_ajuste": "GEMINI_BASE_URL",
        "clave": "GEMINI_API_KEY",
        "modelo": "GEMINI_MODEL",
    },
}


class ErrorProveedor(Exception):
    """Falló el proveedor (se intentará con el siguiente).

    `transitorio`: fallo pasajero (red o 5xx) que merece un reintento antes de cambiar.
    """

    def __init__(self, mensaje, transitorio=False):
        super().__init__(mensaje)
        self.transitorio = transitorio


class IANoConfigurada(Exception):
    """No hay ninguna llave de proveedor definida."""


def configurados() -> list[dict]:
    """Proveedores con llave definida, en orden de preferencia."""
    lista = []
    for pid in settings.IA_PROVEEDORES:
        d = DEFINICIONES.get(pid.strip().lower())
        if not d:
            continue
        clave = getattr(settings, d["clave"], "")
        if clave:
            lista.append(
                {
                    "id": pid.strip().lower(),
                    "etiqueta": d["etiqueta"],
                    "url": (getattr(settings, d["url_ajuste"], "") or d["url"]).rstrip("/"),
                    "clave": clave,
                    "modelo": getattr(settings, d["modelo"]),
                }
            )
    return lista


def estado() -> dict:
    """Estado no sensible, para mostrar en la app."""
    c = configurados()
    return {
        "configurada": bool(c),
        "proveedores": [{"id": p["id"], "etiqueta": p["etiqueta"], "modelo": p["modelo"]} for p in c],
    }


def _motivo(r, p: dict) -> str:
    """Mensaje de error del proveedor (acotado y sin la llave)."""
    try:
        data = r.json()
        if isinstance(data, list) and data:
            data = data[0]
        err = data.get("error", data)
        texto = err.get("message") if isinstance(err, dict) else str(err)
    except ValueError:
        texto = r.text
    texto = (texto or "sin detalle").replace(p["clave"], "***").strip().replace("\n", " ")
    return texto[:200]


def modelos(p: dict) -> list[str]:
    """Ids de los modelos disponibles para la llave de este proveedor."""
    try:
        r = requests.get(
            f"{p['url']}/models",
            headers={"Authorization": f"Bearer {p['clave']}"},
            timeout=settings.IA_TIMEOUT_SEGUNDOS,
        )
        r.raise_for_status()
        return sorted(m.get("id", "").removeprefix("models/") for m in r.json().get("data", []))
    except (requests.RequestException, ValueError):
        return []


def _normalizar(data: dict, proveedor: str) -> dict:
    try:
        msg = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ErrorProveedor("Respuesta inesperada del proveedor.") from exc
    llamadas = []
    for i, tc in enumerate(msg.get("tool_calls") or []):
        fn = tc.get("function") or {}
        args = fn.get("arguments", "{}")
        if not isinstance(args, str):
            args = json.dumps(args)
        llamada = {
            "id": tc.get("id") or f"call_{uuid.uuid4().hex[:12]}_{i}",
            "nombre": fn.get("name", ""),
            "argumentos": args or "{}",
        }
        # Gemini 3 exige devolver su "thought_signature" al continuar una llamada de herramienta.
        if tc.get("extra_content"):
            llamada["extra"] = tc["extra_content"]
        llamadas.append(llamada)
    uso = data.get("usage") or {}
    return {
        "contenido": msg.get("content") or "",
        "llamadas": llamadas,
        "proveedor": proveedor,
        "uso": {
            "entrada": uso.get("prompt_tokens"),
            "salida": uso.get("completion_tokens"),
        },
    }


def _llamar(p: dict, mensajes: list, herramientas: list) -> dict:
    cuerpo = {
        "model": p["modelo"],
        "messages": mensajes,
        "temperature": 0.2,
        "max_tokens": 700,
    }
    # Los gpt-oss "razonan" y esos tokens cuentan contra el límite por minuto: esfuerzo bajo.
    if p["modelo"].startswith("openai/gpt-oss"):
        cuerpo["reasoning_effort"] = "low"
    if herramientas:
        cuerpo["tools"] = herramientas
        cuerpo["tool_choice"] = "auto"
    try:
        r = requests.post(
            f"{p['url']}/chat/completions",
            headers={"Authorization": f"Bearer {p['clave']}", "Content-Type": "application/json"},
            json=cuerpo,
            timeout=settings.IA_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as exc:
        raise ErrorProveedor(f"sin conexión ({type(exc).__name__})", transitorio=True) from exc
    if r.status_code in (401, 403):
        raise ErrorProveedor("llave rechazada o región no permitida")
    if r.status_code == 429:
        raise ErrorProveedor("límite de uso alcanzado")
    if r.status_code >= 500:
        raise ErrorProveedor(f"error del servidor ({r.status_code})", transitorio=True)
    if r.status_code >= 400:
        # 400/404/422: modelo inexistente o formato rechazado.
        raise ErrorProveedor(f"petición rechazada ({r.status_code}): {_motivo(r, p)}")
    try:
        resultado = _normalizar(r.json(), p["id"])
        log.info("IA: %s %s tokens=%s", p["id"], p["modelo"], resultado["uso"])
        return resultado
    except ValueError as exc:
        raise ErrorProveedor("respuesta no es JSON") from exc


def _aplanar(mensajes: list) -> list:
    """Convierte las llamadas/resultados de herramientas en texto plano.

    Al cambiar de proveedor a mitad de un turno, el nuevo no reconoce las llamadas hechas por
    el anterior (p. ej. Gemini pide firmas de pensamiento); en texto plano las entiende todas.
    """
    salida = []
    for m in mensajes:
        if m.get("role") == "assistant" and m.get("tool_calls"):
            llamadas = "; ".join(
                f"{tc['function']['name']}({tc['function']['arguments']})" for tc in m["tool_calls"]
            )
            salida.append(
                {"role": "assistant", "content": ((m.get("content") or "") + f" [Consulté: {llamadas}]").strip()}
            )
        elif m.get("role") == "tool":
            salida.append({"role": "user", "content": f"[Resultado de la herramienta]: {m['content']}"})
        else:
            salida.append(m)
    return salida


def chat(mensajes: list, herramientas: list) -> dict:
    """Pide una respuesta al primer proveedor disponible.

    Devuelve {"contenido", "llamadas": [{id, nombre, argumentos}], "proveedor"}.
    """
    proveedores = configurados()
    if not proveedores:
        raise IANoConfigurada("No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas.")
    errores = []
    for orden, p in enumerate(proveedores):
        # El primer proveedor recibe el formato nativo; los de respaldo, texto plano.
        enviados = mensajes if orden == 0 else _aplanar(mensajes)
        for intento in (1, 2):
            try:
                return _llamar(p, enviados, herramientas)
            except ErrorProveedor as exc:
                log.warning("IA: %s falló (intento %s): %s", p["id"], intento, exc)
                if exc.transitorio and intento == 1:
                    time.sleep(1.0)  # un solo reintento ante sobrecarga o red
                    continue
                errores.append(f"{p['etiqueta']}: {exc}")
                break
    raise ErrorProveedor("; ".join(errores))
