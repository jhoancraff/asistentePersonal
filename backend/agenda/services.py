from datetime import timedelta

from django.utils import timezone

from core.services import CrudService

from .models import Evento


class EventoService(CrudService):
    model = Evento

    @classmethod
    def actualizar(cls, usuario, pk, **datos):
        # Si cambia la hora, el recordatorio debe volver a dispararse.
        if "inicio" in datos or "recordar_minutos_antes" in datos:
            datos["recordatorio_enviado"] = False
        return super().actualizar(usuario, pk, **datos)

    @classmethod
    def mover(cls, usuario, pk, nuevo_inicio):
        return cls.actualizar(usuario, pk, inicio=nuevo_inicio)

    @classmethod
    def pendientes_de_recordar(cls):
        """Eventos (de todos los usuarios) cuyo recordatorio ya toca enviar."""
        ahora = timezone.now()
        candidatos = Evento.objects.filter(
            recordatorio_enviado=False, completado=False, inicio__gte=ahora - timedelta(hours=1)
        )
        return [
            e
            for e in candidatos
            if e.inicio - timedelta(minutes=e.recordar_minutos_antes) <= ahora
        ]
