import json
import logging

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core import registry
from core.api import AuditSerializer, ServiceViewSet

from . import agente, proveedores
from .models import AccionPendiente, Conversacion, Mensaje
from .services import ConversacionService, MensajeService

log = logging.getLogger(__name__)


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


def _accion_dict(p):
    return {
        "id": p.id,
        "nombre": p.nombre,
        "resumen": p.resumen,
        "estado": p.estado,
        "resultado": p.resultado if p.estado != AccionPendiente.Estado.PENDIENTE else "",
    }


def serializar_mensajes(mensajes):
    """Mensajes con sus acciones al día (estado actual de cada acción pendiente)."""
    mensajes = list(mensajes)
    ids = [a["pendiente_id"] for m in mensajes for a in (m.acciones or []) if "pendiente_id" in a]
    pend = {p.id: p for p in AccionPendiente.objects.filter(pk__in=ids)}
    salida = []
    for m in mensajes:
        datos = dict(MensajeSerializer(m).data)
        datos["acciones"] = [
            _accion_dict(pend[a["pendiente_id"]])
            for a in (m.acciones or [])
            if a.get("pendiente_id") in pend
        ]
        salida.append(datos)
    return salida


class ConversacionViewSet(ServiceViewSet):
    service = ConversacionService
    serializer_class = ConversacionSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @action(detail=True, methods=["get", "post"], url_path="mensajes")
    def mensajes(self, request, pk=None):
        conversacion = self.get_object()
        if request.method == "POST":
            mensaje, respuesta = MensajeService.enviar(
                request.user,
                conversacion,
                texto=request.data.get("texto", ""),
                audio=request.FILES.get("audio"),
            )
            return Response({"mensajes": serializar_mensajes([mensaje, respuesta])}, status=201)
        return Response(serializar_mensajes(conversacion.mensajes.all()))


class AccionPendienteViewSet(viewsets.ViewSet):
    """Confirmar o cancelar lo que el agente propuso. Solo el dueño puede resolverlo."""

    def _bloquear(self, request, pk):
        try:
            return AccionPendiente.objects.select_for_update().get(pk=pk, creado_por=request.user)
        except (ObjectDoesNotExist, ValueError) as exc:
            raise NotFound("La acción no existe.") from exc

    @staticmethod
    def _mensaje(pend, usuario, texto):
        return Mensaje.objects.create(
            conversacion=pend.conversacion,
            rol=Mensaje.Rol.ASISTENTE,
            texto=texto,
            creado_por=usuario,
            actualizado_por=usuario,
        )

    @action(detail=True, methods=["post"])
    def confirmar(self, request, pk=None):
        usuario = request.user
        with transaction.atomic():
            pend = self._bloquear(request, pk)
            if pend.estado != AccionPendiente.Estado.PENDIENTE:
                return Response(
                    {"detail": f"La acción ya está {pend.get_estado_display().lower()}.",
                     "accion": _accion_dict(pend)},
                    status=409,
                )
            if agente.expirada(pend):
                pend.estado = AccionPendiente.Estado.EXPIRADA
                pend.resuelta_en = timezone.now()
                pend.save(update_fields=["estado", "resuelta_en", "fecha_actualizacion"])
                return Response(
                    {"detail": "La acción expiró; vuelve a pedírsela a Luz.", "accion": _accion_dict(pend)},
                    status=409,
                )
            try:
                with transaction.atomic():  # punto de guardado: un fallo no rompe la transacción
                    resultado = registry.ejecutar(pend.nombre, usuario, **pend.parametros)
                pend.estado = AccionPendiente.Estado.CONFIRMADA
                pend.resultado = json.dumps(resultado, ensure_ascii=False, default=str)[:2000]
                texto = f"✅ Listo: {pend.resumen}"
            except (ValueError, TypeError, ObjectDoesNotExist) as exc:
                pend.estado = AccionPendiente.Estado.FALLIDA
                pend.resultado = str(exc)[:500] or "No se pudo ejecutar."
                texto = f"⚠️ No pude hacerlo: {pend.resultado}"
            except Exception:  # noqa: BLE001
                log.exception("Fallo ejecutando acción confirmada %s", pend.nombre)
                pend.estado = AccionPendiente.Estado.FALLIDA
                pend.resultado = "Error interno al ejecutar la acción."
                texto = "⚠️ No pude hacerlo por un error interno."
            pend.resuelta_en = timezone.now()
            pend.actualizado_por = usuario
            pend.save()
            mensaje = self._mensaje(pend, usuario, texto)
        return Response(
            {"accion": _accion_dict(pend), "mensaje": serializar_mensajes([mensaje])[0]}
        )

    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        usuario = request.user
        with transaction.atomic():
            pend = self._bloquear(request, pk)
            if pend.estado != AccionPendiente.Estado.PENDIENTE:
                return Response(
                    {"detail": f"La acción ya está {pend.get_estado_display().lower()}.",
                     "accion": _accion_dict(pend)},
                    status=409,
                )
            pend.estado = AccionPendiente.Estado.CANCELADA
            pend.resuelta_en = timezone.now()
            pend.actualizado_por = usuario
            pend.save()
            mensaje = self._mensaje(pend, usuario, "Entendido, no lo hice.")
        return Response(
            {"accion": _accion_dict(pend), "mensaje": serializar_mensajes([mensaje])[0]}
        )


@api_view(["GET"])
def estado_ia(request):
    """Qué proveedores de IA están configurados (sin exponer llaves)."""
    return Response(proveedores.estado())
