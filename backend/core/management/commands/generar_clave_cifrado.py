from django.core.management.base import BaseCommand

from core.crypto import generar_clave


class Command(BaseCommand):
    help = "Genera una clave AES-256 para FIELD_ENCRYPTION_KEYS."

    def add_arguments(self, parser):
        parser.add_argument("--id", default="k1", help="Identificador de la clave (ej. k2).")

    def handle(self, *args, **opts):
        self.stdout.write(f"FIELD_ENCRYPTION_KEYS={opts['id']}:{generar_clave()}")
        self.stdout.write(
            "Para ROTAR: pon la nueva primero y deja la anterior detrás, separadas por coma, "
            "y luego ejecuta: python manage.py rotar_cifrado"
        )
