"""Registro de acciones expuestas a la IA.

Cada función de la app que el asistente (chat/voz) podrá invocar se registra
con @accion. Hoy solo es un catálogo; cuando se agregue el agente, este
registro se convertirá en sus "tools" sin tocar los módulos de negocio.

    @accion("finanzas.crear_movimiento", "Registra un ingreso o gasto")
    def crear_movimiento(usuario, **datos): ...
"""
from dataclasses import dataclass
from typing import Callable

ACCIONES: dict[str, "Accion"] = {}


@dataclass(frozen=True)
class Accion:
    nombre: str
    descripcion: str
    funcion: Callable


def accion(nombre: str, descripcion: str):
    def decorador(funcion):
        ACCIONES[nombre] = Accion(nombre, descripcion, funcion)
        return funcion

    return decorador


def ejecutar(nombre: str, usuario, **parametros):
    if nombre not in ACCIONES:
        raise KeyError(f"Acción desconocida: {nombre}")
    return ACCIONES[nombre].funcion(usuario, **parametros)
