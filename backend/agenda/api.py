from core.api import AuditSerializer, ServiceViewSet

from .models import Evento
from .services import EventoService


class EventoSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Evento
        read_only_fields = AuditSerializer.Meta.read_only_fields + ("recordatorio_enviado",)


class EventoViewSet(ServiceViewSet):
    service = EventoService
    serializer_class = EventoSerializer
