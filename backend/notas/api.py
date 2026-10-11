from core.api import AuditSerializer, ServiceViewSet

from .models import Nota
from .services import NotaService


class NotaSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Nota


class NotaViewSet(ServiceViewSet):
    service = NotaService
    serializer_class = NotaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        return NotaService.buscar(self.request.user, q) if q else qs
