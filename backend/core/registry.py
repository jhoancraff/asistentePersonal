"""Registro de acciones (herramientas) que el agente de IA puede usar.

Cada acción declara:
- `parametros`: esquema JSON de sus argumentos (lo recibe el modelo).
- `escribe`: True si crea, edita o elimina datos. El agente NUNCA ejecuta estas por sí
  solo: se guardan como "acción pendiente" y solo corren cuando el usuario confirma.
- `preparar(usuario, argumentos) -> (argumentos_normalizados, resumen)`: valida los
  argumentos del modelo (son datos NO confiables), resuelve referencias (cuenta por
  nombre, etc.) y devuelve un resumen legible para pedir confirmación.

    @accion("finanzas.crear_movimiento", "Registra un gasto o ingreso",
            parametros={...}, escribe=True, preparar=_preparar)
    def crear_movimiento(usuario, **datos): ...
"""
from dataclasses import dataclass, field
from typing import Callable, Optional

ACCIONES: dict[str, "Accion"] = {}

PARAMETROS_VACIOS = {"type": "object", "properties": {}}


@dataclass(frozen=True)
class Accion:
    nombre: str
    descripcion: str
    funcion: Callable
    parametros: dict = field(default_factory=lambda: dict(PARAMETROS_VACIOS))
    escribe: bool = False
    preparar: Optional[Callable] = None


def accion(
    nombre: str,
    descripcion: str,
    parametros: Optional[dict] = None,
    escribe: bool = False,
    preparar: Optional[Callable] = None,
):
    def decorador(funcion):
        ACCIONES[nombre] = Accion(
            nombre=nombre,
            descripcion=descripcion,
            funcion=funcion,
            parametros=parametros or dict(PARAMETROS_VACIOS),
            escribe=escribe,
            preparar=preparar,
        )
        return funcion

    return decorador


def nombre_para_modelo(nombre: str) -> str:
    """Los proveedores solo admiten [a-zA-Z0-9_-] en nombres de herramienta."""
    return nombre.replace(".", "__")


def nombre_desde_modelo(nombre: str) -> str:
    return nombre.replace("__", ".")


def herramientas_openai(nombres=None) -> list[dict]:
    """Catálogo en el formato de 'tools' compatible con OpenAI (Groq, Gemini…).

    `nombres`: si se indica, solo esas acciones (menos tokens por llamada).
    """
    return [
        {
            "type": "function",
            "function": {
                "name": nombre_para_modelo(a.nombre),
                "description": a.descripcion,
                "parameters": a.parametros,
            },
        }
        for a in ACCIONES.values()
        if nombres is None or a.nombre in nombres
    ]


def obtener(nombre: str) -> Accion:
    if nombre not in ACCIONES:
        raise KeyError(f"Acción desconocida: {nombre}")
    return ACCIONES[nombre]


def ejecutar(nombre: str, usuario, **parametros):
    return obtener(nombre).funcion(usuario, **parametros)
