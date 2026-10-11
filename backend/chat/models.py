from django.conf import settings
from django.db import models

from core.models import AuditModel


class Conversacion(AuditModel):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversaciones"
    )
    titulo = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-fecha_actualizacion"]

    def __str__(self):
        return self.titulo or f"Conversación {self.pk}"


class Mensaje(AuditModel):
    """Mensaje del chat personal. Admite texto y/o audio (voz)."""

    class Rol(models.TextChoices):
        USUARIO = "usuario", "Usuario"
        ASISTENTE = "asistente", "Asistente"
        SISTEMA = "sistema", "Sistema"

    conversacion = models.ForeignKey(
        Conversacion, on_delete=models.CASCADE, related_name="mensajes"
    )
    rol = models.CharField(max_length=10, choices=Rol.choices, default=Rol.USUARIO)
    texto = models.TextField(blank=True)
    audio = models.FileField(upload_to="chat_audio/%Y/%m/", null=True, blank=True)
    # Transcripción del audio (la llenará el servicio de voz cuando exista).
    transcripcion = models.TextField(blank=True)
    # Acciones que ejecutó el agente a partir de este mensaje (auditoría futura).
    acciones = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["fecha_creacion"]
