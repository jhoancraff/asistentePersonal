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


class AccionPendiente(AuditModel):
    """Acción que el agente propone y que SOLO se ejecuta cuando el usuario confirma."""

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente de confirmación"
        CONFIRMADA = "confirmada", "Confirmada y ejecutada"
        CANCELADA = "cancelada", "Cancelada"
        FALLIDA = "fallida", "Falló al ejecutarse"
        EXPIRADA = "expirada", "Expiró"

    conversacion = models.ForeignKey(
        Conversacion, on_delete=models.CASCADE, related_name="acciones_pendientes"
    )
    mensaje = models.ForeignKey(
        Mensaje, null=True, blank=True, on_delete=models.SET_NULL, related_name="acciones_pendientes"
    )
    nombre = models.CharField(max_length=80)  # p. ej. finanzas.crear_movimiento
    parametros = models.JSONField(default=dict)  # ya validados y normalizados
    resumen = models.CharField(max_length=500)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PENDIENTE)
    resultado = models.TextField(blank=True)
    resuelta_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["fecha_creacion", "id"]

    def __str__(self):
        return f"{self.nombre} [{self.estado}]"
