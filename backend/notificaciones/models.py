from django.conf import settings
from django.db import models

from core.models import AuditModel


class SuscripcionPush(AuditModel):
    """Suscripción Web Push de un dispositivo/navegador (PWA)."""

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="suscripciones_push"
    )
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.usuario_id} · {self.endpoint[:40]}"


class Notificacion(AuditModel):
    class Tipo(models.TextChoices):
        EVENTO = "evento", "Recordatorio de evento"
        SALDO = "saldo", "Disponibilidad en cuentas"
        REPORTE = "reporte", "Reporte mensual"
        GENERAL = "general", "General"

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificaciones"
    )
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.GENERAL)
    titulo = models.CharField(max_length=200)
    mensaje = models.TextField(blank=True)
    leida = models.BooleanField(default=False)

    class Meta:
        ordering = ["-fecha_creacion"]

    def __str__(self):
        return self.titulo
