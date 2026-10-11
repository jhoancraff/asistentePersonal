"""Importa bancos del dataset ISO 9362 (BIC/SWIFT) de OpenSanctions.

Licencia del dataset: CC BY-NC 4.0 (gratis para uso NO comercial, con atribución).
Fuente: https://www.opensanctions.org/datasets/iso9362_bic/

Uso:
    python manage.py importar_bancos --descargar            # baja la última versión (~19 MB)
    python manage.py importar_bancos --archivo entities.ftm.json
    python manage.py importar_bancos --archivo entities.ftm.json --pais CO --pais US

No sobrescribe el catálogo curado: si ya existe una institución con el mismo nombre en ese
país, solo le completa el BIC.
"""
import json
import tempfile
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from finanzas.models import Proveedor

INDICE = "https://data.opensanctions.org/datasets/latest/iso9362_bic/index.json"


def _primero(valor):
    return (valor[0] if isinstance(valor, list) and valor else valor) or ""


def parsear_entidad(linea: dict):
    """Devuelve (nombre, bic8, pais) o None si la entidad no sirve."""
    props = linea.get("properties", {})
    nombre = _primero(props.get("name")) or linea.get("caption") or ""
    bic = (
        _primero(props.get("swiftBic"))
        or _primero(props.get("bicCode"))
        or str(linea.get("id", "")).removeprefix("bic-")
    ).upper()
    if not nombre or len(bic) < 8 or not bic[:8].isalnum():
        return None
    # Posiciones 5-6 del BIC = país (ISO 3166-1 alfa-2)
    pais = bic[4:6]
    if not pais.isalpha():
        return None
    return nombre.strip(), bic[:8], pais


class Command(BaseCommand):
    help = "Importa bancos desde el dataset BIC/SWIFT de OpenSanctions (CC BY-NC 4.0)."

    def add_arguments(self, parser):
        parser.add_argument("--archivo", help="Ruta a entities.ftm.json (JSON por líneas).")
        parser.add_argument("--descargar", action="store_true", help="Descarga la última versión.")
        parser.add_argument("--pais", action="append", help="Limitar a un país (ISO-2). Repetible.")

    def _descargar(self) -> Path:
        self.stdout.write(f"Consultando {INDICE} ...")
        with urllib.request.urlopen(INDICE, timeout=60) as r:  # noqa: S310 - URL fija y HTTPS
            indice = json.load(r)
        url = next(
            (x["url"] for x in indice.get("resources", []) if x.get("name") == "entities.ftm.json"),
            None,
        )
        if not url:
            raise CommandError("No se encontró entities.ftm.json en el índice del dataset.")
        destino = Path(tempfile.gettempdir()) / "opensanctions_iso9362_bic.ftm.json"
        self.stdout.write(f"Descargando {url} ...")
        urllib.request.urlretrieve(url, destino)  # noqa: S310
        return destino

    def handle(self, *args, **opts):
        if not opts["archivo"] and not opts["descargar"]:
            raise CommandError("Indica --archivo RUTA o --descargar.")
        ruta = Path(opts["archivo"]) if opts["archivo"] else self._descargar()
        if not ruta.exists():
            raise CommandError(f"No existe el archivo: {ruta}")
        paises = {p.upper() for p in (opts["pais"] or [])}

        vistos, nuevos, actualizados = set(), 0, 0
        with ruta.open(encoding="utf8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    datos = parsear_entidad(json.loads(linea))
                except json.JSONDecodeError:
                    continue
                if not datos:
                    continue
                nombre, bic8, pais = datos
                if (paises and pais not in paises) or bic8 in vistos:
                    continue  # un BIC8 identifica la institución; omite sucursales
                vistos.add(bic8)
                nombre = nombre[:160]
                existente = Proveedor.objects.filter(
                    clase="banco", pais=pais, nombre__iexact=nombre, creado_por__isnull=True
                ).first()
                if existente:
                    if not existente.bic:
                        existente.bic = bic8
                        existente.save(update_fields=["bic"])
                        actualizados += 1
                    continue
                Proveedor.objects.create(
                    clase="banco", pais=pais, nombre=nombre, bic=bic8, tema="generico", curado=False
                )
                nuevos += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Importación lista: {nuevos} nuevos, {actualizados} con BIC completado, "
                f"{len(vistos)} BIC únicos procesados."
            )
        )
        self.stdout.write("Datos: OpenSanctions (CC BY-NC 4.0) - https://www.opensanctions.org")
