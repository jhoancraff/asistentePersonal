from django.core.management.base import BaseCommand

from finanzas.models import Proveedor
from finanzas.seed import sembrar


class Command(BaseCommand):
    help = "Siembra (o actualiza) el catálogo curado de bancos, billeteras y exchanges."

    def handle(self, *args, **options):
        nuevos = sembrar(Proveedor)
        total = Proveedor.objects.filter(curado=True, creado_por__isnull=True).count()
        self.stdout.write(self.style.SUCCESS(f"Catálogo curado: {total} instituciones ({nuevos} nuevas)."))
