from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class AuditModel(models.Model):
    """Base de TODA tabla de Luz: lleva siempre las 4 columnas de auditoría."""

    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Usuario(AbstractUser):
    """Usuario propio de Luz (también lleva las 4 columnas)."""

    creado_por = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    actualizado_por = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "usuario"
