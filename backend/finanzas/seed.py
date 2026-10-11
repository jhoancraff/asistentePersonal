"""Catálogo curado de instituciones (bancos, billeteras digitales y exchanges)."""
import json
from pathlib import Path

DATOS = Path(__file__).parent / "data" / "proveedores.json"


def sembrar(Proveedor):
    """Idempotente: crea o actualiza el catálogo compartido (creado_por = nulo)."""
    nuevos = 0
    for fila in json.loads(DATOS.read_text(encoding="utf8")):
        _, creado = Proveedor.objects.update_or_create(
            clase=fila["clase"],
            pais=fila["pais"],
            nombre=fila["nombre"],
            creado_por=None,
            defaults={
                "codigo": fila["codigo"],
                "tema": fila["tema"],
                "moneda_sugerida": fila["moneda_sugerida"],
                "curado": True,
            },
        )
        nuevos += creado
    return nuevos
