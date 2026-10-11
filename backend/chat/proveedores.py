"""Clientes de los proveedores de IA (API compatible con OpenAI).

Orden de preferencia en settings.IA_PROVEEDORES (por defecto: groq, gemini). Si uno falla
por límite de uso (429), llave inválida, región, red o error del servidor, se prueba el
siguiente. Nunca se registran las llaves ni el contenido de los mensajes.
"""
import json
import logging
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
    """Falló el proveedor (se intentará con el siguiente)."""


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
        llamadas.append(
            {
                "id": tc.get("id") or f"call_{uuid.uuid4().hex[:12]}_{i}",
                "nombre": fn.get("name", ""),
                "argumentos": args or "{}",
            }
        )
    return {"contenido": msg.get("content") or "", "llamadas": llamadas, "proveedor": proveedor}


def _llamar(p: dict, mensajes: list, herramientas: list) -> dict:
    cuerpo = {
        "model": p["modelo"],
        "messages": mensajes,
        "temperature": 0.2,
        "max_tokens": 900,
    }
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
        raise ErrorProveedor(f"sin conexión ({type(exc).__name__})") from exc
    if r.status_code in (401, 403):
        raise ErrorProveedor("llave rechazada o región no permitida")
    if r.status_code == 429:
        raise ErrorProveedor("límite de uso alcanzado")
    if r.status_code >= 500:
        raise ErrorProveedor(f"error del servidor ({r.status_code})")
    if r.status_code >= 400:
        # 400/404/422: modelo inexistente o formato rechazado; no se imprime el contenido
        raise ErrorProveedor(f"petición rechazada ({r.status_code})")
    try:
        return _normalizar(r.json(), p["id"])
    except ValueError as exc:
        raise ErrorProveedor("respuesta no es JSON") from exc


def chat(mensajes: list, herramientas: list) -> dict:
    """Pide una respuesta al primer proveedor disponible.

    Devuelve {"contenido", "llamadas": [{id, nombre, argumentos}], "proveedor"}.
    """
    proveedores = configurados()
    if not proveedores:
        raise IANoConfigurada("No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas.")
    errores = []
    for p in proveedores:
        try:
            return _llamar(p, mensajes, herramientas)
        except ErrorProveedor as exc:
            log.warning("IA: %s falló: %s", p["id"], exc)
            errores.append(f"{p['etiqueta']}: {exc}")
    raise ErrorProveedor("; ".join(errores))
