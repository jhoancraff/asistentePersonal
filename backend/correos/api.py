from rest_framework import serializers
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from . import services
from .models import CorreoBancario


class IngestaThrottle(AnonRateThrottle):
    scope = "ingesta"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([IngestaThrottle])
def ingesta(request):
    """Recibe una notificación bancaria desde el script de Gmail del usuario.

    Se autentica con la llave de la integración (cabecera X-Luz-Token), no con JWT. La
    respuesta es genérica ante una llave inválida para no revelar nada.
    """
    usuario = services.usuario_por_token(request.headers.get("X-Luz-Token", ""))
    if usuario is None:
        return Response({"detail": "No autorizado."}, status=401)
    if not isinstance(request.data, dict):
        return Response({"detail": "Cuerpo inválido."}, status=400)
    resultado = services.procesar(usuario, request.data)
    return Response(resultado)


class CorreoBancarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorreoBancario
        fields = ("id", "fecha_creacion", "banco", "referencia", "estado", "detalle", "monto", "movimiento")


@api_view(["GET"])
def registros(request):
    """Últimos correos bancarios procesados del usuario (para revisar qué pasó con cada uno)."""
    qs = CorreoBancario.objects.filter(creado_por=request.user)[:50]
    return Response(CorreoBancarioSerializer(qs, many=True).data)
