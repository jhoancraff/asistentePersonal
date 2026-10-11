from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api import AuditSerializer, ServiceViewSet

from .models import Conversacion, Mensaje
from .services import ConversacionService, MensajeService


class MensajeSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Mensaje
        read_only_fields = AuditSerializer.Meta.read_only_fields + (
            "rol",
            "transcripcion",
            "acciones",
        )


class ConversacionSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Conversacion
        read_only_fields = AuditSerializer.Meta.read_only_fields + ("usuario",)


class ConversacionViewSet(ServiceViewSet):
    service = ConversacionService
    serializer_class = ConversacionSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @action(detail=True, methods=["get", "post"], url_path="mensajes")
    def mensajes(self, request, pk=None):
        conversacion = self.get_object()
        if request.method == "POST":
            msg = MensajeService.enviar(
                request.user,
                conversacion,
                texto=request.data.get("texto", ""),
                audio=request.FILES.get("audio"),
            )
            return Response(MensajeSerializer(msg).data, status=201)
        qs = conversacion.mensajes.all()
        return Response(MensajeSerializer(qs, many=True).data)
