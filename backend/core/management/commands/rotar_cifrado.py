from django.core.management.base import BaseCommand

from core.crypto import clave_activa_id, descifrar, cifrar
from finanzas.models import NotaSegura
from finanzas.services import aad_nota


class Command(BaseCommand):
    help = "Re-cifra las notas seguras con la clave activa (la primera de FIELD_ENCRYPTION_KEYS)."

    def handle(self, *args, **opts):
        total = cambiadas = 0
        for nota in NotaSegura.objects.all().iterator():
            total += 1
            nuevo = {}
            for campo in ("titulo", "contenido"):
                token = getattr(nota, f"{campo}_cifrado")
                aad = aad_nota(nota.cuenta_id, nota.creado_por_id, campo)
                plano = descifrar(token, aad)
                nuevo[f"{campo}_cifrado"] = cifrar(plano, aad)
            if any(clave_activa_id(getattr(nota, k)) != clave_activa_id(v) for k, v in nuevo.items()):
                cambiadas += 1
            for k, v in nuevo.items():
                setattr(nota, k, v)
            nota.save(update_fields=list(nuevo))
        self.stdout.write(self.style.SUCCESS(f"{total} notas procesadas, {cambiadas} re-cifradas."))
