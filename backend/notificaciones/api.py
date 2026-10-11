from django.conf import settings
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.api import AUDITORIA

from .models import Notificacion
from .services import NotificacionService, SuscripcionService


class NotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notificacion
        fields = "__all__"
        read_only_fields = AUDITORIA + ("usuario", "tipo", "titulo", "mensaje")


class NotificacionViewSet(
    mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet
):
    """Lista notificaciones y permite marcarlas como leídas (PATCH leida)."""

    serializer_class = NotificacionSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return NotificacionService.listar(self.request.user)

    def perform_update(self, serializer):
        serializer.instance = NotificacionService.actualizar(
            self.request.user, serializer.instance.pk, **serializer.validated_data
        )


@api_view(["GET"])
def vapid_public_key(request):
    return Response({"publicKey": settings.VAPID_PUBLIC_KEY})


@api_view(["POST"])
def suscribir(request):
    """Body: {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}}"""
    datos = request.data
    SuscripcionService.registrar(
        request.user, datos["endpoint"], datos["keys"]["p256dh"], datos["keys"]["auth"]
    )
    return Response(status=201)
