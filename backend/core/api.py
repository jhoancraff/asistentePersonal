from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

AUDITORIA = ("creado_por", "fecha_creacion", "actualizado_por", "fecha_actualizacion")


class AuditSerializer(serializers.ModelSerializer):
    """Los campos de auditoría son siempre de solo lectura."""

    class Meta:
        fields = "__all__"
        read_only_fields = AUDITORIA


class ServiceViewSet(viewsets.ModelViewSet):
    """ViewSet que delega toda escritura en un CrudService."""

    service = None

    def get_queryset(self):
        return self.service.listar(self.request.user)

    def perform_create(self, serializer):
        serializer.instance = self.service.crear(self.request.user, **serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = self.service.actualizar(
            self.request.user, serializer.instance.pk, **serializer.validated_data
        )

    def perform_destroy(self, instance):
        self.service.eliminar(self.request.user, instance.pk)


@api_view(["GET"])
def me(request):
    """Datos básicos del usuario autenticado (para saludo en el frontend)."""
    u = request.user
    return Response(
        {"id": u.pk, "username": u.username, "first_name": u.first_name, "email": u.email}
    )
